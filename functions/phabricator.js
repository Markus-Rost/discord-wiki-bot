import { EmbedBuilder } from 'discord.js';
import logging from '../util/logging.js';
import { got, escapeFormatting, limitLength } from '../util/functions.js';

/**
 * Sends a Phabricator task.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../util/wiki.js').default} wiki - The wiki.
 * @param {URL} link - The link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} [spoiler] - If the response is in a spoiler.
 * @param {Boolean} [noEmbed] - If the response should be without an embed.
 */
export default function phabricator_task(lang, msg, wiki, link, reaction, spoiler = '', noEmbed = false) {
	var regex = /^(?:https?:)?\/\/phabricator\.(wikimedia|miraheze)\.org\/T(\d+)(?:#|$)/.exec(link.href);
	if ( !regex || !process.env['phabricator_' + regex[1]] ) {
		logging(wiki, msg.guildId, 'interwiki');
		msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler );
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	var site = 'https://phabricator.' + regex[1] + '.org/';
	logging(site, msg.guildId, 'phabricator', regex[1]);
	got.get( site + 'api/maniphest.search?api.token=' + process.env['phabricator_' + regex[1]] + '&attachments[projects]=1&constraints[ids][0]=' + regex[2], {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body?.result?.data || body.error_code ) {
			console.log( '- ' + response.statusCode + ': Error while getting the Phabricator task: ' + body?.error_info );
			msg.sendChannelError( spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler );

			if ( reaction ) reaction.removeEmoji();
			return;
		}
		if ( !body.result.data.length ) {
			msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler );

			if ( reaction ) reaction.removeEmoji();
			return;
		}
		var task = body.result.data[0];
		var status = '**' + task.fields.status.name + ':** ' + escapeFormatting(task.fields.name) + '\n';
		if ( !msg.showEmbed() || noEmbed ) {
			msg.sendChannel( spoiler + status + '<' + link + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		var summary = escapeFormatting(task.fields.name);
		if ( summary.length > 250 ) summary = summary.substring(0, 250) + '\u2026';
		var embed = new EmbedBuilder().setAuthor( {name: 'Phabricator'} ).setTitle( summary ).setURL( link.href ).addFields(...[
			{name: lang.get('phabricator.status'), value: escapeFormatting(task.fields.status.name), inline: true},
			{name: lang.get('phabricator.priority'), value: escapeFormatting(task.fields.priority.name), inline: true}
		]);
		if ( task.fields.subtype !== 'default' ) embed.addFields( {name: lang.get('phabricator.subtype'), value: escapeFormatting(task.fields.subtype), inline: true} );
		var description = parse_text( task.fields.description.raw, site );
		if ( description.length > 2000 ) description = limitLength(description, 2000, 40);
		embed.setDescription( description );

		Promise.all([
			( task.attachments.projects.projectPHIDs.length ? got.get( site + 'api/phid.lookup?api.token=' + process.env['phabricator_' + regex[1]] + '&' + task.attachments.projects.projectPHIDs.map( (project, i) => 'names[' + i + ']=' + project ).join('&'), {
				context: {
					guildId: msg.guildId
				}
			} ).then( presponse => {
				var pbody = presponse.body;
				if ( presponse.statusCode !== 200 || !pbody?.result || pbody.error_code ) {
					console.log( '- ' + presponse.statusCode + ': Error while getting the projects: ' + pbody?.error_info );
					return;
				}
				var projects = Object.values(pbody.result);
				var tags = projects.map( project => {
					return '[' + escapeFormatting(project.fullName) + '](' + project.uri + ')';
				} ).join(',\n');
				if ( tags.length > 1000 ) tags = projects.map( project => project.fullName ).join(',\n');
				if ( tags.length > 1000 ) tags = tags.substring(0, 1000) + '\u2026';
				embed.addFields( {name: lang.get('phabricator.tags'), value: tags} );
			}, error => {
				console.log( '- Error while getting the projects: ' + error );
			} ) : undefined ),
			( /^#\d+$/.test( link.hash ) ? got.get( site + 'api/transaction.search?api.token=' + process.env['phabricator_' + regex[1]] + '&objectIdentifier=' + task.phid, {
				context: {
					guildId: msg.guildId
				}
			} ).then( tresponse => {
				var tbody = tresponse.body;
				if ( tresponse.statusCode !== 200 || !tbody?.result?.data || tbody.error_code ) {
					console.log( '- ' + tresponse.statusCode + ': Error while getting the task transactions: ' + tbody?.error_info );
					return;
				}
				var comment = tbody.result.data.find( transaction => '#' + transaction.id === link.hash );
				if ( comment.type === 'comment' ) {
					var content = parse_text( comment.comments[0].content.raw, site );
					if ( content.length > 1000 ) content = limitLength(content, 1000, 20);
					embed.spliceFields( 0, 0, {name: lang.get('phabricator.comment'), value: content} );
					if ( embed.description.length > 500 ) embed.setDescription( limitLength(description, 500, 250) );
				}
			}, error => {
				console.log( '- Error while getting the task transactions: ' + error );
			} ) : undefined )
		]).finally( () => {
			msg.sendChannel( {content: spoiler + status + '<' + link + '>' + spoiler, embeds: [embed]} );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}, error => {
		console.log( '- Error while getting the Phabricator task: ' + error );
		msg.sendChannelError( spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler );

		if ( reaction ) reaction.removeEmoji();
	} );
}

/**
 * Parse Phabricator text.
 * @param {String} text - The text to parse.
 * @param {String} site - The site the Phabricator is for.
 * @returns {String}
 */
function parse_text(text, site) {
	text = text.replace( /```\n?lang=/g, '```' );
	text = text.replace( /^>>! (.+?)$/gm, '> *$1*' );
	text = text.replace( /^>>/gm, '> >' );
	text = text.replace( /##(.+?)##/g, '`$1`' );
	text = text.replace( /!!(.+?)!!/g, '`$1`' );
	text = text.replace( /(?<!https?:)\/\/(.+?)(?<!https?:)\/\//g, '*$1*' );
	text = text.replace( /\[\[ ?(.+?) ?(?:\| ?(.+?) ?)?\]\]/g, (match, target, display) => {
		var link = target;
		if ( /^(?:(?:https?:)?\/\/|\/|#)/.test(target) ) link = new URL(target, site).href;
		else link = site + 'w/' + target;
		return '[' + ( display || target ) + '](' + link + ')';
	} );
	text = text.replace( /(?<!\w)@([\w-]+)\b/g, '[@$1](' + site + 'p/$1)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)\b\{?(r[A-Z]+[a-f\d]+)\}?\b/g, '[$1](' + site + '$1)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)\b\{?([CDFHLMPQTV]\d+(?:#\d+)?)\}?\b/g, '[$1](' + site + '$1)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)#([a-z0-9_-]+)\b/g, '[#$1](' + site + 'tag/$1)' );
	return text;
}
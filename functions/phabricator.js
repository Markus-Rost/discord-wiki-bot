import { EmbedBuilder } from 'discord.js';
import logging from '../util/logging.js';
import { got, escapeFormatting, limitLength } from '../util/functions.js';

/**
 * Sends a Phabricator task.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../util/wiki.js').default} wiki - The wiki.
 * @param {URL} link - The link.
 * @param {String} [spoiler] - If the response is in a spoiler.
 * @param {Boolean} [noEmbed] - If the response should be without an embed.
 * @returns {Promise<{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>}
 */
export default function phabricator_task(lang, msg, wiki, link, spoiler = '', noEmbed = false) {
	var regex = /^(?:https?:)?\/\/phabricator\.(wikimedia|miraheze)\.org\/T(\d+)(?:#|$)/.exec(link.href);
	if ( !regex || !process.env['phabricator_' + regex[1]] ) {
		logging(wiki, msg.guildId, 'interwiki');
		return Promise.resolve( {message: spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler} );
	}
	var site = 'https://phabricator.' + regex[1] + '.org/';
	logging(site, msg.guildId, 'phabricator', regex[1]);
	return got.get( site + 'api/maniphest.search?api.token=' + process.env['phabricator_' + regex[1]] + '&attachments[projects]=1&constraints[ids][0]=' + regex[2], {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body?.result?.data || body.error_code ) {
			console.log( '- ' + response.statusCode + ': Error while getting the Phabricator task: ' + body?.error_info );
			return {
				reaction: WB_EMOJI.error,
				message: spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler
			};
		}
		if ( !body.result.data.length ) {
			return {message: spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler};
		}
		var task = body.result.data[0];
		var status = '**' + task.fields.status.name + ':** ' + escapeFormatting(task.fields.name) + '\n';
		if ( noEmbed ) {
			return {message: spoiler + status + '<' + link + '>' + spoiler};
		}
		var summary = escapeFormatting(task.fields.name);
		if ( summary.length > 250 ) summary = summary.substring(0, 250) + '\u2026';
		var embed = new EmbedBuilder().setAuthor( {name: 'Phabricator'} ).setTitle( summary ).setURL( link.href ).addFields(...[
			{name: lang.get('phabricator.status'), value: escapeFormatting(task.fields.status.name), inline: true},
			{name: lang.get('phabricator.priority'), value: escapeFormatting(task.fields.priority.name), inline: true}
		]);
		if ( task.fields.subtype !== 'default' ) embed.addFields( {name: lang.get('phabricator.subtype'), value: escapeFormatting(task.fields.subtype), inline: true} );
		if ( msg.embedLimits.descLength ) {
			var description = parse_text( task.fields.description.raw, site );
			if ( description.length > msg.embedLimits.descLength ) description = limitLength(description, msg.embedLimits.descLength, 40);
			embed.setDescription( description );
		}

		return Promise.all([
			( task.attachments.projects.projectPHIDs.length && msg.embedLimits.fieldLength ? got.get( site + 'api/phid.lookup?api.token=' + process.env['phabricator_' + regex[1]] + '&' + task.attachments.projects.projectPHIDs.map( (project, i) => 'names[' + i + ']=' + project ).join('&'), {
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
					return '[' + escapeFormatting(project.fullName) + '](<' + project.uri + '>)';
				} ).join(',\n');
				if ( tags.length > msg.embedLimits.fieldLength ) tags = projects.map( project => project.fullName ).join(',\n');
				if ( tags.length > msg.embedLimits.fieldLength ) tags = tags.substring(0, msg.embedLimits.fieldLength) + '\u2026';
				embed.addFields( {name: lang.get('phabricator.tags'), value: tags} );
			}, error => {
				console.log( '- Error while getting the projects: ' + error );
			} ) : undefined ),
			( /^#\d+$/.test( link.hash ) && msg.embedLimits.sectionLength ? got.get( site + 'api/transaction.search?api.token=' + process.env['phabricator_' + regex[1]] + '&objectIdentifier=' + task.phid, {
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
					if ( content.length > msg.embedLimits.sectionLength ) content = limitLength(content, msg.embedLimits.sectionLength, 20);
					embed.spliceFields( 0, 0, {name: lang.get('phabricator.comment'), value: content} );
					if ( !msg.embedLimits.sectionDescLength ) embed.setDescription( null );
					else if ( ( embed.data.description?.length ?? 0 ) > msg.embedLimits.sectionDescLength ) embed.setDescription( limitLength(description, msg.embedLimits.sectionDescLength, 50) );
				}
			}, error => {
				console.log( '- Error while getting the task transactions: ' + error );
			} ) : undefined )
		]).then( () => {
			return {message: {
				content: spoiler + status + '<' + link + '>' + spoiler,
				embeds: [embed]
			}};
		} );
	}, error => {
		console.log( '- Error while getting the Phabricator task: ' + error );
		return {
			reaction: WB_EMOJI.error,
			message: spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler
		};
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
		try {
			var link = target;
			if ( /^(?:(?:https?:)?\/\/|\/|#)/.test(target) ) link = new URL(target, site).href;
			else link = site + 'w/' + target;
			return '[' + ( display || target ) + '](<' + link + '>)';
		}
		catch {
			return ( display || target );
		}
	} );
	text = text.replace( /(?<!\w)@([\w-]+)\b/g, '[@$1](<' + site + 'p/$1>)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)\b\{?(r[A-Z]+[a-f\d]+)\}?\b/g, '[$1](<' + site + '$1>)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)\b\{?([CDFHLMPQTV]\d+(?:#\d+)?)\}?\b/g, '[$1](<' + site + '$1>)' );
	text = text.replace( /(?<!https?:\/\/[^\s]+)#([a-z0-9_-]+)\b/g, '[#$1](<' + site + 'tag/$1>)' );
	return text;
}
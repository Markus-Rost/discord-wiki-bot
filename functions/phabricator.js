import { EmbedBuilder } from 'discord.js';
import logging from '../util/logging.js';
import { got, escapeFormatting, limitLength } from '../util/functions.js';

export const phabricatorSites = new Map([
	['phabricator.wikimedia.org', {
		id: 'wikimedia',
		name: 'Wikimedia Phabricator',
		href: 'https://phabricator.wikimedia.org/',
		apikey: 'phabricator_wikimedia'
	}],
	['issue-tracker.miraheze.org', {
		id: 'miraheze',
		name: 'Miraheze Issue Tracker',
		href: 'https://issue-tracker.miraheze.org/',
		apikey: 'phabricator_miraheze'
	}],
	['phabricator.telepedia.net', {
		id: 'telepedia',
		name: 'Telepedia Phabricator',
		href: 'https://phabricator.telepedia.net/',
		apikey: 'phabricator_telepedia'
	}]
]);

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
	const site = phabricatorSites.get(link.hostname);
	const taskname = /^\/T(\d+)$/.exec(link.pathname)?.[1];
	if ( !site || !taskname || !process.env[site.apikey] ) {
		logging(wiki, msg.guildId, 'interwiki');
		return Promise.resolve( {message: spoiler + ( noEmbed ? '<' : ' ' ) + link + ( noEmbed ? '>' : ' ' ) + spoiler} );
	}
	logging(site.href, msg.guildId, 'phabricator', site.id);
	return got.get( site.href + 'api/maniphest.search?api.token=' + process.env[site.apikey] + '&attachments[projects]=1&constraints[ids][0]=' + taskname, {
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
		var embed = new EmbedBuilder().setAuthor( {name: site.name} ).setTitle( summary ).setURL( link.href ).addFields(...[
			{name: lang.get('phabricator.status'), value: escapeFormatting(task.fields.status.name), inline: true},
			{name: lang.get('phabricator.priority'), value: escapeFormatting(task.fields.priority.name), inline: true}
		]);
		if ( task.fields.subtype !== 'default' ) embed.addFields( {name: lang.get('phabricator.subtype'), value: escapeFormatting(task.fields.subtype), inline: true} );
		if ( msg.embedLimits.descLength ) {
			var description = parse_text( task.fields.description.raw, site.href );
			if ( description.length > msg.embedLimits.descLength ) description = limitLength(description, msg.embedLimits.descLength, 40);
			embed.setDescription( description );
		}

		return Promise.all([
			( task.attachments.projects.projectPHIDs.length && msg.embedLimits.fieldLength ? got.get( site.href + 'api/phid.lookup?api.token=' + process.env[site.apikey] + '&' + task.attachments.projects.projectPHIDs.map( (project, i) => 'names[' + i + ']=' + project ).join('&'), {
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
			( /^#\d+$/.test( link.hash ) && msg.embedLimits.sectionLength ? got.get( site.href + 'api/transaction.search?api.token=' + process.env[site.apikey] + '&objectIdentifier=' + task.phid, {
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
					var content = parse_text( comment.comments[0].content.raw, site.href );
					if ( content.length > Math.min(msg.embedLimits.sectionLength, 1_000) ) {
						content = limitLength(content, Math.min(msg.embedLimits.sectionLength, 1_000), 20);
					}
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

import { MessageEmbed } from 'discord.js';
import { got, escapeFormatting, limitLength } from '../../util/functions.js';

/**
 * Sends a Minecraft issue.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 */
function minecraft_bug(lang, msg, wiki, args, title, cmd, reaction, spoiler, noEmbed) {
	var invoke = args[0];
	args = args.slice(1);
	if ( invoke && /\d+$/.test(invoke) && !args.length ) {
		if ( /^\d+$/.test(invoke) ) invoke = 'MC-' + invoke;
		var baseBrowseUrl = 'https://bugs.mojang.com/browse/';
		got.get( 'https://bugs.mojang.com/rest/api/2/issue/' + encodeURIComponent( invoke ) + '?fields=summary,description,issuelinks,fixVersions,resolution,status', {
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'Issue Does Not Exist' ) ) {
						msg.reactEmoji('🤷');
					}
					else if ( body.errorMessages.includes( 'You do not have the permission to see the specified issue.' ) ) {
						msg.sendChannel( spoiler + lang.get('minecraft.private') + '\n<' + baseBrowseUrl + invoke + '>' + spoiler );
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issue: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the issue: ' + ( body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + baseBrowseUrl + invoke + '>' + spoiler );
				}
			}
			else {
				if ( !body.fields ) {
					msg.reactEmoji('error');
				}
				else {
					var statusList = lang.get('minecraft.status');
					var summary = escapeFormatting(body.fields.summary);
					if ( summary.length > 250 ) summary = summary.substring(0, 250) + '\u2026';
					var description = parse_links( ( body.fields.description || '' ).replace( /\{code\}/g, '```' ) );
					var embed = null;
					if ( msg.showEmbed() && !noEmbed ) {
						embed = new MessageEmbed().setAuthor( {name: 'Mojira'} ).setTitle( summary ).setURL( baseBrowseUrl + body.key ).setDescription( limitLength(description, 2000, 20) );
						var links = body.fields.issuelinks.filter( link => link.outwardIssue || ( link.inwardIssue && link.type.name !== 'Duplicate' ) );
						if ( links.length ) {
							var linkList = lang.get('minecraft.issue_link');
							var extralinks = [];
							links.forEach( link => {
								var ward = ( link.outwardIssue ? 'outward' : 'inward' );
								var issue = link[ward + 'Issue']; // looks for property (in|out)wardIssue
								var name = ( linkList?.[link.type.name]?.[ward]?.replaceSave( /\$1/g, issue.key ) || link.type[ward] + ' ' + issue.key );
								var status = issue.fields.status.name;
								var value = ( statusList?.[status] || status ) + ': [' + escapeFormatting(issue.fields.summary) + '](' + baseBrowseUrl + issue.key + ')';
								if ( embed.fields.length < 25 && ( embed.length + name.length + value.length ) < 6000 ) embed.addField( name, value );
								else extralinks.push({name,value,inline:false});
							} );
							if ( extralinks.length ) embed.setFooter( {text: lang.get('minecraft.more', extralinks.length.toLocaleString(lang.get('dateformat')), extralinks.length)} );
						}
					}
					var status = ( body.fields.resolution ? body.fields.resolution.name : body.fields.status.name );
					var fixed = '';
					if ( body.fields.resolution && body.fields.fixVersions && body.fields.fixVersions.length ) {
						fixed = '\n' + lang.get('minecraft.fixed', body.fields.fixVersions.length) + ' ' + body.fields.fixVersions.map( v => v.name ).join(', ');
					}
					msg.sendChannel( {content: spoiler + '**' + ( statusList?.[status] || status ) + '**: ' + escapeFormatting(body.fields.summary) + '\n<' + baseBrowseUrl + body.key + '>' + fixed + spoiler, embeds: [embed]} );
				}
			}
		}, error => {
			console.log( '- Error while getting the issue: ' + error );
			msg.sendChannelError( spoiler + '<' + baseBrowseUrl + invoke + '>' + spoiler );
		} ).finally( () => {
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else if ( invoke && invoke.toLowerCase() === 'version' && args.length && args.join(' ').length < 100 ) {
		var jql = new URLSearchParams({
			jql: 'fixVersion="' + args.join(' ').replace( /["\\]/g, '\\$&' ) + '" order by key'
		});
		var uri = 'https://bugs.mojang.com/issues/?' + jql;
		got.get( 'https://bugs.mojang.com/rest/api/2/search?fields=summary,resolution,status&' + jql + '&maxResults=25', {
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'The value \'' + args.join(' ') + '\' does not exist for the field \'fixVersion\'.' ) ) {
						msg.reactEmoji('🤷');
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while getting the issues: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the issues: ' + ( body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + uri + '>' + spoiler );
				}
			}
			else {
				if ( !body.issues ) {
					msg.reactEmoji('error');
				}
				else {
					var embed = null;
					if ( msg.showEmbed() && !noEmbed ) {
						embed = new MessageEmbed().setAuthor( {name: 'Mojira'} ).setTitle( args.join(' ') ).setURL( uri );
						if ( body.total > 0 ) {
							var statusList = lang.get('minecraft.status');
							body.issues.forEach( bug => {
								var status = ( bug.fields.resolution ? bug.fields.resolution.name : bug.fields.status.name );
								var value = ( statusList?.[status] || status ) + ': [' + escapeFormatting(bug.fields.summary) + '](https://bugs.mojang.com/browse/' + bug.key + ')';
								embed.addField( bug.key, value );
							} );
							if ( body.total > 25 ) {
								var extrabugs = body.total - 25;
								embed.setFooter( {text: lang.get('minecraft.more', extrabugs.toLocaleString(lang.get('dateformat')), extrabugs)} );
							}
						}
					}
					var total = '**' + args.join(' ') + ':** ' + lang.get('minecraft.total', body.total.toLocaleString(lang.get('dateformat')), body.total);
					msg.sendChannel( {content: spoiler + total + '\n<' + uri + '>' + spoiler, embeds: [embed]} );
				}
			}
		}, error => {
			console.log( '- Error while getting the issues: ' + error );
			msg.sendChannelError( spoiler + '<' + uri + '>' + spoiler );
		} ).finally( () => {
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else {
		msg.notMinecraft = true;
		this.WIKI.general(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed);
	}
}

/**
 * Parse Mojira links.
 * @param {String} text - The text to parse.
 * @returns {String}
 */
function parse_links(text) {
	text = text.replace( /\[~([^\]]+)\]/g, '[$1](https://bugs.mojang.com/secure/ViewProfile.jspa?name=$1)' );
	text = text.replace( /\[([^\|]+)\|([^\]]+)\]/g, '[$1]($2)' );
	text = text.replace( /{panel(?::title=([^|}]+))?[^}]*}/g, (panel, title) => {
		return ( title ? '**' + title + '**' : '' );
	} );
	return text;
}

export default {
	name: 'bug',
	run: minecraft_bug
};

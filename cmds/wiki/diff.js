import { EmbedBuilder } from 'discord.js';
import logging from '../../util/logging.js';
import { got, htmlToPlain, htmlToDiscord, escapeFormatting } from '../../util/functions.js';
import diffParser from '../../util/edit_diff.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {timeoptions} = require('../../util/default.json');

/**
 * Processes a Gamepedia edit.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the edit.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {EmbedBuilder} [embed] - The embed for the page.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
export default function gamepedia_diff(lang, msg, args, wiki, spoiler, noEmbed, embed) {
	if ( !args[0] ) {
		if ( embed ) return Promise.resolve( {message: {
			content: spoiler + '<' + embed.data.url + '>' + spoiler,
			embeds: ( noEmbed ? [] : [embed] )
		}} );
		return Promise.resolve( {
			reaction: 'reply',
			message: {
				content: lang.get('diff.badrev'),
				allowedMentions: {repliedUser: false}
			}
		} );
	}
	var error = false;
	var title = '';
	var revision = 0;
	var diff = 0;
	var relative = 'prev';
	if ( /^\d+$/.test(args[0]) ) {
		revision = parseInt(args[0], 10);
		if ( args[1] ) {
			if ( /^\d+$/.test(args[1]) ) {
				diff = parseInt(args[1], 10);
			}
			else if ( args[1] === 'prev' || args[1] === 'next' || args[1] === 'cur' ) {
				relative = args[1];
			}
			else error = true;
		}
	}
	else if ( args[0] === 'prev' || args[0] === 'next' || args[0] === 'cur' ) {
		relative = args[0];
		if ( args[1] ) {
			if ( /^\d+$/.test(args[1]) ) {
				revision = parseInt(args[1], 10);
			}
			else error = true;
		}
		else error = true;
	}
	else title = args.join(' ');
	
	if ( error ) {
		return Promise.resolve( {
			reaction: 'reply',
			message: {
				content: lang.get('diff.badrev'),
				allowedMentions: {repliedUser: false}
			}
		} );
	}
	if ( diff ) {
		return gamepedia_diff_send(lang, msg, [diff, revision], wiki, spoiler, noEmbed);
	}
	return got.get( wiki + 'api.php?action=compare&prop=ids|diff' + ( title ? '&fromtitle=' + encodeURIComponent( title ) : '&fromrev=' + revision ) + '&torelative=' + relative + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || !body.compare ) {
			var noerror = false;
			if ( body && body.error ) {
				switch ( body.error.code ) {
					case 'nosuchrevid':
						noerror = true;
						break;
					case 'missingtitle':
						noerror = true;
						break;
					case 'invalidtitle':
						noerror = true;
						break;
					case 'missingcontent':
						noerror = true;
						break;
					default:
						noerror = false;
				}
			}
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				return {reaction: 'nowiki'};
			}
			if ( noerror ) {
				return {
					reaction: 'reply',
					message: {
						content: lang.get('diff.badrev'),
						allowedMentions: {repliedUser: false}
					}
				};
			}
			console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink(title, ( title ? {diff} : {diff,oldid:revision} )) + '>' + spoiler
			};
		}
		if ( body.compare.fromarchive !== undefined || body.compare.toarchive !== undefined ) {
			return {reaction: 'error'};
		}
		var argids = [];
		var ids = body.compare;
		if ( ids.fromrevid && !ids.torevid ) argids = [ids.fromrevid];
		else if ( !ids.fromrevid && ids.torevid ) argids = [ids.torevid];
		else {
			argids = [ids.torevid, ids.fromrevid];
			var compare = ['', ''];
			if ( ids.fromtexthidden === undefined && ids.totexthidden === undefined && ids['*'] !== undefined ) {
				let more = '\n__' + lang.get('diff.info.more') + '__';
				let whitespace = '__' + lang.get('diff.info.whitespace') + '__';
				compare = diffParser( ids['*'], more, whitespace );
			}
			else if ( ids.fromtexthidden !== undefined ) compare[0] = '__' + lang.get('diff.hidden') + '__';
			else if ( ids.totexthidden !== undefined ) compare[1] = '__' + lang.get('diff.hidden') + '__';
		}
		return gamepedia_diff_send(lang, msg, argids, wiki, spoiler, noEmbed, compare);
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			return {reaction: 'nowiki'};
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink(title, 'diff=' + relative + ( title ? '' : '&oldid=' + revision )) + '>' + spoiler
			};
		}
	} );
}

/**
 * Sends a Gamepedia edit.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the edit.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {String[]} [compare] - The edit difference.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
function gamepedia_diff_send(lang, msg, args, wiki, spoiler, noEmbed, compare) {
	return got.get( wiki + 'api.php?uselang=' + lang.lang + '&action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvslots=main&rvprop=ids|timestamp|flags|user|size|parsedcomment|tags' + ( args.length === 1 || args[0] === args[1] ? '|content' : '' ) + '&revids=' + args.join('|') + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				return {reaction: 'nowiki'};
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				return {
					reaction: 'error',
					message: spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler
				};
			}
		}
		if ( body.query.badrevids ) {
			return {
				reaction: 'reply',
				message: {
					content: lang.get('diff.badrev'),
					allowedMentions: {repliedUser: false}
				}
			};
		}
		if ( body.query.pages && !body.query.pages['-1'] ) {
			wiki.updateWiki(body.query.general);
			logging(wiki, msg.guildId, 'diff');
			var pages = Object.values(body.query.pages);
			if ( pages.length !== 1 ) {
				return {message: spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler};
			}
			var title = pages[0].title;
			var revisions = pages[0].revisions.sort( (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp) );
			var diff = revisions[0].revid;
			var oldid = ( revisions[1] ? revisions[1].revid : 0 );
			var editor = [lang.get('diff.info.editor'), ( revisions[0].userhidden !== undefined ? lang.get('diff.hidden') : ( !noEmbed ? '[' + escapeFormatting(revisions[0].user) + '](' + wiki.toLink(( revisions[0].anon !== undefined ? 'Special:Contributions/' : 'User:' ) + revisions[0].user, '', '', true) + ')' : escapeFormatting(revisions[0].user) ) )];
			try {
				var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
					timeZone: body.query.general.timezone
				}, timeoptions));
			}
			catch ( error ) {
				var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
					timeZone: 'UTC'
				}, timeoptions));
			}
			var editDate = new Date(revisions[0].timestamp);
			var timestamp = [lang.get('diff.info.timestamp'), dateformat.format(editDate), '<t:' + Math.trunc(editDate.getTime() / 1000) + ':R>'];
			var difference = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
			var size = [lang.get('diff.info.size'), lang.get('diff.info.bytes', ( difference > 0 ? '+' : '' ) + difference.toLocaleString(lang.get('dateformat')), difference) + ( revisions[0].minor !== undefined ? lang.get('diff.info.minor').replaceAll( '_', ' ' ) : '' )];
			var comment = [lang.get('diff.info.comment'), ( revisions[0].commenthidden !== undefined ? lang.get('diff.hidden') : ( revisions[0].parsedcomment ? ( !noEmbed ? htmlToDiscord(revisions[0].parsedcomment, wiki.toLink(title), true) : htmlToPlain(revisions[0].parsedcomment) ) : lang.get('diff.nocomment') ) )];
			if ( revisions[0].tags.length ) var tags = [lang.get('diff.info.tags'), body.query.tags.filter( tag => tag.displayname && revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname || tag.name ).join(', ')];
			
			var pagelink = wiki.toLink(title, {diff,oldid});
			var text = '<' + pagelink + '>';
			if ( !noEmbed ) {
				var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting( title + '?diff=' + diff + '&oldid=' + oldid ) ).setURL( pagelink ).addFields(...[
					{name: editor[0], value: editor[1], inline: true},
					{name: size[0], value: size[1], inline: true},
					{name: timestamp[0], value: timestamp[1] + '\n' + timestamp[2], inline: true},
					{name: comment[0], value: comment[1]}
				]).setTimestamp( editDate );
				
				var more = '\n__' + lang.get('diff.info.more') + '__';
				var whitespace = '__' + lang.get('diff.info.whitespace') + '__';
				if ( !compare && oldid ) return got.get( wiki + 'api.php?action=compare&prop=diff&fromrev=' + oldid + '&torev=' + diff + '&format=json', {
					context: {
						guildId: msg.guildId
					}
				} ).then( cpresponse => {
					var cpbody = cpresponse.body;
					if ( cpbody && cpbody.warnings ) log_warning(cpbody.warnings);
					if ( cpresponse.statusCode !== 200 || !cpbody || !cpbody.compare || cpbody.compare['*'] === undefined ) {
						var noerror = false;
						if ( cpbody && cpbody.error ) {
							switch ( cpbody.error.code ) {
								case 'nosuchrevid':
									noerror = true;
									break;
								case 'missingcontent':
									noerror = true;
									break;
								default:
									noerror = false;
							}
						}
						if ( !noerror ) console.log( '- ' + cpresponse.statusCode + ': Error while getting the diff: ' + ( cpbody && cpbody.error && cpbody.error.info ) );
					}
					else if ( cpbody.compare.fromtexthidden === undefined && cpbody.compare.totexthidden === undefined && cpbody.compare.fromarchive === undefined && cpbody.compare.toarchive === undefined ) {
						let edit_diff = diffParser( cpbody.compare['*'], more, whitespace )
						if ( edit_diff[0].length ) {
							embed.addFields( {name: lang.get('diff.info.removed'), value: edit_diff[0], inline: true} );
						}
						if ( edit_diff[1].length ) {
							embed.addFields( {name: lang.get('diff.info.added'), value: edit_diff[1], inline: true} );
						}
					}
					else if ( cpbody.compare.fromtexthidden !== undefined ) {
						embed.addFields( {name: lang.get('diff.info.removed'), value: '__' + lang.get('diff.hidden') + '__', inline: true} );
					}
					else if ( cpbody.compare.totexthidden !== undefined ) {
						embed.addFields( {name: lang.get('diff.info.added'), value: '__' + lang.get('diff.hidden') + '__', inline: true} );
					}
				}, error => {
					console.log( '- Error while getting the diff: ' + error );
				} ).then( () => {
					if ( tags?.[1] ) embed.addFields( {name: tags[0], value: htmlToDiscord(tags[1], pagelink)} );
					return {message: {
						content: spoiler + text + spoiler,
						embeds: [embed]
					}};
				} );
				
				if ( compare ) {
					if ( compare[0].length ) embed.addFields( {name: lang.get('diff.info.removed'), value: compare[0], inline: true} );
					if ( compare[1].length ) embed.addFields( {name: lang.get('diff.info.added'), value: compare[1], inline: true} );
				}
				else if ( ( revisions[0]?.slots?.main || revisions[0] )['*'] ) {
					var content = escapeFormatting( ( revisions[0]?.slots?.main || revisions[0] )['*'] );
					if ( content.trim().length ) {
						if ( content.length <= 1000 ) content = '**' + content + '**';
						else {
							content = content.substring(0, 1000 - more.length);
							content = '**' + content.substring(0, content.lastIndexOf('\n')) + '**' + more;
						}
						embed.addFields( {name: lang.get('diff.info.added'), value: content, inline: true} );
					} else embed.addFields( {name: lang.get('diff.info.added'), value: whitespace, value: true} );
				}
				if ( tags?.[1] ) embed.addFields( {name: tags[0], value: htmlToDiscord(tags[1], pagelink)} );
				
				return {message: {
					content: spoiler + text + spoiler,
					embeds: [embed]
				}};
			}
			text += '\n\n' + editor.join(' ') + '\n' + timestamp.join(' ') + '\n' + size.join(' ') + '\n' + comment.join(' ');
			if ( tags?.[1] ) text += htmlToDiscord( '\n' + tags.join(' ') );
			
			return {message: spoiler + text + spoiler};
		}
		return {reaction: 'error'};
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			return {reaction: 'nowiki'};
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler
			};
		}
	} );
}
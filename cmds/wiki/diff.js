const {MessageEmbed} = require('discord.js');
const logging = require('../../util/logging.js');
const {timeoptions} = require('../../util/default.json');
const {got, htmlToPlain, htmlToDiscord, escapeFormatting} = require('../../util/functions.js');
const diffParser = require('../../util/edit_diff.js');

/**
 * Processes a Gamepedia edit.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the edit.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {MessageEmbed} [embed] - The embed for the page.
 */
function gamepedia_diff(lang, msg, args, wiki, reaction, spoiler, noEmbed, embed) {
	if ( args[0] ) {
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
			msg.reactEmoji('error');
			if ( reaction ) reaction.removeEmoji();
		}
		else if ( diff ) {
			gamepedia_diff_send(lang, msg, [diff, revision], wiki, reaction, spoiler, noEmbed);
		}
		else {
			got.get( wiki + 'api.php?action=compare&prop=ids|diff' + ( title ? '&fromtitle=' + encodeURIComponent( title ) : '&fromrev=' + revision ) + '&torelative=' + relative + '&format=json' ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warn(body.warnings);
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
						msg.reactEmoji('nowiki');
					}
					else if ( noerror ) {
						msg.replyMsg( lang.get('diff.badrev') );
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
						msg.sendChannelError( spoiler + '<' + wiki.toLink(title, ( title ? {diff} : {diff,oldid:revision} )) + '>' + spoiler );
					}
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					if ( body.compare.fromarchive !== undefined || body.compare.toarchive !== undefined ) {
						msg.reactEmoji('error');
						
						if ( reaction ) reaction.removeEmoji();
					} else {
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
						gamepedia_diff_send(lang, msg, argids, wiki, reaction, spoiler, noEmbed, compare);
					}
				}
			}, error => {
				if ( wiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Error while getting the search results: ' + error );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(title, 'diff=' + relative + ( title ? '' : '&oldid=' + revision )) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			} );
		}
	}
	else {
		if ( embed ) msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, ( noEmbed ? {} : {embed} ) );
		else msg.reactEmoji('error');
		
		if ( reaction ) reaction.removeEmoji();
	}
}

/**
 * Sends a Gamepedia edit.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the edit.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {String[]} [compare] - The edit difference.
 */
function gamepedia_diff_send(lang, msg, args, wiki, reaction, spoiler, noEmbed, compare) {
	got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvslots=main&rvprop=ids|timestamp|flags|user|size|parsedcomment|tags' + ( args.length === 1 || args[0] === args[1] ? '|content' : '' ) + '&revids=' + args.join('|') + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else if ( body.query.badrevids ) {
			msg.replyMsg( lang.get('diff.badrev') );
			
			if ( reaction ) reaction.removeEmoji();
		}
		else if ( body.query.pages && !body.query.pages['-1'] ) {
			wiki.updateWiki(body.query.general);
			logging(wiki, msg.guild?.id, 'diff');
			var pages = Object.values(body.query.pages);
			if ( pages.length !== 1 ) {
				msg.sendChannel( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			var title = pages[0].title;
			var revisions = pages[0].revisions.sort( (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp) );
			var diff = revisions[0].revid;
			var oldid = ( revisions[1] ? revisions[1].revid : 0 );
			var editor = [lang.get('diff.info.editor'), ( revisions[0].userhidden !== undefined ? lang.get('diff.hidden') : ( msg.showEmbed() && !noEmbed ? '[' + escapeFormatting(revisions[0].user) + '](' + wiki.toLink(( revisions[0].anon !== undefined ? 'Special:Contributions/' : 'User:' ) + revisions[0].user, '', '', true) + ')' : escapeFormatting(revisions[0].user) ) )];
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
			var size = [lang.get('diff.info.size'), lang.get('diff.info.bytes', ( difference > 0 ? '+' : '' ) + difference.toLocaleString(lang.get('dateformat')), difference) + ( revisions[0].minor !== undefined ? lang.get('diff.info.minor').replace( /_/g, ' ' ) : '' )];
			var comment = [lang.get('diff.info.comment'), ( revisions[0].commenthidden !== undefined ? lang.get('diff.hidden') : ( revisions[0].parsedcomment ? ( msg.showEmbed() && !noEmbed ? htmlToDiscord(revisions[0].parsedcomment, wiki.toLink(title), true) : htmlToPlain(revisions[0].parsedcomment) ) : lang.get('diff.nocomment') ) )];
			if ( revisions[0].tags.length ) var tags = [lang.get('diff.info.tags'), body.query.tags.filter( tag => tag.displayname && revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname || tag.name ).join(', ')];
			
			var pagelink = wiki.toLink(title, {diff,oldid});
			var text = '<' + pagelink + '>';
			if ( msg.showEmbed() && !noEmbed ) {
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( escapeFormatting( title + '?diff=' + diff + '&oldid=' + oldid ) ).setURL( pagelink ).addField( editor[0], editor[1], true ).addField( size[0], size[1], true ).addField( timestamp[0], timestamp[1] + '\n' + timestamp[2], true ).addField( comment[0], comment[1] ).setTimestamp( editDate );
				
				var more = '\n__' + lang.get('diff.info.more') + '__';
				var whitespace = '__' + lang.get('diff.info.whitespace') + '__';
				if ( !compare && oldid ) got.get( wiki + 'api.php?action=compare&prop=diff&fromrev=' + oldid + '&torev=' + diff + '&format=json' ).then( cpresponse => {
					var cpbody = cpresponse.body;
					if ( cpbody && cpbody.warnings ) log_warn(cpbody.warnings);
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
							embed.addField( lang.get('diff.info.removed'), edit_diff[0], true );
						}
						if ( edit_diff[1].length ) {
							embed.addField( lang.get('diff.info.added'), edit_diff[1], true );
						}
					}
					else if ( cpbody.compare.fromtexthidden !== undefined ) {
						embed.addField( lang.get('diff.info.removed'), '__' + lang.get('diff.hidden') + '__', true );
					}
					else if ( cpbody.compare.totexthidden !== undefined ) {
						embed.addField( lang.get('diff.info.added'), '__' + lang.get('diff.hidden') + '__', true );
					}
				}, error => {
					console.log( '- Error while getting the diff: ' + error );
				} ).finally( () => {
					if ( tags?.[1] ) embed.addField( tags[0], htmlToDiscord(tags[1], pagelink) );
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				} );
				else {
					if ( compare ) {
						if ( compare[0].length ) embed.addField( lang.get('diff.info.removed'), compare[0], true );
						if ( compare[1].length ) embed.addField( lang.get('diff.info.added'), compare[1], true );
					}
					else if ( ( revisions[0]?.slots?.main || revisions[0] )['*'] ) {
						var content = escapeFormatting( ( revisions[0]?.slots?.main || revisions[0] )['*'] );
						if ( content.trim().length ) {
							if ( content.length <= 1000 ) content = '**' + content + '**';
							else {
								content = content.substring(0, 1000 - more.length);
								content = '**' + content.substring(0, content.lastIndexOf('\n')) + '**' + more;
							}
							embed.addField( lang.get('diff.info.added'), content, true );
						} else embed.addField( lang.get('diff.info.added'), whitespace, true );
					}
					if ( tags?.[1] ) embed.addField( tags[0], htmlToDiscord(tags[1], pagelink) );
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				}
			}
			else {
				text += '\n\n' + editor.join(' ') + '\n' + timestamp.join(' ') + '\n' + size.join(' ') + '\n' + comment.join(' ');
				if ( tags?.[1] ) text += htmlToDiscord( '\n' + tags.join(' ') );
				
				msg.sendChannel( spoiler + text + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
		}
		else {
			msg.reactEmoji('error');
			
			if ( reaction ) reaction.removeEmoji();
		}
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'diff',
	run: gamepedia_diff
};
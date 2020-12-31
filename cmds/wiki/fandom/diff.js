const {MessageEmbed} = require('discord.js');
const logging = require('../../../util/logging.js');
const {timeoptions} = require('../../../util/default.json');
const {toFormatting, htmlToPlain} = require('../../../util/functions.js');
const diffParser = require('../../../util/edit_diff.js');

/**
 * Processes a Fandom edit.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the edit.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {MessageEmbed} [embed] - The embed for the page.
 */
function fandom_diff(lang, msg, args, wiki, reaction, spoiler, embed) {
	if ( args[0] ) {
		var error = false;
		var title = '';
		var revision = 0;
		var diff = 'prev';
		if ( /^\d+$/.test(args[0]) ) {
			revision = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					diff = args[1];
				}
				else if ( args[1] === 'prev' || args[1] === 'next' ) {
					diff = args[1];
				}
				else error = true;
			}
		}
		else if ( args[0] === 'prev' || args[0] === 'next' ) {
			diff = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					revision = args[1];
				}
				else error = true;
			}
			else error = true;
		}
		else title = args.join(' ');
		
		if ( error ) msg.reactEmoji('error');
		else if ( /^\d+$/.test(diff) ) {
			var argids = [];
			if ( parseInt(revision, 10) > parseInt(diff, 10) ) argids = [revision, diff];
			else if ( parseInt(revision, 10) === parseInt(diff, 10) ) argids = [revision];
			else argids = [diff, revision];
			fandom_diff_send(lang, msg, argids, wiki, reaction, spoiler);
		}
		else {
			got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=' + ( title ? '&titles=' + encodeURIComponent( title ) : '&revids=' + revision ) + '&rvdiffto=' + diff + '&format=json' ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warn(body.warnings);
				if ( response.statusCode !== 200 || !body || !body.query ) {
					if ( wiki.noWiki(response.url, response.statusCode) ) {
						console.log( '- This wiki doesn\'t exist!' );
						msg.reactEmoji('nowiki');
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
						msg.sendChannelError( spoiler + '<' + wiki.toLink(title, ( title ? {diff} : {diff,oldid:revision} )) + '>' + spoiler );
					}
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					if ( body.query.badrevids ) {
						msg.replyMsg( lang.get('diff.badrev') );
						
						if ( reaction ) reaction.removeEmoji();
					} else if ( body.query.pages && !body.query.pages[-1] ) {
						var revisions = Object.values(body.query.pages)[0].revisions[0];
						if ( revisions.texthidden === undefined ) {
							var argids = [];
							var ids = revisions.diff;
							if ( !ids.from ) argids = [ids.to];
							else {
								argids = [ids.to, ids.from];
								var compare = ['', ''];
								if ( ids['*'] !== undefined ) {
									let more = '\n__' + lang.get('diff.info.more') + '__';
									let whitespace = '__' + lang.get('diff.info.whitespace') + '__';
									compare = diffParser( ids['*'], more, whitespace );
								}
							}
							fandom_diff_send(lang, msg, argids, wiki, reaction, spoiler, compare);
						} else {
							msg.replyMsg( lang.get('diff.badrev') );
							
							if ( reaction ) reaction.removeEmoji();
						}
					} else {
						if ( body.query.pages && body.query.pages[-1] ) msg.replyMsg( lang.get('diff.badrev') );
						else msg.reactEmoji('error');
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
			}, error => {
				if ( wiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Error while getting the search results: ' + error );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(title, ( title ? {diff} : {diff,oldid:revision} )) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			} );
		}
	}
	else {
		if ( embed ) msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, {embed} );
		else msg.reactEmoji('error');
		
		if ( reaction ) reaction.removeEmoji();
	}
}

/**
 * Sends a Fandom edit.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the edit.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {String[]} [compare] - The edit difference.
 */
function fandom_diff_send(lang, msg, args, wiki, reaction, spoiler, compare) {
	got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags' + ( args.length === 1 || args[0] === args[1] ? '|content' : '' ) + '&revids=' + args.join('|') + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || !body.query ) {
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
			logging(wiki, 'diff', 'legacy');
			var pages = Object.values(body.query.pages);
			if ( pages.length !== 1 ) {
				msg.sendChannel( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				var title = pages[0].title;
				var revisions = pages[0].revisions.sort( (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp) );
				var diff = revisions[0].revid;
				var oldid = ( revisions[1] ? revisions[1].revid : 0 );
				var editor = [lang.get('diff.info.editor'), ( revisions[0].userhidden !== undefined ? lang.get('diff.hidden') : revisions[0].user )];
				var timestamp = [lang.get('diff.info.timestamp'), new Date(revisions[0].timestamp).toLocaleString(lang.get('dateformat'), timeoptions)];
				var difference = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
				var size = [lang.get('diff.info.size'), lang.get('diff.info.bytes', ( difference > 0 ? '+' : '' ) + difference)];
				var comment = [lang.get('diff.info.comment'), ( revisions[0].commenthidden !== undefined ? lang.get('diff.hidden') : ( revisions[0].comment ? toFormatting(revisions[0].comment, msg.showEmbed(), wiki, title) : lang.get('diff.nocomment') ) )];
				if ( revisions[0].tags.length ) var tags = [lang.get('diff.info.tags'), body.query.tags.filter( tag => revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname ).join(', ')];
				
				var pagelink = wiki.toLink(title, {diff,oldid});
				if ( msg.showEmbed() ) {
					var text = '<' + pagelink + '>';
					var editorlink = '[' + editor[1] + '](' + wiki.toLink('User:' + editor[1], '', '', true) + ')';
					if ( revisions[0].anon !== undefined ) {
						editorlink = '[' + editor[1] + '](' + wiki.toLink('Special:Contributions/' + editor[1], '', '', true) + ')';
					}
					if ( editor[1] === lang.get('diff.hidden') ) editorlink = editor[1];
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( ( title + '?diff=' + diff + '&oldid=' + oldid ).escapeFormatting() ).setURL( pagelink ).addField( editor[0], editorlink, true ).addField( size[0], size[1], true ).addField( comment[0], comment[1] ).setFooter( timestamp[1] );
					if ( tags ) embed.addField( tags[0], htmlToPlain(tags[1]) );
					
					var more = '\n__' + lang.get('diff.info.more') + '__';
					var whitespace = '__' + lang.get('diff.info.whitespace') + '__';
					if ( !compare && oldid ) got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=&revids=' + oldid + '&rvdiffto=' + diff + '&format=json' ).then( cpresponse => {
						var cpbody = cpresponse.body;
						if ( cpbody && cpbody.warnings ) log_warn(cpbody.warnings);
						if ( cpresponse.statusCode !== 200 || !cpbody || !cpbody.query || cpbody.query.badrevids || !cpbody.query.pages && cpbody.query.pages[-1] ) {
							console.log( '- ' + cpresponse.statusCode + ': Error while getting the diff: ' + ( cpbody && cpbody.error && cpbody.error.info ) );
						}
						else {
							var revision = Object.values(cpbody.query.pages)[0].revisions[0];
							if ( revision.texthidden === undefined && revision.diff && revision.diff['*'] !== undefined ) {
								let edit_diff = diffParser( revision.diff['*'], more, whitespace )
								if ( edit_diff[0].length ) {
									embed.addField( lang.get('diff.info.removed'), edit_diff[0], true );
								}
								if ( edit_diff[1].length ) {
									embed.addField( lang.get('diff.info.added'), edit_diff[1], true );
								}
							}
							else if ( revision.texthidden !== undefined ) {
								embed.addField( lang.get('diff.info.added'), '__' + lang.get('diff.hidden') + '__', true );
							}
							else if ( revision.diff && revision.diff['*'] === undefined ) {
								embed.addField( lang.get('diff.info.removed'), '__' + lang.get('diff.hidden') + '__', true );
							}
						}
					}, error => {
						console.log( '- Error while getting the diff: ' + error );
					} ).finally( () => {
						msg.sendChannel( spoiler + text + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					} );
					else {
						if ( compare ) {
							if ( compare[0].length ) embed.addField( lang.get('diff.info.removed'), compare[0], true );
							if ( compare[1].length ) embed.addField( lang.get('diff.info.added'), compare[1], true );
						}
						else if ( revisions[0]['*'] ) {
							var content = revisions[0]['*'].escapeFormatting();
							if ( content.trim().length ) {
								if ( content.length <= 1000 ) content = '**' + content + '**';
								else {
									content = content.substring(0, 1000 - more.length);
									content = '**' + content.substring(0, content.lastIndexOf('\n')) + '**' + more;
								}
								embed.addField( lang.get('diff.info.added'), content, true );
							} else embed.addField( lang.get('diff.info.added'), whitespace, true );
						}
						
						msg.sendChannel( spoiler + text + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
				else {
					var embed = {};
					var text = '<' + pagelink + '>\n\n' + editor.join(' ') + '\n' + timestamp.join(' ') + '\n' + size.join(' ') + '\n' + comment.join(' ');
					if ( tags ) text += htmlToPlain( '\n' + tags.join(' ') );
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				}
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
	run: fandom_diff
};
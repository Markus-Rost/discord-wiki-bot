const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const {timeoptions} = require('../../../util/default.json');

function gamepedia_diff(lang, msg, args, wiki, reaction, spoiler, embed) {
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
			gamepedia_diff_send(lang, msg, [diff, revision], wiki, reaction, spoiler);
		}
		else {
			got.get( wiki + 'api.php?action=compare&prop=ids|diff' + ( title ? '&fromtitle=' + encodeURIComponent( title ) : '&fromrev=' + revision ) + '&torelative=' + relative + '&format=json', {
				responseType: 'json'
			} ).then( response => {
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
					if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
						console.log( '- This wiki doesn\'t exist!' );
						msg.reactEmoji('nowiki');
					}
					else if ( noerror ) {
						msg.replyMsg( lang.diff.badrev );
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
						msg.sendChannelError( spoiler + '<' + wiki.toLink(title, 'diff=' + relative + ( title ? '' : '&oldid=' + revision )) + '>' + spoiler );
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
								var more = '\n__' + lang.diff.info.more + '__';
								var current_tag = '';
								var small_prev_ins = '';
								var small_prev_del = '';
								var ins_length = more.length;
								var del_length = more.length;
								var added = false;
								var parser = new htmlparser.Parser( {
									onopentag: (tagname, attribs) => {
										if ( tagname === 'ins' || tagname == 'del' ) {
											current_tag = tagname;
										}
										if ( tagname === 'td' && attribs.class === 'diff-addedline' ) {
											current_tag = tagname+'a';
										}
										if ( tagname === 'td' && attribs.class === 'diff-deletedline' ) {
											current_tag = tagname+"d";
										}
										if ( tagname === 'td' && attribs.class === 'diff-marker' ) {
											added = true;
										}
									},
									ontext: (htmltext) => {
										if ( current_tag === 'ins' && ins_length <= 1000 ) {
											ins_length += ( '**' + htmltext.escapeFormatting() + '**' ).length;
											if ( ins_length <= 1000 ) small_prev_ins += '**' + htmltext.escapeFormatting() + '**';
											else small_prev_ins += more;
										}
										if ( current_tag === 'del' && del_length <= 1000 ) {
											del_length += ( '~~' + htmltext.escapeFormatting() + '~~' ).length;
											if ( del_length <= 1000 ) small_prev_del += '~~' + htmltext.escapeFormatting() + '~~';
											else small_prev_del += more;
										}
										if ( ( current_tag === 'afterins' || current_tag === 'tda') && ins_length <= 1000 ) {
											ins_length += htmltext.escapeFormatting().length;
											if ( ins_length <= 1000 ) small_prev_ins += htmltext.escapeFormatting();
											else small_prev_ins += more;
										}
										if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && del_length <= 1000 ) {
											del_length += htmltext.escapeFormatting().length;
											if ( del_length <= 1000 ) small_prev_del += htmltext.escapeFormatting();
											else small_prev_del += more;
										}
										if ( added ) {
											if ( htmltext === '+' && ins_length <= 1000 ) {
												ins_length++;
												if ( ins_length <= 1000 ) small_prev_ins += '\n';
												else small_prev_ins += more;
											}
											if ( htmltext === '−' && del_length <= 1000 ) {
												del_length++;
												if ( del_length <= 1000 ) small_prev_del += '\n';
												else small_prev_del += more;
											}
											added = false;
										}
									},
									onclosetag: (tagname) => {
										if ( tagname === 'ins' ) {
											current_tag = 'afterins';
										} else if ( tagname === 'del' ) {
											current_tag = 'afterdel';
										} else {
											current_tag = '';
										}
									}
								}, {decodeEntities:true} );
								parser.write( ids['*'] );
								parser.end();
								if ( small_prev_del.length ) {
									if ( small_prev_del.replace( /\~\~/g, '' ).trim().length ) {
										compare[0] = small_prev_del.replace( /\~\~\~\~/g, '' );
									} else compare[0] = '__' + lang.diff.info.whitespace + '__';
								}
								if ( small_prev_ins.length ) {
									if ( small_prev_ins.replace( /\*\*/g, '' ).trim().length ) {
										compare[1] = small_prev_ins.replace( /\*\*\*\*/g, '' );
									} else compare[1] = '__' + lang.diff.info.whitespace + '__';
								}
							}
							else if ( ids.fromtexthidden !== undefined ) compare[0] = '__' + lang.diff.hidden + '__';
							else if ( ids.totexthidden !== undefined ) compare[1] = '__' + lang.diff.hidden + '__';
						}
						gamepedia_diff_send(lang, msg, argids, wiki, reaction, spoiler, compare);
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
		if ( embed ) msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, {embed} );
		else msg.reactEmoji('error');
		
		if ( reaction ) reaction.removeEmoji();
	}
}

function gamepedia_diff_send(lang, msg, args, wiki, reaction, spoiler, compare) {
	got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvslots=main&rvprop=ids|timestamp|flags|user|size|comment|tags' + ( args.length === 1 || args[0] === args[1] ? '|content' : '' ) + '&revids=' + args.join('|') + '&format=json', {
		responseType: 'json'
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0]) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else {
			if ( body.query.badrevids ) {
				msg.replyMsg( lang.diff.badrev );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( body.query.pages && !body.query.pages['-1'] ) {
				var pages = Object.values(body.query.pages);
				if ( pages.length !== 1 ) {
					msg.sendChannel( spoiler + '<' + wiki.toLink('Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0], '', '', body.query.general) + '>' + spoiler );
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					var title = pages[0].title;
					var revisions = pages[0].revisions.sort( (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp) );
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = [lang.diff.info.editor, ( revisions[0].userhidden !== undefined ? lang.diff.hidden : revisions[0].user )];
					var timestamp = [lang.diff.info.timestamp, new Date(revisions[0].timestamp).toLocaleString(lang.dateformat, timeoptions)];
					var difference = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
					var size = [lang.diff.info.size, lang.diff.info.bytes.replace( '%s', ( difference > 0 ? '+' : '' ) + difference )];
					var comment = [lang.diff.info.comment, ( revisions[0].commenthidden !== undefined ? lang.diff.hidden : ( revisions[0].comment ? revisions[0].comment.toFormatting(msg.showEmbed(), wiki, body.query.general, title) : lang.diff.nocomment ) )];
					if ( revisions[0].tags.length ) var tags = [lang.diff.info.tags, body.query.tags.filter( tag => revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname ).join(', ')];
					
					var pagelink = wiki.toLink(title, 'diff=' + diff + '&oldid=' + oldid, '', body.query.general);
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var editorlink = '[' + editor[1] + '](' + wiki.toLink('User:' + editor[1], '', '', body.query.general, true) + ')';
						if ( revisions[0].anon !== undefined ) {
							editorlink = '[' + editor[1] + '](' + wiki.toLink('Special:Contributions/' + editor[1], '', '', body.query.general, true) + ')';
						}
						if ( editor[1] === lang.diff.hidden ) editorlink = editor[1];
						var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( ( title + '?diff=' + diff + '&oldid=' + oldid ).escapeFormatting() ).setURL( pagelink ).addField( editor[0], editorlink, true ).addField( size[0], size[1], true ).addField( comment[0], comment[1] ).setFooter( timestamp[1] );
						if ( tags ) {
							var taglink = '';
							var tagtext = '';
							var tagparser = new htmlparser.Parser( {
								onopentag: (tagname, attribs) => {
									if ( tagname === 'a' ) taglink = attribs.href;
								},
								ontext: (htmltext) => {
									if ( taglink ) tagtext += '[' + htmltext.escapeFormatting() + '](' + taglink + ')'
									else tagtext += htmltext.escapeFormatting();
								},
								onclosetag: (tagname) => {
									if ( tagname === 'a' ) taglink = '';
								}
							}, {decodeEntities:true} );
							tagparser.write( tags[1] );
							tagparser.end();
							embed.addField( tags[0], tagtext );
						}
						
						var more = '\n__' + lang.diff.info.more + '__';
						if ( !compare && oldid ) got.get( wiki + 'api.php?action=compare&prop=diff&fromrev=' + oldid + '&torev=' + diff + '&format=json', {
							responseType: 'json'
						} ).then( cpresponse => {
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
								var current_tag = '';
								var small_prev_ins = '';
								var small_prev_del = '';
								var ins_length = more.length;
								var del_length = more.length;
								var added = false;
								var parser = new htmlparser.Parser( {
									onopentag: (tagname, attribs) => {
										if ( tagname === 'ins' || tagname == 'del' ) {
											current_tag = tagname;
										}
										if ( tagname === 'td' && attribs.class === 'diff-addedline' ) {
											current_tag = tagname+'a';
										}
										if ( tagname === 'td' && attribs.class === 'diff-deletedline' ) {
											current_tag = tagname+"d";
										}
										if ( tagname === 'td' && attribs.class === 'diff-marker' ) {
											added = true;
										}
									},
									ontext: (htmltext) => {
										if ( current_tag === 'ins' && ins_length <= 1000 ) {
											ins_length += ( '**' + htmltext.escapeFormatting() + '**' ).length;
											if ( ins_length <= 1000 ) small_prev_ins += '**' + htmltext.escapeFormatting() + '**';
											else small_prev_ins += more;
										}
										if ( current_tag === 'del' && del_length <= 1000 ) {
											del_length += ( '~~' + htmltext.escapeFormatting() + '~~' ).length;
											if ( del_length <= 1000 ) small_prev_del += '~~' + htmltext.escapeFormatting() + '~~';
											else small_prev_del += more;
										}
										if ( ( current_tag === 'afterins' || current_tag === 'tda') && ins_length <= 1000 ) {
											ins_length += htmltext.escapeFormatting().length;
											if ( ins_length <= 1000 ) small_prev_ins += htmltext.escapeFormatting();
											else small_prev_ins += more;
										}
										if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && del_length <= 1000 ) {
											del_length += htmltext.escapeFormatting().length;
											if ( del_length <= 1000 ) small_prev_del += htmltext.escapeFormatting();
											else small_prev_del += more;
										}
										if ( added ) {
											if ( htmltext === '+' && ins_length <= 1000 ) {
												ins_length++;
												if ( ins_length <= 1000 ) small_prev_ins += '\n';
												else small_prev_ins += more;
											}
											if ( htmltext === '−' && del_length <= 1000 ) {
												del_length++;
												if ( del_length <= 1000 ) small_prev_del += '\n';
												else small_prev_del += more;
											}
											added = false;
										}
									},
									onclosetag: (tagname) => {
										if ( tagname === 'ins' ) {
											current_tag = 'afterins';
										} else if ( tagname === 'del' ) {
											current_tag = 'afterdel';
										} else {
											current_tag = '';
										}
									}
								}, {decodeEntities:true} );
								parser.write( cpbody.compare['*'] );
								parser.end();
								if ( small_prev_del.length ) {
									if ( small_prev_del.replace( /\~\~/g, '' ).trim().length ) {
										embed.addField( lang.diff.info.removed, small_prev_del.replace( /\~\~\~\~/g, '' ), true );
									} else embed.addField( lang.diff.info.removed, '__' + lang.diff.info.whitespace + '__', true );
								}
								if ( small_prev_ins.length ) {
									if ( small_prev_ins.replace( /\*\*/g, '' ).trim().length ) {
										embed.addField( lang.diff.info.added, small_prev_ins.replace( /\*\*\*\*/g, '' ), true );
									} else embed.addField( lang.diff.info.added, '__' + lang.diff.info.whitespace + '__', true );
								}
							}
							else if ( cpbody.compare.fromtexthidden !== undefined ) {
								embed.addField( lang.diff.info.removed, '__' + lang.diff.hidden + '__', true );
							}
							else if ( cpbody.compare.totexthidden !== undefined ) {
								embed.addField( lang.diff.info.added, '__' + lang.diff.hidden + '__', true );
							}
						}, error => {
							console.log( '- Error while getting the diff: ' + error );
						} ).finally( () => {
							msg.sendChannel( spoiler + text + spoiler, {embed} );
							
							if ( reaction ) reaction.removeEmoji();
						} );
						else {
							if ( compare ) {
								if ( compare[0].length ) embed.addField( lang.diff.info.removed, compare[0], true );
								if ( compare[1].length ) embed.addField( lang.diff.info.added, compare[1], true );
							}
							else if ( revisions[0]['*'] ) {
								var content = revisions[0]['*'].escapeFormatting();
								if ( content.trim().length ) {
									if ( content.length <= 1000 ) content = '**' + content + '**';
									else {
										content = content.substring(0, 1000 - more.length);
										content = '**' + content.substring(0, content.lastIndexOf('\n')) + '**' + more;
									}
									embed.addField( lang.diff.info.added, content, true );
								} else embed.addField( lang.diff.info.added, '__' + lang.diff.info.whitespace + '__', true );
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

function htmlToPlain(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		}
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

module.exports = {
	name: 'diff',
	run: gamepedia_diff
};
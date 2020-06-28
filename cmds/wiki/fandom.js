const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const Lang = require('../../util/i18n.js');

const fs = require('fs');
var fn = {
	special_page: require('../../functions/special_page.js'),
	discussion: require('../../functions/discussion.js')
};
fs.readdir( './cmds/wiki/fandom', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('./fandom/' + file);
		fn[command.name] = command.run;
	} );
} );

function fandom_check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler = '', querystring = '', fragment = '', selfcall = 0) {
	var full_title = title;
	if ( title.includes( '#' ) ) {
		fragment = title.split('#').slice(1).join('#');
		title = title.split('#')[0];
	}
	if ( /\?\w+=/.test(title) ) {
		var querystart = title.search(/\?\w+=/);
		querystring = title.substring(querystart + 1) + ( querystring ? '&' + querystring : '' );
		title = title.substring(0, querystart);
	}
	if ( title.length > 250 ) {
		title = title.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	var invoke = title.split(' ')[0].toLowerCase();
	var aliasInvoke = ( lang.get('aliases')[invoke] || invoke );
	var args = title.split(' ').slice(1);
	
	if ( aliasInvoke === 'random' && !args.join('') && !querystring && !fragment ) fn.random(lang, msg, wiki, reaction, spoiler);
	else if ( aliasInvoke === 'overview' && !args.join('') && !querystring && !fragment ) fn.overview(lang, msg, wiki, reaction, spoiler);
	else if ( aliasInvoke === 'page' ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink(args.join('_'), querystring.toTitle(), fragment) + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( aliasInvoke === 'diff' && args.join('') && !querystring && !fragment ) fn.diff(lang, msg, args, wiki, reaction, spoiler);
	else {
		var noRedirect = ( /(?:^|&)redirect=no(?:&|$)/.test(querystring) || /(?:^|&)action=(?!view(?:&|$))/.test(querystring) );
		got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=description&amenableparser=true&siprop=general|namespaces|specialpagealiases|wikidesc&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=imageinfo|categoryinfo&titles=' + encodeURIComponent( title ) + '&format=json', {
			responseType: 'json'
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( response.statusCode !== 200 || !body || !body.query ) {
				if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(( querystring || fragment || !title ? title : 'Special:Search' ), ( querystring || fragment || !title ? querystring.toTitle() : 'search=' + title.toSearch() ), fragment) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( body.query.general.generator.startsWith( 'MediaWiki 1.3' ) ) {
				return this.gamepedia(lang, msg, title, wiki, cmd, reaction, spoiler, querystring, fragment, selfcall);
			}
			else if ( aliasInvoke === 'search' ) {
				fn.search(lang, msg, full_title.split(' ').slice(1).join(' '), wiki, body.query, reaction, spoiler);
			}
			else if ( aliasInvoke === 'discussion' && !querystring && !fragment ) {
				fn.discussion(lang, msg, wiki, args.join(' '), body.query, reaction, spoiler);
			}
			else {
				if ( body.query.pages ) {
					var querypages = Object.values(body.query.pages);
					var querypage = querypages[0];
					if ( body.query.redirects && body.query.redirects[0].from.split(':')[0] === body.query.namespaces['-1']['*'] && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk','MyLanguage'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ) ) {
						querypage.title = body.query.redirects[0].from;
						delete body.query.redirects[0].tofragment;
						delete querypage.missing;
						querypage.ns = -1;
						querypage.special = '';
					}
					if ( querypages.length !== 1 ) querypage = {
						title: title,
						invalidreason: 'The requested page title contains invalid characters: "|".',
						invalid: ''
					}
					
					var contribs = body.query.namespaces['-1']['*'] + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
					if ( querypage.ns === 2 && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
						var userparts = querypage.title.split(':');
						querypage.noRedirect = noRedirect;
						fn.user(lang, msg, userparts[0].toTitle() + ':', userparts.slice(1).join(':'), wiki, querystring, fragment, querypage, contribs.toTitle(), reaction, spoiler);
					}
					else if ( querypage.ns === -1 && querypage.title.startsWith( contribs ) && querypage.title.length > contribs.length ) {
						var username = querypage.title.split('/').slice(1).join('/');
						got.get( wiki + 'api.php?action=query&titles=User:' + encodeURIComponent( username ) + '&format=json', {
							responseType: 'json'
						} ).then( uresponse => {
							var ubody = uresponse.body;
							if ( uresponse.statusCode !== 200 || !ubody || !ubody.query ) {
								console.log( '- ' + uresponse.statusCode + ': Error while getting the user: ' + ( ubody && ubody.error && ubody.error.info ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink(contribs + username, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
								
								if ( reaction ) reaction.removeEmoji();
							}
							else {
								querypage = Object.values(ubody.query.pages)[0];
								if ( querypage.ns === 2 ) {
									username = querypage.title.split(':').slice(1).join(':');
									querypage.title = contribs + username;
									delete querypage.missing;
									querypage.ns = -1;
									querypage.special = '';
									querypage.noRedirect = noRedirect;
									fn.user(lang, msg, contribs.toTitle(), username, wiki, querystring, fragment, querypage, contribs.toTitle(), reaction, spoiler);
								}
								else {
									msg.reactEmoji('error');
									
									if ( reaction ) reaction.removeEmoji();
								}
							}
						}, error => {
							console.log( '- Error while getting the user: ' + error );
							msg.sendChannelError( spoiler + '<' + wiki.toLink(contribs + username, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else if ( querypage.ns === 1201 && querypage.missing !== undefined ) {
						var thread = querypage.title.split(':');
						got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=user&rvdir=newer&rvlimit=1&pageids=' + thread.slice(1).join(':') + '&format=json', {
							responseType: 'json'
						} ).then( thresponse => {
							var thbody = thresponse.body;
							if ( thresponse.statusCode !== 200 || !thbody || !thbody.query || !thbody.query.pages ) {
								console.log( '- ' + thresponse.statusCode + ': Error while getting the thread: ' + ( thbody && thbody.error && thbody.error.info ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
								
								if ( reaction ) reaction.removeEmoji();
							}
							else {
								querypage = thbody.query.pages[thread.slice(1).join(':')];
								if ( querypage.missing !== undefined ) {
									msg.reactEmoji('🤷');
									
									if ( reaction ) reaction.removeEmoji();
								}
								else {
									var pagelink = wiki.toLink(thread.join(':'), querystring.toTitle(), fragment, body.query.general);
									var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( thread.join(':').escapeFormatting() ).setURL( pagelink ).setFooter( querypage.revisions[0].user );
									got.get( wiki.toDescLink(querypage.title) ).then( descresponse => {
										var descbody = descresponse.body;
										if ( descresponse.statusCode !== 200 || !descbody ) {
											console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
										} else {
											var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general);
											var parser = new htmlparser.Parser( {
												onopentag: (tagname, attribs) => {
													if ( tagname === 'meta' && attribs.property === 'og:description' ) {
														var description = attribs.content.escapeFormatting();
														if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
														embed.setDescription( description );
													}
													if ( tagname === 'meta' && attribs.property === 'og:image' ) {
														thumbnail = attribs.content;
													}
												}
											}, {decodeEntities:true} );
											parser.write( descbody );
											parser.end();
											embed.setThumbnail( thumbnail );
										}
									}, error => {
										console.log( '- Error while getting the description: ' + error );
									} ).finally( () => {
										msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
										
										if ( reaction ) reaction.removeEmoji();
									} );
								}
							}
						}, error => {
							console.log( '- Error while getting the thread: ' + error );
							msg.sendChannelError( spoiler + '<' + wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else if ( ( querypage.missing !== undefined && querypage.known === undefined && !( noRedirect || querypage.categoryinfo ) ) || querypage.invalid !== undefined ) {
						got.get( wiki + 'api/v1/Search/List?minArticleQuality=0&namespaces=4,12,14,' + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join(',') + '&limit=1&query=' + encodeURIComponent( title ) + '&format=json', {
							responseType: 'json'
						} ).then( wsresponse => {
							var wsbody = wsresponse.body;
							if ( wsresponse.statusCode !== 200 || !wsbody || wsbody.exception || !wsbody.total || !wsbody.items || !wsbody.items.length ) {
								if ( wsbody && ( !wsbody.total || ( wsbody.items && !wsbody.items.length ) || ( wsbody.exception && wsbody.exception.code === 404 ) ) ) msg.reactEmoji('🤷');
								else {
									console.log( '- ' + wsresponse.statusCode + ': Error while getting the search results: ' + ( wsbody && wsbody.exception && wsbody.exception.details ) );
									msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', 'search=' + title.toSearch(), '', body.query.general) + '>' + spoiler );
								}
								
								if ( reaction ) reaction.removeEmoji();
							}
							else {
								querypage = wsbody.items[0];
								if ( querypage.ns && !querypage.title.startsWith( body.query.namespaces[querypage.ns]['*'] + ':' ) ) {
									querypage.title = body.query.namespaces[querypage.ns]['*'] + ':' + querypage.title;
								}
								
								var text = '';
								var prefix = ( msg.channel.type === 'text' && patreons[msg.guild.id] || process.env.prefix );
								var linksuffix = ( querystring ? '?' + querystring : '' ) + ( fragment ? '#' + fragment : '' );
								if ( title.replace( /\-/g, ' ' ).toTitle().toLowerCase() === querypage.title.replace( /\-/g, ' ' ).toTitle().toLowerCase() ) {
									text = '';
								}
								else if ( wsbody.total === 1 ) {
									text = '\n' + lang.get('search.infopage').replaceSave( '%s', '`' + prefix + cmd + lang.get('search.page') + ' ' + title + linksuffix + '`' );
								}
								else {
									text = '\n' + lang.get('search.infosearch').replaceSave( '%1$s', '`' + prefix + cmd + lang.get('search.page') + ' ' + title + linksuffix + '`' ).replaceSave( '%2$s', '`' + prefix + cmd + lang.get('search.search') + ' ' + title + linksuffix + '`' );
								}
								got.get( wiki + 'api.php?action=query&prop=imageinfo|categoryinfo&titles=' + encodeURIComponent( querypage.title ) + '&format=json', {
									responseType: 'json'
								} ).then( srresponse => {
									var srbody = srresponse.body;
									if ( srbody && srbody.warnings ) log_warn(srbody.warnings);
									if ( srresponse.statusCode !== 200 || !srbody || !srbody.query || !srbody.query.pages ) {
										console.log( '- ' + srresponse.statusCode + ': Error while getting the search results: ' + ( srbody && srbody.error && srbody.error.info ) );
										msg.sendChannelError( spoiler + '<' + wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
										
										if ( reaction ) reaction.removeEmoji();
									}
									else {
										querypage = Object.values(srbody.query.pages)[0];
										var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general);
										var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
										if ( querypage.imageinfo ) {
											var filename = querypage.title.replace( body.query.namespaces['6']['*'] + ':', '' );
											var pageimage = wiki.toLink('Special:FilePath/' + filename, 'v=' + Date.now(), '', body.query.general);
											if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
											else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + filename}] );
										}
										if ( querypage.categoryinfo ) {
											var langCat = new Lang(lang.lang, 'search.category');
											var category = [langCat.get('content')];
											if ( querypage.categoryinfo.size === 0 ) category.push(langCat.get('empty'));
											if ( querypage.categoryinfo.pages > 0 ) {
												let pages = querypage.categoryinfo.pages;
												let count = langCat.get('pages');
												category.push(( count[pages] || count['*' + pages % 100] || count['*' + pages % 10] || langCat.get('pages.default') ).replaceSave( '%s', pages ));
											}
											if ( querypage.categoryinfo.files > 0 ) {
												let files = querypage.categoryinfo.files;
												let count = langCat.get('files');
												category.push(( count[files] || count['*' + files % 100] || count['*' + files % 10] || langCat.get('files.default') ).replaceSave( '%s', files ));
											}
											if ( querypage.categoryinfo.subcats > 0 ) {
												let subcats = querypage.categoryinfo.subcats;
												let count = langCat.get('subcats');
												category.push(( count[subcats] || count['*' + subcats % 100] || count['*' + subcats % 10] || langCat.get('subcats.default') ).replaceSave( '%s', subcats ));
											}
											if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
											else text += '\n\n' + category.join('\n');
										}
										
										if ( querypage.title === body.query.general.mainpage && body.query.allmessages[0]['*'] ) {
											embed.setDescription( body.query.allmessages[0]['*'] );
											embed.setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general) );
											
											msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
											
											if ( reaction ) reaction.removeEmoji();
										}
										else got.get( wiki.toDescLink(querypage.title) ).then( descresponse => {
											var descbody = descresponse.body;
											if ( descresponse.statusCode !== 200 || !descbody ) {
												console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
											} else {
												var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general);
												var parser = new htmlparser.Parser( {
													onopentag: (tagname, attribs) => {
														if ( tagname === 'meta' && attribs.property === 'og:description' ) {
															var description = attribs.content.escapeFormatting();
															if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
															embed.setDescription( description );
														}
														if ( tagname === 'meta' && attribs.property === 'og:image' && querypage.title !== body.query.general.mainpage ) {
															thumbnail = attribs.content;
														}
													}
												}, {decodeEntities:true} );
												parser.write( descbody );
												parser.end();
												if ( !querypage.imageinfo ) embed.setThumbnail( thumbnail );
											}
										}, error => {
											console.log( '- Error while getting the description: ' + error );
										} ).finally( () => {
											msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
											
											if ( reaction ) reaction.removeEmoji();
										} );
									}
								}, error => {
									console.log( '- Error while getting the search results: ' + error );
									msg.sendChannelError( spoiler + '<' + wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
									
									if ( reaction ) reaction.removeEmoji();
								} );
							}
						}, error => {
							console.log( '- Error while getting the search results: ' + error );
							msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', 'search=' + title.toSearch(), '', body.query.general) + '>' + spoiler );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else if ( querypage.ns === -1 ) {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general);
						var embed =  new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink ).setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general) );
						var specialpage = body.query.specialpagealiases.find( sp => body.query.namespaces['-1']['*'] + ':' + sp.aliases[0].replace( /\_/g, ' ' ) === querypage.title.split('/')[0] );
						specialpage = ( specialpage ? specialpage.realname : querypage.title.replace( body.query.namespaces['-1']['*'] + ':', '' ).split('/')[0] ).toLowerCase();
						fn.special_page(lang, msg, querypage.title, specialpage, embed, wiki, reaction, spoiler);
					}
					else {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment || '' ) ), body.query.general);
						var text = '';
						var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.imageinfo ) {
							var filename = querypage.title.replace( body.query.namespaces['6']['*'] + ':', '' );
							var pageimage = wiki.toLink('Special:FilePath/' + filename, 'v=' + Date.now(), '', body.query.general);
							if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
							else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + filename}] );
						}
						if ( querypage.categoryinfo ) {
							var langCat = new Lang(lang.lang, 'search.category');
							var category = [langCat.get('content')];
							if ( querypage.categoryinfo.size === 0 ) category.push(langCat.get('empty'));
							if ( querypage.categoryinfo.pages > 0 ) {
								let pages = querypage.categoryinfo.pages;
								let count = langCat.get('pages');
								category.push(( count[pages] || count['*' + pages % 100] || count['*' + pages % 10]  || langCat.get('pages.default') ).replaceSave( '%s', pages ));
							}
							if ( querypage.categoryinfo.files > 0 ) {
								let files = querypage.categoryinfo.files;
								let count = langCat.get('files');
								category.push(( count[files] || count['*' + files % 100] || count['*' + files % 10]  || langCat.get('files.default') ).replaceSave( '%s', files ));
							}
							if ( querypage.categoryinfo.subcats > 0 ) {
								let subcats = querypage.categoryinfo.subcats;
								let count = langCat.get('subcats');
								category.push(( count[subcats] || count['*' + subcats % 100] || count['*' + subcats % 10]  || langCat.get('subcats.default') ).replaceSave( '%s', subcats ));
							}
							if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
							else text += '\n\n' + category.join('\n');
						}
						
						if ( querypage.title === body.query.general.mainpage && body.query.allmessages[0]['*'] ) {
							embed.setDescription( body.query.allmessages[0]['*'] );
							embed.setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general) );
							
							msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
							
							if ( reaction ) reaction.removeEmoji();
						}
						else got.get( wiki.toDescLink(querypage.title) ).then( descresponse => {
							var descbody = descresponse.body;
							if ( descresponse.statusCode !== 200 || !descbody ) {
								console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
							} else {
								var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general);
								var parser = new htmlparser.Parser( {
									onopentag: (tagname, attribs) => {
										if ( tagname === 'meta' && attribs.property === 'og:description' ) {
											var description = attribs.content.escapeFormatting();
											if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
											embed.setDescription( description );
										}
										if ( tagname === 'meta' && attribs.property === 'og:image' && querypage.title !== body.query.general.mainpage ) {
											thumbnail = attribs.content;
										}
									}
								}, {decodeEntities:true} );
								parser.write( descbody );
								parser.end();
								if ( !querypage.imageinfo ) embed.setThumbnail( thumbnail );
							}
						}, error => {
							console.log( '- Error while getting the description: ' + error );
						} ).finally( () => {
							msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
				}
				else if ( body.query.interwiki ) {
					var inter = body.query.interwiki[0];
					var intertitle = inter.title.substring(inter.iw.length + 1);
					var regex = inter.url.match( /^(?:https?:)?\/\/(([a-z\d-]{1,50})\.(?:fandom\.com|wikia\.org)(?:(?!\/wiki\/)\/([a-z-]{2,8}))?)(?:\/wiki\/|\/?$)/ );
					var maxselfcall = ( msg.channel.type === 'text' && msg.guild.id in patreons ? 10 : 5 );
					if ( regex !== null && selfcall < maxselfcall ) {
						if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
							var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
							selfcall++;
							this.fandom(lang, msg, iwtitle, 'https://' + regex[1] + '/', '?' + ( regex[3] ? regex[3] + '.' : '' ) + regex[2] + ' ', reaction, spoiler, querystring, fragment, selfcall);
						} else {
							if ( reaction ) reaction.removeEmoji();
							console.log( '- Aborted, paused.' );
						}
					} else {
						regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.gamepedia\.com(?:\/|$)/ );
						if ( regex !== null && selfcall < maxselfcall ) {
							if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
								var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
								selfcall++;
								this.gamepedia(lang, msg, iwtitle, 'https://' + regex[1] + '.gamepedia.com/', '!' + regex[1] + ' ', reaction, spoiler, querystring, fragment, selfcall);
							} else {
								if ( reaction ) reaction.removeEmoji();
								console.log( '- Aborted, paused.' );
							}
						} else {
							regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50}\.(?:wikipedia|mediawiki|wiktionary|wikimedia|wikibooks|wikisource|wikidata|wikiversity|wikiquote|wikinews|wikivoyage)\.org)(?:\/wiki\/|\/?$)/ );
							if ( regex !== null && selfcall < maxselfcall ) {
								if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
									var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
									selfcall++;
									this.gamepedia(lang, msg, iwtitle, 'https://' + regex[1] + '/w/', cmd + inter.iw + ':', reaction, spoiler, querystring, fragment, selfcall);
								} else {
									if ( reaction ) reaction.removeEmoji();
									console.log( '- Aborted, paused.' );
								}
							} else {
								if ( fragment ) fragment = '#' + fragment.toSection();
								if ( inter.url.includes( '#' ) ) {
									if ( !fragment ) fragment = '#' + inter.url.split('#').slice(1).join('#');
									inter.url = inter.url.split('#')[0];
								}
								if ( querystring ) inter.url += ( inter.url.includes( '?' ) ? '&' : '?' ) + querystring.toTitle();
								msg.sendChannel( spoiler + ' ' + inter.url.replace( /@(here|everyone)/g, '%40$1' ) + fragment + ' ' + spoiler ).then( message => {
									if ( message && selfcall === maxselfcall ) message.reactEmoji('⚠️');
								} );
								if ( reaction ) reaction.removeEmoji();
							}
						}
					}
				}
				else if ( body.query.redirects ) {
					var pagelink = wiki.toLink(body.query.redirects[0].to, querystring.toTitle(), ( fragment || body.query.redirects[0].tofragment || '' ) );
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.redirects[0].to.escapeFormatting() ).setURL( pagelink ).setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general) );
					
					msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();;
				}
				else {
					var pagelink = wiki.toLink(body.query.general.mainpage, querystring.toTitle(), fragment, body.query.general);
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.general.mainpage.escapeFormatting() ).setURL( pagelink ).setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general) );
					
					if ( body.query.allmessages[0]['*'] ) {
						embed.setDescription( body.query.allmessages[0]['*'] );
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					}
					else got.get( wiki.toDescLink(body.query.general.mainpage) ).then( descresponse => {
						var descbody = descresponse.body;
						if ( descresponse.statusCode !== 200 || !descbody ) {
							console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
						} else {
							var parser = new htmlparser.Parser( {
								onopentag: (tagname, attribs) => {
									if ( tagname === 'meta' && attribs.property === 'og:description' ) {
										var description = attribs.content.escapeFormatting();
										if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
										embed.setDescription( description );
									}
								}
							}, {decodeEntities:true} );
							parser.write( descbody );
							parser.end();
						}
					}, error => {
						console.log( '- Error while getting the description: ' + error );
					} ).finally( () => {
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
			}
		}, error => {
			if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Error while getting the search results: ' + error );
				msg.sendChannelError( spoiler + '<' + wiki.toLink(( querystring || fragment || !title ? title : 'Special:Search' ), ( querystring || fragment || !title ? querystring.toTitle() : 'search=' + title.toSearch() ), fragment) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

module.exports = fandom_check_wiki;
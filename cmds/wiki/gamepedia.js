const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const extract_desc = require('../../util/extract_desc.js');
const {limit: {interwiki: interwikiLimit}, wikiProjects} = require('../../util/default.json');

const fs = require('fs');
var fn = {
	special_page: require('../../functions/special_page.js'),
	discussion: require('../../functions/discussion.js')
};
fs.readdir( './cmds/wiki/gamepedia', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('./gamepedia/' + file);
		fn[command.name] = command.run;
	} );
} );
var minecraft = {};
fs.readdir( './cmds/minecraft', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('../minecraft/' + file);
		minecraft[command.name] = command.run;
	} );
} );

function gamepedia_check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler = '', querystring = '', fragment = '', interwiki = '', selfcall = 0) {
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
	
	var mcaliasInvoke = ( lang.get('minecraft.aliases')[invoke] || invoke );
	if ( !msg.notMinecraft && wiki === lang.get('minecraft.link') && ( mcaliasInvoke in minecraft || invoke.startsWith( '/' ) ) ) {
		minecraft.WIKI = this;
		if ( mcaliasInvoke in minecraft ) minecraft[mcaliasInvoke](lang, msg, args, title, cmd, querystring, fragment, reaction, spoiler);
		else minecraft.SYNTAX(lang, msg, invoke.substring(1), args, title, cmd, querystring, fragment, reaction, spoiler);
	}
	else if ( aliasInvoke === 'random' && !args.join('') && !querystring && !fragment ) fn.random(lang, msg, wiki, reaction, spoiler);
	else if ( aliasInvoke === 'overview' && !args.join('') && !querystring && !fragment ) fn.overview(lang, msg, wiki, reaction, spoiler);
	else if ( aliasInvoke === 'test' && !args.join('') && !querystring && !fragment ) {
		this.test(lang, msg, args, '', wiki);
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( aliasInvoke === 'page' ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink(args.join('_'), querystring.toTitle(), fragment) + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( aliasInvoke === 'diff' && args.join('') && !querystring && !fragment ) fn.diff(lang, msg, args, wiki, reaction, spoiler);
	else {
		var noRedirect = ( /(?:^|&)redirect=no(?:&|$)/.test(querystring) || /(?:^|&)action=(?!view(?:&|$))/.test(querystring) );
		got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general|namespaces|specialpagealiases&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageimages|categoryinfo|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle&explaintext=true&exsectionformat=raw&exlimit=1&titles=%1F' + encodeURIComponent( title.replace( /\x1F/g, '\ufffd' ) ) + '&format=json', {
			responseType: 'json'
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
				if ( interwiki ) msg.sendChannel( spoiler + ' ' + interwiki.replace( /@(here|everyone)/g, '%40$1' ) + fragment + ' ' + spoiler );
				else if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink( ( querystring || fragment || !title ? title : 'Special:Search' ), ( querystring || fragment || !title ? querystring.toTitle() : 'search=' + title.toSearch() ), fragment) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( aliasInvoke === 'search' ) {
				fn.search(lang, msg, full_title.split(' ').slice(1).join(' '), wiki, body.query, reaction, spoiler);
			}
			else if ( aliasInvoke === 'discussion' && wiki.isFandom() && !querystring && !fragment ) {
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
					
					var contribs = body.query.namespaces['-1']['*'] + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
					if ( ( querypage.ns === 2 || querypage.ns === 202 || querypage.ns === 1200 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
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
							if ( uresponse.statusCode !== 200 || !ubody || ubody.batchcomplete === undefined || !ubody.query ) {
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
					else if ( ( querypage.missing !== undefined && querypage.known === undefined && !( noRedirect || querypage.categoryinfo ) ) || querypage.invalid !== undefined ) {
						got.get( wiki + 'api.php?action=query&prop=pageimages|categoryinfo|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle&explaintext=true&exsectionformat=raw&exlimit=1&generator=search&gsrnamespace=4|12|14|' + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json', {
							responseType: 'json'
						} ).then( srresponse => {
							var srbody = srresponse.body;
							if ( srbody && srbody.warnings ) log_warn(srbody.warnings);
							if ( srresponse.statusCode !== 200 || !srbody || srbody.batchcomplete === undefined ) {
								console.log( '- ' + srresponse.statusCode + ': Error while getting the search results: ' + ( srbody && srbody.error && srbody.error.info ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', 'search=' + title.toSearch(), '', body.query.general) + '>' + spoiler );
							}
							else {
								if ( !srbody.query ) {
									msg.reactEmoji('🤷');
								}
								else {
									querypage = Object.values(srbody.query.pages)[0];
									var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general);
									var text = '';
									var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
									if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
										var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
										if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
										embed.setTitle( displaytitle );
									}
									if ( querypage.extract ) {
										var extract = extract_desc(querypage.extract, fragment);
										embed.setDescription( extract[0] );
										if ( extract[2].length ) embed.addField( extract[1], extract[2] );
									}
									if ( querypage.pageprops && querypage.pageprops.description ) {
										var description = htmlToPlain( querypage.pageprops.description );
										if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
										embed.setDescription( description );
									}
									if ( querypage.pageimage && querypage.original && querypage.title !== body.query.general.mainpage ) {
										var pageimage = querypage.original.source;
										if ( querypage.ns === 6 ) {
											if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.pageimage.toLowerCase()) ) embed.setImage( pageimage );
											else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + querypage.pageimage}] );
										} else embed.setThumbnail( pageimage );
									} else embed.setThumbnail( logoToURL(body.query.general) );
									
									var prefix = ( msg.channel.type === 'text' && patreons[msg.guild.id] || process.env.prefix );
									var linksuffix = ( querystring ? '?' + querystring : '' ) + ( fragment ? '#' + fragment : '' );
									if ( title.replace( /\-/g, ' ' ).toTitle().toLowerCase() === querypage.title.replace( /\-/g, ' ' ).toTitle().toLowerCase() ) {
										text = '';
									}
									else if ( !srbody.continue ) {
										text = '\n' + lang.get('search.infopage', '`' + prefix + cmd + lang.get('search.page') + ' ' + title + linksuffix + '`');
									}
									else {
										text = '\n' + lang.get('search.infosearch', '`' + prefix + cmd + lang.get('search.page') + ' ' + title + linksuffix + '`', '`' + prefix + cmd + lang.get('search.search') + ' ' + title + linksuffix + '`');
									}
									
									if ( querypage.categoryinfo ) {
										var category = [lang.get('search.category.content')];
										if ( querypage.categoryinfo.size === 0 ) {
											category.push(lang.get('search.category.empty'));
										}
										if ( querypage.categoryinfo.pages > 0 ) {
											category.push(lang.get('search.category.pages', querypage.categoryinfo.pages));
										}
										if ( querypage.categoryinfo.files > 0 ) {
											category.push(lang.get('search.category.files', querypage.categoryinfo.files));
										}
										if ( querypage.categoryinfo.subcats > 0 ) {
											category.push(lang.get('search.category.subcats', querypage.categoryinfo.subcats));
										}
										if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
										else text += '\n\n' + category.join('\n');
									}
						
									msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
								}
							}
						}, error => {
							console.log( '- Error while getting the search results: ' + error );
							msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', 'search=' + title.toSearch(), '', body.query.general) + '>' + spoiler );
						} ).finally( () => {
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else if ( querypage.ns === -1 ) {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general);
						var embed =  new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink ).setThumbnail( logoToURL(body.query.general) );
						var specialpage = body.query.specialpagealiases.find( sp => body.query.namespaces['-1']['*'] + ':' + sp.aliases[0].replace( /\_/g, ' ' ) === querypage.title.split('/')[0] );
						specialpage = ( specialpage ? specialpage.realname : querypage.title.replace( body.query.namespaces['-1']['*'] + ':', '' ).split('/')[0] ).toLowerCase();
						fn.special_page(lang, msg, querypage.title, specialpage, embed, wiki, reaction, spoiler);
					}
					else {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ), body.query.general);
						var text = '';
						var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
							var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
							if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
							embed.setTitle( displaytitle );
						}
						if ( querypage.extract ) {
							var extract = extract_desc(querypage.extract, ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ));
							embed.setDescription( extract[0] );
							if ( extract[2].length ) embed.addField( extract[1], extract[2] );
						}
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = htmlToPlain( querypage.pageprops.description );
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						if ( querypage.pageimage && querypage.original && querypage.title !== body.query.general.mainpage ) {
							var pageimage = querypage.original.source;
							if ( querypage.ns === 6 ) {
								if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.pageimage.toLowerCase()) ) embed.setImage( pageimage );
								else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + querypage.pageimage}] );
							} else embed.setThumbnail( pageimage );
						} else embed.setThumbnail( logoToURL(body.query.general) );
						if ( querypage.categoryinfo ) {
							var category = [lang.get('search.category.content')];
							if ( querypage.categoryinfo.size === 0 ) {
								category.push(lang.get('search.category.empty'));
							}
							if ( querypage.categoryinfo.pages > 0 ) {
								category.push(lang.get('search.category.pages', querypage.categoryinfo.pages));
							}
							if ( querypage.categoryinfo.files > 0 ) {
								category.push(lang.get('search.category.files', querypage.categoryinfo.files));
							}
							if ( querypage.categoryinfo.subcats > 0 ) {
								category.push(lang.get('search.category.subcats', querypage.categoryinfo.subcats));
							}
							if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
							else text += '\n\n' + category.join('\n');
						}
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
				else if ( body.query.interwiki ) {
					if ( msg.channel.type === 'text' && pause[msg.guild.id] ) {
						if ( reaction ) reaction.removeEmoji();
						console.log( '- Aborted, paused.' );
						return;
					}
					interwiki = body.query.interwiki[0].url;
					var maxselfcall = interwikiLimit[( msg?.guild?.id in patreons ? 'patreon' : 'default' )];
					if ( selfcall < maxselfcall && /^(?:https?:)?\/\//.test(interwiki) ) {
						selfcall++;
						var regex = interwiki.match( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.gamepedia\.com(?:\/|$)/ );
						if ( regex ) {
							let iwtitle = decodeURIComponent( interwiki.replace( regex[0], '' ) ).replace( /\_/g, ' ' );
							this.gamepedia(lang, msg, iwtitle, 'https://' + regex[1] + '.gamepedia.com/', '!' + regex[1] + ' ', reaction, spoiler, querystring, fragment, interwiki, selfcall);
							return;
						}
						regex = interwiki.match( /^(?:https?:)?\/\/(([a-z\d-]{1,50})\.(?:fandom\.com|wikia\.org)(?:(?!\/wiki\/)\/([a-z-]{2,12}))?)(?:\/wiki\/|\/?$)/ );
						if ( regex ) {
							let iwtitle = decodeURIComponent( interwiki.replace( regex[0], '' ) ).replace( /\_/g, ' ' );
							this.fandom(lang, msg, iwtitle, 'https://' + regex[1] + '/', ( regex[1].includes( '.wikia.org' ) ? '??' : '?' ) + ( regex[3] ? regex[3] + '.' : '' ) + regex[2] + ' ', reaction, spoiler, querystring, fragment, interwiki, selfcall);
							return;
						}
						let project = wikiProjects.find( project => interwiki.split('/')[2].endsWith( project.name ) );
						if ( project ) {
							regex = interwiki.match( new RegExp( '^(?:https?:)?//' + project.regex + `(?:${project.articlePath}|/?$)` ) );
							if ( regex ) {
								let iwtitle = decodeURIComponent( interwiki.replace( regex[0], '' ) ).replace( /\_/g, ' ' );
								this.gamepedia(lang, msg, iwtitle, 'https://' + regex[1] + project.scriptPath, cmd + body.query.interwiki[0].iw + ':', reaction, spoiler, querystring, fragment, interwiki, selfcall);
								return;
							}
						}
					}
					if ( fragment ) fragment = '#' + fragment.toSection();
					if ( interwiki.includes( '#' ) ) {
						if ( !fragment ) fragment = '#' + interwiki.split('#').slice(1).join('#');
						interwiki = interwiki.split('#')[0];
					}
					if ( querystring ) interwiki += ( interwiki.includes( '?' ) ? '&' : '?' ) + querystring.toTitle();
					msg.sendChannel( spoiler + ' ' + interwiki.replace( /@(here|everyone)/g, '%40$1' ) + fragment + ' ' + spoiler ).then( message => {
						if ( message && selfcall === maxselfcall ) message.reactEmoji('⚠️');
					} );
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( body.query.redirects ) {
					var pagelink = wiki.toLink(body.query.redirects[0].to, querystring.toTitle(), ( fragment || body.query.redirects[0].tofragment || '' ), body.query.general);
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.redirects[0].to.escapeFormatting() ).setURL( pagelink ).setThumbnail( logoToURL(body.query.general) );
					
					msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();;
				}
				else {
					var pagelink = wiki.toLink(body.query.general.mainpage, querystring.toTitle(), fragment, body.query.general);
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.general.mainpage.escapeFormatting() ).setURL( pagelink ).setThumbnail( logoToURL(body.query.general) );
					got.get( wiki + 'api.php?action=query' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageprops|extracts&ppprop=description|displaytitle&explaintext=true&exsectionformat=raw&exlimit=1&titles=' + encodeURIComponent( body.query.general.mainpage ) + '&format=json', {
						responseType: 'json'
					} ).then( mpresponse => {
						var mpbody = mpresponse.body;
						if ( mpbody && mpbody.warnings ) log_warn(body.warnings);
						if ( mpresponse.statusCode !== 200 || !mpbody || mpbody.batchcomplete === undefined || !mpbody.query ) {
							console.log( '- ' + mpresponse.statusCode + ': Error while getting the main page: ' + ( mpbody && mpbody.error && mpbody.error.info ) );
						} else {
							var querypage = Object.values(mpbody.query.pages)[0];
							if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
								var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
								if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
								embed.setTitle( displaytitle );
							}
							if ( querypage.extract ) {
								var extract = extract_desc(querypage.extract, fragment);
								embed.setDescription( extract[0] );
								if ( extract[2].length ) embed.addField( extract[1], extract[2] );
							}
							if ( querypage.pageprops && querypage.pageprops.description ) {
								var description = htmlToPlain( querypage.pageprops.description );
								if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
								embed.setDescription( description );
							}
						}
					}, error => {
						console.log( '- Error while getting the main page: ' + error );
					} ).finally( () => {
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
			}
		}, error => {
			if ( interwiki ) msg.sendChannel( spoiler + ' ' + interwiki.replace( /@(here|everyone)/g, '%40$1' ) + fragment + ' ' + spoiler );
			else if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Error while getting the search results: ' + error );
				msg.sendChannelError( spoiler + '<' + wiki.toLink( ( querystring || fragment || !title ? title : 'Special:Search' ), ( querystring || fragment || !title ? querystring.toTitle() : 'search=' + title.toSearch() ), fragment) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

function logoToURL({logo, server: serverURL}) {
	if ( /^(?:https?:)?\/\//.test(logo) ) logo = logo.replace( /^(?:https?:)?\/\//, 'https://' );
	else logo = serverURL + ( logo.startsWith( '/' ) ? '' : '/' ) + logo;
	return logo;
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

function htmlToDiscord(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		},
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		},
		onclosetag: (tagname) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		}
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

module.exports = gamepedia_check_wiki;
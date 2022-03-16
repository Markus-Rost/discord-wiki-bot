import { readdir } from 'fs';
import { MessageEmbed } from 'discord.js';
import parse_page from '../../functions/parse_page.js';
import phabricator from '../../functions/phabricator.js';
import logging from '../../util/logging.js';
import { got, htmlToDiscord, escapeFormatting, partialURIdecode, breakOnTimeoutPause } from '../../util/functions.js';
import extract_desc from '../../util/extract_desc.js';
import Wiki from '../../util/wiki.js';
import * as fn from './functions.js'
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {limit: {interwiki: interwikiLimit}, wikiProjects} = require('../../util/default.json');
const {wikis: mcw} = require('../minecraft/commands.json');

var minecraft = {};
readdir( './cmds/minecraft', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		import('../minecraft/' + file).then( ({default: command}) => {
			minecraft[command.name] = command.run;
		} );
	} );
} );

/**
 * Checks a Gamepedia wiki.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {Wiki} wiki - The wiki for the page.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} [spoiler] - If the response is in a spoiler.
 * @param {Boolean} [noEmbed] - If the response should be without an embed.
 * @param {URLSearchParams} [querystring] - The querystring for the link.
 * @param {String} [fragment] - The section for the link.
 * @param {String} [interwiki] - The fallback interwiki link.
 * @param {Number} [selfcall] - The amount of followed interwiki links.
 */
export default function gamepedia_check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler = '', noEmbed = false, querystring = new URLSearchParams(), fragment = '', interwiki = '', selfcall = 0) {
	var full_title = title;
	if ( title.includes( '#' ) ) {
		fragment = title.split('#').slice(1).join('#').trim().replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
		title = title.split('#')[0];
	}
	if ( /\?\w+=/.test(title) ) {
		let querystart = title.search(/\?\w+=/);
		querystring = new URLSearchParams(querystring + '&' + title.substring(querystart + 1));
		title = title.substring(0, querystart);
	}
	title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
	if ( title.length > 250 ) {
		title = title.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	var invoke = full_title.split(' ')[0].toLowerCase();
	var aliasInvoke = ( lang.aliases[invoke] || invoke );
	var args = full_title.split(' ').slice(1);
	
	if ( aliasInvoke === 'random' && !args.join('') && !querystring.toString() && !fragment ) {
		return fn.random(lang, msg, wiki, reaction, spoiler, noEmbed);
	}
	if ( aliasInvoke === 'overview' && !args.join('') && !querystring.toString() && !fragment ) {
		return fn.overview(lang, msg, wiki, reaction, spoiler, noEmbed);
	}
	if ( aliasInvoke === 'test' && !args.join('') && !querystring.toString() && !fragment ) {
		this.test(lang, msg, args, '', wiki);
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	if ( aliasInvoke === 'page' ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink(args.join('_'), querystring, fragment) + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	if ( aliasInvoke === 'diff' && args.join('') && !querystring.toString() && !fragment ) {
		return fn.diff(lang, msg, args, wiki, reaction, spoiler, noEmbed);
	}
	var noRedirect = ( querystring.getAll('redirect').pop() === 'no' || ( querystring.has('action') && querystring.getAll('action').pop() !== 'view' ) );
	var uselang = lang.lang;
	if ( querystring.has('variant') || querystring.has('uselang') ) {
		uselang = ( querystring.getAll('variant').pop() || querystring.getAll('uselang').pop() || uselang );
		lang = lang.uselang(querystring.getAll('variant').pop(), querystring.getAll('uselang').pop());
	}
	got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=siteinfo&siprop=general|namespaces|namespacealiases|specialpagealiases&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&converttitles=true&titles=%1F' + encodeURIComponent( ( aliasInvoke === 'search' ? full_title.split(' ').slice(1).join(' ') : title ).replace( /\x1F/g, '\ufffd' ) ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( interwiki ) msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + interwiki + ( noEmbed ? '>' : ' ' ) + spoiler );
			else if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink( ( querystring.toString() || fragment || !title ? title : 'Special:Search' ), ( querystring.toString() || fragment || !title ? querystring : {search:title} ), fragment) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		wiki.updateWiki(body.query.general);
		if ( aliasInvoke === 'search' ) {
			logging(wiki, msg.guildId, 'search');
			return fn.search(lang, msg, full_title.split(' ').slice(1).join(' '), wiki, body.query, reaction, spoiler, noEmbed);
		}
		if ( aliasInvoke === 'discussion' && wiki.isFandom(false) && !querystring.toString() && !fragment ) {
			logging(wiki, msg.guildId, 'discussion');
			return fn.discussion(lang, msg, wiki, args.join(' '), body.query.general.sitename, reaction, spoiler, noEmbed);
		}
		if ( !msg.notMinecraft && mcw.hasOwnProperty(wiki.href) && ( minecraft.hasOwnProperty(aliasInvoke) || invoke.startsWith( '/' ) ) && !querystring.toString() && !fragment ) {
			logging(wiki, msg.guildId, 'minecraft', ( minecraft.hasOwnProperty(aliasInvoke) ? aliasInvoke : 'command' ));
			minecraft.WIKI = this;
			if ( minecraft.hasOwnProperty(aliasInvoke) ) minecraft[aliasInvoke](lang, msg, wiki, args, title, cmd, reaction, spoiler, noEmbed);
			else minecraft.SYNTAX(lang, msg, wiki, invoke.substring(1), args, title, cmd, reaction, spoiler, noEmbed);
			return;
		}
		if ( body.query.pages && body.query.pages?.['-1']?.title !== '%1F' ) {
			var querypages = Object.values(body.query.pages);
			var querypage = querypages[0];
			if ( body.query.redirects && body.query.redirects[0].from.split(':')[0] === body.query.namespaces['-1']['*'] && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk','MyLanguage'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ) ) {
				noRedirect = ( body.query.specialpagealiases.find( sp => sp.realname === 'MyLanguage' )?.aliases?.[0] === body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ? noRedirect : true );
				querypage.title = body.query.redirects[0].from;
				delete body.query.redirects[0].tofragment;
				delete querypage.pageprops;
				delete querypage.extract;
				delete querypage.pageimage;
				delete querypage.original;
				delete querypage.missing;
				querypage.ns = -1;
				querypage.special = '';
				querypage.contentmodel = 'wikitext';
			}
			querypage.uselang = uselang;
			querypage.noRedirect = noRedirect;
			
			var contribs = body.query.namespaces['-1']['*'] + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
			if ( ( querypage.ns === 2 || querypage.ns === 202 || querypage.ns === 1200 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
				var userparts = querypage.title.split(':');
				querypage.noRedirect = noRedirect;
				return fn.user(lang, msg, userparts[0] + ':', userparts.slice(1).join(':'), wiki, querystring, fragment, querypage, contribs, reaction, spoiler, noEmbed);
			}
			if ( querypage.ns === -1 && querypage.title.startsWith( contribs ) && querypage.title.length > contribs.length ) {
				var username = querypage.title.split('/').slice(1).join('/');
				return got.get( wiki + 'api.php?action=query&titles=User:' + encodeURIComponent( username ) + '&format=json' ).then( uresponse => {
					var ubody = uresponse.body;
					if ( uresponse.statusCode !== 200 || !ubody || ubody.batchcomplete === undefined || !ubody.query ) {
						console.log( '- ' + uresponse.statusCode + ': Error while getting the user: ' + ( ubody && ubody.error && ubody.error.info ) );
						msg.sendChannelError( spoiler + '<' + wiki.toLink(contribs + username, querystring, fragment) + '>' + spoiler );
						
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
							querypage.uselang = uselang;
							querypage.noRedirect = noRedirect;
							fn.user(lang, msg, contribs, username, wiki, querystring, fragment, querypage, contribs, reaction, spoiler, noEmbed);
						}
						else {
							msg.reactEmoji('error');
							
							if ( reaction ) reaction.removeEmoji();
						}
					}
				}, error => {
					console.log( '- Error while getting the user: ' + error );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(contribs + username, querystring, fragment) + '>' + spoiler );
					
					if ( reaction ) reaction.removeEmoji();
				} );
			}
			if ( wiki.isMiraheze() && querypage.ns === 0 && /^Mh:[a-z\d]+:/.test(querypage.title) ) {
				logging(wiki, msg.guildId, 'interwiki', 'miraheze');
				var iw_parts = querypage.title.split(':');
				var iw = new Wiki('https://' + iw_parts[1] + '.miraheze.org/w/');
				var iw_link = iw.toLink(iw_parts.slice(2).join(':'), querystring, fragment);
				var maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
				if ( selfcall < maxselfcall ) {
					selfcall++;
					return this.general(lang, msg, iw_parts.slice(2).join(':'), iw, '!!' + iw.hostname + ' ', reaction, spoiler, noEmbed, querystring, fragment, iw_link, selfcall);
				}
				msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + iw_link + ( noEmbed ? '>' : ' ' ) + spoiler ).then( message => {
					if ( message && selfcall === maxselfcall ) message.reactEmoji('⚠️');
				} );
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			if ( ( querypage.missing !== undefined && querypage.known === undefined && !( noRedirect || querypage.categoryinfo ) ) || querypage.invalid !== undefined ) return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&generator=search&gsrnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json' ).then( srresponse => {
				logging(wiki, msg.guildId, 'general', 'search');
				var srbody = srresponse.body;
				if ( srbody?.warnings ) log_warning(srbody.warnings);
				if ( srresponse.statusCode !== 200 || !srbody || srbody.batchcomplete === undefined ) {
					console.log( '- ' + srresponse.statusCode + ': Error while getting the search results: ' + srbody?.error?.info );
					msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', {search:title}) + '>' + spoiler );
				
					if ( reaction ) reaction.removeEmoji();
					return;
				}
				if ( querypage.ns === 12 && wiki.isFandom() ) {
					return got.head( wiki.articleURL.href.replace( '$1', encodeURIComponent( querypage.title ).replace( /%3A/g, ':' ) ), {
						followRedirect: false
					} ).then( hresponse => {
						if ( hresponse.statusCode === 301 && /^https:\/\/[a-z\d-]{1,50}\.fandom\.com\/(?:(?!wiki\/)[a-z-]{2,12}\/)?wiki\/Help:/.test( hresponse.headers?.location ) ) {
							var location = hresponse.headers.location.split('wiki/');
							if ( location[0] === wiki.href && location.slice(1).join('wiki/').replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ).replace( /_/g, ' ' ) === querypage.title ) {
								if ( srbody.query ) return srbody;
								msg.reactEmoji('🤷');
								
								if ( reaction ) reaction.removeEmoji();
								return;
							}
							var maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
							if ( selfcall < maxselfcall ) {
								selfcall++;
								return this.general(lang, msg, location.slice(1).join('wiki/'), new Wiki(location[0]), cmd, reaction, spoiler, noEmbed, querystring, fragment, '', selfcall);
							}
							msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + hresponse.headers.location + ( noEmbed ? '>' : ' ' ) + spoiler ).then( message => {
								if ( message && selfcall === maxselfcall ) message.reactEmoji('⚠️');
							} );
							if ( reaction ) reaction.removeEmoji();
							return;
						}
						if ( srbody.query ) return srbody;
						msg.reactEmoji('🤷');
						
						if ( reaction ) reaction.removeEmoji();
					}, error => {
						console.log( '- Error while checking the help redirect: ' + error );
						if ( srbody.query ) return srbody;
						msg.reactEmoji('🤷');
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
				if ( !srbody.query ) {
					return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&generator=search&gsrwhat=text&gsrnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json' ).then( tsrresponse => {
						var tsrbody = tsrresponse.body;
						if ( tsrbody?.warnings ) log_warning(tsrbody.warnings);
						if ( tsrresponse.statusCode !== 200 || !tsrbody || tsrbody.batchcomplete === undefined ) {
							if ( tsrbody?.error?.code !== 'search-text-disabled' ) console.log( '- ' + tsrresponse.statusCode + ': Error while getting the text search results: ' + tsrbody?.error?.info );
						}
						else if ( tsrbody.query ) return tsrbody;
						msg.reactEmoji('🤷');
						
						if ( reaction ) reaction.removeEmoji();
					}, error => {
						console.log( '- Error while getting the text search results: ' + error );
						msg.reactEmoji('🤷');
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
				return srbody;
			} ).then( srbody => {
				if ( !srbody?.query?.pages ) return;
				querypage = Object.values(srbody.query.pages)[0];
				querypage.uselang = uselang;
				var pagelink = wiki.toLink(querypage.title, querystring, fragment);
				var text = '';
				var embed = new MessageEmbed().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
				if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
					var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
					if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
					embed.setTitle( displaytitle );
				}
				if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract, fragment);
					embed.backupDescription = extract[0];
					if ( extract[1].length && extract[2].length ) {
						embed.backupField = {name: extract[1], value: extract[2]};
					}
				}
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToDiscord( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.backupDescription = description;
				}
				if ( querypage.ns === 6 ) {
					var pageimage = ( querypage?.original?.source || wiki.toLink('Special:FilePath/' + querypage.title, {version:Date.now()}) );
					if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
					else if ( querypage.title.toLowerCase().endsWith( '.svg' ) && querypage?.original?.width && msg.showEmbed() ) {
						embed.setImage( wiki.toLink('Special:FilePath/' + querypage.title, {width:querypage.original.width,version:Date.now()}) );
					}
				}
				else if ( querypage.title === body.query.general.mainpage ) {
					embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				}
				else if ( querypage.pageimage && querypage.original ) {
					embed.setThumbnail( querypage.original.source );
				}
				else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
					embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
				}
				else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				
				var prefix = ( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix );
				var linksuffix = ( querystring.toString() ? '?' + querystring : '' ) + ( fragment ? '#' + fragment : '' );
				if ( title.replace( /[_-]/g, ' ' ).toLowerCase() === querypage.title.replace( /-/g, ' ' ).toLowerCase() ) {
					text = '';
				}
				else if ( !srbody.continue ) {
					text = '\n' + lang.get('search.infopage', '`' + prefix + cmd + ( lang.localNames.page || 'page' ) + ' ' + title + linksuffix + '`');
				}
				else {
					text = '\n' + lang.get('search.infosearch', '`' + prefix + cmd + ( lang.localNames.page || 'page' ) + ' ' + title + linksuffix + '`', '`' + prefix + cmd + ( lang.localNames.search || 'search' ) + ' ' + title + linksuffix + '`');
				}
				
				if ( querypage.categoryinfo ) {
					var category = [lang.get('search.category.content')];
					if ( querypage.categoryinfo.size === 0 ) {
						category.push(lang.get('search.category.empty'));
					}
					if ( querypage.categoryinfo.pages > 0 ) {
						category.push(lang.get('search.category.pages', querypage.categoryinfo.pages.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.pages));
					}
					if ( querypage.categoryinfo.files > 0 ) {
						category.push(lang.get('search.category.files', querypage.categoryinfo.files.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.files));
					}
					if ( querypage.categoryinfo.subcats > 0 ) {
						category.push(lang.get('search.category.subcats', querypage.categoryinfo.subcats.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.subcats));
					}
					if ( msg.showEmbed() && !noEmbed ) embed.addField( category[0], category.slice(1).join('\n') );
					else text += '\n\n' + category.join('\n');
				}

				return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ), fragment, pagelink);
			}, error => {
				logging(wiki, msg.guildId, 'general', 'search');
				console.log( '- Error while getting the search results: ' + error );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Search', {search:title}) + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			} );
			if ( querypage.ns === -1 ) {
				var specialpage = body.query.specialpagealiases.find( sp => body.query.namespaces['-1']['*'] + ':' + sp.aliases[0].replace( /\_/g, ' ' ) === querypage.title.split('/')[0] );
				specialpage = ( specialpage ? specialpage.realname : querypage.title.replace( body.query.namespaces['-1']['*'] + ':', '' ).split('/')[0] ).toLowerCase();
				if ( !['mylanguage'].includes( specialpage ) ) {
					return fn.special_page(lang, msg, querypage, specialpage, body.query, wiki, querystring, fragment, reaction, spoiler, noEmbed);
				}
			}
			if ( querypage.ns === -2 ) {
				logging(wiki, msg.guildId, 'general', 'media');
				var filepath = body.query.specialpagealiases.find( sp => sp.realname === 'Filepath' );
				var pagelink = wiki.toLink(body.query.namespaces['-1']['*'] + ':' + ( filepath?.aliases?.[0] || 'FilePath' ) + querypage.title.replace( body.query.namespaces['-2']['*'] + ':', '/' ), querystring, fragment);
				var embed = null;
				if ( !noEmbed ) {
					embed = new MessageEmbed().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink ).setDescription( '[' + lang.get('search.media') + '](' + wiki.toLink(querypage.title, '', '', true) + ')' );
					if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pagelink );
				}
				
				msg.sendChannel( {content: spoiler + '<' + pagelink + '>' + spoiler, embeds: [embed]} );
				
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			logging(wiki, msg.guildId, 'general');
			var pagelink = wiki.toLink(querypage.title, querystring, ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ));
			var text = '';
			var embed = new MessageEmbed().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
			if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				embed.setTitle( displaytitle );
			}
			if ( querypage.extract ) {
				var extract = extract_desc(querypage.extract, ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ));
				embed.backupDescription = extract[0];
				if ( extract[1].length && extract[2].length ) {
					embed.backupField = {name: extract[1], value: extract[2]};
				}
			}
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = htmlToDiscord( querypage.pageprops.description );
				if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
				embed.backupDescription = description;
			}
			if ( querypage.ns === 6 ) {
				var pageimage = ( querypage?.original?.source || wiki.toLink('Special:FilePath/' + querypage.title, {version:Date.now()}) );
				if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
			}
			else if ( querypage.title === body.query.general.mainpage ) {
				embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			else if ( querypage.pageimage && querypage.original ) {
				embed.setThumbnail( querypage.original.source );
			}
			else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
				embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
			}
			else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			if ( querypage.categoryinfo ) {
				var category = [lang.get('search.category.content')];
				if ( querypage.categoryinfo.size === 0 ) {
					category.push(lang.get('search.category.empty'));
				}
				if ( querypage.categoryinfo.pages > 0 ) {
					category.push(lang.get('search.category.pages', querypage.categoryinfo.pages.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.pages));
				}
				if ( querypage.categoryinfo.files > 0 ) {
					category.push(lang.get('search.category.files', querypage.categoryinfo.files.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.files));
				}
				if ( querypage.categoryinfo.subcats > 0 ) {
					category.push(lang.get('search.category.subcats', querypage.categoryinfo.subcats.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.subcats));
				}
				if ( msg.showEmbed() && !noEmbed ) embed.addField( category[0], category.slice(1).join('\n') );
				else text += '\n\n' + category.join('\n');
			}
			
			return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ), ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ), pagelink);
		}
		if ( body.query.interwiki ) {
			if ( breakOnTimeoutPause(msg) ) {
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			var iw = new URL(body.query.interwiki[0].url.replace( /\\/g, '%5C' ).replace( /@(here|everyone)/g, '%40$1' ), wiki);
			querystring.forEach( (value, name) => {
				iw.searchParams.append(name, value);
			} );
			if ( fragment ) iw.hash = Wiki.toSection(fragment);
			else fragment = iw.hash.substring(1);
			if ( /^phabricator\.(wikimedia|miraheze)\.org$/.test(iw.hostname) ) {
				return phabricator(lang, msg, wiki, iw, reaction, spoiler, noEmbed);
			}
			logging(wiki, msg.guildId, 'interwiki');
			var maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
			if ( selfcall < maxselfcall && ['http:','https:'].includes( iw.protocol ) ) {
				selfcall++;
				if ( iw.hostname.endsWith( '.gamepedia.com' ) ) {
					let iwtitle = decodeURIComponent( iw.pathname.substring(1) ).replace( /_/g, ' ' );
					cmd = '!' + iw.hostname.replace( '.gamepedia.com', ' ' );
					if ( cmd !== '!www ' ) return this.general(lang, msg, iwtitle, new Wiki(iw.origin), cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
				}
				if ( iw.hostname.endsWith( '.fandom.com' ) || iw.hostname.endsWith( '.wikia.org' ) ) {
					let regex = iw.pathname.match( /^(\/(?!wiki\/)[a-z-]{2,12})?(?:\/wiki\/|\/?$)/ );
					if ( regex ) {
						let path = ( regex[1] || '' );
						let iwtitle = decodeURIComponent( iw.pathname.replace( regex[0], '' ) ).replace( /_/g, ' ' );
						cmd = ( iw.hostname.endsWith( '.wikia.org' ) ? '??' : '?' ) + ( path ? path.substring(1) + '.' : '' ) + iw.hostname.replace( /\.(?:fandom\.com|wikia\.org)/, ' ' );
						return this.general(lang, msg, iwtitle, new Wiki(iw.origin + path + '/'), cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
					}
				}
				let project = wikiProjects.find( project => iw.hostname.endsWith( project.name ) );
				if ( project ) {
					let regex = ( iw.host + iw.pathname ).match( new RegExp( '^' + project.regex + '(?:' + project.articlePath + '|/?$)' ) );
					if ( regex ) {
						let iwtitle = decodeURIComponent( ( iw.host + iw.pathname ).replace( regex[0], '' ) ).replace( /_/g, ' ' );
						cmd = '!!' + regex[1] + ' ';
						return this.general(lang, msg, iwtitle, new Wiki('https://' + regex[1] + project.scriptPath), cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
					}
				}
			}
			msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + iw + ( noEmbed ? '>' : ' ' ) + spoiler ).then( message => {
				if ( message && selfcall === maxselfcall ) message.reactEmoji('⚠️');
			} );
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		logging(wiki, msg.guildId, 'general');
		var querypage = {
			title: body.query.general.mainpage,
			contentmodel: 'wikitext',
			uselang, noRedirect
		};
		var pagelink = wiki.toLink(querypage.title, querystring, fragment);
		var embed = new MessageEmbed().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink ).setThumbnail( new URL(body.query.general.logo, wiki).href );
		got.get( wiki + 'api.php?uselang=' + uselang + '&action=query' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=info|pageprops|extracts&ppprop=description|displaytitle|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&titles=' + encodeURIComponent( querypage.title ) + '&format=json' ).then( mpresponse => {
			var mpbody = mpresponse.body;
			if ( mpbody && mpbody.warnings ) log_warning(body.warnings);
			if ( mpresponse.statusCode !== 200 || !mpbody || mpbody.batchcomplete === undefined || !mpbody.query ) {
				console.log( '- ' + mpresponse.statusCode + ': Error while getting the main page: ' + ( mpbody && mpbody.error && mpbody.error.info ) );
				return;
			}
			querypage = Object.values(mpbody.query.pages)[0];
			if ( mpbody.query.redirects && mpbody.query.redirects[0].from.split(':')[0] === body.query.namespaces['-1']['*'] && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( mpbody.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ) ) {
				noRedirect = true;
				querypage.title = mpbody.query.redirects[0].from;
				delete mpbody.query.redirects[0].tofragment;
				delete querypage.pageprops;
				delete querypage.extract;
				delete querypage.missing;
				querypage.ns = -1;
				querypage.special = '';
				querypage.contentmodel = 'wikitext';
			}
			querypage.uselang = uselang;
			querypage.noRedirect = noRedirect;
			if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				embed.setTitle( displaytitle );
			}
			if ( querypage.extract ) {
				var extract = extract_desc(querypage.extract, fragment);
				embed.backupDescription = extract[0];
				if ( extract[1].length && extract[2].length ) {
					embed.backupField = {name: extract[1], value: extract[2]};
				}
			}
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = htmlToDiscord( querypage.pageprops.description );
				if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
				embed.backupDescription = description;
			}
		}, error => {
			console.log( '- Error while getting the main page: ' + error );
		} ).finally( () => {
			parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', fragment, pagelink);
		} );
	}, error => {
		if ( interwiki ) msg.sendChannel( spoiler + ( noEmbed ? '<' : ' ' ) + interwiki + ( noEmbed ? '>' : ' ' ) + spoiler );
		else if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink( ( querystring.toString() || fragment || !title ? title : 'Special:Search' ), ( querystring.toString() || fragment || !title ? querystring : {search:title} ), fragment) + '>' + spoiler );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}
import { readdir } from 'node:fs';
import { EmbedBuilder } from 'discord.js';
import { getWikiProject, urlToIdString } from 'mediawiki-projects-list';
import mcwCommands from '../minecraft/commands.json' with { type: 'json' };
import { botLimits } from '../../util/defaults.js';
import parse_page from '../../functions/parse_page.js';
import phabricator, { phabricatorSites } from '../../functions/phabricator.js';
import logging from '../../util/logging.js';
import { got, isMessage, htmlToDiscord, escapeFormatting, escapeRegExp, partialURIdecode, breakOnTimeoutPause } from '../../util/functions.js';
import extract_desc from '../../util/extract_desc.js';
import Wiki from '../../util/wiki.js';
import * as fn from './functions.js'

const {interwiki: interwikiLimit} = botLimits;
const mcw = mcwCommands.wikis;

var minecraft = {
	WIKI: mw_check_wiki
};
readdir( './cmds/minecraft', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		import('../minecraft/' + file).then( ({default: command}) => {
			minecraft[command.name] = command.run;
		} );
	} );
} );

/**
 * Checks a wiki.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {Wiki} wiki - The wiki for the page.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} [reaction] - The reaction on the message.
 * @param {String} [spoiler] - If the response is in a spoiler.
 * @param {Boolean} [noEmbed] - If the response should be without an embed.
 * @param {URLSearchParams} [querystring] - The querystring for the link.
 * @param {String} [fragment] - The section for the link.
 * @param {String} [interwiki] - The fallback interwiki link.
 * @param {Number} [selfcall] - The amount of followed interwiki links.
 * @returns {Promise<{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>}
 */
export default function mw_check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler = '', noEmbed = false, querystring = new URLSearchParams(), fragment = '', interwiki = '', selfcall = 0) {
	if ( selfcall === 0 && title.startsWith('https://') && title.split('/').length > 3 ) {
		try {
			let iw = new URL(title.replaceAll( '\\', '%5C' ).replace( /@(here|everyone)/g, '%40$1' ), wiki);
			querystring.forEach( (value, name) => {
				iw.searchParams.append(name, value);
			} );
			if ( fragment ) iw.hash = Wiki.toSection(fragment, wiki.spaceReplacement);
			else fragment = iw.hash.substring(1);
			if ( phabricatorSites.has(iw.hostname) ) {
				return phabricator(lang, msg, wiki, iw, spoiler, noEmbed);
			}
			if ( iw.hostname === 'bugs.mojang.com' && minecraft.hasOwnProperty('bug') && !iw.searchParams.toString() && !iw.hash ) {
				let bug = iw.pathname.match( /^\/browse\/([A-Z]{2,6}-\d+)$/ );
				if ( bug ) {
					logging(wiki, msg.guildId, 'minecraft', 'bug');
					return minecraft.bug(lang, msg, wiki, [bug[1]], title, cmd, reaction, spoiler, noEmbed);
				}
			}
			if ( ['http:','https:'].includes( iw.protocol ) ) {
				let project = getWikiProject(iw.hostname);
				if ( project ) {
					let articlePath = escapeRegExp( project.regexPaths ? '/' : project.articlePath.split('?')[0] );
					let regex = ( iw.host + iw.pathname ).match( new RegExp( '^' + project.regex + '(?:' + articlePath + '|/?$)' ) );
					if ( regex ) {
						let iwtitle = decodeURIComponent( ( iw.host + iw.pathname ).replace( regex[0], '' ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );
						let scriptPath = project.scriptPath;
						if ( project.regexPaths ) scriptPath = scriptPath.replace( /\$(\d)/g, (match, n) => regex[n] );
						let iwwiki = new Wiki('https://' + regex[1] + scriptPath);
						if ( msg.wikiWhitelist.length && !msg.wikiWhitelist.includes( iwwiki.href ) ) return Promise.resolve( {message: lang.get('general.whitelist')} );
						if ( isMessage(msg) ) {
							cmd = '!!' + regex[1] + ' ';
							if ( msg.wikiPrefixes.has(iwwiki.name) ) cmd = msg.wikiPrefixes.get(iwwiki.name);
							else if ( msg.wikiPrefixes.has(project.name) ) {
								let idString = urlToIdString(iwwiki);
								if ( idString ) cmd = msg.wikiPrefixes.get(project.name) + idString + ' ';
							}
						}
						else if ( msg.commandName === 'interwiki' ) {
							cmd = `</${msg.commandName}:${msg.commandId}> wiki:${regex[1]} title:`;
						}
						else {
							let command = msg.client.application.commands.cache.find( cmd => cmd.name === 'interwiki' );
							if ( command ) cmd = `</${command.name}:${command.id}> wiki:${regex[1]} title:`;
							else cmd += body.query.interwiki[0].iw + ':';
						}
						return mw_check_wiki(lang, msg, iwtitle, iwwiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, ++selfcall);
					}
				}
				else if ( iw.host === wiki.host && iw.pathname.startsWith( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ) {
					let iwtitle = decodeURIComponent( iw.pathname.replace( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );
					return mw_check_wiki(lang, msg, iwtitle, wiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, ++selfcall);
				}
			}
		}
		catch {}
	}
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
	if ( !title ) {
		wiki.articleURL.searchParams.forEach( (value, name) => {
			if ( value.includes( '$1' ) && querystring.has(name) ) {
				title = querystring.get(name);
				querystring.delete(name);
				if ( value !== '$1' ) {
					title = title.replace( new RegExp( '^' + escapeRegExp(value).replaceAll( '$1', '(.*?)' ) + '$' ), '$1' );
				}
			}
		} );
	}
	if ( !title && querystring.has('title') ) {
		title = querystring.get('title');
		querystring.delete('title');
	}
	title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
	if ( title.length > 250 ) {
		title = title.substring(0, 250);
		msg?.fetchReply?.().then( message => message?.reactEmoji?.('warning'), log_error );
		msg?.reactEmoji?.('warning');
	}
	var invoke = full_title.split(' ')[0].toLowerCase();
	var aliasInvoke = ( lang.aliases[invoke] || invoke );
	var args = full_title.split(' ').slice(1);
	
	if ( aliasInvoke === 'random' && !args.join('') && !querystring.toString() && !fragment ) {
		return fn.random(lang, msg, wiki, reaction, spoiler, noEmbed);
	}
	if ( aliasInvoke === 'overview' && !args.join('') && !querystring.toString() && !fragment ) {
		return fn.overview(lang, msg, wiki, spoiler, noEmbed);
	}
	if ( aliasInvoke === 'test' && !args.join('') && !querystring.toString() && !fragment && isMessage(msg) ) {
		fn.test(lang, msg, [], '', wiki);
		if ( reaction ) reaction.removeEmoji();
		return Promise.resolve();
	}
	if ( aliasInvoke === 'page' ) {
		return Promise.resolve( {message: spoiler + '<' + wiki.toLink(args.join(' '), querystring, fragment) + '>' + spoiler} );
	}
	if ( aliasInvoke === 'diff' && args.join('') && !querystring.toString() && !fragment ) {
		return fn.diff(lang, msg, args, wiki, spoiler, noEmbed);
	}
	if ( querystring.has('diff') && [...querystring.keys()].every(name => ['diff', 'oldid', 'curid', 'title'].includes( name )) && !fragment ) {
		return fn.diff(lang, msg, [querystring.get('diff'), querystring.get('oldid')], wiki, spoiler, noEmbed);
	}
	var noRedirect = ( querystring.getAll('redirect').pop() === 'no' || ( querystring.has('action') && querystring.getAll('action').pop() !== 'view' ) );
	var uselang = ( isMessage(msg) || msg.inCachedGuild?.() ? lang.lang : 'content' );
	if ( querystring.has('variant') || querystring.has('uselang') ) {
		uselang = ( querystring.getAll('variant').pop() || querystring.getAll('uselang').pop() || uselang );
		lang = lang.uselang(querystring.getAll('variant').pop(), querystring.getAll('uselang').pop());
	}
	return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=siteinfo&siprop=general|namespaces|namespacealiases|specialpagealiases&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&converttitles=true&titles=%1F' + encodeURIComponent( ( aliasInvoke === 'search' ? full_title.split(' ').slice(1).join(' ') : title ).replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body?.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( interwiki ) return {message: spoiler + ( noEmbed ? '<' : ' ' ) + interwiki + ( noEmbed ? '>' : ' ' ) + spoiler};
			else if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				return {reaction: WB_EMOJI.nowiki};
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + body?.error?.info );
				return {
					reaction: WB_EMOJI.error,
					message: spoiler + '<' + wiki.toLink( ( querystring.toString() || fragment || !title ? title : 'Special:Search' ), ( querystring.toString() || fragment || !title ? querystring : {search:title} ), fragment) + '>' + spoiler
				};
			}
		}
		wiki.updateWiki(body.query.general, Object.values(body.query.namespaces), body.query.namespacealiases);
		if ( aliasInvoke === 'search' ) {
			logging(wiki, msg.guildId, 'search');
			let searchterm = full_title.split(' ').slice(1).join(' ').trim();
			if ( !searchterm ) return fn.special_page(lang, msg, {title: 'Special:Search', uselang}, 'search', body.query, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
			return fn.search(lang, msg, searchterm, wiki, body.query, reaction, spoiler, noEmbed);
		}
		if ( aliasInvoke === 'discussion' && wiki.wikifarm === 'fandom' && !querystring.toString() && !fragment ) {
			logging(wiki, msg.guildId, 'discussion');
			return fn.discussion(lang, msg, wiki, args.join(' '), body.query.general.sitename, spoiler, noEmbed);
		}
		if ( !msg.notMinecraft && mcw.hasOwnProperty(wiki.href) && ( minecraft.hasOwnProperty(aliasInvoke) || invoke.startsWith( '/' ) ) && !querystring.toString() && !fragment ) {
			logging(wiki, msg.guildId, 'minecraft', ( minecraft.hasOwnProperty(aliasInvoke) ? aliasInvoke : 'command' ));
			if ( minecraft.hasOwnProperty(aliasInvoke) ) return minecraft[aliasInvoke](lang, msg, wiki, args, title, cmd, reaction, spoiler, noEmbed);
			return minecraft.SYNTAX(lang, msg, wiki, invoke.substring(1), args, title, cmd, reaction, spoiler, noEmbed);
		}
		if ( body.query.pages && body.query.pages?.['-1']?.title !== '%1F' ) {
			var querypages = Object.values(body.query.pages);
			var querypage = querypages[0];
			if ( body.query.redirects && body.query.redirects[0].from.split(':')[0] === wiki.namespaces.get(-1).name && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk','MyLanguage'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replaceAll( ' ', wiki.spaceReplacement ?? '_' ) ) ) {
				noRedirect = ( body.query.specialpagealiases.find( sp => sp.realname === 'MyLanguage' )?.aliases?.[0] === body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replaceAll( ' ', wiki.spaceReplacement ?? '_' ) ? noRedirect : true );
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
			
			var contribs = wiki.namespaces.get(-1).name + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
			if ( ( querypage.ns === 2 || querypage.ns === 200 || querypage.ns === 202 || querypage.ns === 1200 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
				var userparts = querypage.title.split(':');
				return fn.user(lang, msg, userparts[0] + ':', userparts.slice(1).join(':'), wiki, querystring, fragment, querypage, contribs, reaction, spoiler, noEmbed);
			}
			if ( querypage.ns === -1 && querypage.title.startsWith( contribs ) && querypage.title.length > contribs.length ) {
				var username = querypage.title.split('/').slice(1).join('/');
				return got.get( wiki + 'api.php?action=query&titles=User:' + encodeURIComponent( username ) + '&format=json', {
					context: {
						guildId: msg.guildId
					}
				} ).then( uresponse => {
					var ubody = uresponse.body;
					if ( uresponse.statusCode !== 200 || !ubody || ubody.batchcomplete === undefined || !ubody.query ) {
						console.log( '- ' + uresponse.statusCode + ': Error while getting the user: ' + ubody?.error?.info );
						return {
							reaction: WB_EMOJI.error,
							message: spoiler + '<' + wiki.toLink(contribs + username, querystring, fragment) + '>' + spoiler
						};
					}
					querypage = Object.values(ubody.query.pages)[0];
					if ( querypage.ns === 2 ) {
						username = querypage.title.split(':').slice(1).join(':');
						querypage.title = contribs + username;
						delete querypage.missing;
						querypage.ns = -1;
						querypage.special = '';
						querypage.uselang = uselang;
						querypage.noRedirect = noRedirect;
						return fn.user(lang, msg, contribs, username, wiki, querystring, fragment, querypage, contribs, reaction, spoiler, noEmbed);
					}
					return {reaction: WB_EMOJI.error};
				}, error => {
					console.log( '- Error while getting the user: ' + error );
					return {
						reaction: WB_EMOJI.error,
						message: spoiler + '<' + wiki.toLink(contribs + username, querystring, fragment) + '>' + spoiler
					};
				} );
			}
			if ( ( querypage.missing !== undefined && querypage.known === undefined && !( noRedirect || querypage.categoryinfo ) ) || querypage.invalid !== undefined ) return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&iwurl=true&redirects=true&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&generator=search&gsrprop=sectiontitle&gsrnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + wiki.namespaces.content.map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json', {
				context: {
					guildId: msg.guildId
				}
			} ).then( srresponse => {
				logging(wiki, msg.guildId, 'general', 'search');
				var srbody = srresponse.body;
				if ( srbody?.warnings ) log_warning(srbody.warnings);
				if ( srresponse.statusCode !== 200 || !srbody || srbody.batchcomplete === undefined ) {
					console.log( '- ' + srresponse.statusCode + ': Error while getting the search results: ' + srbody?.error?.info );
					return {RETURN: {
						reaction: WB_EMOJI.error,
						message: spoiler + '<' + wiki.toLink('Special:Search', {search:title}) + '>' + spoiler
					}};
				}
				if ( querypage.ns === 12 && wiki.wikifarm === 'fandom' ) {
					return got.head( wiki + '/wiki/' + encodeURIComponent( querypage.title ).replace( /%3A/g, ':' ), {
						followRedirect: false,
						context: {
							guildId: msg.guildId
						}
					} ).then( hresponse => {
						if ( hresponse.statusCode === 301 && /^https:\/\/[a-z\d-]{1,50}\.fandom\.com\/(?:(?!wiki\/)[a-z-]{2,12}\/)?wiki\/Help:/.test( hresponse.headers?.location ) ) {
							var location = hresponse.headers.location.split('wiki/');
							if ( location[0] === wiki.href && location.slice(1).join('wiki/').replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ).replaceAll( '_', ' ' ) === querypage.title ) {
								if ( srbody.query ) return srbody;
								return {RETURN: {reaction: WB_EMOJI.shrug}};
							}
							if ( msg.wikiWhitelist.length && !msg.wikiWhitelist.includes( location[0] ) ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + querypage.title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed).then( result => {
								return {RETURN: result};
							} );
							var maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
							if ( selfcall < maxselfcall ) {
								selfcall++;
								return mw_check_wiki(lang, msg, location.slice(1).join('wiki/'), new Wiki(location[0]), cmd, reaction, spoiler, noEmbed, querystring, fragment, '', selfcall).then( result => {
									return {RETURN: result};
								} );
							}
							return {RETURN: {
								reaction: ( selfcall === maxselfcall ? WB_EMOJI.warning : undefined ),
								message: spoiler + ( noEmbed ? '<' : ' ' ) + hresponse.headers.location + ( noEmbed ? '>' : ' ' ) + spoiler
							}};
						}
						if ( srbody.query ) return srbody;
						return {RETURN: {reaction: WB_EMOJI.shrug}};
					}, error => {
						console.log( '- Error while checking the help redirect: ' + error );
						if ( srbody.query ) return srbody;
						return {RETURN: {reaction: WB_EMOJI.shrug}};
					} );
				}
				if ( !srbody.query ) {
					return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&iwurl=true&redirects=true&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&generator=search&gsrwhat=text&gsrprop=sectiontitle&gsrnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + wiki.namespaces.content.map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json', {
						context: {
							guildId: msg.guildId
						}
					} ).then( tsrresponse => {
						var tsrbody = tsrresponse.body;
						if ( tsrbody?.warnings ) log_warning(tsrbody.warnings);
						if ( tsrresponse.statusCode !== 200 || !tsrbody || tsrbody.batchcomplete === undefined ) {
							if ( tsrbody?.error?.code !== 'search-text-disabled' ) console.log( '- ' + tsrresponse.statusCode + ': Error while getting the text search results: ' + tsrbody?.error?.info );
						}
						else if ( tsrbody.query ) return tsrbody;
						return {RETURN: {reaction: WB_EMOJI.shrug}};
					}, error => {
						console.log( '- Error while getting the text search results: ' + error );
						return {RETURN: {reaction: WB_EMOJI.shrug}};
					} );
				}
				return srbody;
			} ).then( srbody => {
				if ( srbody?.RETURN ) return srbody.RETURN;
				if ( !srbody?.query?.pages ) {
					if ( srbody?.query?.interwiki ) {
						if ( breakOnTimeoutPause(msg) && isMessage(msg) ) {
							if ( reaction ) reaction.removeEmoji();
							return;
						}
						var maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
						try {
							var iw = new URL(srbody.query.interwiki[0].url.replaceAll( '\\', '%5C' ).replace( /@(here|everyone)/g, '%40$1' ), wiki);
							querystring.forEach( (value, name) => {
								iw.searchParams.append(name, value);
							} );
							if ( fragment ) iw.hash = Wiki.toSection(fragment, wiki.spaceReplacement);
							else fragment = iw.hash.substring(1);
							if ( phabricatorSites.has(iw.hostname) ) {
								return phabricator(lang, msg, wiki, iw, spoiler, noEmbed);
							}
							if ( iw.hostname === 'bugs.mojang.com' && minecraft.hasOwnProperty('bug') && !iw.searchParams.toString() && !iw.hash ) {
								let bug = iw.pathname.match( /^\/browse\/([A-Z]{2,6}-\d+)$/ );
								if ( bug ) {
									logging(wiki, msg.guildId, 'minecraft', 'bug');
									return minecraft.bug(lang, msg, wiki, [bug[1]], title, cmd, reaction, spoiler, noEmbed);
								}
							}
							logging(wiki, msg.guildId, 'interwiki');
							if ( selfcall < maxselfcall && ['http:','https:'].includes( iw.protocol ) ) {
								selfcall++;
								let project = getWikiProject(iw.hostname);
								if ( project ) {
									let articlePath = escapeRegExp( project.regexPaths ? '/' : project.articlePath.split('?')[0] );
									let regex = ( iw.host + iw.pathname ).match( new RegExp( '^' + project.regex + '(?:' + articlePath + '|/?$)' ) );
									if ( regex ) {
										let iwtitle = decodeURIComponent( ( iw.host + iw.pathname ).replace( regex[0], '' ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );
										let scriptPath = project.scriptPath;
										if ( project.regexPaths ) scriptPath = scriptPath.replace( /\$(\d)/g, (match, n) => regex[n] );
										let iwwiki = new Wiki('https://' + regex[1] + scriptPath);
										if ( msg.wikiWhitelist.length && !msg.wikiWhitelist.includes( iwwiki.href ) ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + srbody.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
										if ( isMessage(msg) ) {
											cmd = '!!' + regex[1] + ' ';
											if ( msg.wikiPrefixes.has(iwwiki.name) ) cmd = msg.wikiPrefixes.get(iwwiki.name);
											else if ( msg.wikiPrefixes.has(project.name) ) {
												let idString = urlToIdString(iwwiki);
												if ( idString ) cmd = msg.wikiPrefixes.get(project.name) + idString + ' ';
											}
										}
										else if ( msg.commandName === 'interwiki' ) {
											cmd = `</${msg.commandName}:${msg.commandId}> wiki:${regex[1]} title:`;
										}
										else {
											let command = msg.client.application.commands.cache.find( cmd => cmd.name === 'interwiki' );
											if ( command ) cmd = `</${command.name}:${command.id}> wiki:${regex[1]} title:`;
											else cmd += srbody.query.interwiki[0].iw + ':';
										}
										return mw_check_wiki(lang, msg, iwtitle, iwwiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
									}
								}
								else if ( iw.host === wiki.host && iw.pathname.startsWith( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ) {
									let iwtitle = decodeURIComponent( iw.pathname.replace( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );;
									return mw_check_wiki(lang, msg, iwtitle, wiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
								}
							}
							if ( msg.wikiWhitelist.length ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + srbody.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
							return {
								reaction: ( selfcall === maxselfcall ? WB_EMOJI.warning : undefined ),
								message: spoiler + ( noEmbed ? '<' : ' ' ) + iw + ( noEmbed ? '>' : ' ' ) + spoiler
							};
						}
						catch {
							if ( msg.wikiWhitelist.length ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + srbody.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
							return {
								reaction: ( selfcall === maxselfcall ? WB_EMOJI.warning : undefined ),
								message: spoiler + ( noEmbed ? '<' : ' ' ) + srbody.query.interwiki[0].url + ( noEmbed ? '>' : ' ' ) + spoiler
							};
						}
					}
					return {reaction: WB_EMOJI.error};
				}
				querypage = Object.values(srbody.query.pages)[0];
				querypage.uselang = uselang;
				
				var text = '';
				var prefix = ( isMessage(msg)
					? '`' + ( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix ) + cmd
					: cmd.split(' ')[0] + ' `' + cmd.split(' ').slice(1).join(' ')
				);
				var linksuffix = ( isMessage(msg)
					? ( querystring.toString() ? '?' + querystring : '' ) + ( fragment ? '#' + fragment : '' )
					: ( querystring.toString() ? ' query:' + querystring : '' ) + ( fragment ? ' section:' + fragment : '' )
				);
				if ( title.replace( /[_-]/g, ' ' ).toLowerCase() === querypage.title.replaceAll( '-', ' ' ).toLowerCase() ) {
					text = '';
				}
				else if ( !srbody.continue ) {
					text = '\n' + lang.get('search.infopage', prefix + ( lang.localNames.page || 'page' ) + ' ' + title + linksuffix + '`');
				}
				else {
					text = '\n' + lang.get('search.infosearch', prefix + ( lang.localNames.page || 'page' ) + ' ' + title + linksuffix + '`', prefix + ( lang.localNames.search || 'search' ) + ' ' + title + linksuffix + '`');
				}

				if ( querypage.sectiontitle && !fragment ) fragment = querypage.sectiontitle;
				var pagelink = wiki.toLink(querypage.title, querystring, fragment);
				var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
				if ( querypage.pageprops?.displaytitle ) {
					var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
					if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
					if ( displaytitle.trim() ) embed.setTitle( displaytitle );
				}
				if ( querypage.extract ) embed.backupDescription = extract_desc(querypage.extract, msg.embedLimits, fragment);
				if ( querypage.pageprops?.description && msg.embedLimits.descLength ) {
					var description = htmlToDiscord( querypage.pageprops.description );
					if ( description.length > msg.embedLimits.descLength ) description = description.substring(0, msg.embedLimits.descLength) + '\u2026';
					embed.backupDescription = description;
				}
				try {
					if ( querypage.ns === 6 ) {
						var pageimage = ( querypage?.original?.source || wiki.toLink('Special:FilePath/' + querypage.title, {version:Date.now()}) );
						if ( !noEmbed && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
						else if ( !noEmbed && querypage.title.toLowerCase().endsWith( '.svg' ) && querypage?.original?.width ) {
							embed.setImage( wiki.toLink('Special:FilePath/' + querypage.title, {width:querypage.original.width,version:Date.now()}) );
						}
					}
					else if ( querypage.title === body.query.general.mainpage ) {
						embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
					}
					else if ( querypage.pageimage && querypage.original ) {
						embed.setThumbnail( querypage.original.source );
					}
					else if ( querypage.pageprops?.page_image_free ) {
						embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
					}
					else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				}
				catch {}
				
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
					if ( !noEmbed ) embed.addFields( {name: category[0], value: category.slice(1).join('\n')} );
					else text += '\n\n' + category.join('\n');
				}

				try {
					return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ), fragment, pagelink);
				}
				catch {
					return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', fragment, pagelink);
				}
			}, error => {
				logging(wiki, msg.guildId, 'general', 'search');
				console.log( '- Error while getting the search results: ' + error );
				return {
					reaction: WB_EMOJI.error,
					message: spoiler + '<' + wiki.toLink('Special:Search', {search:title}) + '>' + spoiler
				};
			} );
			if ( querypage.ns === -1 ) {
				var specialpage = body.query.specialpagealiases.find( sp => wiki.namespaces.get(-1).name + ':' + sp.aliases[0].replaceAll( wiki.spaceReplacement ?? '_', ' ' ) === querypage.title.split('/')[0] );
				specialpage = ( specialpage ? specialpage.realname : querypage.title.replace( wiki.namespaces.get(-1).name + ':', '' ).split('/')[0] ).toLowerCase();
				if ( !['mylanguage'].includes( specialpage ) ) {
					return fn.special_page(lang, msg, querypage, specialpage, body.query, wiki, querystring, fragment, reaction, spoiler, noEmbed);
				}
			}
			if ( querypage.ns === -2 ) {
				logging(wiki, msg.guildId, 'general', 'media');
				var filepath = body.query.specialpagealiases.find( sp => sp.realname === 'Filepath' );
				var pagelink = wiki.toLink(wiki.namespaces.get(-1).name + ':' + ( filepath?.aliases?.[0] || 'FilePath' ) + querypage.title.replace( wiki.namespaces.get(-2).name + ':', '/' ), querystring, fragment);
				var embed = null;
				if ( !noEmbed ) {
					embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink ).setDescription( '[' + lang.get('search.media') + '](<' + wiki.toLink(querypage.title, '', '', true) + '>)' );
					if ( /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pagelink );
				}
				return {message: {
					content: spoiler + '<' + pagelink + '>' + spoiler,
					embeds: [embed]
				}};
			}
			logging(wiki, msg.guildId, 'general');
			var pagelink = wiki.toLink(querypage.title, querystring, ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ));
			var text = '';
			var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(body.query.converted?.[0]?.from || querypage.title) ).setURL( pagelink );
			if ( querypage.pageprops?.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				if ( displaytitle.trim() ) embed.setTitle( displaytitle );
			}
			if ( querypage.extract ) embed.backupDescription = extract_desc(querypage.extract, msg.embedLimits, ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ));
			if ( querypage.pageprops?.description && msg.embedLimits.descLength ) {
				var description = htmlToDiscord( querypage.pageprops.description );
				if ( description.length > msg.embedLimits.descLength ) description = description.substring(0, msg.embedLimits.descLength) + '\u2026';
				embed.backupDescription = description;
			}
			try {
				if ( querypage.ns === 6 ) {
					var pageimage = ( querypage?.original?.source || wiki.toLink('Special:FilePath/' + querypage.title, {version:Date.now()}) );
					if ( !noEmbed && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
					else if ( !noEmbed && querypage.title.toLowerCase().endsWith( '.svg' ) && querypage?.original?.width ) {
						embed.setImage( wiki.toLink('Special:FilePath/' + querypage.title, {width:querypage.original.width,version:Date.now()}) );
					}
				}
				else if ( querypage.title === body.query.general.mainpage ) {
					embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				}
				else if ( querypage.pageimage && querypage.original ) {
					embed.setThumbnail( querypage.original.source );
				}
				else if ( querypage.pageprops?.page_image_free ) {
					embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
				}
				else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			catch {}
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
				if ( !noEmbed ) embed.addFields( {name: category[0], value: category.slice(1).join('\n')} );
				else text += '\n\n' + category.join('\n');
			}
			
			try {
				return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ), ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ), pagelink);
			}
			catch {
				return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', ( fragment || ( body.query.redirects && body.query.redirects[0].tofragment ) || '' ), pagelink);
			}
		}
		if ( body.query.interwiki ) {
			if ( breakOnTimeoutPause(msg) && isMessage(msg) ) {
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			let maxselfcall = interwikiLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
			try {
				let iw = new URL(body.query.interwiki[0].url.replaceAll( '\\', '%5C' ).replace( /@(here|everyone)/g, '%40$1' ), wiki);
				querystring.forEach( (value, name) => {
					iw.searchParams.append(name, value);
				} );
				if ( fragment ) iw.hash = Wiki.toSection(fragment, wiki.spaceReplacement);
				else fragment = iw.hash.substring(1);
				if ( phabricatorSites.has(iw.hostname) ) {
					return phabricator(lang, msg, wiki, iw, spoiler, noEmbed);
				}
				if ( iw.hostname === 'bugs.mojang.com' && minecraft.hasOwnProperty('bug') && !iw.searchParams.toString() && !iw.hash ) {
					let bug = iw.pathname.match( /^\/browse\/([A-Z]{2,6}-\d+)$/ );
					if ( bug ) {
						logging(wiki, msg.guildId, 'minecraft', 'bug');
						return minecraft.bug(lang, msg, wiki, [bug[1]], title, cmd, reaction, spoiler, noEmbed);
					}
				}
				logging(wiki, msg.guildId, 'interwiki');
				if ( selfcall < maxselfcall && ['http:','https:'].includes( iw.protocol ) ) {
					selfcall++;
					let project = getWikiProject(iw.hostname);
					if ( project ) {
						let articlePath = escapeRegExp( project.regexPaths ? '/' : project.articlePath.split('?')[0] );
						let regex = ( iw.host + iw.pathname ).match( new RegExp( '^' + project.regex + '(?:' + articlePath + '|/?$)' ) );
						if ( regex ) {
							let iwtitle = decodeURIComponent( ( iw.host + iw.pathname ).replace( regex[0], '' ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );
							let scriptPath = project.scriptPath;
							if ( project.regexPaths ) scriptPath = scriptPath.replace( /\$(\d)/g, (match, n) => regex[n] );
							let iwwiki = new Wiki('https://' + regex[1] + scriptPath);
							if ( msg.wikiWhitelist.length && !msg.wikiWhitelist.includes( iwwiki.href ) ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + body.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
							if ( isMessage(msg) ) {
								cmd = '!!' + regex[1] + ' ';
								if ( msg.wikiPrefixes.has(iwwiki.name) ) cmd = msg.wikiPrefixes.get(iwwiki.name);
								else if ( msg.wikiPrefixes.has(project.name) ) {
									let idString = urlToIdString(iwwiki);
									if ( idString ) cmd = msg.wikiPrefixes.get(project.name) + idString + ' ';
								}
							}
							else if ( msg.commandName === 'interwiki' ) {
								cmd = `</${msg.commandName}:${msg.commandId}> wiki:${regex[1]} title:`;
							}
							else {
								let command = msg.client.application.commands.cache.find( cmd => cmd.name === 'interwiki' );
								if ( command ) cmd = `</${command.name}:${command.id}> wiki:${regex[1]} title:`;
								else cmd += body.query.interwiki[0].iw + ':';
							}
							return mw_check_wiki(lang, msg, iwtitle, iwwiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
						}
					}
					else if ( iw.host === wiki.host && iw.pathname.startsWith( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ) {
						let iwtitle = decodeURIComponent( iw.pathname.replace( wiki.articlepath.split('?')[0].replace( '$1', '' ) ) ).replaceAll( wiki.spaceReplacement ?? '_', ' ' );;
						return mw_check_wiki(lang, msg, iwtitle, wiki, cmd, reaction, spoiler, noEmbed, iw.searchParams, fragment, iw.href, selfcall);
					}
				}
				if ( msg.wikiWhitelist.length ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + body.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
				return {
					reaction: ( selfcall === maxselfcall ? WB_EMOJI.warning : undefined ),
					message: spoiler + ( noEmbed ? '<' : ' ' ) + iw + ( noEmbed ? '>' : ' ' ) + spoiler
				};
			}
			catch {
				if ( msg.wikiWhitelist.length ) return fn.special_page(lang, msg, {title: 'Special:GoToInterwiki/' + body.query.interwiki[0].title, uselang}, 'gotointerwiki', {general: body.query.general}, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
				return {
					reaction: ( selfcall === maxselfcall ? WB_EMOJI.warning : undefined ),
					message: spoiler + ( noEmbed ? '<' : ' ' ) + body.query.interwiki[0].url + ( noEmbed ? '>' : ' ' ) + spoiler
				};
			}
		}
		logging(wiki, msg.guildId, 'general');
		var querypage = {
			title: body.query.general.mainpage,
			contentmodel: 'wikitext',
			uselang, noRedirect
		};
		var pagelink = wiki.toLink(querypage.title, querystring, fragment);
		var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
		try {
			embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
		}
		catch {}
		return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=info|pageprops|extracts&ppprop=description|displaytitle|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&titles=' + encodeURIComponent( querypage.title ) + '&format=json', {
			context: {
				guildId: msg.guildId
			}
		} ).then( mpresponse => {
			var mpbody = mpresponse.body;
			if ( mpbody?.warnings ) log_warning(body.warnings);
			if ( mpresponse.statusCode !== 200 || !mpbody || mpbody.batchcomplete === undefined || !mpbody.query ) {
				console.log( '- ' + mpresponse.statusCode + ': Error while getting the main page: ' + mpbody?.error?.info );
				return;
			}
			querypage = Object.values(mpbody.query.pages)[0];
			if ( mpbody.query.redirects && mpbody.query.redirects[0].from.split(':')[0] === wiki.namespaces.get(-1).name && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( mpbody.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replaceAll( ' ', wiki.spaceReplacement ?? '_' ) ) ) {
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
			if ( querypage.pageprops?.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				if ( displaytitle.trim() ) embed.setTitle( displaytitle );
			}
			if ( querypage.extract ) embed.backupDescription = extract_desc(querypage.extract, msg.embedLimits, fragment);
			if ( querypage.pageprops?.description && msg.embedLimits.descLength ) {
				var description = htmlToDiscord( querypage.pageprops.description );
				if ( description.length > msg.embedLimits.descLength ) description = description.substring(0, msg.embedLimits.descLength) + '\u2026';
				embed.backupDescription = description;
			}
		}, error => {
			console.log( '- Error while getting the main page: ' + error );
		} ).then( () => {
			return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', fragment, pagelink);
		} );
	}, error => {
		if ( interwiki ) return {message: spoiler + ( noEmbed ? '<' : ' ' ) + interwiki + ( noEmbed ? '>' : ' ' ) + spoiler};
		else if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			return {reaction: WB_EMOJI.nowiki};
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			return {
				reaction: WB_EMOJI.error,
				message: spoiler + '<' + wiki.toLink( ( querystring.toString() || fragment || !title ? title : 'Special:Search' ), ( querystring.toString() || fragment || !title ? querystring : {search:title} ), fragment) + '>' + spoiler
			};
		}
	} );
}
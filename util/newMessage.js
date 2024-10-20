import { readdir } from 'node:fs';
import { domainToASCII } from 'node:url';
import { cleanContent } from 'discord.js';
import { inputToWikiProject, idStringToUrl, inputToFrontendProxy } from 'mediawiki-projects-list';
import Wiki from './wiki.js';
import logging from './logging.js';
import { got, isMessage, splitMessage, partialURIdecode, canShowEmbed } from './functions.js';
import check_wiki from '../cmds/wiki/general.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {limit: {command: commandLimit}, defaultSettings} = require('./default.json');

/** @type {WeakMap<import('discord.js').Message, import('discord.js').Message[]>} */
const inlineCache = new WeakMap()

var cmdmap = {};
var pausecmdmap = {};
var ownercmdmap = {};
readdir( './cmds', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		import('../cmds/' + file).then( ({cmdData}) => {
			if ( cmdData.everyone ) cmdmap[cmdData.name] = cmdData.run;
			if ( cmdData.pause ) pausecmdmap[cmdData.name] = cmdData.run;
			if ( cmdData.owner ) ownercmdmap[cmdData.name] = cmdData.run;
		} );
	} );
} );

/**
 * Processes new messages.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('./i18n.js').default} lang - The user language.
 * @param {Wiki} [wiki] - The default wiki.
 * @param {{descLength: Number, fieldCount: Number, fieldLength: Number, sectionLength: Number, sectionDescLength: Number}} [embedLimits] - The limits for the embed.
 * @param {String} [prefix] - The prefix for the message.
 * @param {Boolean} [noInline] - Parse inline commands?
 * @param {Map<String, String>} [subprefixes] - The subprefixes for the message.
 * @param {String[]} [wikiWhitelist] - Whitelist of allowed wikis.
 * @param {String} [content] - Overwrite for the message content.
 */
export default function newMessage(msg, lang, wiki = defaultSettings.wiki, embedLimits = defaultSettings.embedLimits, prefix = process.env.prefix, noInline = null, subprefixes = new Map(defaultSettings.subprefixes), wikiWhitelist = [], content = '') {
	wiki = new Wiki(wiki);
	msg.wikiPrefixes = new Map();
	subprefixes.forEach( (prefixwiki, prefixchar) => msg.wikiPrefixes.set(prefixwiki, prefixchar) );
	msg.wikiPrefixes.set(wiki.name, '');
	msg.embedLimits = {...embedLimits};
	msg.wikiWhitelist = [...wikiWhitelist];
	msg.noInline = noInline;
	var cont = ( content || msg.content );
	var cleanCont = ( content ? cleanContent(content, msg.channel) : msg.cleanContent ).replaceAll( '\u200b', '' ).replace( /<a?(:\w+:)\d+>/g, '$1' ).replace( /<(\/[\w ]+):\d+>/g, '$1' ).replace( /(?<!\\)```.+?```/gs, '<codeblock>' );
	if ( msg.isOwner() && cont.hasPrefix(prefix) ) {
		let invoke = cont.substring(prefix.length).split(' ')[0].split('\n')[0].toLowerCase();
		let aliasInvoke = ( lang.aliases[invoke] || invoke );
		if ( ownercmdmap.hasOwnProperty(aliasInvoke) ) {
			cont = cont.substring(prefix.length);
			let args = cont.split(' ').slice(1);
			if ( cont.split(' ')[0].split('\n')[1] ) args.unshift( '', cont.split(' ')[0].split('\n')[1] );
			console.log( ( msg.guildId || '@' + msg.author.id ) + ': ' + prefix + cont );
			return ownercmdmap[aliasInvoke](lang, msg, args, cont, wiki);
		}
	}
	var count = 0;
	var maxcount = commandLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
	var breakLines = false;
	cleanCont.split('\n').forEach( line => {
		if ( line.startsWith( '>>> ' ) ) breakLines = true;
		if ( !line.hasPrefix(prefix) || breakLines || count > maxcount ) return;
		if ( count === maxcount ) {
			count++;
			console.log( '- Message contains too many commands!' );
			msg.reactEmoji(WB_EMOJI.warning);
			msg.sendChannelError( {
				content: lang.get('general.limit', msg.author.toString()),
				reply: {messageReference: msg.id},
				allowedMentions: {
					users: [msg.author.id],
					repliedUser: true
				}
			} );
			return;
		}
		count++;
		line = line.substring(prefix.length);
		var invoke = line.split(' ')[0].toLowerCase();
		var args = line.split(' ').slice(1);
		var aliasInvoke = ( lang.aliases[invoke] || invoke );
		var ownercmd = ( msg.isOwner() && ownercmdmap.hasOwnProperty(aliasInvoke) );
		var pausecmd = ( msg.isAdmin() && pausedGuilds.has(msg.guildId) && pausecmdmap.hasOwnProperty(aliasInvoke) );
		if ( msg.onlyVerifyCommand && !( aliasInvoke === 'verify' || pausecmd || ownercmd ) ) return;
		if ( msg.inGuild() && pausedGuilds.has(msg.guildId) && !( pausecmd || ownercmd ) ) {
			return console.log( msg.guildId + ': Paused' );
		}
		console.log( ( msg.guildId || '@' + msg.author.id ) + ': ' + prefix + line );
		if ( ownercmd ) return ownercmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( pausecmd ) return pausecmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( cmdmap.hasOwnProperty(aliasInvoke) ) return cmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( subprefixes.has(invoke[0]) ) {
			let subprefix = subprefixes.get(invoke[0]);
			if ( subprefix.startsWith( 'https://' ) ) return cmdmap.LINK(lang, msg, line.substring(1), new Wiki(subprefix), ( subprefix === wiki.name ? '' : invoke[0] ));
			let subprefixUrl = idStringToUrl(invoke.substring(1), subprefix);
			if ( subprefixUrl ) return cmdmap.LINK(lang, msg, args.join(' '), new Wiki(subprefixUrl), ( subprefixUrl === wiki.name ? '' : invoke + ' ' ));
		}
		if ( invoke.startsWith( '!!' ) && /^!!(?:[a-z\d-]{1,50}\.)?(?:[a-z\d-]{1,50}\.)?[a-z\d-]{1,50}\.[a-z\d-]{1,10}$/.test(domainToASCII(invoke.split('/')[0])) ) {
			let project = inputToWikiProject(invoke.slice(2));
			if ( project ) return cmdmap.LINK(lang, msg, args.join(' '), new Wiki(project.fullScriptPath), ( project.fullScriptPath === wiki.name ? '' : invoke + ' ' ));
			let proxy = inputToFrontendProxy(invoke.slice(2));
			if ( proxy ) return cmdmap.LINK(lang, msg, args.join(' '), new Wiki(proxy.fullNamePath), ( proxy.fullNamePath === wiki.name ? '' : invoke + ' ' ));
		}
		return cmdmap.LINK(lang, msg, line, wiki);
	} );
	if ( msg.onlyVerifyCommand ) return;
	
	if ( ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) && !noInline && ( cont.includes( '[[' ) || cont.includes( '{{' ) ) ) {
		parseInlineLinks(msg, cleanCont, wiki, prefix, count).then( inlineLinks => {
			if ( inlineLinks.links.length ) {
				Promise.all( splitMessage( inlineLinks.links.join('\n') ).map( textpart => msg.sendChannel( textpart ) ) ).then( inlineMessages => {
					inlineMessages = inlineMessages.filter( message => message );
					if ( inlineMessages.length ) inlineCache.set(msg, inlineMessages);
				} );
			}
			if ( inlineLinks.templates.length ) splitMessage( inlineLinks.templates.join('\n') ).forEach( textpart => msg.sendChannel( textpart ) );
			if ( inlineLinks.embeds.length ) inlineLinks.embeds.forEach( embed => msg.reactEmoji(WB_EMOJI.waiting).then( reaction => {
				logging(wiki, msg.guildId, 'inline', 'embed');
				check_wiki(lang, msg, embed.title, wiki, '', reaction, embed.spoiler, !canShowEmbed(msg), new URLSearchParams(), embed.section)?.then( result => {
					if ( !result || isMessage(result) ) return result;
					if ( result.message ) {
						if ( Array.isArray(result.message) ) result.message.forEach( content => msg.sendChannel(content) );
						else if ( result.reaction === WB_EMOJI.error ) msg.sendChannelError(result.message);
						else if ( result.reaction === 'reply' ) msg.replyMsg(result.message, true);
						else msg.sendChannel(result.message).then( message => {
							if ( result.reaction === WB_EMOJI.warning && message ) message.reactEmoji(WB_EMOJI.warning);
							return message;
						} );
					}
					else if ( result.reaction ) {
						msg.reactEmoji(result.reaction);
					}
					if ( reaction ) reaction.removeEmoji();
				} );
			} ) );
		} );
	}
}

/**
 * Update inline links.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('./i18n.js').default} lang - The user language.
 * @param {Wiki} [wiki] - The default wiki.
 * @param {{descLength: Number, fieldCount: Number, fieldLength: Number, sectionLength: Number, sectionDescLength: Number}} [embedLimits] - The limits for the embed.
 * @param {String} [prefix] - The prefix for the message.
 * @param {Boolean} [noInline] - Parse inline commands?
 * @param {Map<String, String>} [subprefixes] - The subprefixes for the message.
 * @param {String[]} [wikiWhitelist] - Whitelist of allowed wikis.
 */
function updateInlineLinks(msg, lang, wiki = defaultSettings.wiki, embedLimits = defaultSettings.embedLimits, prefix = process.env.prefix, noInline = null, subprefixes = new Map(defaultSettings.subprefixes), wikiWhitelist = []) {
	wiki = new Wiki(wiki);
	msg.wikiPrefixes = new Map();
	subprefixes.forEach( (prefixwiki, prefixchar) => msg.wikiPrefixes.set(prefixwiki, prefixchar) );
	msg.wikiPrefixes.set(wiki.name, '');
	msg.embedLimits = {...embedLimits};
	msg.wikiWhitelist = [...wikiWhitelist];
	msg.noInline = noInline;
	var cleanCont = msg.cleanContent.replaceAll( '\u200b', '' ).replace( /<a?(:\w+:)\d+>/g, '$1' ).replace( /<(\/[\w ]+):\d+>/g, '$1' ).replace( /(?<!\\)```.+?```/gs, '<codeblock>' );
	if ( msg.isOwner() && msg.content.hasPrefix(prefix) ) {
		let invoke = msg.content.substring(prefix.length).split(' ')[0].split('\n')[0].toLowerCase();
		let aliasInvoke = ( lang.aliases[invoke] || invoke );
		if ( ownercmdmap.hasOwnProperty(aliasInvoke) ) return;
	}
	if ( msg.onlyVerifyCommand ) return;
	
	if ( ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) && !noInline ) {
		let cachedMessages = inlineCache.get(msg);
		if ( !cachedMessages ) return;
		parseInlineLinks(msg, cleanCont, wiki, prefix, commandLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )] + 1).then( ({links}) => {
			if ( !links.length ) {
				cachedMessages.forEach( message => message.delete().catch(log_error) );
				inlineCache.delete(msg);
				return;
			}
			let textparts = splitMessage( links.join('\n') );
			Promise.all( cachedMessages.map( (message, i) => {
				if ( !textparts[i] ) {
					message.delete().catch(log_error);
					return;
				}
				return message.edit( textparts[i] ).catch(log_error);
			} ) ).then( inlineMessages => {
				inlineMessages = inlineMessages.filter( message => message );
				if ( inlineMessages.length ) inlineCache.set(msg, inlineMessages);
				else inlineCache.delete(msg);
			} );
		} );
	}
}


/**
 * Parse inline links.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} cleanCont - The message content without mentions.
 * @param {Wiki} wiki - The default wiki.
 * @param {String} [prefix] - The prefix for the message.
 * @param {Number} [embedcount] - The amount of already sent embeds.
 */
async function parseInlineLinks(msg, cleanCont, wiki, prefix = process.env.prefix, embedcount = 0) {
	var links = [];
	var embeds = [];
	var maxcount = commandLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
	var linkcount = 0;
	var linkmaxcount = maxcount + 5;
	var breakInline = false;
	cleanCont.replace( /(?<!\\)``.+?``/gs, '<code>' ).replace( /(?<!\\)`.+?`/gs, '<code>' ).split('\n').forEach( line => {
		if ( line.startsWith( '>>> ' ) ) breakInline = true;
		if ( line.startsWith( '> ' ) || breakInline ) return;
		if ( line.hasPrefix(prefix) || !( line.includes( '[[' ) || line.includes( '{{' ) ) ) return;
		line = line.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
		if ( line.includes( '[[' ) && line.includes( ']]' ) && linkcount <= linkmaxcount ) {
			let regex = new RegExp( '(?<!\\\\)(|\\|\\|)\\[\\[([^' + "<>\\[\\]\\|{}\\x01-\\x1F\\x7F" + ']+)(?<!\\\\)\\]\\]\\1', 'g' );
			let entry = null;
			while ( ( entry = regex.exec(line) ) !== null ) {
				if ( linkcount < linkmaxcount ) {
					linkcount++;
					console.log( ( msg.guildId || '@' + msg.author.id ) + ': ' + entry[0] );
					let title = entry[2].split('#')[0];
					let section = entry[2].split('#').slice(1).join('#').trim();
					links.push({title,section,spoiler:entry[1]});
				}
				else if ( linkcount === linkmaxcount ) {
					linkcount++;
					console.log( '- Message contains too many links!' );
					msg.reactEmoji(WB_EMOJI.warning);
					break;
				}
			}
		}
		
		if ( line.includes( '{{' ) && line.includes( '}}' ) && embedcount <= maxcount ) {
			let regex = new RegExp( '(?<!\\\\)(|\\|\\|)(?<!\\{)\\{\\{(?:\\s*(?:subst|safesubst|raw|msg|msgnw):)?([^' + "<>\\[\\]\\|{}\\x01-\\x1F\\x7F" + ']+)(?<!\\\\)\\}\\}\\1', 'g' );
			let entry = null;
			while ( ( entry = regex.exec(line) ) !== null ) {
				if ( embedcount < maxcount ) {
					embedcount++;
					console.log( ( msg.guildId || '@' + msg.author.id ) + ': ' + entry[0] );
					let title = entry[2].split('#')[0];
					let section = entry[2].split('#').slice(1).join('#').trim();
					embeds.push({title,section,spoiler:entry[1]});
				}
				else if ( embedcount === maxcount ) {
					embedcount++;
					console.log( '- Message contains too many links!' );
					msg.reactEmoji(WB_EMOJI.warning);
					break;
				}
			}
		}
	} );

	/** @type {{links: String[], templates: String[], embeds: {title: String, section: String, spoiler: String}[]}} */
	var result = {
		links: [],
		templates: [],
		embeds: []
	}

	if ( links.length ) await got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&iwurl=true&titles=' + encodeURIComponent( links.map( link => link.title ).join('|') ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji(WB_EMOJI.nowiki);
				return;
			}
			console.log( '- ' + response.statusCode + ': Error while following the links: ' + body?.error?.info );
			return;
		}
		wiki.updateWiki(body.query.general);
		if ( body.query.normalized ) {
			body.query.normalized.forEach( title => links.filter( link => link.title === title.from ).forEach( link => link.title = title.to ) );
		}
		if ( body.query.interwiki ) {
			body.query.interwiki.forEach( interwiki => links.filter( link => link.title === interwiki.title ).forEach( link => {
				logging(wiki, msg.guildId, 'inline', 'interwiki');
				if ( msg.wikiWhitelist.length ) link.url = wiki.toLink('Special:GoToInterwiki/' + interwiki.title, '', link.section);
				else link.url = ( link.section ? decodeURI(interwiki.url.split('#')[0]) + Wiki.toSection(link.section, wiki.spaceReplacement) : decodeURI(interwiki.url) );
			} ) );
		}
		if ( body.query.pages ) {
			var querypages = Object.values(body.query.pages);
			querypages.filter( page => page.invalid !== undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
				links.splice(links.indexOf(link), 1);
			} ) );
			querypages.filter( page => page.missing !== undefined && page.known === undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
				if ( ( page.ns === 2 || page.ns === 200 || page.ns === 202 || page.ns === 1200 ) && !page.title.includes( '/' ) ) return;
				logging(wiki, msg.guildId, 'inline', 'redlink');
				link.url = wiki.toLink(link.title, 'action=edit&redlink=1');
			} ) );
		}
		if ( links.length ) result.links = [...new Set(links.map( link => {
			if ( !link.url ) logging(wiki, msg.guildId, 'inline');
			return link.spoiler + '<' + ( link.url || wiki.toLink(link.title, '', link.section) ) + '>' + link.spoiler;
		} ))];
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji(WB_EMOJI.nowiki);
		}
		else {
			console.log( '- Error while following the links: ' + error );
		}
	} );
	
	if ( embeds.length ) await got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general|functionhooks' + ( wiki.wikifarm === 'fandom' ? '' : '|variables' ) + '&titles=' + encodeURIComponent( embeds.map( embed => embed.title + '|Template:' + embed.title ).join('|') ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji(WB_EMOJI.nowiki);
				return;
			}
			console.log( '- ' + response.statusCode + ': Error while following the links: ' + body?.error?.info );
			return;
		}
		wiki.updateWiki(body.query.general);
		if ( body.query.normalized ) {
			body.query.normalized.forEach( title => embeds.filter( embed => embed.title === title.from ).forEach( embed => embed.title = title.to ) );
		}
		if ( body.query.pages ) {
			var querypages = Object.values(body.query.pages);
			querypages.filter( page => page.invalid !== undefined ).forEach( page => embeds.filter( embed => embed.title === page.title ).forEach( embed => {
				embeds.splice(embeds.indexOf(embed), 1);
			} ) );
			var missing = [];
			querypages.filter( page => page.missing !== undefined && page.known === undefined ).forEach( page => embeds.filter( embed => embed.title === page.title ).forEach( embed => {
				if ( ( page.ns === 2 || page.ns === 200 || page.ns === 202 || page.ns === 1200 ) && !page.title.includes( '/' ) ) return;
				embeds.splice(embeds.indexOf(embed), 1);
				if ( page.ns === 0 && !embed.section ) {
					var template = querypages.find( template => template.ns === 10 && template.title.split(':').slice(1).join(':') === embed.title );
					if ( template && template.missing === undefined ) embed.template = wiki.toLink(template.title);
				}
				if ( embed.template || ( !body.query.functionhooks?.some( functionhook => embed.title.toLowerCase().startsWith( functionhook + ':' ) ) && !body.query.variables?.some( variable => variable.toUpperCase() === embed.title ) ) ) missing.push(embed);
			} ) );
			if ( missing.length ) result.templates = [...new Set(missing.map( embed => {
				if ( embed.template ) logging(wiki, msg.guildId, 'inline', 'template');
				else logging(wiki, msg.guildId, 'inline', 'redlink');
				return embed.spoiler + '<' + ( embed.template || wiki.toLink(embed.title, 'action=edit&redlink=1') ) + '>' + embed.spoiler;
			} ))];
		}
		if ( embeds.length ) result.embeds = [...new Map(embeds.map( embed => {
			return [JSON.stringify(embed), embed];
		} )).values()];
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji(WB_EMOJI.nowiki);
		}
		else {
			console.log( '- Error while following the links: ' + error );
		}
	} );

	return result;
}

export { defaultSettings, inlineCache, updateInlineLinks };
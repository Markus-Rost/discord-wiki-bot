const {Util} = require('discord.js');
const logging = require('./logging.js');
const {partialURIdecode} = require('./functions.js');
const {limit: {command: commandLimit}, defaultSettings, wikiProjects} = require('./default.json');
const Wiki = require('./wiki.js');
const check_wiki = {
	general: require('../cmds/wiki/general.js'),
	test: require('../cmds/test.js').run
};

const fs = require('fs');
var cmdmap = {};
var pausecmdmap = {};
var ownercmdmap = {};
fs.readdir( './cmds', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('../cmds/' + file);
		if ( command.everyone ) cmdmap[command.name] = command.run;
		if ( command.pause ) pausecmdmap[command.name] = command.run;
		if ( command.owner ) ownercmdmap[command.name] = command.run;
	} );
} );

/**
 * Processes new messages.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('./i18n.js')} lang - The user language.
 * @param {Wiki} [wiki] - The default wiki.
 * @param {String} [prefix] - The prefix for the message.
 * @param {Boolean} [noInline] - Parse inline commands?
 * @param {String} [content] - Overwrite for the message content.
 */
function newMessage(msg, lang, wiki = defaultSettings.wiki, prefix = process.env.prefix, noInline = null, content = '') {
	wiki = new Wiki(wiki);
	msg.noInline = noInline;
	var cont = ( content || msg.content );
	var cleanCont = ( content && Util.cleanContent(content, msg) || msg.cleanContent );
	var author = msg.author;
	var channel = msg.channel;
	if ( msg.isOwner() && cont.hasPrefix(prefix) ) {
		let invoke = cont.substring(prefix.length).split(' ')[0].split('\n')[0].toLowerCase();
		let aliasInvoke = ( lang.aliases[invoke] || invoke );
		if ( ownercmdmap.hasOwnProperty(aliasInvoke) ) {
			cont = cont.substring(prefix.length);
			let args = cont.split(' ').slice(1);
			if ( cont.split(' ')[0].split('\n')[1] ) args.unshift( '', cont.split(' ')[0].split('\n')[1] );
			console.log( ( channel.isGuild() ? msg.guild.id : '@' + author.id ) + ': ' + prefix + cont );
			return ownercmdmap[aliasInvoke](lang, msg, args, cont, wiki);
		}
	}
	var count = 0;
	var maxcount = commandLimit[( patreons[msg.guild?.id] ? 'patreon' : 'default' )];
	var breakLines = false;
	cleanCont.replace( /\u200b/g, '' ).replace( /<a?(:\w+:)\d+>/g, '$1' ).replace( /(?<!\\)```.+?```/gs, '<codeblock>' ).split('\n').forEach( line => {
		if ( line.startsWith( '>>> ' ) ) breakLines = true;
		if ( !line.hasPrefix(prefix) || breakLines || count > maxcount ) return;
		if ( count === maxcount ) {
			count++;
			console.log( '- Message contains too many commands!' );
			msg.reactEmoji('⚠️');
			msg.sendChannelError( lang.get('general.limit', '<@' + author.id + '>'), {allowedMentions:{users:[author.id]}} );
			return;
		}
		count++;
		line = line.substring(prefix.length);
		var invoke = line.split(' ')[0].toLowerCase();
		var args = line.split(' ').slice(1);
		var aliasInvoke = ( lang.aliases[invoke] || invoke );
		var ownercmd = ( msg.isOwner() && ownercmdmap.hasOwnProperty(aliasInvoke) );
		var pausecmd = ( msg.isAdmin() && pause[msg.guild.id] && pausecmdmap.hasOwnProperty(aliasInvoke) );
		if ( msg.onlyVerifyCommand && !( aliasInvoke === 'verify' || pausecmd || ownercmd ) ) return;
		if ( channel.isGuild() && pause[msg.guild.id] && !( pausecmd || ownercmd ) ) {
			return console.log( msg.guild.id + ': Paused' );
		}
		console.log( ( channel.isGuild() ? msg.guild.id : '@' + author.id ) + ': ' + prefix + line );
		if ( ownercmd ) return ownercmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( pausecmd ) return pausecmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( cmdmap.hasOwnProperty(aliasInvoke) ) return cmdmap[aliasInvoke](lang, msg, args, line, wiki);
		if ( /^![a-z\d-]{1,50}$/.test(invoke) ) {
			return cmdmap.LINK(lang, msg, args.join(' '), new Wiki('https://' + invoke.substring(1) + '.gamepedia.com/'), invoke + ' ');
		}
		if ( /^\?(?:[a-z-]{2,12}\.)?[a-z\d-]{1,50}$/.test(invoke) ) {
			let invokeWiki = wiki;
			if ( invoke.includes( '.' ) ) invokeWiki = 'https://' + invoke.split('.')[1] + '.fandom.com/' + invoke.substring(1).split('.')[0] + '/';
			else invokeWiki = 'https://' + invoke.substring(1) + '.fandom.com/';
			return cmdmap.LINK(lang, msg, args.join(' '), new Wiki(invokeWiki), invoke + ' ');
		}
		if ( /^\?\?(?:[a-z-]{2,12}\.)?[a-z\d-]{1,50}$/.test(invoke) ) {
			let invokeWiki = wiki;
			if ( invoke.includes( '.' ) ) invokeWiki = 'https://' + invoke.split('.')[1] + '.wikia.org/' + invoke.substring(2).split('.')[0] + '/';
			else invokeWiki = 'https://' + invoke.substring(2) + '.wikia.org/';
			return cmdmap.LINK(lang, msg, args.join(' '), new Wiki(invokeWiki), invoke + ' ');
		}
		if ( /^!!(?:[a-z\d-]{1,50}\.)?[a-z\d-]{1,50}\.[a-z\d-]{1,10}(?:\/|$)/.test(invoke) ) {
			let project = wikiProjects.find( project => invoke.split('/')[0].endsWith( project.name ) );
			if ( project ) {
				let regex = invoke.match( new RegExp( project.regex ) );
				if ( regex && invoke === '!!' + regex[1] ) return cmdmap.LINK(lang, msg, args.join(' '), new Wiki('https://' + regex[1] + project.scriptPath), invoke + ' ');
			}
		}
		return cmdmap.LINK(lang, msg, line, wiki);
	} );
	if ( msg.onlyVerifyCommand ) return;
	
	if ( ( !channel.isGuild() || !pause[msg.guild.id] ) && !noInline && ( cont.includes( '[[' ) || cont.includes( '{{' ) ) ) {
		var links = [];
		var embeds = [];
		var linkcount = 0;
		var linkmaxcount = maxcount + 5;
		var breakInline = false;
		cleanCont.replace( /\u200b/g, '' ).replace( /<a?(:\w+:)\d+>/g, '$1' ).replace( /(?<!\\)```.+?```/gs, '<codeblock>' ).replace( /(?<!\\)`.+?`/gs, '<code>' ).split('\n').forEach( line => {
			if ( line.startsWith( '>>> ' ) ) breakInline = true;
			if ( line.startsWith( '> ' ) || breakInline ) return;
			if ( line.hasPrefix(prefix) || !( line.includes( '[[' ) || line.includes( '{{' ) ) ) return;
			if ( line.includes( '[[' ) && line.includes( ']]' ) && linkcount <= linkmaxcount ) {
				let regex = new RegExp( '(?<!\\\\)(|\\|\\|)\\[\\[([^' + "<>\\[\\]\\|{}\\x01-\\x1F\\x7F" + ']+)(?<!\\\\)\\]\\]\\1', 'g' );
				let entry = null;
				while ( ( entry = regex.exec(line) ) !== null ) {
					if ( linkcount < linkmaxcount ) {
						linkcount++;
						console.log( ( channel.isGuild() ? msg.guild.id : '@' + author.id ) + ': ' + entry[0] );
						let title = entry[2].split('#')[0].replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
						let section = ( entry[2].includes( '#' ) ? entry[2].split('#').slice(1).join('#').replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ) : '' );
						links.push({title,section,spoiler:entry[1]});
					}
					else if ( linkcount === linkmaxcount ) {
						linkcount++;
						console.log( '- Message contains too many links!' );
						msg.reactEmoji('⚠️');
						break;
					}
				}
			}
			
			if ( line.includes( '{{' ) && line.includes( '}}' ) && count <= maxcount ) {
				let regex = new RegExp( '(?<!\\\\)(|\\|\\|)(?<!\\{)\\{\\{([^' + "<>\\[\\]\\|{}\\x01-\\x1F\\x7F" + ']+)(?<!\\\\)\\}\\}\\1', 'g' );
				let entry = null;
				while ( ( entry = regex.exec(line) ) !== null ) {
					if ( count < maxcount ) {
						count++;
						console.log( ( channel.isGuild() ? msg.guild.id : '@' + author.id ) + ': ' + entry[0] );
						let title = entry[2].split('#')[0].replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
						let section = ( entry[2].includes( '#' ) ? entry[2].split('#').slice(1).join('#').replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ) : '' );
						embeds.push({title,section,spoiler:entry[1]});
					}
					else if ( count === maxcount ) {
						count++;
						console.log( '- Message contains too many links!' );
						msg.reactEmoji('⚠️');
						break;
					}
				}
			}
		} );
	
		if ( links.length ) got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&iwurl=true&titles=' + encodeURIComponent( links.map( link => link.title ).join('|') ) + '&format=json' ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
					return;
				}
				console.log( '- ' + response.statusCode + ': Error while following the links: ' + ( body && body.error && body.error.info ) );
				return;
			}
			wiki.updateWiki(body.query.general);
			if ( body.query.normalized ) {
				body.query.normalized.forEach( title => links.filter( link => link.title === title.from ).forEach( link => link.title = title.to ) );
			}
			if ( body.query.interwiki ) {
				body.query.interwiki.forEach( interwiki => links.filter( link => link.title === interwiki.title ).forEach( link => {
					logging(wiki, msg.guild?.id, 'inline', 'interwiki');
					link.url = ( link.section ? interwiki.url.split('#')[0] + Wiki.toSection(link.section) : interwiki.url );
				} ) );
			}
			if ( body.query.pages ) {
				var querypages = Object.values(body.query.pages);
				querypages.filter( page => page.invalid !== undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
					links.splice(links.indexOf(link), 1);
				} ) );
				querypages.filter( page => page.missing !== undefined && page.known === undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
					if ( ( page.ns === 2 || page.ns === 202 ) && !page.title.includes( '/' ) ) return;
					if ( wiki.isMiraheze() && page.ns === 0 && /^Mh:[a-z\d]+:/.test(page.title) ) {
						logging(wiki, msg.guild?.id, 'inline', 'interwiki');
						var iw_parts = page.title.split(':');
						var iw = new Wiki('https://' + iw_parts[1] + '.miraheze.org/w/');
						link.url = iw.toLink(iw_parts.slice(2).join(':'), '', link.section);
						return;
					}
					logging(wiki, msg.guild?.id, 'inline', 'redlink');
					link.url = wiki.toLink(link.title, 'action=edit&redlink=1');
				} ) );
			}
			if ( links.length ) msg.sendChannel( links.map( link => {
				if ( !link.url ) logging(wiki, msg.guild?.id, 'inline');
				return link.spoiler + '<' + ( link.url || wiki.toLink(link.title, '', link.section) ) + '>' + link.spoiler;
			} ).join('\n'), {split:true} );
		}, error => {
			if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Error while following the links: ' + error );
			}
		} );
		
		if ( embeds.length ) got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general' + ( wiki.isFandom() ? '' : '|variables' ) + '&titles=' + encodeURIComponent( embeds.map( embed => embed.title + '|Template:' + embed.title ).join('|') ) + '&format=json' ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
					return;
				}
				console.log( '- ' + response.statusCode + ': Error while following the links: ' + ( body && body.error && body.error.info ) );
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
					if ( ( page.ns === 2 || page.ns === 202 ) && !page.title.includes( '/' ) ) return;
					if ( wiki.isMiraheze() && page.ns === 0 && /^Mh:[a-z\d]+:/.test(page.title) ) return;
					embeds.splice(embeds.indexOf(embed), 1);
					if ( page.ns === 0 && !embed.section ) {
						var template = querypages.find( template => template.ns === 10 && template.title.split(':').slice(1).join(':') === embed.title );
						if ( template && template.missing === undefined ) embed.template = wiki.toLink(template.title);
					}
					if ( embed.template || !body.query.variables || !body.query.variables.some( variable => variable.toUpperCase() === embed.title ) ) missing.push(embed);
				} ) );
				if ( missing.length ) {
					msg.sendChannel( missing.map( embed => {
						if ( embed.template ) logging(wiki, msg.guild?.id, 'inline', 'template');
						else logging(wiki, msg.guild?.id, 'inline', 'redlink');
						return embed.spoiler + '<' + ( embed.template || wiki.toLink(embed.title, 'action=edit&redlink=1') ) + '>' + embed.spoiler;
					} ).join('\n'), {split:true} );
				}
			}
			if ( embeds.length ) embeds.forEach( embed => msg.reactEmoji('⏳').then( reaction => {
				logging(wiki, msg.guild?.id, 'inline', 'embed');
				check_wiki.general(lang, msg, embed.title, wiki, '', reaction, embed.spoiler, new URLSearchParams(), embed.section);
			} ) );
		}, error => {
			if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Error while following the links: ' + error );
			}
		} );
	}
}

module.exports = newMessage;

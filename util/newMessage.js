const {Util} = require('discord.js');
const {defaultSettings} = require('./default.json');
const check_wiki = {
	fandom: require('../cmds/wiki/fandom.js'),
	gamepedia: require('../cmds/wiki/gamepedia.js')
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

function newMessage(msg, lang, wiki = defaultSettings.wiki, prefix = process.env.prefix, noInline = null, content = '') {
	msg.noInline = noInline;
	var cont = ( content || msg.content );
	var cleanCont = ( content && Util.cleanContent(content, msg) || msg.cleanContent );
	var author = msg.author;
	var channel = msg.channel;
	var invoke = ( cont.split(' ')[1] ? cont.split(' ')[1].split('\n')[0].toLowerCase() : '' );
	var aliasInvoke = ( lang.aliases[invoke] || invoke );
	var ownercmd = ( msg.isOwner() && aliasInvoke in ownercmdmap );
	if ( cont.hasPrefix(prefix) && ownercmd ) {
		var args = cont.split(' ').slice(2);
		if ( cont.split(' ')[1].split('\n')[1] ) args.unshift( '', cont.split(' ')[1].split('\n')[1] );
		else console.log( ( channel.type === 'text' ? msg.guild.id : '@' + author.id ) + ': ' + cont );
		ownercmdmap[aliasInvoke](lang, msg, args, cont, wiki);
	} else {
		var count = 0;
		var maxcount = ( channel.type === 'text' && msg.guild.id in patreons ? 15 : 10 );
		cleanCont.replace( /\u200b/g, '' ).split('\n').forEach( line => {
			if ( line.hasPrefix(prefix) && count < maxcount ) {
				count++;
				invoke = ( line.split(' ')[1] ? line.split(' ')[1].toLowerCase() : '' );
				var args = line.split(' ').slice(2);
				aliasInvoke = ( lang.aliases[invoke] || invoke );
				ownercmd = ( msg.isOwner() && aliasInvoke in ownercmdmap );
				if ( channel.type === 'text' && pause[msg.guild.id] && !( ( msg.isAdmin() && aliasInvoke in pausecmdmap ) || ownercmd ) ) console.log( msg.guild.id + ': Paused' );
				else console.log( ( channel.type === 'text' ? msg.guild.id : '@' + author.id ) + ': ' + line );
				if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, line, wiki);
				else if ( channel.type !== 'text' || !pause[msg.guild.id] || ( msg.isAdmin() && aliasInvoke in pausecmdmap ) ) {
					if ( aliasInvoke in cmdmap ) cmdmap[aliasInvoke](lang, msg, args, line, wiki);
					else if ( /^![a-z\d-]{1,50}$/.test(invoke) ) {
						cmdmap.LINK(lang, msg, args.join(' '), 'https://' + invoke.substring(1) + '.gamepedia.com/', ' ' + invoke + ' ');
					}
					else if ( /^\?(?:[a-z-]{1,8}\.)?[a-z\d-]{1,50}$/.test(invoke) ) {
						var invokeWiki = wiki;
						if ( invoke.includes( '.' ) ) invokeWiki = 'https://' + invoke.split('.')[1] + '.fandom.com/' + invoke.substring(1).split('.')[0] + '/';
						else invokeWiki = 'https://' + invoke.substring(1) + '.fandom.com/';
						cmdmap.LINK(lang, msg, args.join(' '), invokeWiki, ' ' + invoke + ' ');
					}
					else if ( /^\?\?(?:[a-z-]{1,8}\.)?[a-z\d-]{1,50}$/.test(invoke) ) {
						var invokeWiki = wiki;
						if ( invoke.includes( '.' ) ) invokeWiki = 'https://' + invoke.split('.')[1] + '.wikia.org/' + invoke.substring(2).split('.')[0] + '/';
						else invokeWiki = 'https://' + invoke.substring(2) + '.wikia.org/';
						cmdmap.LINK(lang, msg, args.join(' '), invokeWiki, ' ' + invoke + ' ');
					}
					else cmdmap.LINK(lang, msg, line.split(' ').slice(1).join(' '), wiki);
				}
			} else if ( line.hasPrefix(prefix) && count === maxcount ) {
				count++;
				console.log( '- Message contains too many commands!' );
				msg.reactEmoji('⚠️');
				msg.sendChannelError( lang.limit.replaceSave( '%s', '<@' + author.id + '>' ), {allowedMentions:{users:[author.id]}} );
			}
		} );
		
		if ( ( channel.type !== 'text' || !pause[msg.guild.id] ) && !noInline && ( cont.includes( '[[' ) || cont.includes( '{{' ) ) ) {
			var links = [];
			var embeds = [];
			var linkcount = 0;
			var linkmaxcount = maxcount + 5;
			msg.cleanContent.replace( /\u200b/g, '' ).replace( /(?<!\\)```.+?```/gs, '<codeblock>' ).replace( /(?<!\\)`.+?`/gs, '<code>' ).split('\n').forEach( line => {
				if ( line.hasPrefix(prefix) || !( line.includes( '[[' ) || line.includes( '{{' ) ) ) return;
				if ( line.includes( '[[' ) && line.includes( ']]' ) && linkcount <= linkmaxcount ) {
					let regex = new RegExp( '(?<!\\\\)(|\\|\\|)\\[\\[([^' + "<>\\[\\]\\|{}\\x01-\\x1F\\x7F" + ']+)(?<!\\\\)\\]\\]\\1', 'g' );
					let entry = null;
					while ( ( entry = regex.exec(line) ) !== null ) {
						if ( linkcount < linkmaxcount ) {
							linkcount++;
							console.log( ( channel.type === 'text' ? msg.guild.id : '@' + author.id ) + ': ' + entry[0] );
							let title = entry[2].split('#')[0];
							let section = ( entry[2].includes( '#' ) ? entry[2].split('#').slice(1).join('#') : '' )
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
							console.log( ( channel.type === 'text' ? msg.guild.id : '@' + author.id ) + ': ' + entry[0] );
							let title = entry[2].split('#')[0];
							let section = ( entry[2].includes( '#' ) ? entry[2].split('#').slice(1).join('#') : '' )
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
		
			if ( links.length ) got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&iwurl=true&titles=' + encodeURIComponent( links.map( link => link.title ).join('|') ) + '&format=json', {
				responseType: 'json'
			} ).then( response => {
				var body = response.body;
				if ( response.statusCode !== 200 || !body || !body.query ) {
					if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
						console.log( '- This wiki doesn\'t exist!' );
						msg.reactEmoji('nowiki');
						return;
					}
					console.log( '- ' + response.statusCode + ': Error while following the links: ' + ( body && body.error && body.error.info ) );
					return;
				}
				if ( body.query.normalized ) {
					body.query.normalized.forEach( title => links.filter( link => link.title === title.from ).forEach( link => link.title = title.to ) );
				}
				if ( body.query.interwiki ) {
					body.query.interwiki.forEach( interwiki => links.filter( link => link.title === interwiki.title ).forEach( link => {
						link.url = interwiki.url + ( link.section ? '#' + link.section.toSection() : '' );
					} ) );
				}
				if ( body.query.pages ) {
					var querypages = Object.values(body.query.pages);
					querypages.filter( page => page.invalid !== undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
						links.splice(links.indexOf(link), 1);
					} ) );
					querypages.filter( page => page.missing !== undefined && page.known === undefined ).forEach( page => links.filter( link => link.title === page.title ).forEach( link => {
						if ( ( page.ns === 2 || page.ns === 202 ) && !page.title.includes( '/' ) ) return;
						link.url = wiki.toLink(link.title, 'action=edit&redlink=1', '', body.query.general);
					} ) );
				}
				if ( links.length ) msg.sendChannel( links.map( link => link.spoiler + '<' + ( link.url || wiki.toLink(link.title, '', link.section, body.query.general) ) + '>' + link.spoiler ).join('\n'), {split:true} );
			}, error => {
				if ( wiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Error while following the links: ' + error );
				}
			} );
			
			if ( embeds.length ) got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general' + ( wiki.isFandom() ? '' : '|variables' ) + '&titles=' + encodeURIComponent( embeds.map( embed => embed.title + '|Template:' + embed.title ).join('|') ) + '&format=json', {
				responseType: 'json'
			} ).then( response => {
				var body = response.body;
				if ( response.statusCode !== 200 || !body || !body.query ) {
					if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
						console.log( '- This wiki doesn\'t exist!' );
						msg.reactEmoji('nowiki');
						return;
					}
					console.log( '- ' + response.statusCode + ': Error while following the links: ' + ( body && body.error && body.error.info ) );
					return;
				}
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
						embeds.splice(embeds.indexOf(embed), 1);
						if ( page.ns === 0 && !embed.section ) {
							var template = querypages.find( template => template.ns === 10 && template.title.split(':').slice(1).join(':') === embed.title );
							if ( template && template.missing === undefined ) embed.template = wiki.toLink(template.title, '', '', body.query.general);
						}
						if ( embed.template || !body.query.variables || !body.query.variables.some( variable => variable.toUpperCase() === embed.title ) ) missing.push(embed);
					} ) );
					if ( missing.length ) {
						msg.sendChannel( missing.map( embed => embed.spoiler + '<' + ( embed.template || wiki.toLink(embed.title, 'action=edit&redlink=1', '', body.query.general) ) + '>' + embed.spoiler ).join('\n'), {split:true} );
					}
				}
				if ( embeds.length ) {
					if ( wiki.isFandom() ) embeds.forEach( embed => msg.reactEmoji('⏳').then( reaction => {
						check_wiki.fandom(lang, msg, embed.title, wiki, ' ', reaction, embed.spoiler, '', embed.section);
					} ) );
					else embeds.forEach( embed => msg.reactEmoji('⏳').then( reaction => {
						check_wiki.gamepedia(lang, msg, embed.title, wiki, ' ', reaction, embed.spoiler, '', embed.section);
					} ) );
				}
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
}

module.exports = newMessage;
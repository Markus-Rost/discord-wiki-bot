import { PermissionFlagsBits } from 'discord.js';
import logging from '../util/logging.js';
import Wiki from '../util/wiki.js';
import { got, limitLength, partialURIdecode, sendMessage } from '../util/functions.js';

/**
 * Post a message with inline wiki links.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_inline(interaction, lang, wiki) {
	var text = ( interaction.options.getString('text') || '' ).replace( /\]\(/g, ']\\(' );
	text = text.replace( /\x1F/g, '' ).replace( /(?<!@)\u200b/g, '' ).trim();
	if ( !text.includes( '{{' ) && !( text.includes( '[[' ) && text.includes( ']]' ) ) && !text.includes( 'PMID' ) && !text.includes( 'RFC' ) && !text.includes( 'ISBN' ) ) {
		return interaction.reply( {content: lang.uselang(interaction.locale).get('interaction.inline'), ephemeral: true} ).catch(log_error);
	}
	/** @type {import('discord.js').MessageMentionOptions} */
	var allowedMentions = {
		parse: ['users']
	};
	if ( interaction.inGuild() ) {
		if ( interaction.memberPermissions.has(PermissionFlagsBits.MentionEveryone) ) {
			allowedMentions.parse = ['users', 'roles', 'everyone'];
		}
		else if ( interaction.guild ) {
			allowedMentions.roles = interaction.guild.roles.cache.filter( role => role.mentionable ).map( role => role.id ).slice(0, 100);
		}
		if ( !interaction.memberPermissions.has(PermissionFlagsBits.UseExternalEmojis) && interaction.appPermissions.has(PermissionFlagsBits.UseExternalEmojis) && interaction.guild ) {
			text = text.replace( /(?<!\\)<a?(:\w+:)\d+>/g, (replacement, emoji, id) => {
				if ( interaction.guild.emojis.cache.has(id) ) {
					return replacement;
				}
				return emoji;
			} );
		}
	}
	if ( text.length > 1800 ) text = text.substring(0, 1800) + '\u2026';
	var message = {
		content: text.replace( /(?<!\\)<a?(:\w+:)\d+>/g, (replacement, emoji, id) => {
			if ( interaction.guild?.emojis.cache.has(id) ) {
				return replacement;
			}
			return emoji;
		} ),
		allowedMentions
	};
	return interaction.deferReply().then( () => {
		var textReplacement = [];
		var magiclinks = [];
		var replacedText = text.replace( /(?<!\\)(?:<a?(:\w+:)\d+>|<#(\d+)>|<@!?(\d+)>|<@&(\d+)>|```.+?```|``.+?``|`.+?`)/gs, (replacement, emoji, textchannel, user, role) => {
			textReplacement.push(replacement);
			var arg = '';
			if ( emoji ) arg = emoji;
			if ( textchannel ) {
				let tempchannel = interaction.client.channels.cache.get(textchannel);
				if ( tempchannel ) arg = '#' + ( tempchannel.name || 'deleted-channel' );
			}
			if ( user ) {
				let tempmember = interaction.guild?.members.cache.get(user);
				if ( tempmember ) arg = '@' + tempmember.displayName;
				else {
					let tempuser = interaction.client.users.cache.get(user);
					if ( tempuser ) arg = '@' + tempuser.username;
				}
			}
			if ( role ) {
				let temprole = interaction.guild?.roles.cache.get(role);
				if ( temprole ) arg = '@' + temprole.name;
			}
			return '\x1F<replacement\x1F' + textReplacement.length + ( arg ? '\x1F' + arg : '' ) + '>\x1F';
		} ).replace( /\b(PMID|RFC) +([0-9]+)\b/g, (replacement, type, id) => {
			magiclinks.push({type, id, replacementId: textReplacement.length});
			textReplacement.push(replacement);
			return '\x1F<replacement\x1F' + textReplacement.length + '\x1F' + replacement + '>\x1F';
		} ).replace( /\bISBN +((?:97[89][- ]?)?(?:[0-9][- ]?){9}[0-9Xx])\b/g, (replacement, id) => {
			let isbn = id.replace( /[- ]/g, '' ).replace( /x/g, 'X' );
			magiclinks.push({type: 'ISBN', id, isbn, replacementId: textReplacement.length});
			textReplacement.push(replacement);
			return '\x1F<replacement\x1F' + textReplacement.length + '\x1F' + replacement + '>\x1F';
		} );
		var templates = [];
		var links = [];
		var breakInline = false;
		replacedText.replace( /\x1F<replacement\x1F\d+\x1F(.+?)>\x1F/g, '$1' ).replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ).split('\n').forEach( line => {
			if ( line.startsWith( '>>> ' ) ) breakInline = true;
			if ( line.startsWith( '> ' ) || breakInline ) return;
			var inlineLink = null;
			var regex = /(?<!\\|\{)\{\{(?:\s*(?:subst|safesubst|raw|msg|msgnw):)?([^<>\[\]\|\{\}\x01-\x1F\x7F#]+)(?<!\\)(?:\||\}\})/g;
			while ( ( inlineLink = regex.exec(line) ) !== null ) {
				let title = inlineLink[1].trim();
				if ( !title.replace( /:/g, '' ).trim().length || title.startsWith( '/' ) ) continue;
				if ( title.startsWith( 'int:' ) ) templates.push({
					raw: title,
					title: title.replace( /^int:/, 'MediaWiki:' ),
					template: title.replace( /^int:/, 'MediaWiki:' )
				});
				else templates.push({raw: title, title, template: 'Template:' + title});
			}
			inlineLink = null;
			regex = /(?<!\\)\[\[([^<>\[\]\|\{\}\x01-\x1F\x7F]+)(?:\|(?:(?!\[\[|\]\\\]).)*?)?(?<!\\)\]\]/g;
			while ( ( inlineLink = regex.exec(line) ) !== null ) {
				inlineLink[1] = inlineLink[1].trim();
				let title = inlineLink[1].split('#')[0].trim();
				let section = inlineLink[1].split('#').slice(1).join('#');
				if ( !title.replace( /:/g, '' ).trim().length || title.startsWith( '/' ) ) continue;
				links.push({raw: title, title, section});
			}
		} );
		if ( !templates.length && !links.length && !magiclinks.length ) {
			return sendMessage(interaction, message);
		}
		return got.get( wiki + 'api.php?action=query&meta=siteinfo' + ( magiclinks.length ? '|allmessages&ammessages=pubmedurl|rfcurl&amenableparser=true' : '' ) + '&siprop=general&iwurl=true&titles=' + encodeURIComponent( [
			...templates.map( link => link.title + '|' + link.template ),
			...links.map( link => link.title ),
			...( magiclinks.length ? ['Special:BookSources'] : [] )
		].join('|') ) + '&format=json', {
			context: {
				guildId: interaction.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					console.log( '- This wiki doesn\'t exist!' );
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while following the links: ' + body?.error?.info );
				}
				return sendMessage(interaction, message);
			}
			logging(wiki, interaction.guildId, 'slash', 'inline');
			wiki.updateWiki(body.query.general);
			if ( body.query.normalized ) {
				body.query.normalized.forEach( title => {
					templates.filter( link => link.title === title.from ).forEach( link => link.title = title.to );
					templates.filter( link => link.template === title.from ).forEach( link => link.template = title.to );
					links.filter( link => link.title === title.from ).forEach( link => link.title = title.to );
				} );
			}
			if ( body.query.interwiki ) {
				body.query.interwiki.forEach( interwiki => {
					templates.filter( link => link.title === interwiki.title ).forEach( link => {
						link.url = decodeURI(interwiki.url)
					} );
					links.filter( link => link.title === interwiki.title ).forEach( link => {
						link.url = ( link.section ? decodeURI(interwiki.url.split('#')[0]) + Wiki.toSection(link.section) : decodeURI(interwiki.url) );
					} );
				} );
			}
			if ( body.query.pages ) {
				Object.values(body.query.pages).forEach( page => {
					templates.filter( link => link.title === page.title ).forEach( link => {
						if ( page.invalid !== undefined || ( page.missing !== undefined && page.known === undefined ) ) {
							link.title = '';
						}
						else if ( page.ns === 0 && !link.raw.startsWith( ':' ) ) {
							link.title = '';
						}
					} );
					templates.filter( link => link.template === page.title ).forEach( link => {
						if ( page.invalid !== undefined || ( page.missing !== undefined && page.known === undefined ) ) {
							link.template = '';
						}
					} );
					links.filter( link => link.title === page.title ).forEach( link => {
						link.ns = page.ns;
						if ( page.invalid !== undefined ) return links.splice(links.indexOf(link), 1);
						if ( page.missing !== undefined && page.known === undefined ) {
							if ( ( page.ns === 2 || page.ns === 200 || page.ns === 202 || page.ns === 1200 ) && !page.title.includes( '/' ) ) {
								return;
							}
							if ( wiki.wikifarm === 'miraheze' && page.ns === 0 && /^Mh:[a-z\d]+:/.test(page.title) ) {
								var iw_parts = page.title.split(':');
								var iw = new Wiki('https://' + iw_parts[1] + '.miraheze.org/w/');
								link.url = iw.toLink(iw_parts.slice(2).join(':'), '', link.section, true);
								return;
							}
							return links.splice(links.indexOf(link), 1);
						}
					} );
				} );
			}
			if ( magiclinks.length && body.query?.allmessages?.length === 2 ) {
				magiclinks = magiclinks.filter( link => body.query.general.magiclinks.hasOwnProperty(link.type) );
				if ( magiclinks.length ) magiclinks.forEach( link => {
					if ( link.type === 'PMID' && body.query.allmessages[0]?.['*']?.includes( '$1' ) ) {
						link.url = new URL(body.query.allmessages[0]['*'].replace( /\$1/g, link.id ), wiki).href;
					}
					if ( link.type === 'RFC' && body.query.allmessages[1]?.['*']?.includes( '$1' ) ) {
						link.url = new URL(body.query.allmessages[1]['*'].replace( /\$1/g, link.id ), wiki).href;
					}
					if ( link.type === 'ISBN' ) {
						let title = 'Special:BookSources';
						title = ( body.query.normalized?.find( title => title.from === title )?.to || title );
						link.url = wiki.toLink(title + '/' + link.isbn, '', '', true);
					}
					if ( link.url ) {
						console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: ' + link.type + ' ' + link.id );
						textReplacement[link.replacementId] = '[' + link.type + ' ' + link.id + '](<' + link.url + '>)';
					}
				} );
			}
			templates = templates.filter( link => link.title || link.template );
			if ( templates.length || links.length || magiclinks.length ) {
				breakInline = false;
				if ( templates.length || links.length ) replacedText = replacedText.split('\n').map( line => {
					if ( line.startsWith( '>>> ' ) ) breakInline = true;
					if ( line.startsWith( '> ' ) || breakInline ) return line;
					let regex = null;
					if ( line.includes( '{{' ) ) {
						regex = /(?<!\\|\{)(\{\{(?:\s*(?:subst|safesubst|raw|msg|msgnw):)?\s*)((?:[^<>\[\]\|\{\}\x01-\x1F\x7F#]|\x1F<replacement\x1F\d+\x1F.+?>\x1F)+?)(\s*(?<!\\)\||\}\})/g;
						line = line.replace( regex, (fullLink, linkprefix, title, linktrail) => {
							title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ).replace( /\x1F<replacement\x1F\d+\x1F(.+?)>\x1F/g, '$1' ).trim();
							let link = templates.find( link => link.raw === title );
							if ( !link ) return fullLink;
							console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: ' + fullLink );
							if ( title.startsWith( 'int:' ) ) {
								title = title.replace( /^int:\s*/, replacement => {
									linkprefix += replacement;
									return '';
								} );
							}
							return linkprefix + '[' + title + '](<' + ( link.url || wiki.toLink(link.title || link.template, '', '', true) ) + '>)' + linktrail;
						} );
					}
					if ( line.includes( '[[' ) && line.includes( ']]' ) ) {
						regex = new RegExp( '([' + body.query.general.linkprefixcharset.replace( /\\x([a-fA-f0-9]{4,6}|\{[a-fA-f0-9]{4,6}\})/g, '\\u$1' ) + ']+)?' + '(?<!\\\\)\\[\\[' + '((?:[^' + '<>\\[\\]\\|\\{\\}\\x01-\\x1F\\x7F' + ']|' + '\\x1F<replacement\\x1F\\d+\\x1F.+?>\\x1F' + ')+)' + '(?:\\|((?:(?!\\[\\[|\\]\\(|\\]\\\\\\]).)*?))?' + '(?<!\\\\)\\]\\]' + body.query.general.linktrail.replace( /\\x([a-fA-f0-9]{4,6}|\{[a-fA-f0-9]{4,6}\})/g, '\\u$1' ).replace( /^\/\^(\(\[.+?\]\+\))\(\.\*\)\$\/sDu?$/, '$1?' ), 'gu' );
						line = line.replace( regex, (fullLink, linkprefix = '', title, display, linktrail = '') => {
							title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode ).replace( /\x1F<replacement\x1F\d+\x1F(.+?)>\x1F/g, '$1' ).split('#')[0].trim();
							let link = links.find( link => link.raw === title );
							if ( !link ) return fullLink;
							console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: ' + fullLink );
							if ( display === undefined ) display = title.replace( /^\s*:?/, '' );
							if ( !display.trim() ) {
								display = title.replace( /^\s*:/, '' );
								if ( display.includes( ',' ) && !/ ([^\(\)]+)$/.test(display) ) {
									display = display.replace( /^([^,]+), .*$/, '$1' );
								}
								display = display.replace( / \([^\(\)]+\)$/, '' );
								if ( link.url || link.ns  !== 0 ) {
									display = display.split(':').slice(1).join(':');
								}
							}
							return '[' + ( linkprefix + display + linktrail ).replace( /\x1F<replacement\x1F\d+\x1F((?:PMID|RFC|ISBN) .+?)>\x1F/g, '$1' ).replace( /[\[\]\(\)]/g, '\\$&' ) + '](<' + ( link.url || wiki.toLink(link.title, '', link.section, true) ) + '>)';
						} );
					}
					return line;
				} ).join('\n');
				text = replacedText.replace( /\x1F<replacement\x1F(\d+)(?:\x1F.+?)?>\x1F/g, (replacement, id) => {
					return textReplacement[id - 1];
				} );
				if ( text.length > 1900 ) text = limitLength(text, 1900, 100);
				message.content = text;
				return sendMessage(interaction, message);
			}
			else return sendMessage(interaction, message);
		}, error => {
			if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
			}
			else {
				console.log( '- Error while following the links: ' + error );
			}
			return sendMessage(interaction, message);
		} );
	}, log_error );
}

export default {
	name: 'inline',
	slash: slash_inline
};
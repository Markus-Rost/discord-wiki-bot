const logging = require('../util/logging.js');
const Wiki = require('../util/wiki.js');
const {limitLength, partialURIdecode, allowDelete} = require('../util/functions.js');

/**
 * Post a message with inline wiki links.
 * @param {Object} interaction - The interaction.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('../util/wiki.js')} wiki - The wiki for the interaction.
 * @param {import('discord.js').TextChannel} [channel] - The channel for the interaction.
 */
function slash_inline(interaction, lang, wiki, channel) {
	var text = ( interaction.data.options?.[0]?.value || '' ).replace( /\]\(/g, ']\\(' );
	text = text.replace( /\x1F/g, '' ).replace( /(?<!@)\u200b/g, '' ).trim();
	if ( !text ) {
		return got.post( `https://discord.com/api/v8/interactions/${interaction.id}/${interaction.token}/callback`, {
			json: {
				//type: 4,
				type: 3,
				data: {
					content: lang.get('interaction.inline'),
					allowed_mentions: {
						parse: []
					},
					flags: 64
				}
			}
		} ).then( response => {
			if ( response.statusCode !== 204 ) {
				console.log( '- Slash: ' + response.statusCode + ': Error while sending the response: ' + response.body?.message );
			}
		}, log_error );
	}
	var allowed_mentions = {
		parse: ['users']
	};
	if ( interaction.guild_id ) {
		if ( ( (interaction.member.permissions & 1 << 3) === 1 << 3 ) // ADMINISTRATOR
		|| ( (interaction.member.permissions & 1 << 17) === 1 << 17 ) ) { // MENTION_EVERYONE
			allowed_mentions.parse = ['users', 'roles', 'everyone'];
		}
		else if ( channel?.guild ) {
			allowed_mentions.roles = channel.guild.roles.cache.filter( role => role.mentionable ).map( role => role.id ).slice(0, 100);
		}
		if ( channel?.guild && ( (interaction.member.permissions & 1 << 3) !== 1 << 3 ) // ADMINISTRATOR
		&& ( (interaction.member.permissions & 1 << 18) !== 1 << 18 ) ) { // USE_EXTERNAL_EMOJIS
			text = text.replace( /(?<!\\)<a?(:\w+:)\d+>/g, (replacement, emoji, id) => {
				if ( channel.guild.emojis.cache.has(id) ) {
					return replacement;
				}
				return emoji;
			} );
		}
	}
	if ( text.length > 1800 ) text = text.substring(0, 1800) + '\u2026';
	return got.post( `https://discord.com/api/v8/interactions/${interaction.id}/${interaction.token}/callback`, {
		json: {
			type: 4,
			data: {
				content: text.replace( /(?<!\\)<a?(:\w+:)\d+>/g, (replacement, emoji, id) => {
					if ( channel?.guild?.emojis.cache.has(id) ) {
						return replacement;
					}
					return emoji;
				} ),
				allowed_mentions,
				flags: 0
			}
		}
	} ).then( aresponse => {
		if ( aresponse.statusCode !== 204 ) {
			console.log( '- Slash: ' + aresponse.statusCode + ': Error while sending the response: ' + aresponse.body?.message );
			return;
		}
		if ( !text.includes( '{{' ) && !( text.includes( '[[' ) && text.includes( ']]' ) ) ) {
			return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
				json: {}
			} ).then( presponse => {
				if ( presponse.statusCode === 200 && presponse.body?.id ) {
					channel?.messages.fetch(presponse.body.id).then( msg => {
						allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
					}, () => {} );
				}
			}, () => {} );
		}
		var textReplacement = [];
		var replacedText = text.replace( /(?<!\\)(?:<a?(:\w+:)\d+>|<#(\d+)>|<@!?(\d+)>|<@&(\d+)>|```.+?```|``.+?``|`.+?`)/gs, (replacement, emoji, textchannel, user, role) => {
			textReplacement.push(replacement);
			var arg = '';
			if ( emoji ) arg = emoji;
			if ( channel ) {
				if ( textchannel ) {
					let tempchannel = channel.client.channels.cache.get(textchannel);
					if ( tempchannel ) arg = '#' + tempchannel.name;
				}
				if ( user ) {
					let tempuser = channel.guild?.members.cache.get(user);
					if ( tempuser ) arg = '@' + tempuser.displayName;
					else {
						tempuser = channel.client.users.cache.get(user);
						if ( tempuser ) arg = '@' + tempuser.username;
					}
				}
				if ( role ) {
					let temprole = channel.guild?.roles.cache.get(role);
					if ( temprole ) arg = '@' + temprole.name;
				}
			}
			return '\x1F<replacement' + ( arg ? '\x1F' + textReplacement.length + '\x1F' + arg : '' ) + '>\x1F';
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
		if ( !templates.length && !links.length ) {
			return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
				json: {}
			} ).then( presponse => {
				if ( presponse.statusCode === 200 && presponse.body?.id ) {
					channel?.messages.fetch(presponse.body.id).then( msg => {
						allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
					}, () => {} );
				}
			}, () => {} );
		}
		return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&iwurl=true&titles=' + encodeURIComponent( [
			...templates.map( link => link.title + '|' + link.template ),
			...links.map( link => link.title )
		].join('|') ) + '&format=json' ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					console.log( '- This wiki doesn\'t exist!' );
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while following the links: ' + body?.error?.info );
				}
				return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
					json: {}
				} ).then( presponse => {
					if ( presponse.statusCode === 200 && presponse.body?.id ) {
						channel?.messages.fetch(presponse.body.id).then( msg => {
							allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
						}, () => {} );
					}
				}, () => {} );
			}
			logging(wiki, interaction.guild_id, 'slash', 'inline');
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
							if ( ( page.ns === 2 || page.ns === 202 ) && !page.title.includes( '/' ) ) {
								return;
							}
							if ( wiki.isMiraheze() && page.ns === 0 && /^Mh:[a-z\d]+:/.test(page.title) ) {
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
			templates = templates.filter( link => link.title || link.template );
			if ( templates.length || links.length ) {
				breakInline = false;
				replacedText = replacedText.split('\n').map( line => {
					if ( line.startsWith( '>>> ' ) ) breakInline = true;
					if ( line.startsWith( '> ' ) || breakInline ) return line;
					let linkReplacements = 1;
					let regex = /(?<!\\|\{)(\{\{(?:\s*(?:subst|safesubst|raw|msg|msgnw):)?\s*)((?:[^<>\[\]\|\{\}\x01-\x1F\x7F#]|\x1F<replacement\x1F\d+\x1F.+?>\x1F)+?)(\s*(?<!\\)\||\}\})/g;
					line = line.replace( regex, (fullLink, linkprefix, title, linktrail) => {
						title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
						let rawTitle = title.replace( /\x1F<replacement\x1F\d+\x1F(.+?)>\x1F/g, '$1' ).trim();
						let link = templates.find( link => link.raw === rawTitle );
						if ( !link ) return fullLink;
						console.log( ( interaction.guild_id || '@' + interaction.user.id ) + ': Slash: ' + fullLink );
						title = title.replace( /\x1F<replacement\x1F(\d+)\x1F(.+?)>\x1F/g, (replacement, id, arg) => {
							links.splice(id - linkReplacements, 1);
							linkReplacements++;
							return arg;
						} );
						if ( title.startsWith( 'int:' ) ) {
							title = title.replace( /^int:\s*/, replacement => {
								linkprefix += replacement;
								return '';
							} );
						}
						return linkprefix + '[' + title + '](<' + ( link.url || wiki.toLink(link.title || link.template, '', '', true) ) + '>)' + linktrail;
					} );
					regex = new RegExp( '([' + body.query.general.linkprefixcharset.replace( /\\x([a-fA-f0-9]{4,6}|\{[a-fA-f0-9]{4,6}\})/g, '\\u$1' ) + ']+)?' + '(?<!\\\\)\\[\\[' + '((?:[^' + "<>\\[\\]\\|\{\}\\x01-\\x1F\\x7F" + ']|' + '\\x1F<replacement\\x1F\\d+\\x1F.+?>\\x1F' + ')+)' + '(?:\\|((?:(?!\\[\\[|\\]\\(|\\]\\\\\\]).)*?))?' + '(?<!\\\\)\\]\\]' + body.query.general.linktrail.replace( /\\x([a-fA-f0-9]{4,6}|\{[a-fA-f0-9]{4,6}\})/g, '\\u$1' ).replace( /^\/\^(\(\[.+?\]\+\))\(\.\*\)\$\/sDu?$/, '$1?' ), 'gu' );
					line = line.replace( regex, (fullLink, linkprefix = '', title, display, linktrail = '') => {
						title = title.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode );
						let rawTitle = title.replace( /\x1F<replacement\x1F\d+\x1F(.+?)>\x1F/g, '$1' ).split('#')[0].trim();
						let link = links.find( link => link.raw === rawTitle );
						if ( !link ) return fullLink;
						console.log( ( interaction.guild_id || '@' + interaction.user.id ) + ': Slash: ' + fullLink );
						title = title.replace( /\x1F<replacement\x1F(\d+)\x1F(.+?)>\x1F/g, (replacement, id, arg) => {
							links.splice(id - linkReplacements, 1);
							linkReplacements++;
							return arg;
						} );
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
						return '[' + ( linkprefix + display + linktrail ).replace( /\[\]\(\)/g, '\\$&' ) + '](<' + ( link.url || wiki.toLink(link.title, '', link.section, true) ) + '>)';
					} );
					return line;
				} ).join('\n');
				text = replacedText.replace( /\x1F<replacement(?:\x1F\d+\x1F.+?)?>\x1F/g, replacement => {
					return textReplacement.shift();
				} );
				if ( text.length > 1900 ) text = limitLength(text, 1900, 100);
				return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
					json: {
						content: text,
						allowed_mentions
					}
				} ).then( presponse => {
					if ( presponse.statusCode !== 200 ) {
						console.log( '- Slash: ' + presponse.statusCode + ': Error while sending the response: ' + presponse.body?.message );
					}
					channel?.messages.fetch(presponse.body.id).then( msg => {
						allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
					}, () => {} );
				}, log_error );
			}
			else return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
				json: {}
			} ).then( presponse => {
				if ( presponse.statusCode === 200 && presponse.body?.id ) {
					channel?.messages.fetch(presponse.body.id).then( msg => {
						allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
					}, () => {} );
				}
			}, () => {} );
		}, error => {
			if ( wiki.noWiki(error.message) ) {
				console.log( '- This wiki doesn\'t exist!' );
			}
			else {
				console.log( '- Error while following the links: ' + error );
			}
			return got.patch( `https://discord.com/api/v8/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
				json: {}
			} ).then( presponse => {
				if ( presponse.statusCode === 200 && presponse.body?.id ) {
					channel?.messages.fetch(presponse.body.id).then( msg => {
						allowDelete(msg, ( interaction.member?.user.id || interaction.user.id ));
					}, () => {} );
				}
			}, () => {} );
		} );
	}, log_error );
}

module.exports = {
	name: 'inline',
	run: slash_inline
};
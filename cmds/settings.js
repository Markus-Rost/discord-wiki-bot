import { load as cheerioLoad } from 'cheerio';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { got, splitMessage } from '../util/functions.js';
import Lang from '../util/i18n.js';
import Wiki from '../util/wiki.js';
import db from '../util/database.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultSettings} = require('../util/default.json');
const allLangs = Lang.allLangs();

/**
 * Processes the "settings" command.
 * @param {Lang} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {Wiki} wiki - The wiki for the message.
 */
function cmd_settings(lang, msg, args, line, wiki) {
	if ( !msg.isAdmin() ) return msg.reactEmoji('❌');
	
	db.query( 'SELECT channel, wiki, lang, role, inline, prefix FROM discord WHERE guild = $1 ORDER BY channel DESC NULLS LAST', [msg.guildId] ).then( ({rows}) => {
		var guild = rows.find( row => !row.channel );
		if ( !guild ) guild = Object.assign({
			role: null, inline: null,
			prefix: process.env.prefix
		}, defaultSettings);
		var prefix = guild.prefix;
		var inlinepage = ( lang.localNames.page || 'page' );
		var button = null;
		var components = [];
		if ( process.env.dashboard ) {
			button = new ButtonBuilder().setLabel(lang.get('settings.button')).setEmoji('<:wikibot:588723255972593672>').setStyle(ButtonStyle.Link).setURL(new URL(`/guild/${msg.guildId}/settings`, process.env.dashboard).href);
			components.push(new ActionRowBuilder().addComponents(button));
		}
		var text = lang.get('settings.missing', '`' + prefix + 'settings lang`', '`' + prefix + 'settings wiki`');
		if ( rows.length ) {
			text = lang.get('settings.current');
			if ( button ) text += `\n<${button.url}>`;
			text += '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[guild.lang] + '` - `' + prefix + 'settings lang`';
			if ( patreonGuildsPrefix.has(msg.guildId) ) text += '\n' + lang.get('settings.currentprefix') + ' `' + prefix + '` - `' + prefix + 'settings prefix`';
			text += '\n' + lang.get('settings.currentrole') + ' ' + ( guild.role ? `<@&${guild.role}>` : '@everyone' ) + ' - `' + prefix + 'settings role`';
			text += '\n' + lang.get('settings.currentinline') + ' ' + ( guild.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( guild.inline ? '~~' : '' ) + ' - `' + prefix + 'settings inline`';
			text += '\n' + lang.get('settings.currentwiki') + ' ' + guild.wiki + ' - `' + prefix + 'settings wiki`';
			text += '\n' + lang.get('settings.currentchannel') + ' `' + prefix + 'settings channel`\n';
			if ( rows.length === 1 ) text += lang.get('settings.nochannels');
			else text += rows.filter( row => row !== guild ).map( row => '<#' + row.channel.replace( /^#/, '' ) + '>: ' + ( patreonGuildsPrefix.has(msg.guildId) ? '`' + allLangs.names[row.lang] + '` - ' : '' ) + '<' + row.wiki + '>' + ( patreonGuildsPrefix.has(msg.guildId) ? ' - ' + ( row.role ? `<@&${row.role}>` : '@everyone' ) + ' - ' + ( row.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( row.inline ? '~~' : '' ) : '' ) ).join('\n');
		}
		
		if ( !args.length ) {
			return splitMessage( text ).forEach( textpart => msg.replyMsg( {content: textpart, components}, true ) );
		}
		var channelId = ( msg.channel.isThread() ? msg.channel.parentId : msg.channelId );
		
		var prelang = '';
		args[0] = args[0].toLowerCase();
		if ( args[0] === 'channel' ) {
			prelang = 'channel ';
			if ( !rows.length ) return splitMessage( text ).forEach( textpart => msg.replyMsg( {content: textpart, components}, true ) );
			
			var channel = rows.find( row => row.channel === channelId );
			if ( !channel ) channel = Object.assign({}, rows.find( row => {
				return ( row.channel === '#' + msg.channel.parentId );
			} ) || guild, {channel: channelId});
			text = lang.get('settings.channel current');
			button?.setURL(new URL(`/guild/${msg.guildId}/settings/${channelId}`, button.url).href);
			if ( button ) text += `\n<${button.url}>`;
			if ( patreonGuildsPrefix.has(msg.guildId) ) {
				text += '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[channel.lang] + '` - `' + prefix + 'settings channel lang`';
				text += '\n' + lang.get('settings.currentrole') + ' ' + ( channel.role ? `<@&${channel.role}>` : '@everyone' ) + ' - `' + prefix + 'settings channel role`';
				text += '\n' + lang.get('settings.currentinline') + ' ' + ( channel.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( channel.inline ? '~~' : '' ) + ' - `' + prefix + 'settings channel inline`';
			}
			text += '\n' + lang.get('settings.currentwiki') + ' ' + channel.wiki + ' - `' + prefix + 'settings channel wiki`';
			
			if ( !args[1] ) return msg.replyMsg( {content: text, components}, true );
			
			args[0] = args[1].toLowerCase();
			args[1] = args.slice(2).join(' ').toLowerCase().trim().replace( /^<\s*(.*)\s*>$/, '$1' );
		}
		else args[1] = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*)\s*>$/, '$1' );
		
		if ( args[0] === 'wiki' ) {
			prelang += 'wiki';
			var wikihelp = '\n' + lang.get('settings.wikihelp', prefix + 'settings ' + prelang);
			if ( !args[1] ) {
				if ( !rows.length ) return msg.replyMsg( {content: lang.get('settings.wikimissing') + wikihelp, components}, true );
				else return msg.replyMsg( {content: lang.get('settings.' + prelang) + ' ' + ( channel || guild ).wiki + wikihelp, components}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			var wikinew = Wiki.fromInput(args[1]);
			if ( !wikinew ) {
				let wikisuggest = lang.get('settings.wikiinvalid') + wikihelp;
				//wikisuggest += '\n\n' + lang.get('settings.foundwikis') + '\n' + sites.map( site => site.wiki_display_name + ': `' + site.wiki_domain + '`' ).join('\n');
				return splitMessage( wikisuggest ).forEach( textpart => msg.replyMsg( {content: textpart, components}, true ) );
			}
			return msg.reactEmoji('⏳', true).then( reaction => {
				got.get( wikinew + 'api.php?&action=query&meta=siteinfo&siprop=general&format=json', {
					responseType: 'text',
					context: {
						guildId: msg.guildId
					}
				} ).then( response => {
					try {
						response.body = JSON.parse(response.body);
					}
					catch (error) {
						if ( response.statusCode === 404 && typeof response.body === 'string' ) {
							let api = cheerioLoad(response.body, {baseURI: response.url})('head link[rel="EditURI"]').prop('href');
							if ( api ) {
								wikinew = new Wiki(api.split('api.php?')[0], wikinew);
								return got.get( wikinew + 'api.php?action=query&meta=siteinfo&siprop=general&format=json', {
									context: {
										guildId: msg.guildId
									}
								} );
							}
						}
					}
					return response;
				} ).then( response => {
					var body = response.body;
					if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.general ) {
						console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						if ( reaction ) reaction.removeEmoji();
						if ( body?.error?.info === 'You need read permission to use this module.' ) {
							return msg.replyMsg( {content: lang.get('settings.wikiinvalid_private') + wikihelp, components}, true );
						}
						msg.reactEmoji('nowiki', true);
						return msg.replyMsg( {content: lang.get('settings.wikiinvalid') + wikihelp, components}, true );
					}
					wikinew.updateWiki(body.query.general);
					var embed;
					var notice = [];
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
						console.log( '- This wiki is using ' + body.query.general.generator + '.' );
						notice.push({
							name: 'MediaWiki',
							value: lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', body.query.general.generator)
						});
					}
					if ( notice.length ) {
						embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( lang.get('test.notice') ).addFields( notice );
					}
					var sql = 'UPDATE discord SET wiki = $1 WHERE guild = $2 AND wiki = $3';
					var sqlargs = [wikinew.href, msg.guildId, guild.wiki];
					if ( !rows.length ) {
						sql = 'INSERT INTO discord(wiki, guild, main, lang) VALUES ($1, $2, $2, $3)';
						sqlargs[2] = lang.lang;
					}
					else if ( channel ) {
						sql = 'UPDATE discord SET wiki = $1 WHERE guild = $2 AND channel = $3';
						sqlargs[2] = channelId;
						if ( !rows.includes( channel ) ) {
							if ( channel.wiki === wikinew.href ) {
								if ( reaction ) reaction.removeEmoji();
								return msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' ' + channel.wiki + wikihelp, embeds: [embed], components}, true );
							}
							sql = 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)';
							sqlargs.push(guild.lang, guild.role, guild.inline, guild.prefix);
						}
					}
					return db.query( sql, sqlargs ).then( () => {
						console.log( '- Settings successfully updated.' );
						if ( channel ) channel.wiki = wikinew.href;
						else {
							rows.forEach( row => {
								if ( row.channel && row.wiki === guild.wiki ) row.wiki = wikinew.href;
							} );
							guild.wiki = wikinew.href;
						}
						if ( channel || !rows.some( row => row.channel === channelId ) ) wiki = new Wiki(wikinew);
						if ( reaction ) reaction.removeEmoji();
						msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' ' + wikinew + wikihelp, embeds: [embed], components}, true );
						var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
						if ( channels.length ) db.query( 'DELETE FROM discord WHERE channel IN (' + channels.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', channels ).then( () => {
							console.log( '- Settings successfully removed.' );
						}, dberror => {
							console.log( '- Error while removing the settings: ' + dberror );
						} );
					}, dberror => {
						console.log( '- Error while editing the settings: ' + dberror );
						msg.replyMsg( {content: lang.get('settings.save_failed'), embeds: [embed], components}, true );
						if ( reaction ) reaction.removeEmoji();
					} );
				}, ferror => {
					if ( reaction ) reaction.removeEmoji();
					if ( ferror.message?.startsWith( 'connect ECONNREFUSED ' ) || ferror.message?.startsWith( 'Hostname/IP does not match certificate\'s altnames: ' ) || ferror.message === 'certificate has expired' || ferror.message === 'self signed certificate' ) {
						console.log( '- Error while testing the wiki: No HTTPS' );
						return msg.replyMsg( {content: lang.get('settings.wikiinvalid_http') + wikihelp, components}, true );
					}
					console.log( '- Error while testing the wiki: ' + ferror );
					if ( ferror.message === `Timeout awaiting 'request' for ${got.defaults.options.timeout.request}ms` ) {
						return msg.replyMsg( {content: lang.get('settings.wikiinvalid_timeout') + wikihelp, components}, true );
					}
					msg.reactEmoji('nowiki', true);
					return msg.replyMsg( {content: lang.get('settings.wikiinvalid') + wikihelp, components}, true );
				} );
			} );
		}
		
		if ( args[0] === 'lang' || args[0] === 'language' ) {
			if ( channel && !patreonGuildsPrefix.has(msg.guildId) ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', true );
			prelang += 'lang';
			var langhelp = '\n' + lang.get('settings.langhelp', prefix + 'settings ' + prelang) + ' `' + Object.values(allLangs.names).join('`, `') + '`';
			if ( !args[1] ) {
				return msg.replyMsg( {content: lang.get('settings.' + prelang) + ' `' + allLangs.names[( channel || guild ).lang] + '`' + langhelp, files: ( msg.uploadFiles() ? [`./i18n/widgets/${( channel || guild ).lang}.png`] : [] ), components}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			if ( !allLangs.map.hasOwnProperty(args[1]) ) {
				return msg.replyMsg( {content: lang.get('settings.langinvalid') + langhelp, components}, true );
			}
			var sql = 'UPDATE discord SET lang = $1 WHERE guild = $2 AND lang = $3';
			var sqlargs = [allLangs.map[args[1]], msg.guildId, guild.lang];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(lang, guild, main) VALUES ($1, $2, $2)';
				sqlargs.pop();
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET lang = $1 WHERE guild = $2 AND channel = $3';
				sqlargs[2] = channelId;
				if ( !rows.includes( channel ) ) {
					if ( channel.lang === allLangs.map[args[1]] ) {
						return msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[channel.lang] + '`' + langhelp, files: ( msg.uploadFiles() ? [`./i18n/widgets/${channel.lang}.png`] : [] ), components}, true );
					}
					sql = 'INSERT INTO discord(lang, guild, channel, wiki, role, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)';
					sqlargs.push(guild.wiki, guild.role, guild.inline, guild.prefix);
				}
			}
			return db.query( sql, sqlargs ).then( () => {
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.lang = allLangs.map[args[1]];
				else {
					rows.forEach( row => {
						if ( row.channel && row.lang === guild.lang ) row.lang = allLangs.map[args[1]];
					} );
					guild.lang = allLangs.map[args[1]];
				}
				if ( channel || !patreonGuildsPrefix.has(msg.guildId) || !rows.some( row => row.channel === channelId ) ) lang = new Lang(allLangs.map[args[1]]);
				msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[allLangs.map[args[1]]] + '`\n' + lang.get('settings.langhelp', prefix + 'settings ' + prelang) + ' `' + Object.values(allLangs.names).join('`, `') + '`', files: ( msg.uploadFiles() ? [`./i18n/widgets/${allLangs.map[args[1]]}.png`] : [] ), components}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.query( 'DELETE FROM discord WHERE channel IN (' + channels.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', channels ).then( () => {
					console.log( '- Settings successfully removed.' );
				}, dberror => {
					console.log( '- Error while removing the settings: ' + dberror );
				} );
			}, dberror => {
				console.log( '- Error while editing the settings: ' + dberror );
				msg.replyMsg( {content: lang.get('settings.save_failed'), components}, true );
			} );
		}
		
		if ( args[0] === 'role' ) {
			if ( channel && !patreonGuildsPrefix.has(msg.guildId) ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', true );
			prelang += 'role';
			var rolehelp = '\n' + lang.get('settings.rolehelp', prefix + 'settings ' + prelang);
			if ( !args[1] ) {
				return msg.replyMsg( {content: lang.get('settings.' + prelang) + ' ' + ( ( channel || guild ).role ? `<@&${( channel || guild ).role}>` : '@everyone' ) + rolehelp, components}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			var role = null;
			if ( /^\d+$/.test(args[1]) ) role = msg.guild.roles.cache.get(args[1]);
			if ( !role ) role = msg.guild.roles.cache.find( gc => gc.name.toLowerCase() === args[1].replace( /^@/, '' ) );
			if ( !role && ['everyone', 'here', 'none', 'all'].includes( args[1].replace( /^@/, '' ) ) ) {
				role = msg.guild.roles.cache.get(msg.guildId);
			}
			if ( !role ) {
				return msg.replyMsg( {content: lang.get('settings.roleinvalid') + rolehelp, components}, true );
			}
			role = ( role.id === msg.guildId ? null : role.id );
			var sql = 'UPDATE discord SET role = $1 WHERE guild = $2';
			var sqlargs = [role, msg.guildId];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(role, guild, main, lang) VALUES ($1, $2, $2, $3)';
				sqlargs.push(lang.lang);
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET role = $1 WHERE guild = $2 AND channel = $3';
				sqlargs.push(channelId);
				if ( !rows.includes( channel ) ) {
					if ( channel.role === role ) {
						return msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' ' + ( channel.role ? `<@&${channel.role}>` : '@everyone' ) + rolehelp, components}, true );
					}
					sql = 'INSERT INTO discord(role, guild, channel, wiki, lang, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)';
					sqlargs.push(guild.wiki, guild.lang, guild.inline, guild.prefix);
				}
			}
			else if ( guild.role ) {
				sql += ' AND role = $3';
				sqlargs.push(guild.role);
			}
			else sql += ' AND role IS NULL';
			return db.query( sql, sqlargs ).then( () => {
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.role = role;
				else {
					rows.forEach( row => {
						if ( row.channel && row.role === guild.role ) row.role = role;
					} );
					guild.role = role;
				}
				msg.replyMsg( {content: lang.get('settings.' + prelang + 'changed') + ' ' + ( role ? `<@&${role}>` : '@everyone' ) + rolehelp, components}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.query( 'DELETE FROM discord WHERE channel IN (' + channels.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', channels ).then( () => {
					console.log( '- Settings successfully removed.' );
				}, dberror => {
					console.log( '- Error while removing the settings: ' + dberror );
				} );
			}, dberror => {
				console.log( '- Error while editing the settings: ' + dberror );
				msg.replyMsg( {content: lang.get('settings.save_failed'), components}, true );
			} );
		}
		
		if ( args[0] === 'prefix' && !channel ) {
			if ( !patreonGuildsPrefix.has(msg.guildId) ) {
				return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', true );
			}
			var prefixhelp = '\n' + lang.get('settings.prefixhelp', prefix + 'settings prefix');
			args[1] = args[1].replace( /(?<!\\)_$/, ' ' ).replace( /\\([_\W])/g, '$1' );
			if ( !args[1].trim() ) {
				return msg.replyMsg( {content: lang.get('settings.prefix') + ' `' + prefix + '`' + prefixhelp, components}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			if ( args[1].includes( '`' ) || args[1].includes( '\\' ) || args[1].length > 100 ) {
				return msg.replyMsg( {content: lang.get('settings.prefixinvalid') + prefixhelp, components}, true );
			}
			if ( args[1] === 'reset' || args[1] === 'default' ) args[1] = process.env.prefix;
			var sql = 'UPDATE discord SET prefix = $1 WHERE guild = $2';
			var sqlargs = [args[1], msg.guildId];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(prefix, guild, main, lang) VALUES ($1, $2, $2, $3)';
				sqlargs.push(lang.lang);
			}
			return db.query( sql, sqlargs ).then( () => {
				console.log( '- Settings successfully updated.' );
				guild.prefix = args[1];
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
				}, {context: {guild: msg.guildId, prefix: args[1]}} );
				msg.replyMsg( {content: lang.get('settings.prefixchanged') + ' `' + args[1] + '`\n' + lang.get('settings.prefixhelp', args[1] + 'settings prefix'), components}, true );
			}, dberror => {
				console.log( '- Error while editing the settings: ' + dberror );
				msg.replyMsg( {content: lang.get('settings.save_failed'), components}, true );
			} );
		}
		
		if ( args[0] === 'inline' ) {
			if ( channel && !patreonGuildsPrefix.has(msg.guildId) ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', true );
			prelang += 'inline';
			var toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
			var inlinehelp = '\n' + lang.get('settings.' + toggle + '.help', prefix + 'settings ' + prelang + ' toggle', inlinepage);
			if ( args[1] !== 'toggle' ) {
				return msg.replyMsg( {content: lang.get('settings.' + toggle + '.' + prelang) + inlinehelp, components}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			var value = ( ( channel || guild ).inline ? null : 1 );
			var sql = 'UPDATE discord SET inline = $1 WHERE guild = $2';
			var sqlargs = [value, msg.guildId];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(inline, guild, main, lang) VALUES ($1, $2, $2, $3)';
				sqlargs.push(lang.lang);
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET inline = $1 WHERE guild = $2 AND channel = $3';
				sqlargs.push(channelId);
				if ( !rows.includes( channel ) ) {
					sql = 'INSERT INTO discord(inline, guild, channel, wiki, lang, role, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)';
					sqlargs.push(guild.wiki, guild.lang, guild.role, guild.prefix);
				}
			}
			return db.query( sql, sqlargs ).then( () => {
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.inline = value;
				else {
					rows.forEach( row => {
						if ( row.channel && row.inline === guild.inline ) row.inline = value;
					} );
					guild.inline = value;
				}
				toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
				msg.replyMsg( {content: lang.get('settings.' + toggle + '.' + prelang + 'changed') + '\n' + lang.get('settings.' + toggle + '.help', prefix + 'settings ' + prelang + ' toggle', inlinepage), components}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.query( 'DELETE FROM discord WHERE channel IN (' + channels.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', channels ).then( () => {
					console.log( '- Settings successfully removed.' );
				}, dberror => {
					console.log( '- Error while removing the settings: ' + dberror );
				} );
			}, dberror => {
				console.log( '- Error while editing the settings: ' + dberror );
				msg.replyMsg( {content: lang.get('settings.save_failed'), components}, true );
			} );
		}
		
		return splitMessage( text ).forEach( textpart => msg.replyMsg( {content: textpart, components}, true ) );
	}, dberror => {
		console.log( '- Error while getting the settings: ' + dberror );
		msg.reactEmoji('error', true);
	} );
}

export default {
	name: 'settings',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_settings
};
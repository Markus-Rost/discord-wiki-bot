const cheerio = require('cheerio');
const {MessageEmbed} = require('discord.js');
const {defaultSettings} = require('../util/default.json');
const Lang = require('../util/i18n.js');
const allLangs = Lang.allLangs();
const Wiki = require('../util/wiki.js');
var db = require('../util/database.js');

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
	
	db.all( 'SELECT channel, wiki, lang, role, inline, prefix FROM discord WHERE guild = ? ORDER BY channel DESC', [msg.guild.id], (error, rows) => {
		if ( error ) {
			console.log( '- Error while getting the settings: ' + error );
			msg.reactEmoji('error', true);
			return error;
		}
		var guild = rows.find( row => !row.channel );
		if ( !guild ) guild = Object.assign({
			role: null, inline: null,
			prefix: process.env.prefix
		}, defaultSettings);
		var prefix = guild.prefix;
		var inlinepage = ( lang.localNames.page || 'page' );
		var text = lang.get('settings.missing', '`' + prefix + 'settings lang`', '`' + prefix + 'settings wiki`');
		if ( rows.length ) {
			text = lang.get('settings.current');
			text += `\n<${new URL(`/guild/${msg.guild.id}/settings`, process.env.dashboard).href}>`;
			text += '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[guild.lang] + '` - `' + prefix + 'settings lang`';
			if ( patreons[msg.guild.id] ) text += '\n' + lang.get('settings.currentprefix') + ' `' + prefix + '` - `' + prefix + 'settings prefix`';
			text += '\n' + lang.get('settings.currentrole') + ' ' + ( guild.role ? `<@&${guild.role}>` : '@everyone' ) + ' - `' + prefix + 'settings role`';
			text += '\n' + lang.get('settings.currentinline') + ' ' + ( guild.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( guild.inline ? '~~' : '' ) + ' - `' + prefix + 'settings inline`';
			text += '\n' + lang.get('settings.currentwiki') + ' ' + guild.wiki + ' - `' + prefix + 'settings wiki`';
			text += '\n' + lang.get('settings.currentchannel') + ' `' + prefix + 'settings channel`\n';
			if ( rows.length === 1 ) text += lang.get('settings.nochannels');
			else text += rows.filter( row => row !== guild ).map( row => '<#' + row.channel.replace( /^#/, '' ) + '>: ' + ( patreons[msg.guild.id] ? '`' + allLangs.names[row.lang] + '` - ' : '' ) + '<' + row.wiki + '>' + ( patreons[msg.guild.id] ? ' - ' + ( row.role ? `<@&${row.role}>` : '@everyone' ) + ' - ' + ( row.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( row.inline ? '~~' : '' ) : '' ) ).join('\n');
		}
		
		if ( !args.length ) {
			return msg.replyMsg( text, {split:true}, true );
		}
		
		var prelang = '';
		args[0] = args[0].toLowerCase();
		if ( args[0] === 'channel' ) {
			prelang = 'channel ';
			if ( !rows.length ) return msg.replyMsg( text, {split:true}, true );
			
			var channel = rows.find( row => row.channel === msg.channel.id );
			if ( !channel ) channel = Object.assign({}, rows.find( row => {
				return ( row.channel === '#' + msg.channel.parentID );
			} ) || guild, {channel: msg.channel.id});
			text = lang.get('settings.' + prelang + 'current');
			text += `\n<${new URL(`/guild/${msg.guild.id}/settings/${msg.channel.id}`, process.env.dashboard).href}>`;
			if ( patreons[msg.guild.id] ) {
				text += '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[channel.lang] + '` - `' + prefix + 'settings channel lang`';
				text += '\n' + lang.get('settings.currentrole') + ' ' + ( channel.role ? `<@&${channel.role}>` : '@everyone' ) + ' - `' + prefix + 'settings channel role`';
				text += '\n' + lang.get('settings.currentinline') + ' ' + ( channel.inline ? '~~' : '' ) + '`[[' + inlinepage + ']]`' + ( channel.inline ? '~~' : '' ) + ' - `' + prefix + 'settings channel inline`';
			}
			text += '\n' + lang.get('settings.currentwiki') + ' ' + channel.wiki + ' - `' + prefix + 'settings channel wiki`';
			
			if ( !args[1] ) return msg.replyMsg( text, {}, true );
			
			args[0] = args[1].toLowerCase();
			args[1] = args.slice(2).join(' ').toLowerCase().trim().replace( /^<\s*(.*)>$/, '$1' );
		}
		else args[1] = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*)>$/, '$1' );
		
		if ( args[0] === 'wiki' ) {
			prelang += 'wiki';
			var wikihelp = '\n' + lang.get('settings.wikihelp', prefix + 'settings ' + prelang);
			if ( !args[1] ) {
				if ( !rows.length ) return msg.replyMsg( lang.get('settings.wikimissing') + wikihelp, {}, true );
				else return msg.replyMsg( lang.get('settings.' + prelang) + ' ' + ( channel || guild ).wiki + wikihelp, {}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			var isForced = false;
			if ( /^<?(?:https?:)?\/\//.test(args[1]) ) {
				args[1] = args[1].replace( /^<?(?:https?:)?\/\//, 'https://' );
				let value = [];
				[args[1], ...value] = args[1].split(/>? /);
				if ( value.join(' ') === '--force' ) isForced = true;
			}
			var wikinew = Wiki.fromInput(args[1]);
			if ( !wikinew ) {
				var text = lang.get('settings.wikiinvalid') + wikihelp;
				//text += '\n\n' + lang.get('settings.foundwikis') + '\n' + sites.map( site => site.wiki_display_name + ': `' + site.wiki_domain + '`' ).join('\n');
				return msg.replyMsg( text, {split:true}, true );
			}
			return msg.reactEmoji('⏳', true).then( reaction => {
				got.get( wikinew + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-GamepediaNotice|custom-FandomMergeNotice&amenableparser=true&siprop=general|extensions&format=json' ).then( response => {
					if ( !isForced && response.statusCode === 404 && typeof response.body === 'string' ) {
						let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
						if ( api ) {
							wikinew = new Wiki(api.split('api.php?')[0], wikinew);
							return got.get( wikinew + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-GamepediaNotice|custom-FandomMergeNotice&amenableparser=true&siprop=general|extensions&format=json' );
						}
					}
					return response;
				} ).then( response => {
					var body = response.body;
					if ( response.statusCode !== 200 || !body?.query?.allmessages || !body?.query?.general || !body?.query?.extensions ) {
						console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						if ( reaction ) reaction.removeEmoji();
						msg.reactEmoji('nowiki', true);
						return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
					}
					if ( !isForced ) wikinew.updateWiki(body.query.general);
					if ( wikinew.isFandom(false) && !isForced ) {
						let crossover = '';
						if ( body.query.allmessages[0]['*'] ) {
							crossover = 'https://' + body.query.allmessages[0]['*'] + '.gamepedia.com/';
						}
						else if ( body.query.allmessages[1]['*'] ) {
							let merge = body.query.allmessages[1]['*'].split('/');
							crossover = 'https://' + merge[0] + '.fandom.com/' + ( merge[1] ? merge[1] + '/' : '' );
						}
						if ( crossover ) wikinew = new Wiki(crossover);
					}
					var embed;
					if ( !wikinew.isFandom() ) {
						var notice = [];
						if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
							console.log( '- This wiki is using ' + body.query.general.generator + '.' );
							notice.push({
								name: 'MediaWiki',
								value: lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', body.query.general.generator)
							});
						}
						if ( !body.query.extensions.some( extension => extension.name === 'TextExtracts' ) ) {
							console.log( '- This wiki is missing Extension:TextExtracts.' );
							notice.push({
								name: 'TextExtracts',
								value: lang.get('test.TextExtracts', '[TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts)')
							});
						}
						if ( !body.query.extensions.some( extension => extension.name === 'PageImages' ) ) {
							console.log( '- This wiki is missing Extension:PageImages.' );
							notice.push({
								name: 'PageImages',
								value: lang.get('test.PageImages', '[PageImages](https://www.mediawiki.org/wiki/Extension:PageImages)')
							});
						}
						if ( notice.length ) {
							embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( lang.get('test.notice') ).addFields( notice );
						}
					}
					var sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND wiki = ?';
					var sqlargs = [wikinew.href, msg.guild.id, guild.wiki];
					if ( !rows.length ) {
						sql = 'INSERT INTO discord(wiki, guild, main) VALUES(?, ?, ?)';
						sqlargs[2] = msg.guild.id;
					}
					else if ( channel ) {
						sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND channel = ?';
						sqlargs[2] = msg.channel.id;
						if ( !rows.includes( channel ) ) {
							if ( channel.wiki === wikinew.href ) {
								if ( reaction ) reaction.removeEmoji();
								return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + channel.wiki + wikihelp, {embed}, true );
							}
							sql = 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES(?, ?, ?, ?, ?, ?, ?)';
							sqlargs.push(guild.lang, guild.role, guild.inline, guild.prefix);
						}
					}
					return db.run( sql, sqlargs, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while editing the settings: ' + dberror );
							msg.replyMsg( lang.get('settings.save_failed'), {embed}, true );
							if ( reaction ) reaction.removeEmoji();
							return dberror;
						}
						console.log( '- Settings successfully updated.' );
						if ( channel ) channel.wiki = wikinew.href;
						else {
							rows.forEach( row => {
								if ( row.channel && row.wiki === guild.wiki ) row.wiki = wikinew.href;
							} );
							guild.wiki = wikinew.href;
						}
						if ( channel || !rows.some( row => row.channel === msg.channel.id ) ) wiki = new Wiki(wikinew);
						if ( reaction ) reaction.removeEmoji();
						msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + wikinew + wikihelp, {embed}, true );
						var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
						if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join(', ') + ')', channels, function (delerror) {
							if ( delerror ) {
								console.log( '- Error while removing the settings: ' + delerror );
								return delerror;
							}
							console.log( '- Settings successfully removed.' );
						} );
					} );
				}, ferror => {
					console.log( '- Error while testing the wiki: ' + ferror );
					if ( reaction ) reaction.removeEmoji();
					msg.reactEmoji('nowiki', true);
					return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
				} );
			} );
		}
		
		if ( args[0] === 'lang' ) {
			if ( channel && !patreons[msg.guild.id] ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', {}, true );
			prelang += 'lang';
			var langhelp = '\n' + lang.get('settings.langhelp', prefix + 'settings ' + prelang) + ' `' + Object.values(allLangs.names).join('`, `') + '`';
			if ( !args[1] ) {
				return msg.replyMsg( lang.get('settings.' + prelang) + ' `' + allLangs.names[( channel || guild ).lang] + '`' + langhelp, {files:( msg.uploadFiles() ? [`./i18n/widgets/${( channel || guild ).lang}.png`] : [] )}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			if ( !allLangs.map.hasOwnProperty(args[1]) ) {
				return msg.replyMsg( lang.get('settings.langinvalid') + langhelp, {}, true );
			}
			var sql = 'UPDATE discord SET lang = ? WHERE guild = ? AND lang = ?';
			var sqlargs = [allLangs.map[args[1]], msg.guild.id, guild.lang];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(lang, guild, main) VALUES(?, ?, ?)';
				sqlargs[2] = msg.guild.id;
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET lang = ? WHERE guild = ? AND channel = ?';
				sqlargs[2] = msg.channel.id;
				if ( !rows.includes( channel ) ) {
					if ( channel.lang === allLangs.map[args[1]] ) {
						return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[channel.lang] + '`' + langhelp, {files:( msg.uploadFiles() ? [`./i18n/widgets/${channel.lang}.png`] : [] )}, true );
					}
					sql = 'INSERT INTO discord(lang, guild, channel, wiki, role, inline, prefix) VALUES(?, ?, ?, ?, ?, ?, ?)';
					sqlargs.push(guild.wiki, guild.role, guild.inline, guild.prefix);
				}
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.lang = allLangs.map[args[1]];
				else {
					rows.forEach( row => {
						if ( row.channel && row.lang === guild.lang ) row.lang = allLangs.map[args[1]];
					} );
					guild.lang = allLangs.map[args[1]];
					if ( voice[msg.guild.id] ) voice[msg.guild.id] = guild.lang;
				}
				if ( channel || !patreons[msg.guild.id] || !rows.some( row => row.channel === msg.channel.id ) ) lang = new Lang(allLangs.map[args[1]]);
				msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[allLangs.map[args[1]]] + '`\n' + lang.get('settings.langhelp', prefix + 'settings ' + prelang) + ' `' + Object.values(allLangs.names).join('`, `') + '`', {files:( msg.uploadFiles() ? [`./i18n/widgets/${allLangs.map[args[1]]}.png`] : [] )}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join(', ') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		if ( args[0] === 'role' ) {
			if ( channel && !patreons[msg.guild.id] ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', {}, true );
			prelang += 'role';
			var rolehelp = '\n' + lang.get('settings.rolehelp', prefix + 'settings ' + prelang);
			if ( !args[1] ) {
				return msg.replyMsg( lang.get('settings.' + prelang) + ' ' + ( ( channel || guild ).role ? `<@&${( channel || guild ).role}>` : '@everyone' ) + rolehelp, {}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			var role = null;
			if ( /^\d+$/.test(args[1]) ) role = msg.guild.roles.cache.get(args[1]);
			if ( !role ) role = msg.guild.roles.cache.find( gc => gc.name.toLowerCase() === args[1].replace( /^@/, '' ) );
			if ( !role && ['everyone', 'here', 'none', 'all'].includes( args[1].replace( /^@/, '' ) ) ) {
				role = msg.guild.roles.cache.get(msg.guild.id);
			}
			if ( !role ) {
				return msg.replyMsg( lang.get('settings.roleinvalid') + rolehelp, {}, true );
			}
			role = ( role.id === msg.guild.id ? null : role.id );
			var sql = 'UPDATE discord SET role = ? WHERE guild = ?';
			var sqlargs = [role, msg.guild.id];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(role, guild, main) VALUES(?, ?, ?)';
				sqlargs.push(msg.guild.id);
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET role = ? WHERE guild = ? AND channel = ?';
				sqlargs.push(msg.channel.id);
				if ( !rows.includes( channel ) ) {
					if ( channel.role === role ) {
						return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + ( channel.role ? `<@&${channel.role}>` : '@everyone' ) + rolehelp, {}, true );
					}
					sql = 'INSERT INTO discord(role, guild, channel, wiki, lang, inline, prefix) VALUES(?, ?, ?, ?, ?, ?, ?)';
					sqlargs.push(guild.wiki, guild.lang, guild.inline, guild.prefix);
				}
			}
			else if ( guild.role ) {
				sql += ' AND role = ?';
				sqlargs.push(guild.role);
			}
			else sql += ' AND role IS NULL';
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.role = role;
				else {
					rows.forEach( row => {
						if ( row.channel && row.role === guild.role ) row.role = role;
					} );
					guild.role = role;
				}
				msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + ( role ? `<@&${role}>` : '@everyone' ) + rolehelp, {}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join(', ') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		if ( args[0] === 'prefix' && !channel ) {
			if ( !patreons[msg.guild.id] ) {
				return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', {}, true );
			}
			var prefixhelp = '\n' + lang.get('settings.prefixhelp', prefix + 'settings prefix');
			args[1] = args[1].replace( /(?<!\\)_$/, ' ' ).replace( /\\([_\W])/g, '$1' );
			if ( !args[1].trim() ) {
				return msg.replyMsg( lang.get('settings.prefix') + ' `' + prefix + '`' + prefixhelp, {}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			if ( args[1].includes( '`' ) || args[1].includes( '\\' ) || args[1].length > 100 ) {
				return msg.replyMsg( lang.get('settings.prefixinvalid') + prefixhelp, {}, true );
			}
			if ( args[1] === 'reset' || args[1] === 'default' ) args[1] = process.env.prefix;
			var sql = 'UPDATE discord SET prefix = ? WHERE guild = ?';
			var sqlargs = [args[1], msg.guild.id];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(prefix, guild, main) VALUES(?, ?, ?)';
				sqlargs.push(msg.guild.id);
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				guild.prefix = args[1];
				msg.client.shard.broadcastEval( `global.patreons['${msg.guild.id}'] = '${args[1]}'` );
				msg.replyMsg( lang.get('settings.prefixchanged') + ' `' + args[1] + '`\n' + lang.get('settings.prefixhelp', args[1] + 'settings prefix'), {}, true );
			} );
		}
		
		if ( args[0] === 'inline' ) {
			if ( channel && !patreons[msg.guild.id] ) return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', {}, true );
			prelang += 'inline';
			var toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
			var inlinehelp = '\n' + lang.get('settings.' + toggle + '.help', prefix + 'settings ' + prelang + ' toggle', inlinepage);
			if ( args[1] !== 'toggle' ) {
				return msg.replyMsg( lang.get('settings.' + toggle + '.' + prelang) + inlinehelp, {}, true );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			var value = ( ( channel || guild ).inline ? null : 1 );
			var sql = 'UPDATE discord SET inline = ? WHERE guild = ?';
			var sqlargs = [value, msg.guild.id];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(inline, guild, main) VALUES(?, ?, ?)';
				sqlargs.push(msg.guild.id);
			}
			else if ( channel ) {
				sql = 'UPDATE discord SET inline = ? WHERE guild = ? AND channel = ?';
				sqlargs.push(msg.channel.id);
				if ( !rows.includes( channel ) ) {
					sql = 'INSERT INTO discord(inline, guild, channel, wiki, lang, role, prefix) VALUES(?, ?, ?, ?, ?, ?, ?)';
					sqlargs.push(guild.wiki, guild.lang, guild.role, guild.prefix);
				}
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.inline = value;
				else {
					rows.forEach( row => {
						if ( row.channel && row.inline === guild.inline ) row.inline = value;
					} );
					guild.inline = value;
				}
				toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
				msg.replyMsg( lang.get('settings.' + toggle + '.' + prelang + 'changed') + '\n' + lang.get('settings.' + toggle + '.help', prefix + 'settings ' + prelang + ' toggle', inlinepage), {}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.role === guild.role && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join(', ') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		return msg.replyMsg( text, {split:true}, true );
	} );
}

module.exports = {
	name: 'settings',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_settings
};
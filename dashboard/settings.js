const cheerio = require('cheerio');
const {defaultSettings} = require('../util/default.json');
const Lang = require('../util/i18n.js');
const allLangs = Lang.allLangs();
const Wiki = require('../util/wiki.js');
const {got, db, sendMsg, hasPerm} = require('./util.js');

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>',
	wiki: '<label for="wb-settings-wiki">Default Wiki:</label>'
	+ '<input type="url" id="wb-settings-wiki" name="wiki" required>',
	//+ '<button type="button" id="wb-settings-wiki-search" class="collapsible">Search wiki</button>'
	//+ '<fieldset style="display: none;">'
	//+ '<legend>Wiki search</legend>'
	//+ '</fieldset>',
	lang: '<label for="wb-settings-lang">Language:</label>'
	+ '<select id="wb-settings-lang" name="lang" required>'
	+ Object.keys(allLangs.names).map( lang => {
		return `<option id="wb-settings-lang-${lang}" value="${lang}">${allLangs.names[lang]}</option>`
	} ).join('\n')
	+ '</select>',
	role: '<label for="wb-settings-role">Minimal Role:</label>'
	+ '<select id="wb-settings-role" name="role"></select>',
	prefix: '<label for="wb-settings-prefix">Prefix:</label>'
	+ '<input type="text" id="wb-settings-prefix" name="prefix" pattern="^\\s*[^\\s`\\\\]{1,100}\\s*$" required>'
	+ '<br>'
	+ '<label for="wb-settings-prefix-space">Prefix ends with space:</label>'
	+ '<input type="checkbox" id="wb-settings-prefix-space" name="prefix_space">',
	inline: '<label for="wb-settings-inline">Inline commands:</label>'
	+ '<input type="checkbox" id="wb-settings-inline" name="inline">',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete_settings">'
};

/**
 * Create a settings form
 * @param {import('cheerio')} $ - The response body
 * @param {String} header - The form header
 * @param {Object} settings - The current settings
 * @param {Boolean} settings.patreon
 * @param {String} settings.channel
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {String} settings.role
 * @param {Boolean} settings.inline
 * @param {String} settings.prefix
 * @param {Object[]} guildRoles - The guild roles
 * @param {String} guildRoles.id
 * @param {String} guildRoles.name
 * @param {Object[]} guildChannels - The guild channels
 * @param {String} guildChannels.id
 * @param {String} guildChannels.name
 * @param {Number} guildChannels.userPermissions
 */
function createForm($, header, settings, guildRoles, guildChannels = []) {
	var readonly = ( process.env.READONLY ? true : false );
	if ( settings.channel && guildChannels.userPermissions === 0 && guildChannels.name === 'UNKNOWN' ) {
		readonly = true;
	}
	var fields = [];
	if ( settings.channel ) {
		let channel = $('<div>').append(fieldset.channel);
		channel.find('#wb-settings-channel').append(
			...guildChannels.map( guildChannel => {
				return $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – #${guildChannel.name}`)
			} )
		);
		if ( guildChannels.length === 1 ) {
			channel.find(`#wb-settings-channel-${settings.channel}`).attr('selected', '');
			if ( !hasPerm(guildChannels[0].userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
				readonly = true;
			}
		}
		else channel.find('#wb-settings-channel').prepend(
			$(`<option id="wb-settings-channel-default" selected>`).val('').text('-- Select a Channel --')
		);
		fields.push(channel);
	}
	let wiki = $('<div>').append(fieldset.wiki);
	wiki.find('#wb-settings-wiki').val(settings.wiki);
	fields.push(wiki);
	if ( !settings.channel || settings.patreon ) {
		let lang = $('<div>').append(fieldset.lang);
		lang.find(`#wb-settings-lang-${settings.lang}`).attr('selected', '');
		fields.push(lang);
		let role = $('<div>').append(fieldset.role);
		role.find('#wb-settings-role').append(
			...guildRoles.map( guildRole => {
				return $(`<option id="wb-settings-role-${guildRole.id}">`).val(guildRole.id).text(`${guildRole.id} – @${guildRole.name}`)
			} ),
			$(`<option id="wb-settings-role-everyone">`).val('').text(`@everyone`),
		);
		if ( settings.role ) role.find(`#wb-settings-role-${settings.role}`).attr('selected', '');
		else role.find(`#wb-settings-role-everyone`).attr('selected', '');
		fields.push(role);
		let inline = $('<div>').append(fieldset.inline);
		if ( !settings.inline ) inline.find('#wb-settings-inline').attr('checked', '');
		fields.push(inline);
	}
	if ( settings.patreon && !settings.channel ) {
		let prefix = $('<div>').append(fieldset.prefix);
		prefix.find('#wb-settings-prefix').val(settings.prefix.trim());
		if ( settings.prefix.endsWith( ' ' ) ) {
			prefix.find('#wb-settings-prefix-space').attr('checked', '');
		}
		fields.push(prefix);
	}
	fields.push($(fieldset.save).val('Save'));
	if ( settings.channel && settings.channel !== 'new' ) {
		fields.push($(fieldset.delete).val('Delete').attr('onclick', `return confirm('Are you sure?');`));
	}
	var form = $('<fieldset>').append(...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="checkbox"], option').attr('disabled', '');
		form.find('input[type="submit"]').remove();
	}
	return $('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
		$('<h2>').text(header),
		form
	);
}

/**
 * Let a user change settings
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio')} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 */
function dashboard_settings(res, $, guild, args) {
	db.all( 'SELECT channel, wiki, lang, role, inline, prefix, patreon FROM discord WHERE guild = ? ORDER BY channel ASC', [guild.id], function(dberror, rows) {
		if ( dberror ) {
			console.log( '- Dashboard: Error while getting the settings: ' + dberror );
			$('#text .description').text('Failed to load the settings!');
			$('.channel#settings').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		$('#text .description').text(`These are the settings for "${guild.name}":`);
		if ( !rows.length ) {
			$('.channel#settings').addClass('selected');
			createForm($, 'Server-wide Settings', Object.assign({
				prefix: process.env.prefix
			}, defaultSettings), guild.roles).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		let isPatreon = rows.some( row => row.patreon );
		let channellist = rows.filter( row => row.channel ).map( row => {
			let channel = guild.channels.find( channel => channel.id === row.channel );
			return ( channel || {id: row.channel, name: 'UNKNOWN', userPermissions: 0} );
		} ).sort( (a, b) => {
			return guild.channels.indexOf(a) - guild.channels.indexOf(b);
		} );
		$('#channellist #settings').after(
			...channellist.map( channel => {
				return $('<a class="channel">').attr('id', `channel-${channel.id}`).append(
					$('<img>').attr('src', '/src/channel.svg'),
					$('<div>').text(channel.name)
				).attr('href', `/guild/${guild.id}/settings/${channel.id}`).attr('title', channel.id);
			} ),
			( process.env.READONLY || !guild.channels.filter( channel => {
				return ( hasPerm(channel.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && !rows.some( row => row.channel === channel.id ) );
			} ).length ? '' :
			$('<a class="channel" id="channel-new">').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text('New channel overwrite')
			).attr('href', `/guild/${guild.id}/settings/new`) )
		);
		if ( args[4] === 'new' ) {
			$('.channel#channel-new').addClass('selected');
			createForm($, 'New Channel Overwrite', Object.assign({}, rows.find( row => !row.channel ), {
				patreon: isPatreon,
				channel: 'new'
			}), guild.roles, guild.channels.filter( channel => {
				return ( hasPerm(channel.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && !rows.some( row => row.channel === channel.id ) );
			} )).attr('action', `/guild/${guild.id}/settings/new`).appendTo('#text');
		}
		else if ( channellist.some( channel => channel.id === args[4] ) ) {
			let channel = channellist.find( channel => channel.id === args[4] );
			$(`.channel#channel-${channel.id}`).addClass('selected');
			createForm($, `#${channel.name} Settings`, Object.assign({}, rows.find( row => {
				return row.channel === channel.id;
			} ), {
				patreon: isPatreon
			}), guild.roles, [channel]).attr('action', `/guild/${guild.id}/settings/${channel.id}`).appendTo('#text');
		}
		else {
			$('.channel#settings').addClass('selected');
			createForm($, 'Server-wide Settings', rows.find( row => !row.channel ), guild.roles).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
		}
		let body = $.html();
		res.writeHead(200, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	} );
}

/**
 * Change settings
 * @param {Function} res - The server response
 * @param {import('./util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String} type - The setting to change
 * @param {Object} settings - The new settings
 * @param {String} [settings.channel]
 * @param {String} settings.wiki
 * @param {String} [settings.lang]
 * @param {String} [settings.role]
 * @param {String} [settings.inline]
 * @param {String} [settings.prefix]
 * @param {String} [settings.prefix_space]
 * @param {String} [settings.save_settings]
 * @param {String} [settings.delete_settings]
 */
function update_settings(res, userSettings, guild, type, settings) {
	if ( type !== 'default' && type !== 'new' && type !== settings.channel ) {
		return res(`/guild/${guild}/settings?save=failed`);
	}
	if ( !settings.save_settings === !settings.delete_settings ) {
		return res(`/guild/${guild}/settings/${type}?save=failed`);
	}
	if ( settings.save_settings ) {
		if ( !settings.wiki || ( settings.lang && !( settings.lang in allLangs.names ) ) ) {
			return res(`/guild/${guild}/settings/${type}?save=failed`);
		}
		if ( settings.channel && !userSettings.guilds.isMember.get(guild).channels.some( channel => {
			return ( channel.id === settings.channel );
		} ) ) return res(`/guild/${guild}/settings/${type}?save=failed`);
		if ( settings.role && !userSettings.guilds.isMember.get(guild).roles.some( role => {
			return ( role.id === settings.role );
		} ) ) return res(`/guild/${guild}/settings/${type}?save=failed`);
	}
	if ( settings.delete_settings && ( type === 'default' || type === 'new' ) ) {
		return res(`/guild/${guild}/settings/${type}?save=failed`);
	}
	sendMsg( {
		type: 'getMember',
		member: userSettings.user.id,
		guild: guild,
		channel: ( type === settings.channel ? type : undefined )
	} ).then( response => {
		if ( !response ) {
			userSettings.guilds.notMember.set(guild, userSettings.guilds.isMember.get(guild));
			userSettings.guilds.isMember.delete(guild);
			return res(`/guild/${guild}?save=failed`);
		}
		if ( response === 'noMember' || !hasPerm(response.userPermissions, 'MANAGE_GUILD') ) {
			userSettings.guilds.isMember.delete(guild);
			return res('/?save=failed');
		}
		if ( response.message === 'noChannel' ) return db.run( 'DELETE FROM discord WHERE guild = ? AND channel = ?', [guild, type], function (delerror) {
			if ( delerror ) {
				console.log( '- Dashboard: Error while removing the settings: ' + delerror );
				return res(`/guild/${guild}/settings?save=failed`);
			}
			console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
			if ( settings.delete_settings ) return res(`/guild/${guild}/settings?save=success`);
			else return res(`/guild/${guild}/settings?save=failed`);
		} );
		if ( type === settings.channel && !hasPerm(response.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
			return res(`/guild/${guild}/settings/${type}?save=failed`);
		}
		if ( settings.delete_settings ) return db.get( 'SELECT main.lang mainlang, main.patreon, main.lang mainwiki, main.role mainrole, main.inline maininline, old.wiki, old.lang, old.role, old.inline FROM discord main LEFT JOIN discord old ON main.guild = old.guild AND old.channel = ? WHERE main.guild = ? AND main.channel IS NULL', [type, guild], function(dberror, row) {
			db.run( 'DELETE FROM discord WHERE guild = ? AND channel = ?', [guild, type], function (delerror) {
				if ( delerror ) {
					console.log( '- Dashboard: Error while removing the settings: ' + delerror );
					return res(`/guild/${guild}/settings/${type}?save=failed`);
				}
				console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
				res(`/guild/${guild}/settings?save=success`);
				if ( dberror ) {
					console.log( '- Dashboard: Error while notifying the guild: ' + dberror );
					return;
				}
				if ( !row || row.wiki === null ) return;
				var lang = new Lang(row.mainlang);
				var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
				if ( row.wiki !== row.mainwiki ) text += `\n${lang.get('settings.currentwiki')} <${row.wiki}>`;
				if ( row.patreon ) {
					if ( row.lang !== row.mainlang ) text += `\n${lang.get('settings.currentlang')} \`${allLangs.names[row.lang]}\``;
					if ( row.role !== row.mainrole ) text += `\n${lang.get('settings.currentrole')} ` + ( row.role ? `<@&${row.role}>` : '@everyone' );
					if ( row.inline !== row.maininline ) text += `\n${lang.get('settings.currentinline')} ${( row.inline ? '~~' : '' )}\`[[${inlinepage}]]\`${( row.inline ? '~~' : '' )}`;
				}
				text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
				sendMsg( {
					type: 'notifyGuild', guild, text
				} ).catch( error => {
					console.log( '- Dashboard: Error while notifying the guild: ' + error );
				} );
			} );
		} );
		var wiki = Wiki.fromInput(settings.wiki);
		return got.get( wiki + 'api.php?&action=query&meta=siteinfo&siprop=general|extensions&format=json' ).then( fresponse => {
			if ( fresponse.statusCode === 404 && typeof fresponse.body === 'string' ) {
				let api = cheerio.load(fresponse.body)('head link[rel="EditURI"]').prop('href');
				if ( api ) {
					wiki = new Wiki(api.split('api.php?')[0], wiki);
					return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general|extensions&format=json' );
				}
			}
			return fresponse;
		} ).then( fresponse => {
			return new Promise( function (resolve, reject) {
				db.get( 'SELECT lang, wiki, role, inline, prefix FROM discord WHERE guild = ? AND channel IS NULL', [guild], function(error, row) {
					if ( error ) {
						console.log( '- Dashboard: Error while getting the settings: ' + error );
						reject();
					}
					var body = fresponse.body;
					if ( fresponse.statusCode !== 200 || !body?.query?.general || !body?.query?.extensions ) {
						console.log( '- Dashboard: ' + fresponse.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						if ( row?.wiki === wiki.href ) resolve(row);
						reject();
					}
					wiki.updateWiki(body.query.general);
					resolve(row, body.query);
				} );
			} );
		}, error => {
			console.log( '- Dashboard: Error while testing the wiki: ' + error );
			return Promise.reject();
		} ).then( (row, query) => {
			var lang = new Lang(( type === 'default' && settings.lang || row.lang ));
			var embed;
			if ( !wiki.isFandom() && query ) {
				let notice = [];
				if ( query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) <= 30 ) {
					console.log( '- Dashboard: This wiki is using ' + query.general.generator + '.' );
					notice.push({
						name: 'MediaWiki',
						value: lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', query.general.generator)
					});
				}
				if ( !query.extensions.some( extension => extension.name === 'TextExtracts' ) ) {
					console.log( '- Dashboard: This wiki is missing Extension:TextExtracts.' );
					notice.push({
						name: 'TextExtracts',
						value: lang.get('test.TextExtracts', '[TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts)')
					});
				}
				if ( !query.extensions.some( extension => extension.name === 'PageImages' ) ) {
					console.log( '- Dashboard: This wiki is missing Extension:PageImages.' );
					notice.push({
						name: 'PageImages',
						value: lang.get('test.PageImages', '[PageImages](https://www.mediawiki.org/wiki/Extension:PageImages)')
					});
				}
				if ( notice.length ) {
					embed = {
						author: {name: query.general.sitename},
						title: lang.get('test.notice'),
						fields: notice
					}
				}
			}
			if ( type === 'default' ) {
				if ( settings.channel || !settings.lang || ( !response.patreon && settings.prefix ) ) {
					return res(`/guild/${guild}/settings?save=failed`);
				}
				if ( settings.prefix ) {
					if ( !/^\s*[^\s`\\]{1,100}\s*$/.test(settings.prefix) ) {
						return res(`/guild/${guild}/settings?save=failed`);
					}
					settings.prefix = settings.prefix.trim().toLowerCase();
					if ( settings.prefix_space ) settings.prefix += ' ';
				}
				if ( !row ) return db.run( 'INSERT INTO discord(wiki, lang, role, inline, prefix, guild, main) VALUES(?, ?, ?, ?, ?, ?)', [wiki.href, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.prefix || process.env.prefix ), guild, guild], function(dberror) {
					if ( dberror ) {
						console.log( '- Dashboard: Error while saving the settings: ' + dberror );
						return res(`/guild/${guild}/settings?save=failed`);
					}
					console.log( '- Dashboard: Settings successfully saved: ' + guild );
					res(`/guild/${guild}/settings?save=success`);
					var text = lang.get('settings.dashboard.updated', `<@${userSettings.user.id}>`);
					text += '\n' + lang.get('settings.currentwiki') + ` <${wiki.href}>`;
					text += '\n' + lang.get('settings.currentlang') + ` \`${allLangs.names[settings.lang]}\``;
					text += '\n' + lang.get('settings.currentrole') + ( settings.role ? ` <@&${settings.role}>` : ' @everyone' );
					if ( response.patreon ) {
						text += '\n' + lang.get('settings.currentprefix') + ` \`${settings.prefix.replace( /\\/g, '\\$&' )}\``;
					}
					text += '\n' + lang.get('settings.currentinline') + ` ${( settings.inline ? '' : '~~' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( settings.inline ? '' : '~~' )}`;
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, embed
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
				var diff = [];
				if ( row.wiki !== wiki.href ) {
					diff.push(lang.get('settings.currentwiki') + ` ~~<${row.wiki}>~~ → <${wiki.href}>`);
				}
				if ( row.lang !== settings.lang ) {
					diff.push(lang.get('settings.currentlang') + ` ~~\`${allLangs.names[row.lang]}\`~~ → \`${allLangs.names[settings.lang]}\``);
				}
				if ( response.patreon && row.prefix !== settings.prefix ) {
					diff.push(lang.get('settings.currentprefix') + ` ~~\`${row.prefix.replace( /\\/g, '\\$&' )}\`~~ → \`${settings.prefix.replace( /\\/g, '\\$&' )}\``);
				}
				if ( row.role !== ( settings.role || null ) ) {
					diff.push(lang.get('settings.currentrole') + ` ~~${( row.role ? `<@&${row.role}>` : '@everyone' )}~~ → ${( settings.role ? `<@&${settings.role}>` : '@everyone' )}`);
				}
				if ( row.inline !== ( settings.inline ? null : 1 ) ) {
					let inlinepage = ( lang.localNames.page || 'page' );
					diff.push(lang.get('settings.currentinline') + ` ${( row.inline ? '~~' : '' )}\`[[${inlinepage}]]\`${( row.inline ? '~~' : '' )} → ${( settings.inline ? '' : '~~' )}\`[[${inlinepage}]]\`${( settings.inline ? '' : '~~' )}`);
				}
				if ( diff.length ) return db.run( 'UPDATE discord SET wiki = ?, lang = ?, role = ?, inline = ?, prefix = ? WHERE guild = ? AND channel IS NULL', [wiki.href, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.prefix || process.env.prefix ), guild], function(dberror) {
					if ( dberror ) {
						console.log( '- Dashboard: Error while saving the settings: ' + dberror );
						return res(`/guild/${guild}/settings?save=failed`);
					}
					console.log( '- Dashboard: Settings successfully saved: ' + guild );
					res(`/guild/${guild}/settings?save=success`);
					var text = lang.get('settings.dashboard.updated', `<@${userSettings.user.id}>`);
					text += '\n' + diff.join('\n');
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, embed,
						prefix: settings.prefix, voice: settings.lang
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
				return res(`/guild/${guild}/settings?save=success`);
			}
			if ( !row || !settings.channel || settings.prefix || 
			( !response.patreon && ( settings.lang || settings.role || settings.inline ) ) ) {
				return res(`/guild/${guild}/settings?save=failed`);
			}
			if ( row.wiki === wiki.href && ( !response.patreon || 
			( row.lang === settings.lang && row.inline === ( settings.inline ? null : 1 ) && row.role === ( settings.role || null ) ) ) ) {
				if ( type === 'new' ) {
					return res(`/guild/${guild}/settings/${type}?save=failed`);
				}
				return db.run( 'DELETE FROM discord WHERE guild = ? AND channel = ?', [guild, type], function (delerror) {
					if ( delerror ) {
						console.log( '- Dashboard: Error while removing the settings: ' + delerror );
						return res(`/guild/${guild}/settings/${type}?save=failed`);
					}
					console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
					res(`/guild/${guild}/settings?save=success`);
					var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
			}
			return db.get( 'SELECT lang, wiki, role, inline FROM discord WHERE guild = ? AND channel = ?', [guild, settings.channel], function(curerror, channel) {
				if ( curerror ) {
					console.log( '- Dashboard: Error while getting the channel settings: ' + curerror );
					return res(`/guild/${guild}/settings/${type}?save=failed`);
				}
				if ( !channel ) channel = row;
				var diff = [];
				if ( channel.wiki !== wiki.href ) {
					diff.push(lang.get('settings.currentwiki') + ` ~~<${channel.wiki}>~~ → <${wiki.href}>`);
				}
				if ( response.patreon && channel.lang !== settings.lang ) {
					diff.push(lang.get('settings.currentlang') + ` ~~\`${allLangs.names[channel.lang]}\`~~ → \`${allLangs.names[settings.lang]}\``);
				}
				if ( response.patreon && channel.role !== ( settings.role || null ) ) {
					diff.push(lang.get('settings.currentrole') + ` ~~${( channel.role ? `<@&${channel.role}>` : '@everyone' )}~~ → ${( settings.role ? `<@&${settings.role}>` : '@everyone' )}`);
				}
				if ( response.patreon && channel.inline !== ( settings.inline ? null : 1 ) ) {
					let inlinepage = ( lang.localNames.page || 'page' );
					diff.push(lang.get('settings.currentinline') + ` ${( channel.inline ? '~~' : '' )}\`[[${inlinepage}]]\`${( channel.inline ? '~~' : '' )} → ${( settings.inline ? '' : '~~' )}\`[[${inlinepage}]]\`${( settings.inline ? '' : '~~' )}`);
				}
				if ( !diff.length ) {
					return res(`/guild/${guild}/settings/${settings.channel}?save=success`);
				}
				let sql = 'UPDATE discord SET wiki = ?, lang = ?, role = ?, inline = ? WHERE guild = ? AND channel = ?';
				let sqlargs = [wiki.href, ( settings.lang || channel.lang ), ( response.patreon ? ( settings.role || null ) : channel.role ), ( response.patreon ? ( settings.inline ? null : 1 ) : channel.inline ), guild, settings.channel];
				if ( channel === row ) {
					sql = 'INSERT INTO discord(wiki, lang, role, inline, guild, channel, prefix) VALUES(?, ?, ?, ?, ?, ?)';
					sqlargs.push(row.prefix);
				}
				return db.run( sql, sqlargs, function(dberror) {
					if ( dberror ) {
						console.log( '- Dashboard: Error while saving the settings: ' + dberror );
						return res(`/guild/${guild}/settings/${type}?save=failed`);
					}
					console.log( `- Dashboard: Settings successfully saved: ${guild}#${settings.channel}` );
					res(`/guild/${guild}/settings/${settings.channel}?save=success`);
					var text = lang.get('settings.dashboard.channel', `<@${userSettings.user.id}>`, `<#${settings.channel}>`);
					text += '\n' + diff.join('\n');
					text += `\n<${new URL(`/guild/${guild}/settings/${settings.channel}`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, embed
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
			} );
		}, () => {
			return res(`/guild/${guild}/settings/${type}?save=failed`);
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the member: ' + error );
		return res(`/guild/${guild}/settings/${type}?save=failed`);
	} );
}

module.exports = {
	get: dashboard_settings,
	post: update_settings
};
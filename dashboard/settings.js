import cheerio from 'cheerio';
import Lang from '../util/i18n.js';
import Wiki from '../util/wiki.js';
import { got, db, sendMsg, createNotice, hasPerm } from './util.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {defaultSettings} = require('../util/default.json');
const allLangs = Lang.allLangs().names;

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>',
	wiki: '<label for="wb-settings-wiki">Default Wiki:</label>'
	+ '<input type="url" id="wb-settings-wiki" name="wiki" required autocomplete="url">'
	+ '<button type="button" id="wb-settings-wiki-check">Check wiki</button>'
	+ '<div id="wb-settings-wiki-check-notice"></div>',
	//+ '<button type="button" id="wb-settings-wiki-search" class="collapsible">Search wiki</button>'
	//+ '<fieldset style="display: none;">'
	//+ '<legend>Wiki search</legend>'
	//+ '</fieldset>',
	lang: '<label for="wb-settings-lang">Language:</label>'
	+ '<select id="wb-settings-lang" name="lang" required autocomplete="language">'
	+ Object.keys(allLangs).map( lang => {
		return `<option id="wb-settings-lang-${lang}" value="${lang}">${allLangs[lang]}</option>`
	} ).join('')
	+ '</select>'
	+ '<img id="wb-settings-lang-widget">',
	role: '<label for="wb-settings-role">Minimal Role:</label>'
	+ '<select id="wb-settings-role" name="role"></select>',
	prefix: '<label for="wb-settings-prefix">Prefix:</label>'
	+ '<input type="text" id="wb-settings-prefix" name="prefix" pattern="^\\s*[^\\s`\\\\]{1,100}\\s*$" minlength="1" maxlength="100" required autocomplete="on">'
	+ '<br>'
	+ '<label for="wb-settings-prefix-space">Prefix ends with space:</label>'
	+ '<input type="checkbox" id="wb-settings-prefix-space" name="prefix_space">',
	inline: '<label for="wb-settings-inline">Inline commands:</label>'
	+ '<input type="checkbox" id="wb-settings-inline" name="inline">',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete_settings" formnovalidate>'
};

/**
 * Create a settings form
 * @param {import('cheerio').default} $ - The response body
 * @param {String} header - The form header
 * @param {import('./i18n.js').default} dashboardLang - The user language
 * @param {Object} settings - The current settings
 * @param {Boolean} settings.patreon
 * @param {String} settings.channel
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {String} settings.role
 * @param {Boolean} settings.inline
 * @param {String} settings.prefix
 * @param {import('./util.js').Role[]} guildRoles - The guild roles
 * @param {import('./util.js').Channel[]} guildChannels - The guild channels
 */
function createForm($, header, dashboardLang, settings, guildRoles, guildChannels = []) {
	var readonly = ( process.env.READONLY ? true : false );
	if ( settings.channel && guildChannels.length === 1 && guildChannels[0].userPermissions === 0 && guildChannels[0].name === 'UNKNOWN' ) {
		readonly = true;
	}
	var fields = [];
	if ( settings.channel ) {
		let channel = $('<div>').append(fieldset.channel);
		channel.find('label').text(dashboardLang.get('settings.form.channel'));
		if ( settings.channel === 'new' ) {
			let curCat = null;
			channel.find('#wb-settings-channel').append(
				$(`<option id="wb-settings-channel-default" selected hidden>`).val('').text(dashboardLang.get('settings.form.select_channel')),
				...guildChannels.filter( guildChannel => {
					return ( hasPerm(guildChannel.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') || guildChannel.isCategory );
				} ).map( guildChannel => {
					if ( settings.patreon ) {
						var optionChannel = $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – ` + ( guildChannel.isCategory ? '' : '#' ) + guildChannel.name);
						if ( guildChannel.isCategory ) {
							curCat = true;
							optionChannel.addClass('wb-settings-optgroup');
							if ( !( hasPerm(guildChannel.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && guildChannel.allowedCat ) ) {
								optionChannel.attr('disabled', '').val('');
							}
						}
						else if ( curCat === true ) {
							optionChannel.prepend('&nbsp; &nbsp; ');
						}
						return optionChannel;
					}
					if ( guildChannel.isCategory ) {
						curCat = $('<optgroup>').attr('label', guildChannel.name);
						return curCat;
					}
					var optionChannel = $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – #${guildChannel.name}`);
					if ( !curCat ) return optionChannel;
					optionChannel.appendTo(curCat);
				} ).filter( (catChannel, i, guildChannelList) => {
					if ( !catChannel ) return false;
					if ( catChannel.is('optgroup') && !catChannel.children('option').length ) return false;
					if ( catChannel.hasClass('wb-settings-optgroup') && guildChannelList[i + 1]?.hasClass?.('wb-settings-optgroup') ) return !catChannel.attr('disabled');
					return true;
				} )
			);
		}
		else {
			channel.find('#wb-settings-channel').append(
				...guildChannels.map( guildChannel => {
					return $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – ` + ( guildChannel.isCategory ? '' : '#' ) + guildChannel.name);
				} )
			);
			channel.find(`#wb-settings-channel-${settings.channel}`).attr('selected', '');
			if ( !hasPerm(guildChannels[0].userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
				readonly = true;
			}
		}
		fields.push(channel);
	}
	let wiki = $('<div>').append(fieldset.wiki);
	wiki.find('label').text(dashboardLang.get('settings.form.wiki'));
	wiki.find('#wb-settings-wiki-check').text(dashboardLang.get('settings.form.wiki_check'));
	wiki.find('#wb-settings-wiki').val(settings.wiki);
	fields.push(wiki);
	if ( !settings.channel || settings.patreon ) {
		let lang = $('<div>').append(fieldset.lang);
		lang.find('label').text(dashboardLang.get('settings.form.lang'));
		lang.find(`#wb-settings-lang-${settings.lang}`).attr('selected', '');
		fields.push(lang);
		let role = $('<div>').append(fieldset.role);
		role.find('label').text(dashboardLang.get('settings.form.role'));
		role.find('#wb-settings-role').append(
			...guildRoles.map( guildRole => {
				return $(`<option id="wb-settings-role-${guildRole.id}">`).val(guildRole.id).text(`${guildRole.id} – @${guildRole.name}`)
			} ),
			$(`<option id="wb-settings-role-everyone">`).val('').text('@everyone')
		);
		if ( settings.role ) role.find(`#wb-settings-role-${settings.role}`).attr('selected', '');
		else role.find(`#wb-settings-role-everyone`).attr('selected', '');
		fields.push(role);
		let inline = $('<div>').append(fieldset.inline);
		inline.find('label').text(dashboardLang.get('settings.form.inline'));
		if ( !settings.inline ) inline.find('#wb-settings-inline').attr('checked', '');
		fields.push(inline);
	}
	if ( settings.patreon && !settings.channel ) {
		let prefix = $('<div>').append(fieldset.prefix);
		prefix.find('label').eq(0).text(dashboardLang.get('settings.form.prefix'));
		prefix.find('label').eq(1).text(dashboardLang.get('settings.form.prefix_space'));
		prefix.find('#wb-settings-prefix').val(settings.prefix.trim());
		if ( settings.prefix.endsWith( ' ' ) ) {
			prefix.find('#wb-settings-prefix-space').attr('checked', '');
		}
		fields.push(prefix);
	}
	fields.push($(fieldset.save).val(dashboardLang.get('general.save')));
	if ( settings.channel && settings.channel !== 'new' ) {
		fields.push($(fieldset.delete).val(dashboardLang.get('general.delete')).attr('onclick', `return confirm('${dashboardLang.get('settings.form.confirm').replace( /'/g, '\\$&' )}');`));
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
 * @param {import('cheerio').default} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 * @param {import('./i18n.js').default} dashboardLang - The user language
 */
function dashboard_settings(res, $, guild, args, dashboardLang) {
	db.query( 'SELECT channel, wiki, lang, role, inline, prefix, patreon FROM discord WHERE guild = $1 ORDER BY channel DESC NULLS LAST', [guild.id] ).then( ({rows}) => {
		$('<p>').html(dashboardLang.get('settings.desc', true, $('<code>').text(guild.name))).appendTo('#text .description');
		if ( !rows.length ) {
			createNotice($, 'nosettings', dashboardLang);
			$('.channel#settings').addClass('selected');
			createForm($, dashboardLang.get('settings.form.default'), dashboardLang, {
				prefix: process.env.prefix,
				wiki: defaultSettings.wiki,
				lang: ( guild.locale || defaultSettings.lang )
			}, guild.roles).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
			return;
		}
		let isPatreon = rows.some( row => row.patreon );
		let channellist = rows.filter( row => row.channel ).map( row => {
			let channel = guild.channels.find( channel => channel.id === row.channel.replace( /^#/, '' ) );
			return ( channel || {id: row.channel.replace( /^#/, '' ), name: 'UNKNOWN', userPermissions: 0, isCategory: row.channel.startsWith( '#' )} );
		} ).sort( (a, b) => {
			return guild.channels.indexOf(a) - guild.channels.indexOf(b);
		} );
		let suffix = ( args[0] === 'owner' ? '?owner=true' : '' );
		$('#channellist #settings').after(
			...channellist.map( channel => {
				return $('<a class="channel">').attr('id', `channel-${channel.id}`).append(
					...( channel.isCategory ? [
						$('<div class="category">').text(channel.name)
					] : [
						$('<img>').attr('src', '/src/channel.svg'),
						$('<div>').text(channel.name)]
					)
				).attr('title', `${channel.id} - ${channel.name}`).attr('href', `/guild/${guild.id}/settings/${channel.id}${suffix}`);
			} ),
			( process.env.READONLY || !guild.channels.filter( channel => {
				return ( hasPerm(channel.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && !rows.some( row => row.channel === ( channel.isCategory ? '#' : '' ) + channel.id ) );
			} ).length ? '' :
			$('<a class="channel" id="channel-new">').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('settings.new'))
			).attr('title', dashboardLang.get('settings.new')).attr('href', `/guild/${guild.id}/settings/new${suffix}`) )
		);
		if ( args[4] === 'new' && !process.env.READONLY ) {
			$('.channel#channel-new').addClass('selected');
			createForm($, dashboardLang.get('settings.form.new'), dashboardLang, Object.assign({}, rows.find( row => !row.channel ), {
				patreon: isPatreon,
				channel: 'new'
			}), guild.roles, guild.channels.filter( channel => {
				return ( channel.isCategory || !rows.some( row => row.channel === ( channel.isCategory ? '#' : '' ) + channel.id ) );
			} ).map( channel => {
				if ( !channel.isCategory ) return channel;
				let {id, name, userPermissions, isCategory} = channel;
				return {
					id, name, userPermissions, isCategory,
					allowedCat: !rows.some( row => row.channel === '#' + channel.id )
				};
			} )).attr('action', `/guild/${guild.id}/settings/new`).appendTo('#text');
		}
		else if ( channellist.some( channel => channel.id === args[4] ) ) {
			let channel = channellist.find( channel => channel.id === args[4] );
			$(`.channel#channel-${channel.id}`).addClass('selected');
			createForm($, dashboardLang.get('settings.form.overwrite', false, `#${channel.name}`), dashboardLang, Object.assign({}, rows.find( row => {
				return row.channel === ( channel.isCategory ? '#' : '' ) + channel.id;
			} ), {
				patreon: isPatreon
			}), guild.roles, [channel]).attr('action', `/guild/${guild.id}/settings/${channel.id}`).appendTo('#text');
		}
		else {
			$('.channel#settings').addClass('selected');
			createForm($, dashboardLang.get('settings.form.default'), dashboardLang, rows.find( row => !row.channel ), guild.roles).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
		}
	}, dberror => {
		console.log( '- Dashboard: Error while getting the settings: ' + dberror );
		createNotice($, 'error', dashboardLang);
		$('<p>').text(dashboardLang.get('settings.failed')).appendTo('#text .description');
		$('.channel#settings').addClass('selected');
	} ).then( () => {
		let body = $.html();
		res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
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
		return res(`/guild/${guild}/settings`, 'savefail');
	}
	if ( !settings.save_settings === !settings.delete_settings ) {
		return res(`/guild/${guild}/settings/${type}`, 'savefail');
	}
	if ( settings.save_settings ) {
		if ( !settings.wiki || ( settings.lang && !allLangs.hasOwnProperty(settings.lang) ) ) {
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.channel && !userSettings.guilds.isMember.get(guild).channels.some( channel => {
			return ( channel.id === settings.channel && ( !channel.isCategory || userSettings.guilds.isMember.get(guild).patreon ) );
		} ) ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		if ( settings.role && !userSettings.guilds.isMember.get(guild).roles.some( role => {
			return ( role.id === settings.role );
		} ) ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
	}
	if ( settings.delete_settings && ( type === 'default' || type === 'new' ) ) {
		return res(`/guild/${guild}/settings/${type}`, 'savefail');
	}
	sendMsg( {
		type: 'getMember',
		member: userSettings.user.id,
		guild: guild,
		channel: ( type !== 'default' ? settings.channel : undefined ),
		allowCategory: true
	} ).then( response => {
		if ( !response ) {
			userSettings.guilds.notMember.set(guild, userSettings.guilds.isMember.get(guild));
			userSettings.guilds.isMember.delete(guild);
			return res(`/guild/${guild}`, 'savefail');
		}
		if ( response === 'noMember' || !hasPerm(response.userPermissions, 'MANAGE_GUILD') ) {
			userSettings.guilds.isMember.delete(guild);
			return res('/', 'savefail');
		}
		if ( response.message === 'noChannel' ) return db.query( 'DELETE FROM discord WHERE guild = $1 AND ( channel = $2 OR channel = $3 )', [guild, type, `#${type}`] ).then( () => {
			console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
			if ( settings.delete_settings ) return res(`/guild/${guild}/settings`, 'save');
			else return res(`/guild/${guild}/settings`, 'savefail');
		}, delerror =>{
			console.log( '- Dashboard: Error while removing the settings: ' + delerror );
			return res(`/guild/${guild}/settings`, 'savefail');
		} );
		if ( type !== 'default' && !hasPerm(response.userPermissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.delete_settings ) return db.query( 'DELETE FROM discord WHERE guild = $1 AND channel = $2 RETURNING wiki, lang, role, inline', [guild, ( response.isCategory ? '#' : '' ) + type] ).then( ({rows:[channel]}) => {
			console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
			res(`/guild/${guild}/settings`, 'save');
			if ( !channel ) return;
			db.query( 'SELECT channel, wiki, lang, role, inline FROM discord WHERE guild = $1 AND ( channel = $2 OR channel IS NULL ) ORDER BY channel DESC NULLS LAST', [guild, '#' + response.parentId] ).then( ({rows:[row, {lang: guildlang} = {}]}) => {
				var lang = new Lang(( guildlang || row.lang ));
				var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
				if ( channel.wiki !== row.wiki ) text += `\n${lang.get('settings.currentwiki')} <${channel.wiki}>`;
				if ( response.patreon ) {
					if ( channel.lang !== row.lang ) text += `\n${lang.get('settings.currentlang')} \`${allLangs[channel.lang]}\``;
					if ( channel.role !== row.role ) text += `\n${lang.get('settings.currentrole')} ` + ( channel.role ? `<@&${channel.role}>` : '@everyone' );
					if ( channel.inline !== row.inline ) text += `\n${lang.get('settings.currentinline')} ${( channel.inline ? '~~' : '' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( channel.inline ? '~~' : '' )}`;
				}
				text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
				sendMsg( {
					type: 'notifyGuild', guild, text
				} ).catch( error => {
					console.log( '- Dashboard: Error while notifying the guild: ' + error );
				} );
			}, dberror => {
				console.log( '- Dashboard: Error while notifying the guild: ' + dberror );
			} );
		}, dberror => {
			console.log( '- Dashboard: Error while removing the settings: ' + dberror );
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		} );
		var wiki = Wiki.fromInput(settings.wiki);
		if ( !wiki ) return res(`/guild/${guild}/settings`, 'savefail');
		var embed;
		return got.get( wiki + 'api.php?&action=query&meta=siteinfo&siprop=general&format=json', {
			responseType: 'text'
		} ).then( fresponse => {
			try {
				fresponse.body = JSON.parse(fresponse.body);
			}
			catch (error) {
				if ( fresponse.statusCode === 404 && typeof fresponse.body === 'string' ) {
					let api = cheerio.load(fresponse.body)('head link[rel="EditURI"]').prop('href');
					if ( api ) {
						wiki = new Wiki(api.split('api.php?')[0], wiki);
						return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&format=json' );
					}
				}
			}
			return fresponse;
		} ).then( fresponse => {
			return db.query( 'SELECT channel, wiki, lang, role, inline, prefix FROM discord WHERE guild = $1 AND ( channel = $2 OR channel IS NULL ) ORDER BY channel DESC NULLS LAST', [guild, '#' + response.parentId] ).then( ({rows:[row, {lang: guildlang} = {}]}) => {
				if ( row ) row.guildlang = ( guildlang || row.lang );
				var body = fresponse.body;
				if ( fresponse.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.general ) {
					console.log( '- Dashboard: ' + fresponse.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
					if ( row?.wiki === wiki.href ) return row;
					if ( body?.error?.info === 'You need read permission to use this module.' ) {
						return Promise.reject('private');
					}
					return Promise.reject();
				}
				wiki.updateWiki(body.query.general);
				if ( !wiki.isFandom() ) {
					let notice = [];
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) <= 30 ) {
						console.log( '- Dashboard: This wiki is using ' + body.query.general.generator + '.' );
						notice.push({
							name: 'MediaWiki',
							value: lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', body.query.general.generator)
						});
					}
					if ( notice.length ) {
						embed = {
							author: {name: body.query.general.sitename},
							title: lang.get('test.notice'),
							fields: notice
						}
					}
				}
				return row;
			}, dberror => {
				console.log( '- Dashboard: Error while getting the settings: ' + dberror );
				return Promise.reject();
			} );
		}, error => {
			if ( error.message?.startsWith( 'connect ECONNREFUSED ' ) || error.message?.startsWith( 'Hostname/IP does not match certificate\'s altnames: ' ) || error.message === 'certificate has expired' || error.message === 'self signed certificate' ) {
				console.log( '- Dashboard: Error while testing the wiki: No HTTPS' );
				return Promise.reject('http');
			}
			console.log( '- Dashboard: Error while testing the wiki: ' + error );
			if ( error.message === `Timeout awaiting 'request' for ${got.defaults.options.timeout.request}ms` ) {
				return Promise.reject('timeout');
			}
			return Promise.reject();
		} ).then( row => {
			var lang = new Lang(( type === 'default' && settings.lang || row?.guildlang ));
			if ( type === 'default' ) {
				if ( settings.channel || !settings.lang || ( !response.patreon !== !settings.prefix ) ) {
					return res(`/guild/${guild}/settings`, 'savefail');
				}
				if ( settings.prefix ) {
					if ( !/^\s*[^\s`\\]{1,100}\s*$/.test(settings.prefix) ) {
						return res(`/guild/${guild}/settings`, 'savefail');
					}
					settings.prefix = settings.prefix.trim().toLowerCase();
					if ( settings.prefix_space ) settings.prefix += ' ';
				}
				if ( !row ) return db.query( 'INSERT INTO discord(wiki, lang, role, inline, prefix, guild, main) VALUES($1, $2, $3, $4, $5, $6, $6)', [wiki.href, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.prefix || process.env.prefix ), guild] ).then( () => {
					console.log( '- Dashboard: Settings successfully saved: ' + guild );
					res(`/guild/${guild}/settings`, 'save');
					var text = lang.get('settings.dashboard.updated', `<@${userSettings.user.id}>`);
					text += '\n' + lang.get('settings.currentwiki') + ` <${wiki.href}>`;
					text += '\n' + lang.get('settings.currentlang') + ` \`${allLangs[settings.lang]}\``;
					text += '\n' + lang.get('settings.currentrole') + ( settings.role ? ` <@&${settings.role}>` : ' @everyone' );
					if ( response.patreon ) {
						text += '\n' + lang.get('settings.currentprefix') + ` \`${settings.prefix.replace( /\\/g, '\\$&' )}\``;
					}
					text += '\n' + lang.get('settings.currentinline') + ` ${( settings.inline ? '' : '~~' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( settings.inline ? '' : '~~' )}`;
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, embed,
						file: [`./i18n/widgets/${settings.lang}.png`]
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				}, dberror => {
					console.log( '- Dashboard: Error while saving the settings: ' + dberror );
					return res(`/guild/${guild}/settings`, 'savefail');
				} );
				var diff = [];
				var file = [];
				var updateGuild = false;
				var updateChannel = false;
				if ( row.wiki !== wiki.href ) {
					updateGuild = true;
					diff.push(lang.get('settings.currentwiki') + ` ~~<${row.wiki}>~~ → <${wiki.href}>`);
				}
				if ( row.lang !== settings.lang ) {
					updateChannel = true;
					file.push(`./i18n/widgets/${settings.lang}.png`);
					diff.push(lang.get('settings.currentlang') + ` ~~\`${allLangs[row.lang]}\`~~ → \`${allLangs[settings.lang]}\``);
				}
				if ( response.patreon && row.prefix !== settings.prefix ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentprefix') + ` ~~\`${row.prefix.replace( /\\/g, '\\$&' )}\`~~ → \`${settings.prefix.replace( /\\/g, '\\$&' )}\``);
				}
				if ( row.role !== ( settings.role || null ) ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentrole') + ` ~~${( row.role ? `<@&${row.role}>` : '@everyone' )}~~ → ${( settings.role ? `<@&${settings.role}>` : '@everyone' )}`);
				}
				if ( row.inline !== ( settings.inline ? null : 1 ) ) {
					updateChannel = true;
					let inlinepage = ( lang.localNames.page || 'page' );
					diff.push(lang.get('settings.currentinline') + ` ${( row.inline ? '~~' : '' )}\`[[${inlinepage}]]\`${( row.inline ? '~~' : '' )} → ${( settings.inline ? '' : '~~' )}\`[[${inlinepage}]]\`${( settings.inline ? '' : '~~' )}`);
				}
				if ( diff.length ) {
					var dbupdate = [];
					if ( response.patreon ) {
						dbupdate.push([
							'UPDATE discord SET wiki = $1, lang = $2, role = $3, inline = $4, prefix = $5 WHERE guild = $6 AND channel IS NULL',
							[wiki.href, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.prefix || process.env.prefix ), guild]
						]);
					}
					else {
						if ( updateGuild ) {
							dbupdate.push([
								'UPDATE discord SET wiki = $1 WHERE guild = $2 AND channel IS NULL',
								[wiki.href, guild]
							]);
						}
						if ( updateChannel ) {
							dbupdate.push([
								'UPDATE discord SET lang = $1, role =  $2, inline =  $3, prefix = $4 WHERE guild = $5',
								[settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.prefix || process.env.prefix ), guild]
							]);
						}
					}
					return Promise.all(dbupdate.map( ([sql, sqlargs]) => {
						return db.query( sql, sqlargs );
					} )).then( () => {
						console.log( '- Dashboard: Settings successfully saved: ' + guild );
						res(`/guild/${guild}/settings`, 'save');
						var text = lang.get('settings.dashboard.updated', `<@${userSettings.user.id}>`);
						text += '\n' + diff.join('\n');
						text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
						sendMsg( {
							type: 'notifyGuild', guild, text, file,
							embed: ( updateGuild ? embed : undefined ),
							prefix: settings.prefix, voice: settings.lang
						} ).catch( error => {
							console.log( '- Dashboard: Error while notifying the guild: ' + error );
						} );
					}, dberror => {
						console.log( '- Dashboard: Error while saving the settings: ' + dberror );
						return res(`/guild/${guild}/settings`, 'savefail');
					} );
				}
				return res(`/guild/${guild}/settings`, 'save');
			}
			if ( !row || !settings.channel || settings.prefix || 
			( !response.patreon && ( settings.lang || settings.role || settings.inline ) ) ) {
				return res(`/guild/${guild}/settings`, 'savefail');
			}
			if ( row.wiki === wiki.href && ( !response.patreon || 
			( row.lang === settings.lang && row.inline === ( settings.inline ? null : 1 ) && row.role === ( settings.role || null ) ) ) ) {
				if ( type === 'new' ) {
					return res(`/guild/${guild}/settings/${type}`, 'nochange');
				}
				return db.query( 'DELETE FROM discord WHERE guild = $1 AND channel = $2 RETURNING wiki, lang, role, inline', [guild, ( response.isCategory ? '#' : '' ) + type] ).then( ({rows:[channel]}) => {
					console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
					res(`/guild/${guild}/settings`, 'save');
					var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
					if ( channel.wiki !== row.wiki ) text += `\n${lang.get('settings.currentwiki')} <${channel.wiki}>`;
					if ( response.patreon ) {
						if ( channel.lang !== row.lang ) text += `\n${lang.get('settings.currentlang')} \`${allLangs[channel.lang]}\``;
						if ( channel.role !== row.role ) text += `\n${lang.get('settings.currentrole')} ` + ( channel.role ? `<@&${channel.role}>` : '@everyone' );
						if ( channel.inline !== row.inline ) text += `\n${lang.get('settings.currentinline')} ${( channel.inline ? '~~' : '' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( channel.inline ? '~~' : '' )}`;
					}
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				}, dberror => {
					console.log( '- Dashboard: Error while removing the settings: ' + dberror );
					return res(`/guild/${guild}/settings/${type}`, 'savefail');
				} );
			}
			return db.query( 'SELECT lang, wiki, role, inline FROM discord WHERE guild = $1 AND channel = $2', [guild, ( response.isCategory ? '#' : '' ) + settings.channel] ).then( ({rows:[channel]}) => {
				if ( !channel ) channel = row;
				var diff = [];
				var file = [];
				var useEmbed = false;
				if ( channel.wiki !== wiki.href ) {
					useEmbed = true;
					diff.push(lang.get('settings.currentwiki') + ` ~~<${channel.wiki}>~~ → <${wiki.href}>`);
				}
				if ( response.patreon && channel.lang !== settings.lang ) {
					file.push(`./i18n/widgets/${settings.lang}.png`);
					diff.push(lang.get('settings.currentlang') + ` ~~\`${allLangs[channel.lang]}\`~~ → \`${allLangs[settings.lang]}\``);
				}
				if ( response.patreon && channel.role !== ( settings.role || null ) ) {
					diff.push(lang.get('settings.currentrole') + ` ~~${( channel.role ? `<@&${channel.role}>` : '@everyone' )}~~ → ${( settings.role ? `<@&${settings.role}>` : '@everyone' )}`);
				}
				if ( response.patreon && channel.inline !== ( settings.inline ? null : 1 ) ) {
					let inlinepage = ( lang.localNames.page || 'page' );
					diff.push(lang.get('settings.currentinline') + ` ${( channel.inline ? '~~' : '' )}\`[[${inlinepage}]]\`${( channel.inline ? '~~' : '' )} → ${( settings.inline ? '' : '~~' )}\`[[${inlinepage}]]\`${( settings.inline ? '' : '~~' )}`);
				}
				if ( !diff.length ) {
					return res(`/guild/${guild}/settings/${settings.channel}`, 'save');
				}
				let sql = 'UPDATE discord SET wiki = $1, lang = $2, role = $3, inline = $4 WHERE guild = $5 AND channel = $6';
				let sqlargs = [wiki.href, ( settings.lang || channel.lang ), ( response.patreon ? ( settings.role || null ) : channel.role ), ( response.patreon ? ( settings.inline ? null : 1 ) : channel.inline ), guild, ( response.isCategory ? '#' : '' ) + settings.channel];
				if ( channel === row ) {
					sql = 'INSERT INTO discord(wiki, lang, role, inline, guild, channel, prefix) VALUES($1, $2, $3, $4, $5, $6, $7)';
					sqlargs.push(row.prefix);
				}
				return db.query( sql, sqlargs ).then( () => {
					console.log( `- Dashboard: Settings successfully saved: ${guild}#${settings.channel}` );
					res(`/guild/${guild}/settings/${settings.channel}`, 'save');
					var text = lang.get('settings.dashboard.channel', `<@${userSettings.user.id}>`, `<#${settings.channel}>`);
					text += '\n' + diff.join('\n');
					text += `\n<${new URL(`/guild/${guild}/settings/${settings.channel}`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, file,
						embed: ( useEmbed ? embed : undefined )
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				}, dberror => {
					console.log( '- Dashboard: Error while saving the settings: ' + dberror );
					return res(`/guild/${guild}/settings/${type}`, 'savefail');
				} );
			}, dberror => {
				console.log( '- Dashboard: Error while getting the channel settings: ' + dberror );
				return res(`/guild/${guild}/settings/${type}`, 'savefail');
			} );
		}, error => {
			return res(`/guild/${guild}/settings/${type}`, 'savefail', error);
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the member: ' + error );
		return res(`/guild/${guild}/settings/${type}`, 'savefail');
	} );
}

export {
	dashboard_settings as get,
	update_settings as post
};
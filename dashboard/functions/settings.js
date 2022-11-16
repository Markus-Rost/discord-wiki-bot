import { load as cheerioLoad } from 'cheerio';
import { wikiProjects, frontendProxies } from 'mediawiki-projects-list';
import Lang from '../../util/i18n.js';
import Wiki from '../../util/wiki.js';
import { got, db, sendMsg, createNotice, hasPerm, PermissionFlagsBits } from '../util.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultSettings} = require('../../util/default.json');
const allLangs = Lang.allLangs().names;
const wikiProjectNames = [
	...wikiProjects.filter( wikiProject => wikiProject.idString ).map( wikiProject => wikiProject.name ),
	...frontendProxies.filter( frontendProxy => frontendProxy.idString ).map( frontendProxy => frontendProxy.name )
];

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>',
	wiki: '<label for="wb-settings-wiki">Default Wiki:</label>'
	+ '<input type="url" id="wb-settings-wiki" class="wb-settings-wiki" name="wiki" required inputmode="url" autocomplete="url">'
	+ '<button type="button" id="wb-settings-wiki-check" class="wb-settings-wiki-check">Check wiki</button>'
	+ '<div id="wb-settings-wiki-check-notice" class="wb-settings-wiki-check-notice"></div>',
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
	+ '<input type="text" id="wb-settings-prefix" name="prefix" pattern="^\\s*[^\\s`\\\\]{1,100}\\s*$" minlength="1" maxlength="100" required inputmode="text" autocomplete="on">'
	+ '<br>'
	+ '<label for="wb-settings-prefix-space">Prefix ends with space:</label>'
	+ '<input type="checkbox" id="wb-settings-prefix-space" name="prefix_space">',
	inline: '<label for="wb-settings-inline">Inline commands:</label>'
	+ '<input type="checkbox" id="wb-settings-inline" name="inline">',
	subprefix: '<label class="wb-settings-subprefix-label" for="wb-settings-project-subprefix-"><kbd></kbd></label>'
	+ '<select id="wb-settings-project-subprefix-" class="wb-settings-project-subprefix" name="subprefix_">'
	+ '<option id="wb-settings-project-subprefix--none" value="">Set a specific wiki --&gt;</option>'
	+ wikiProjectNames.map( wikiProject => {
		return `<option id="wb-settings-project-subprefix--${wikiProject}" value="${wikiProject}">${wikiProject}</option>`
	} ).join('')
	+ '</select>'
	+ '<input type="url" id="wb-settings-wiki-subprefix-" class="wb-settings-wiki" name="subprefix_" required inputmode="url" autocomplete="url">'
	+ '<button type="button" id="wb-settings-wiki-subprefix--check" class="wb-settings-wiki-check">Check wiki</button>'
	+ '<div id="wb-settings-wiki-subprefix--check-notice" class="wb-settings-wiki-check-notice"></div>',
	desclength: '<label for="wb-settings-desclength">Description length:</label>'
	+ '<input type="number" id="wb-settings-desclength" name="desclength" min="0" max="4000" inputmode="numeric">',
	fieldcount: '<label for="wb-settings-fieldcount">Infobox field count:</label>'
	+ '<input type="number" id="wb-settings-fieldcount" name="fieldcount" min="0" max="25" inputmode="numeric">',
	fieldlength: '<label for="wb-settings-fieldlength">Infobox field length:</label>'
	+ '<input type="number" id="wb-settings-fieldlength" name="fieldlength" min="0" max="1000" inputmode="numeric">',
	sectionlength: '<label for="wb-settings-sectionlength">Section length:</label>'
	+ '<input type="number" id="wb-settings-sectionlength" name="sectionlength" min="0" max="1000" inputmode="numeric">',
	sectiondesclength: '<label for="wb-settings-sectiondesclength">Description length before section:</label>'
	+ '<input type="number" id="wb-settings-sectiondesclength" name="sectiondesclength" min="0" max="4000" inputmode="numeric">',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete_settings" formnovalidate>'
};

/**
 * Create a settings form
 * @param {import('cheerio').CheerioAPI} $ - The response body
 * @param {String} header - The form header
 * @param {import('./i18n.js').default} dashboardLang - The user language
 * @param {Object} settings - The current settings
 * @param {Boolean} [settings.patreon]
 * @param {String} [settings.channel]
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {String} [settings.role]
 * @param {Boolean} [settings.inline]
 * @param {String} settings.prefix
 * @param {Number} [settings.desclength]
 * @param {Number} [settings.fieldcount]
 * @param {Number} [settings.fieldlength]
 * @param {Number} [settings.sectionlength]
 * @param {Number} [settings.sectiondesclength]
 * @param {String[][]} [settings.subprefixes]
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
					return ( hasPerm(guildChannel.userPermissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages) || guildChannel.isCategory );
				} ).map( guildChannel => {
					if ( settings.patreon ) {
						var optionChannel = $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – ` + ( guildChannel.isCategory ? '' : '#' ) + guildChannel.name);
						if ( guildChannel.isCategory ) {
							curCat = true;
							optionChannel.addClass('wb-settings-optgroup');
							if ( !( hasPerm(guildChannel.userPermissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages) && guildChannel.allowedCat ) ) {
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
			if ( !hasPerm(guildChannels[0].userPermissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages) ) {
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
	if ( !settings.channel || settings.patreon ) {
		fields.push($('<h3>').text(dashboardLang.get('settings.form.embedlimits')));
		let desclength = $('<div>').append(fieldset.desclength);
		desclength.find('label').text(dashboardLang.get('settings.form.desclength'));
		desclength.find('#wb-settings-desclength').val(settings.desclength ?? defaultSettings.embedLimits.descLength);
		fields.push(desclength);
		let fieldcount = $('<div>').append(fieldset.fieldcount);
		fieldcount.find('label').text(dashboardLang.get('settings.form.fieldcount'));
		fieldcount.find('#wb-settings-fieldcount').val(settings.fieldcount ?? defaultSettings.embedLimits.fieldCount);
		fields.push(fieldcount);
		let fieldlength = $('<div>').append(fieldset.fieldlength);
		fieldlength.find('label').text(dashboardLang.get('settings.form.fieldlength'));
		fieldlength.find('#wb-settings-fieldlength').val(settings.fieldlength ?? defaultSettings.embedLimits.fieldLength);
		fields.push(fieldlength);
		let sectionlength = $('<div>').append(fieldset.sectionlength);
		sectionlength.find('label').text(dashboardLang.get('settings.form.sectionlength'));
		sectionlength.find('#wb-settings-sectionlength').val(settings.sectionlength ?? defaultSettings.embedLimits.sectionLength);
		fields.push(sectionlength);
		let sectiondesclength = $('<div>').append(fieldset.sectiondesclength);
		sectiondesclength.find('label').text(dashboardLang.get('settings.form.sectiondesclength'));
		sectiondesclength.find('#wb-settings-sectiondesclength').val(settings.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength);
		fields.push(sectiondesclength);
	}
	if ( !settings.channel ) {
		fields.push($('<h3>').text(dashboardLang.get('settings.form.subprefix')));
		let subprefixes = new Map(( settings.subprefixes?.length ? settings.subprefixes : defaultSettings.subprefixes ));
		subprefixes.forEach( (prefixwiki, prefixchar) => {
			let subprefix = $('<div>').append(fieldset.subprefix);
			subprefix.find('kbd').text(prefixchar);
			subprefix.find('label').attr('for', 'wb-settings-project-subprefix-' + prefixchar);
			subprefix.find('select').attr('id', 'wb-settings-project-subprefix-' + prefixchar).attr('name', 'subprefix_' + prefixchar);
			subprefix.find('#wb-settings-project-subprefix--none').text(dashboardLang.get('settings.form.select_subprefix'));
			subprefix.find('option').each( function() {
				$(this).attr('id', $(this).attr('id').replace( '--', '-' + prefixchar + '-' ));
			} );
			subprefix.find('#wb-settings-wiki-subprefix-').attr('id', 'wb-settings-wiki-subprefix-' + prefixchar).attr('name', 'subprefix_' + prefixchar);
			subprefix.find('#wb-settings-wiki-subprefix--check').attr('id', 'wb-settings-wiki-subprefix-' + prefixchar + '-check').text(dashboardLang.get('settings.form.wiki_check'));
			subprefix.find('#wb-settings-wiki-subprefix--check-notice').attr('id', 'wb-settings-wiki-subprefix-' + prefixchar + '-check-notice');
			if ( prefixwiki.startsWith( 'https://' ) ) {
				subprefix.find(`[id="wb-settings-wiki-subprefix-${prefixchar}"]`).val(prefixwiki);
				subprefix.find(`[id="wb-settings-project-subprefix-${prefixchar}-none"]`).attr('selected', '');
			}
			else {
				subprefix.find(`[id="wb-settings-project-subprefix-${prefixchar}-${prefixwiki}"]`).attr('selected', '');
				subprefix.find(`[id="wb-settings-wiki-subprefix-${prefixchar}"]`).attr('disabled', '').attr('style', 'display: none;');
				subprefix.find(`[id="wb-settings-wiki-subprefix-${prefixchar}-check"]`).attr('disabled', '').attr('style', 'display: none;');
			}
			fields.push(subprefix);
		} );
	}
	fields.push($(fieldset.save).val(dashboardLang.get('general.save')));
	if ( settings.channel && settings.channel !== 'new' ) {
		fields.push($(fieldset.delete).val(dashboardLang.get('general.delete')).attr('onclick', `return confirm('${dashboardLang.get('settings.form.confirm').replaceAll( '\'', '\\$&' )}');`));
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
 * @param {import('cheerio').CheerioAPI} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 * @param {import('./i18n.js').default} dashboardLang - The user language
 */
function dashboard_settings(res, $, guild, args, dashboardLang) {
	db.query( 'SELECT channel, wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength, prefix, patreon, (SELECT array_agg(ARRAY[prefixchar, prefixwiki] ORDER BY prefixchar) FROM subprefix WHERE guild = $1) AS subprefixes FROM discord WHERE guild = $1 ORDER BY channel DESC NULLS LAST', [guild.id] ).then( ({rows}) => {
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
				return ( hasPerm(channel.userPermissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages) && !rows.some( row => row.channel === ( channel.isCategory ? '#' : '' ) + channel.id ) );
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
 * @param {Number} [settings.desclength]
 * @param {Number} [settings.fieldcount]
 * @param {Number} [settings.fieldlength]
 * @param {Number} [settings.sectionlength]
 * @param {Number} [settings.sectiondesclength]
 * @param {String} [settings.subprefix_]
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
	/** @type {[String, String][]} */
	var subprefixes = Object.keys(settings).filter( subprefix => /^subprefix_[!?]$/.test(subprefix) ).map( subprefix => {
		return [subprefix.replace( 'subprefix_', '' ), settings[subprefix]];
	} );
	if ( settings.save_settings ) {
		if ( type !== 'default' && subprefixes.length ) subprefixes = [];
		if ( !settings.wiki || ( settings.lang && !allLangs.hasOwnProperty(settings.lang) ) ) {
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.channel && !userSettings.guilds.isMember.get(guild).channels.some( channel => {
			return ( channel.id === settings.channel && ( !channel.isCategory || userSettings.guilds.isMember.get(guild).patreon ) );
		} ) ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		if ( settings.role && !userSettings.guilds.isMember.get(guild).roles.some( role => {
			return ( role.id === settings.role );
		} ) ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		if ( !/^\d+ \d+ \d+ \d+ \d+$/.test(`${settings.desclength ?? '0'} ${settings.fieldcount ?? '0'} ${settings.fieldlength ?? '0'} ${settings.sectionlength ?? '0'} ${settings.sectiondesclength ?? '0'}`) ) {
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.desclength ) {
			settings.desclength = parseInt(settings.desclength, 10);
			if ( settings.desclength > 4_000 ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.fieldcount ) {
			settings.fieldcount = parseInt(settings.fieldcount, 10);
			if ( settings.fieldcount > 4_000 ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.fieldlength ) {
			settings.fieldlength = parseInt(settings.fieldlength, 10);
			if ( settings.fieldlength > 4_000 ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.sectionlength ) {
			settings.sectionlength = parseInt(settings.sectionlength, 10);
			if ( settings.sectionlength > 4_000 ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.sectiondesclength ) {
			settings.sectiondesclength = parseInt(settings.sectiondesclength, 10);
			if ( settings.sectiondesclength > 4_000 ) return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
	}
	if ( settings.delete_settings && ( type === 'default' || type === 'new' ) ) {
		return res(`/guild/${guild}/settings/${type}`, 'savefail');
	}
	sendMsg( {
		type: 'getMember',
		member: userSettings.user.id,
		guild: guild,
		channel: ( type !== 'default' ? settings.channel : undefined ),
		allowForum: true,
		allowCategory: true
	} ).then( response => {
		if ( !response ) {
			userSettings.guilds.notMember.set(guild, userSettings.guilds.isMember.get(guild));
			userSettings.guilds.isMember.delete(guild);
			return res(`/guild/${guild}`, 'savefail');
		}
		if ( response === 'noMember' || !hasPerm(response.userPermissions, PermissionFlagsBits.ManageGuild) ) {
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
		if ( type !== 'default' && !hasPerm(response.userPermissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages) ) {
			return res(`/guild/${guild}/settings/${type}`, 'savefail');
		}
		if ( settings.delete_settings ) return db.query( 'DELETE FROM discord WHERE guild = $1 AND channel = $2 RETURNING wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength', [guild, ( response.isCategory ? '#' : '' ) + type] ).then( ({rows:[channel]}) => {
			console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
			res(`/guild/${guild}/settings`, 'save');
			if ( !channel ) return;
			db.query( 'SELECT channel, wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength FROM discord WHERE guild = $1 AND ( channel = $2 OR channel IS NULL ) ORDER BY channel DESC NULLS LAST', [guild, '#' + response.parentId] ).then( ({rows:[row, {lang: guildlang} = {}]}) => {
				var lang = new Lang(( guildlang || row.lang ));
				var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
				if ( channel.wiki !== row.wiki ) text += `\n${lang.get('settings.currentwiki')} <${channel.wiki}>`;
				if ( response.patreon ) {
					if ( channel.lang !== row.lang ) text += `\n${lang.get('settings.currentlang')} \`${allLangs[channel.lang]}\``;
					if ( channel.role !== row.role ) text += `\n${lang.get('settings.currentrole')} ` + ( channel.role ? `<@&${channel.role}>` : '@everyone' );
					if ( channel.inline !== row.inline ) text += `\n${lang.get('settings.currentinline')} ${( channel.inline ? '~~' : '' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( channel.inline ? '~~' : '' )}`;
					if ( channel.desclength !== row.desclength ) text += `\n${lang.get('settings.currentdesclength')} \`${channel.desclength}\``;
					if ( channel.fieldcount !== row.fieldcount ) text += `\n${lang.get('settings.currentfieldcount')} \`${channel.fieldcount}\``;
					if ( channel.fieldlength !== row.fieldlength ) text += `\n${lang.get('settings.currentfieldlength')} \`${channel.fieldlength}\``;
					if ( channel.sectionlength !== row.sectionlength ) text += `\n${lang.get('settings.currentsectionlength')} \`${channel.sectionlength}\``;
					if ( channel.sectiondesclength !== row.sectiondesclength ) text += `\n${lang.get('settings.currentsectiondesclength')} \`${channel.sectiondesclength}\``;
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
		/** @type {[String, Wiki][]} */
		var wikiSubprefixes = subprefixes.filter( subprefix => !wikiProjectNames.includes( subprefix[1] ) );
		wikiSubprefixes.forEach( (subprefix, s) => {
			subprefix[1] = Wiki.fromInput(subprefix[1]);
			if ( !subprefix[1] ) return;
			if ( subprefix[1].name === wiki.name ) subprefix[1] = wiki;
			else for (let sp = 0; sp < s; sp++) {
				if ( subprefix[1].name === wikiSubprefixes[sp][1]?.name ) subprefix[1] = wikiSubprefixes[sp][1];
			}
		} );
		if ( !wiki || wikiSubprefixes.some( subprefix => !subprefix[1] ) ) return res(`/guild/${guild}/settings`, 'savefail');
		var embeds = [];
		return Promise.all([
			wiki,
			...wikiSubprefixes.map( subprefix => subprefix[1] )
		].filter( (testWiki, w, wikiList) => {
			return ( wikiList.indexOf(testWiki) === w );
		} ).map( testWiki => {
			return got.get( testWiki + 'api.php?&action=query&meta=siteinfo&siprop=general&format=json', {
				responseType: 'text',
				context: {
					guildId: guild
				}
			} ).then( fresponse => {
				try {
					fresponse.body = JSON.parse(fresponse.body);
				}
				catch (error) {
					if ( fresponse.statusCode === 404 && typeof fresponse.body === 'string' ) {
						let api = cheerioLoad(fresponse.body, {baseURI: fresponse.url})('head link[rel="EditURI"]').prop('href');
						if ( api ) {
							Object.assign(testWiki, new Wiki(api.split('api.php?')[0], testWiki));
							return got.get( testWiki + 'api.php?action=query&meta=siteinfo&siprop=general&format=json', {
								context: {
									guildId: guild
								}
							} ).then( hresponse => [testWiki, hresponse] );
						}
					}
				}
				return [testWiki, fresponse];
			} )
		} )).then( /** @param {[Wiki, import('got').Response<String>][]} fresponses */ fresponses => {
			return db.query( 'SELECT channel, wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength, prefix, (SELECT array_agg(ARRAY[prefixchar, prefixwiki] ORDER BY prefixchar) FROM subprefix WHERE guild = $1) AS subprefixes FROM discord WHERE guild = $1 AND ( channel = $2 OR channel IS NULL ) ORDER BY channel DESC NULLS LAST', [guild, '#' + response.parentId] ).then( ({rows:[row, {lang: guildlang} = {}]}) => {
				if ( row ) {
					row.guildlang = ( guildlang || row.lang );
					row.subprefixes = new Map(( row.subprefixes?.length ? row.subprefixes : defaultSettings.subprefixes ));
				}
				let responseError = null;
				let lang = new Lang(( type === 'default' && settings.lang || row?.guildlang ));
				fresponses.forEach( ([testWiki, {statusCode, body}]) => {
					if ( statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.general ) {
						console.log( '- Dashboard: ' + statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						let ignoreError = true;
						if ( testWiki === wiki && testWiki.name !== row?.wiki ) ignoreError = false;
						wikiSubprefixes.forEach( subprefix => {
							if ( subprefix[1] === testWiki && subprefix[1].name !== row?.subprefix.get(subprefix[0]) ) ignoreError = false;
						} );
						if ( ignoreError ) return;
						if ( body?.error?.info === 'You need read permission to use this module.' ) {
							responseError = 'private';
							return;
						}
						responseError ??= undefined;
						return;
					}
					testWiki.updateWiki(body.query.general);
					let notice = [];
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
						console.log( '- Dashboard: This wiki is using ' + body.query.general.generator + '.' );
						notice.push({
							name: 'MediaWiki',
							value: lang.get('test.MediaWiki', '[MediaWiki 1.30](<https://www.mediawiki.org/wiki/MediaWiki_1.30>)', body.query.general.generator)
						});
					}
					if ( notice.length ) {
						embeds.push({
							author: {
								name: body.query.general.sitename,
								url: testWiki.toLink()
							},
							title: lang.get('test.notice'),
							fields: notice
						});
					}
				} );
				if ( responseError !== null ) return Promise.reject(responseError);
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
			wikiSubprefixes.forEach( subprefix => subprefix[1] = subprefix[1].name );
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
				let defaultSubprefixes = new Map(defaultSettings.subprefixes);
				if ( !row ) return db.query( 'INSERT INTO discord(wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength, prefix, guild, main) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)', [wiki.name, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.desclength ?? null ), ( settings.fieldcount ?? null ), ( settings.fieldlength ?? null ), ( settings.sectionlength ?? null ), ( settings.sectiondesclength ?? null ), ( settings.prefix || process.env.prefix ), guild] ).then( () => {
					let updateSubprefix = false;
					subprefixes.forEach( subprefix => {
						if ( defaultSubprefixes.get(subprefix[0]) !== subprefix[1] ) updateSubprefix = true;
					} );
					if ( updateSubprefix ) return db.query( 'INSERT INTO subprefix(guild, prefixchar, prefixwiki) VALUES ' + subprefixes.map( (subprefix, sp) => {
						let index = ( sp * 2 ) + 2;
						return '($1, $' + index + ', $' + ( index + 1 ) + ')';
					} ).join(', '), [guild, ...subprefixes].flat() );
				} ).then( () => {
					console.log( '- Dashboard: Settings successfully saved: ' + guild );
					res(`/guild/${guild}/settings`, 'save');
					var text = lang.get('settings.dashboard.updated', `<@${userSettings.user.id}>`);
					text += '\n' + lang.get('settings.currentwiki') + ` <${wiki.name}>`;
					text += '\n' + lang.get('settings.currentlang') + ` \`${allLangs[settings.lang]}\``;
					text += '\n' + lang.get('settings.currentrole') + ( settings.role ? ` <@&${settings.role}>` : ' @everyone' );
					if ( response.patreon ) {
						text += '\n' + lang.get('settings.currentprefix') + ` \`${settings.prefix.replaceAll( '\\', '\\$&' )}\``;
					}
					text += '\n' + lang.get('settings.currentinline') + ` ${( settings.inline ? '' : '~~' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( settings.inline ? '' : '~~' )}`;
					text += `\n${lang.get('settings.currentdesclength')} \`${settings.desclength}\``;
					text += `\n${lang.get('settings.currentfieldcount')} \`${settings.fieldcount}\``;
					text += `\n${lang.get('settings.currentfieldlength')} \`${settings.fieldlength}\``;
					text += `\n${lang.get('settings.currentsectionlength')} \`${settings.sectionlength}\``;
					text += `\n${lang.get('settings.currentsectiondesclength')} \`${settings.sectiondesclength}\``;
					subprefixes.forEach( subprefix => {
						if (defaultSubprefixes.get(subprefix[0]) !== subprefix[1] ) {
							text += '\n' + lang.get('settings.currentsubprefix', subprefix[0]);
							if ( subprefix[1].startsWith( 'https://' ) ) text += ` <${subprefix[1]}>`;
							else text += ` \`${subprefix[1]}\``;
						}
					} );
					text += `\n<${new URL(`/guild/${guild}/settings`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text, embeds,
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
				var updateSubprefix = false;
				if ( row.wiki !== wiki.name ) {
					updateGuild = true;
					diff.push(lang.get('settings.currentwiki') + ` ~~<${row.wiki}>~~ → <${wiki.name}>`);
				}
				if ( row.lang !== settings.lang ) {
					updateChannel = true;
					file.push(`./i18n/widgets/${settings.lang}.png`);
					diff.push(lang.get('settings.currentlang') + ` ~~\`${allLangs[row.lang]}\`~~ → \`${allLangs[settings.lang]}\``);
				}
				if ( response.patreon && row.prefix !== settings.prefix ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentprefix') + ` ~~\`${row.prefix.replaceAll( '\\', '\\$&' )}\`~~ → \`${settings.prefix.replaceAll( '\\', '\\$&' )}\``);
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
				if ( ( row.desclength ?? defaultSettings.embedLimits.descLength ) !== settings.desclength ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentdesclength') + ` ~~\`${row.desclength ?? defaultSettings.embedLimits.descLength}\`~~ → \`${settings.desclength}\``);
				}
				if ( ( row.fieldcount ?? defaultSettings.embedLimits.fieldCount ) !== settings.fieldcount ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentfieldcount') + ` ~~\`${row.fieldcount ?? defaultSettings.embedLimits.fieldCount}\`~~ → \`${settings.fieldcount}\``);
				}
				if ( ( row.fieldlength ?? defaultSettings.embedLimits.fieldLength ) !== settings.fieldlength ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentfieldlength') + ` ~~\`${row.fieldlength ?? defaultSettings.embedLimits.fieldLength}\`~~ → \`${settings.fieldlength}\``);
				}
				if ( ( row.sectionlength ?? defaultSettings.embedLimits.sectionLength ) !== settings.sectionlength ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentsectionlength') + ` ~~\`${row.sectionlength ?? defaultSettings.embedLimits.sectionLength}\`~~ → \`${settings.sectionlength}\``);
				}
				if ( ( row.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength ) !== settings.sectiondesclength ) {
					updateChannel = true;
					diff.push(lang.get('settings.currentsectiondesclength') + ` ~~\`${row.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength}\`~~ → \`${settings.sectiondesclength}\``);
				}
				subprefixes.forEach( subprefix => {
					let oldSubprefix = row.subprefixes.get(subprefix[0]);
					if ( oldSubprefix !== subprefix[1] ) {
						updateSubprefix = true;
						let text = lang.get('settings.currentsubprefix', subprefix[0]);
						if ( oldSubprefix.startsWith( 'https://' ) ) text += ` ~~<${oldSubprefix}>~~`;
						else text += ` ~~\`${oldSubprefix}\`~~`;
						if ( subprefix[1].startsWith( 'https://' ) ) text += ` → <${subprefix[1]}>`;
						else text += ` → \`${subprefix[1]}\``;
						diff.push(text);
					}
				} );
				if ( diff.length ) {
					var dbupdate = [];
					if ( response.patreon ) {
						if ( updateGuild || updateChannel ) {
							dbupdate.push([
								'UPDATE discord SET wiki = $1, lang = $2, role = $3, inline = $4, desclength = $5, fieldcount = $6, fieldlength = $7, sectionlength = $8, sectiondesclength = $9, prefix = $10 WHERE guild = $11 AND channel IS NULL',
								[wiki.name, settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.desclength ?? null ), ( settings.fieldcount ?? null ), ( settings.fieldlength ?? null ), ( settings.sectionlength ?? null ), ( settings.sectiondesclength ?? null ), ( settings.prefix || process.env.prefix ), guild]
							]);
						}
					}
					else {
						if ( updateGuild ) {
							dbupdate.push([
								'UPDATE discord SET wiki = $1 WHERE guild = $2 AND channel IS NULL',
								[wiki.name, guild]
							]);
						}
						if ( updateChannel ) {
							dbupdate.push([
								'UPDATE discord SET lang = $1, role =  $2, inline =  $3, desclength = $4, fieldcount = $5, fieldlength = $6, sectionlength = $7, sectiondesclength = $8, prefix = $9 WHERE guild = $10',
								[settings.lang, ( settings.role || null ), ( settings.inline ? null : 1 ), ( settings.desclength ?? null ), ( settings.fieldcount ?? null ), ( settings.fieldlength ?? null ), ( settings.sectionlength ?? null ), ( settings.sectiondesclength ?? null ), ( settings.prefix || process.env.prefix ), guild]
							]);
						}
					}
					if ( updateSubprefix ) {
						dbupdate.push([
							'INSERT INTO subprefix(guild, prefixchar, prefixwiki) VALUES ' + subprefixes.map( (subprefix, sp) => {
								let index = ( sp * 2 ) + 2;
								return '($1, $' + index + ', $' + ( index + 1 ) + ')';
							} ).join(', ') + ' ON CONFLICT ON CONSTRAINT subprefix_guild_prefixchar_key DO UPDATE SET prefixwiki = excluded.prefixwiki;',
							[guild, ...subprefixes].flat()
						]);
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
							embeds: ( updateGuild ? embeds : [] ),
							prefix: settings.prefix
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
			if ( !row || !settings.channel || settings.prefix || ( !response.patreon && ( settings.lang || settings.role || settings.inline || settings.desclength || settings.fieldcount || settings.fieldlength || settings.sectionlength || settings.sectiondesclength ) ) ) {
				return res(`/guild/${guild}/settings`, 'savefail');
			}
			if ( row.wiki === wiki.name && ( !response.patreon || 
			( row.lang === settings.lang && row.role === ( settings.role || null ) && row.inline === ( settings.inline ? null : 1 ) && ( row.desclength ?? defaultSettings.embedLimits.descLength ) === settings.desclength && ( row.fieldcount ?? defaultSettings.embedLimits.fieldCount ) === settings.fieldcount && ( row.fieldlength ?? defaultSettings.embedLimits.fieldLength ) === settings.fieldlength && ( row.sectionlength ?? defaultSettings.embedLimits.sectionLength ) === settings.sectionlength && ( row.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength ) === settings.sectiondesclength ) ) ) {
				if ( type === 'new' ) {
					return res(`/guild/${guild}/settings/${type}`, 'nochange');
				}
				return db.query( 'DELETE FROM discord WHERE guild = $1 AND channel = $2 RETURNING wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength', [guild, ( response.isCategory ? '#' : '' ) + type] ).then( ({rows:[channel]}) => {
					console.log( `- Dashboard: Settings successfully removed: ${guild}#${type}` );
					res(`/guild/${guild}/settings`, 'save');
					var text = lang.get('settings.dashboard.removed', `<@${userSettings.user.id}>`, `<#${type}>`);
					if ( channel.wiki !== row.wiki ) text += `\n${lang.get('settings.currentwiki')} <${channel.wiki}>`;
					if ( response.patreon ) {
						if ( channel.lang !== row.lang ) text += `\n${lang.get('settings.currentlang')} \`${allLangs[channel.lang]}\``;
						if ( channel.role !== row.role ) text += `\n${lang.get('settings.currentrole')} ` + ( channel.role ? `<@&${channel.role}>` : '@everyone' );
						if ( channel.inline !== row.inline ) text += `\n${lang.get('settings.currentinline')} ${( channel.inline ? '~~' : '' )}\`[[${( lang.localNames.page || 'page' )}]]\`${( channel.inline ? '~~' : '' )}`;
						if ( channel.desclength !== row.desclength ) text += `\n${lang.get('settings.currentdesclength')} \`${channel.desclength}\``;
						if ( channel.fieldcount !== row.fieldcount ) text += `\n${lang.get('settings.currentfieldcount')} \`${channel.fieldcount}\``;
						if ( channel.fieldlength !== row.fieldlength ) text += `\n${lang.get('settings.currentfieldlength')} \`${channel.fieldlength}\``;
						if ( channel.sectionlength !== row.sectionlength ) text += `\n${lang.get('settings.currentsectionlength')} \`${channel.sectionlength}\``;
						if ( channel.sectiondesclength !== row.sectiondesclength ) text += `\n${lang.get('settings.currentsectiondesclength')} \`${channel.sectiondesclength}\``;
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
			return db.query( 'SELECT lang, wiki, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength FROM discord WHERE guild = $1 AND channel = $2', [guild, ( response.isCategory ? '#' : '' ) + settings.channel] ).then( ({rows:[channel]}) => {
				if ( !channel ) channel = row;
				var diff = [];
				var file = [];
				var useEmbed = false;
				if ( channel.wiki !== wiki.name ) {
					useEmbed = true;
					diff.push(lang.get('settings.currentwiki') + ` ~~<${channel.wiki}>~~ → <${wiki.name}>`);
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
				if ( response.patreon && ( channel.desclength ?? defaultSettings.embedLimits.descLength ) !== settings.desclength ) {
					diff.push(lang.get('settings.currentdesclength') + ` ~~\`${channel.desclength ?? defaultSettings.embedLimits.descLength}\`~~ → \`${settings.desclength}\``);
				}
				if ( response.patreon && ( channel.fieldcount ?? defaultSettings.embedLimits.fieldCount ) !== settings.fieldcount ) {
					diff.push(lang.get('settings.currentfieldcount') + ` ~~\`${channel.fieldcount ?? defaultSettings.embedLimits.fieldCount}\`~~ → \`${settings.fieldcount}\``);
				}
				if ( response.patreon && ( channel.fieldlength ?? defaultSettings.embedLimits.fieldLength ) !== settings.fieldlength ) {
					diff.push(lang.get('settings.currentfieldlength') + ` ~~\`${channel.fieldlength ?? defaultSettings.embedLimits.fieldLength}\`~~ → \`${settings.fieldlength}\``);
				}
				if ( response.patreon && ( channel.sectionlength ?? defaultSettings.embedLimits.sectionLength ) !== settings.sectionlength ) {
					diff.push(lang.get('settings.currentsectionlength') + ` ~~\`${channel.sectionlength ?? defaultSettings.embedLimits.sectionLength}\`~~ → \`${settings.sectionlength}\``);
				}
				if ( response.patreon && ( channel.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength ) !== settings.sectiondesclength ) {
					diff.push(lang.get('settings.currentsectiondesclength') + ` ~~\`${channel.sectiondesclength ?? defaultSettings.embedLimits.sectionDescLength}\`~~ → \`${settings.sectiondesclength}\``);
				}
				if ( !diff.length ) {
					return res(`/guild/${guild}/settings/${settings.channel}`, 'save');
				}
				let sql = 'UPDATE discord SET wiki = $1, lang = $2, role = $3, inline = $4, desclength = $5, fieldcount = $6, fieldlength = $7, sectionlength = $8, sectiondesclength = $9 WHERE guild = $10 AND channel = $11';
				let sqlargs = [wiki.name, ( settings.lang || channel.lang ), ( response.patreon ? ( settings.role || null ) : channel.role ), ( response.patreon ? ( settings.inline ? null : 1 ) : channel.inline ), ( settings.desclength ?? channel.desclength ), ( settings.fieldcount ?? channel.fieldcount ), ( settings.fieldlength ?? channel.fieldlength ), ( settings.sectionlength ?? channel.sectionlength ), ( settings.sectiondesclength ?? channel.sectiondesclength ), guild, ( response.isCategory ? '#' : '' ) + settings.channel];
				if ( channel === row ) {
					sql = 'INSERT INTO discord(wiki, lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength, guild, channel, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)';
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
						embeds: ( useEmbed ? embeds : [] )
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
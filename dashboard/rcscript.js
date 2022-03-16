import cheerio from 'cheerio';
import Lang from '../util/i18n.js';
import Wiki from '../util/wiki.js';
import { got, db, sendMsg, createNotice, hasPerm } from './util.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {defaultSettings, limit: {rcgcdw: rcgcdwLimit}} = require('../util/default.json');
const allLangs = Lang.allLangs(true).names;

const display_types = [
	'compact',
	'embed',
	'image',
	'diff'
];
const avatar_content_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>',
	name: '<label for="wb-settings-name">Webhook name:</label>'
	+ '<input type="text" id="wb-settings-name" name="name" minlength="2" maxlength="32" autocomplete="on">',
	avatar: '<label for="wb-settings-avatar">Webhook avatar:</label>'
	+ '<input type="url" id="wb-settings-avatar" name="avatar" list="wb-settings-avatar-list" autocomplete="url">'
	+ '<datalist id="wb-settings-avatar-list"></datalist>'
	+ '<button type="button" id="wb-settings-avatar-preview">Preview</button>',
	wiki: '<label for="wb-settings-wiki">Wiki:</label>'
	+ '<input type="url" id="wb-settings-wiki" name="wiki" list="wb-settings-wiki-list" required autocomplete="url">'
	+ '<datalist id="wb-settings-wiki-list"></datalist>'
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
	display: '<span>Display mode:</span>'
	+ '<div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-0" name="display" value="0" required>'
	+ '<label for="wb-settings-display-0" class="radio-label">Compact text messages with inline links.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-1" name="display" value="1" required>'
	+ '<label for="wb-settings-display-1" class="radio-label">Embed messages with edit tags and category changes.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-2" name="display" value="2" required>'
	+ '<label for="wb-settings-display-2" class="radio-label">Embed messages with image previews.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-3" name="display" value="3" required>'
	+ '<label for="wb-settings-display-3" class="radio-label">Embed messages with image previews and edit differences.</label>'
	+ '</div>',
	feeds: '<label for="wb-settings-feeds">Feeds based changes:</label>'
	+ '<input type="checkbox" id="wb-settings-feeds" name="feeds">'
	+ '<div id="wb-settings-feeds-only-hide">'
	+ '<label for="wb-settings-feeds-only">Only feeds based changes:</label>'
	+ '<input type="checkbox" id="wb-settings-feeds-only" name="feeds_only">'
	+ '</div>',
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
 * @param {String} [settings.channel]
 * @param {String} [settings.name]
 * @param {String} [settings.avatar]
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {Number} settings.display
 * @param {Number} [settings.rcid]
 * @param {String} [settings.postid]
 * @param {import('./util.js').Channel[]} guildChannels - The guild channels
 * @param {String[]} allWikis - The guild wikis
 */
function createForm($, header, dashboardLang, settings, guildChannels, allWikis) {
	var readonly = ( process.env.READONLY ? true : false );
	var curChannel = guildChannels.find( guildChannel => settings.channel === guildChannel.id );
	var fields = [];
	let channel = $('<div>').append(fieldset.channel);
	channel.find('label').text(dashboardLang.get('rcscript.form.channel'));
	let curCat = null;
	if ( !settings.channel || ( curChannel && hasPerm(curChannel.botPermissions, 'MANAGE_WEBHOOKS') && hasPerm(curChannel.userPermissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') ) ) {
		channel.find('#wb-settings-channel').append(
			...guildChannels.filter( guildChannel => {
				return ( ( hasPerm(guildChannel.userPermissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') && hasPerm(guildChannel.botPermissions, 'MANAGE_WEBHOOKS') ) || guildChannel.isCategory );
			} ).map( guildChannel => {
				if ( guildChannel.isCategory ) {
					curCat = $('<optgroup>').attr('label', guildChannel.name);
					return curCat;
				}
				var optionChannel = $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – #${guildChannel.name}`);
				if ( settings.channel === guildChannel.id ) {
					optionChannel.attr('selected', '');
				}
				if ( !curCat ) return optionChannel;
				optionChannel.appendTo(curCat);
			} ).filter( catChannel => {
				if ( !catChannel ) return false;
				if ( catChannel.is('optgroup') && !catChannel.children('option').length ) return false;
				return true;
			} )
		);
		if ( !settings.channel ) {
			if ( !channel.find('#wb-settings-channel').children().length ) {
				createNotice($, 'missingperm', dashboardLang, ['Manage Webhooks']);
			}
			channel.find('#wb-settings-channel').prepend(
				$(`<option id="wb-settings-channel-default" selected hidden>`).val('').text(dashboardLang.get('rcscript.form.select_channel'))
			);
		}
	}
	else if ( curChannel ) channel.find('#wb-settings-channel').append(
		$(`<option id="wb-settings-channel-${curChannel.id}">`).val(curChannel.id).attr('selected', '').text(`${curChannel.id} – #${curChannel.name}`)
	);
	else channel.find('#wb-settings-channel').append(
		$(`<option id="wb-settings-channel-${settings.channel}">`).val(settings.channel).attr('selected', '').text(settings.channel)
	);
	fields.push(channel);
	let webhook_name = $('<div>').append(fieldset.name);
	webhook_name.find('label').text(dashboardLang.get('rcscript.form.name'));
	webhook_name.find('#wb-settings-name').val(settings.name);
	fields.push(webhook_name);
	let avatar = $('<div>').append(fieldset.avatar);
	avatar.find('label').text(dashboardLang.get('rcscript.form.avatar'));
	avatar.find('#wb-settings-avatar-preview').text(dashboardLang.get('rcscript.form.avatar_preview'));
	avatar.find('#wb-settings-avatar').val(( settings.avatar || '' ));
	if ( settings.avatar ) avatar.find('#wb-settings-avatar').attr('size', settings.avatar.length + 10);
	avatar.find('#wb-settings-avatar-list').append(
		$(`<option>`).val(new URL('/src/icon.png', process.env.dashboard).href),
		( settings.avatar ? $(`<option>`).val(settings.avatar) : null )
	);
	fields.push(avatar);
	let wiki = $('<div>').append(fieldset.wiki);
	wiki.find('label').text(dashboardLang.get('rcscript.form.wiki'));
	wiki.find('#wb-settings-wiki-check').text(dashboardLang.get('rcscript.form.wiki_check'));
	wiki.find('#wb-settings-wiki').val(settings.wiki);
	wiki.find('#wb-settings-wiki-list').append(
		...allWikis.map( listWiki => $(`<option>`).val(listWiki) )
	);
	fields.push(wiki);
	let lang = $('<div>').append(fieldset.lang);
	lang.find('label').text(dashboardLang.get('rcscript.form.lang'));
	lang.find(`#wb-settings-lang-${settings.lang}`).attr('selected', '');
	fields.push(lang);
	let display = $('<div>').append(fieldset.display);
	display.find('span').text(dashboardLang.get('rcscript.form.display'));
	display.find('label').eq(0).text(dashboardLang.get('rcscript.form.display_compact'));
	display.find('label').eq(1).text(dashboardLang.get('rcscript.form.display_embed'));
	display.find('label').eq(2).text(dashboardLang.get('rcscript.form.display_image'));
	display.find('label').eq(3).text(dashboardLang.get('rcscript.form.display_diff'));
	display.find(`#wb-settings-display-${settings.display}`).attr('checked', '');
	if ( !settings.patreon ) display.find('.wb-settings-display').filter( (i, radioDisplay) => {
		return ( i > rcgcdwLimit.display && !$(radioDisplay).has('input:checked').length );
	} ).remove();
	fields.push(display);
	let feeds = $('<div id="wb-settings-feeds-hide">').append(fieldset.feeds);
	feeds.find('label').eq(0).text(dashboardLang.get('rcscript.form.feeds'));
	feeds.find('label').eq(1).text(dashboardLang.get('rcscript.form.feeds_only'));
	if ( /\.(?:fandom\.com|wikia\.org)$/.test(new URL(settings.wiki).hostname) ) {
		if ( settings.postid !== '-1' ) {
			feeds.find('#wb-settings-feeds').attr('checked', '');
			if ( settings.rcid === -1 ) feeds.find('#wb-settings-feeds-only').attr('checked', '');
		}
		else feeds.find('#wb-settings-feeds-only-hide').attr('style', 'visibility: hidden;');
	}
	else {
		feeds.attr('style', 'display: none;');
		feeds.find('#wb-settings-feeds-only-hide').attr('style', 'visibility: hidden;');
	}
	fields.push(feeds);
	fields.push($(fieldset.save).val(dashboardLang.get('general.save')));
	if ( settings.channel && curChannel && hasPerm(curChannel.userPermissions, 'MANAGE_WEBHOOKS') ) {
		fields.push($(fieldset.delete).val(dashboardLang.get('general.delete')).attr('onclick', `return confirm('${dashboardLang.get('rcscript.form.confirm').replace( /'/g, '\\$&' )}');`));
	}
	var form = $('<fieldset>').append(...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="checkbox"], input[type="radio"]:not(:checked), option, optgroup').attr('disabled', '');
		form.find('input[type="submit"]').remove();
	}
	return $('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
		$('<h2>').text(header),
		form
	);
}

/**
 * Let a user change recent changes scripts
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio').default} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 * @param {import('./i18n.js').default} dashboardLang - The user language
 */
function dashboard_rcscript(res, $, guild, args, dashboardLang) {
	db.query( 'SELECT discord.wiki mainwiki, discord.lang mainlang, (SELECT ARRAY_AGG(DISTINCT wiki ORDER BY wiki ASC) FROM discord WHERE guild = $1) allwikis, webhook, configid, rcgcdw.wiki, rcgcdw.lang, display, rcid, postid FROM discord LEFT JOIN rcgcdw ON discord.guild = rcgcdw.guild WHERE discord.guild = $1 AND discord.channel IS NULL ORDER BY configid ASC', [guild.id] ).then( ({rows}) => {
		if ( rows.length === 0 ) {
			createNotice($, 'nosettings', dashboardLang, [guild.id]);
			$('#text .description').html(dashboardLang.get('rcscript.explanation'));
			$('#text code#server-id').text(guild.id);
			$('.channel#rcscript').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
			res.write( body );
			return res.end();
		}
		var wiki = rows[0].mainwiki;
		var lang = rows[0].mainlang;
		var allwikis = rows[0].allwikis;
		if ( rows.length === 1 && rows[0].configid === null ) rows.pop();
		$('<p>').html(dashboardLang.get('rcscript.desc', true, $('<code>').text(guild.name))).appendTo('#text .description');
		Promise.all(rows.map( row => {
			return got.get( 'https://discord.com/api/webhooks/' + row.webhook ).then( response => {
				if ( !response.body?.channel_id ) {
					console.log( '- Dashboard: ' + response.statusCode + ': Error while getting the webhook: ' + response.body?.message );
					if ( ( response.body?.message === 'Unknown Webhook' && response.body?.code === 10015 )
					|| ( response.body?.message === 'Invalid Webhook Token' && response.body?.code === 50027 ) ) {
						row.DELETED = true;
					}
					else {
						row.channel = 'UNKNOWN';
						row.name = 'UNKNOWN';
						row.avatar = '';
					}
				}
				else {
					row.channel = response.body.channel_id;
					row.name = response.body.name;
					row.avatar = ( response.body.avatar ? `https://cdn.discordapp.com/avatars/${response.body.id}/${response.body.avatar}` : '' );
				}
			}, error => {
				console.log( '- Dashboard: Error while getting the webhook: ' + error );
				row.channel = 'UNKNOWN';
				row.name = 'UNKNOWN';
				row.avatar = '';
			} );
		} )).finally( () => {
			if ( rows.some( row => row.DELETED ) ) {
				let deletedRows = rows.filter( row => row.DELETED ).map( row => row.webhook );
				db.query( 'DELETE FROM rcgcdw WHERE webhook IN (' + deletedRows.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', deletedRows ).then( () => {
					console.log( '- Dashboard: Deleted RcGcDw successfully removed.' );
				}, dberror => {
					console.log( '- Dashboard: Error while removing the deleted RcGcDw: ' + dberror );
				} );
				rows = rows.filter( row => !row.DELETED );
			}
			let suffix = ( args[0] === 'owner' ? '?owner=true' : '' );
			$('#channellist #rcscript').after(
				...rows.map( row => {
					let text = `${row.configid} - ${( guild.channels.find( channel => {
						return channel.id === row.channel;
					} )?.name || row.channel )}`;
					return $('<a class="channel">').attr('id', `channel-${row.configid}`).append(
						$('<img>').attr('src', '/src/channel.svg'),
						$('<div>').text(text)
					).attr('title', text).attr('href', `/guild/${guild.id}/rcscript/${row.configid}${suffix}`);
				} ),
				( process.env.READONLY || rows.length >= rcgcdwLimit[( guild.patreon ? 'patreon' : 'default' )] ? '' :
				$('<a class="channel" id="channel-new">').append(
					$('<img>').attr('src', '/src/channel.svg'),
					$('<div>').text(dashboardLang.get('rcscript.new'))
				).attr('href', `/guild/${guild.id}/rcscript/new${suffix}`) )
			);
			if ( args[4] === 'new' && !( process.env.READONLY || rows.length >= rcgcdwLimit[( guild.patreon ? 'patreon' : 'default' )] ) ) {
				$('.channel#channel-new').addClass('selected');
				createForm($, dashboardLang.get('rcscript.form.new'), dashboardLang, {
					wiki, lang: ( allLangs.hasOwnProperty(lang) ? lang : defaultSettings.lang ),
					display: 1, patreon: guild.patreon
				}, guild.channels, allwikis).attr('action', `/guild/${guild.id}/rcscript/new`).appendTo('#text');
			}
			else if ( rows.some( row => row.configid.toString() === args[4] ) ) {
				let row = rows.find( row => row.configid.toString() === args[4] );
				$(`.channel#channel-${row.configid}`).addClass('selected');
				createForm($, dashboardLang.get('rcscript.form.entry', false, row.configid), dashboardLang, Object.assign({
					patreon: guild.patreon
				}, row), guild.channels, allwikis).attr('action', `/guild/${guild.id}/rcscript/${row.configid}`).appendTo('#text');
			}
			else {
				$('.channel#rcscript').addClass('selected');
				$('#text .description').html(dashboardLang.get('rcscript.explanation'));
				$('#text code#server-id').text(guild.id);
			}
			let body = $.html();
			res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
			res.write( body );
			return res.end();
		} );
	}, dberror => {
		console.log( '- Dashboard: Error while getting the RcGcDw: ' + dberror );
		createNotice($, 'error', dashboardLang);
		$('#text .description').html(dashboardLang.get('rcscript.explanation'));
		$('#text code#server-id').text(guild.id);
		$('.channel#rcscript').addClass('selected');
		let body = $.html();
		res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
		res.write( body );
		return res.end();
	} );
}

/**
 * Change recent changes scripts
 * @param {Function} res - The server response
 * @param {import('./util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String|Number} type - The setting to change
 * @param {Object} settings - The new settings
 * @param {String} settings.channel
 * @param {String} [settings.name]
 * @param {String} [settings.avatar]
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {Number} settings.display
 * @param {String} [settings.feeds]
 * @param {String} [settings.feeds_only]
 * @param {String} [settings.save_settings]
 * @param {String} [settings.delete_settings]
 */
function update_rcscript(res, userSettings, guild, type, settings) {
	if ( type === 'default' || type === 'notice' ) {
		return res(`/guild/${guild}/rcscript`, 'savefail');
	}
	if ( !settings.save_settings === !settings.delete_settings ) {
		return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
	}
	if ( settings.save_settings ) {
		if ( !settings.wiki || !allLangs.hasOwnProperty(settings.lang) ) {
			return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
		}
		if ( !['0', '1', '2', '3'].includes( settings.display ) ) {
			return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
		}
		settings.display = parseInt(settings.display, 10);
		if ( type === 'new' && !userSettings.guilds.isMember.get(guild).channels.some( channel => {
			return ( channel.id === settings.channel && !channel.isCategory );
		} ) ) return res(`/guild/${guild}/rcscript/new`, 'savefail');
		settings.name = ( settings.name || '' ).trim();
		if ( settings.name.length < 2 ) settings.name = '';
		if ( !settings.avatar || !/^https?:\/\//.test(settings.avatar) ) settings.avatar = '';
	}
	if ( settings.delete_settings && type === 'new' ) {
		return res(`/guild/${guild}/rcscript/new`, 'savefail');
	}
	if ( type === 'new' ) return sendMsg( {
		type: 'getMember',
		member: userSettings.user.id,
		guild: guild,
		channel: settings.channel
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
		if ( response.message === 'noChannel' || !hasPerm(response.botPermissions, 'MANAGE_WEBHOOKS') || !hasPerm(response.userPermissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') ) {
			return res(`/guild/${guild}/rcscript/new`, 'savefail');
		}
		if ( settings.display > rcgcdwLimit.display && !response.patreon ) {
			settings.display = rcgcdwLimit.display;
		}
		return db.query( 'SELECT discord.lang, ARRAY_REMOVE(ARRAY_AGG(configid ORDER BY configid), NULL) count FROM discord LEFT JOIN rcgcdw ON discord.guild = rcgcdw.guild WHERE discord.guild = $1 AND discord.channel IS NULL GROUP BY discord.lang', [guild] ).then( ({rows:[row]}) => {
			if ( !row ) return res(`/guild/${guild}/rcscript`, 'savefail');
			if ( row.count.length >= rcgcdwLimit[( response.patreon ? 'patreon' : 'default' )] ) {
				return res(`/guild/${guild}/rcscript`, 'savefail');
			}
			var wiki = Wiki.fromInput(settings.wiki);
			if ( !wiki ) return res(`/guild/${guild}/rcscript/new`, 'savefail');
			return got.get( wiki + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw|recentchanges&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json', {
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
							return got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw|recentchanges&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json' );
						}
					}
				}
				return fresponse;
			} ).then( fresponse => {
				var body = fresponse.body;
				if ( fresponse.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.allmessages || !body?.query?.general || !body?.query?.pages?.['-1'] ) {
					console.log( '- Dashboard: ' + fresponse.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
					if ( body?.error?.info === 'You need read permission to use this module.' ) {
						return res(`/guild/${guild}/rcscript/new`, 'savefail', 'private');
					}
					return res(`/guild/${guild}/rcscript/new`, 'savefail');
				}
				wiki.updateWiki(body.query.general);
				if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
					return res(`/guild/${guild}/rcscript/new`, 'mwversion', body.query.general.generator, body.query.general.sitename);
				}
				if ( body.query.allmessages[0]['*'] !== guild ) {
					return res(`/guild/${guild}/rcscript/new`, 'sysmessage', guild, wiki.toLink('MediaWiki:Custom-RcGcDw', 'action=edit'));
				}
				return Promise.all([
					db.query( 'SELECT reason FROM blocklist WHERE wiki = $1', [wiki.href] ),
					( settings.avatar ? got.head( settings.avatar ).then( headresponse => {
						if ( avatar_content_types.includes( headresponse.headers?.['content-type'] ) ) return;
						settings.avatar = '';
					}, error => {
						console.log( '- Dashboard: Error while checking for the HEAD: ' + error );
						settings.avatar = '';
					} ) : null )
				]).then( ([{rows:[block]}]) => {
					if ( block ) {
						console.log( `- Dashboard: ${wiki.href} is blocked: ${block.reason}` );
						return res(`/guild/${guild}/rcscript/new`, 'wikiblocked', body.query.general.sitename, block.reason);
					}
					if ( settings.feeds && wiki.isFandom(false) ) return got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=1&format=json&cache=' + Date.now(), {
						headers: {
							Accept: 'application/hal+json'
						}
					} ).then( dsresponse => {
						var dsbody = dsresponse.body;
						if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.status === 404 ) {
							if ( dsbody?.status !== 404 ) console.log( '- Dashboard: ' + dsresponse.statusCode + ': Error while checking for discussions: ' + dsbody?.title );
							return createWebhook();
						}
						return createWebhook(true);
					}, error => {
						console.log( '- Dashboard: Error while checking for discussions: ' + error );
						return createWebhook();
					} );
					return createWebhook();

					/**
					 * Creates the webhook.
					 * @param {Boolean} enableFeeds - If feeds based changes should be enabled.
					 */
					function createWebhook(enableFeeds = false) {
						var lang = new Lang(row.lang);
						var webhook_lang = new Lang(settings.lang, 'rcscript.webhook');
						sendMsg( {
							type: 'createWebhook',
							guild: guild,
							channel: settings.channel,
							name: ( settings.name || body.query.allmessages[1]['*'] || 'Recent changes' ),
							avatar: settings.avatar,
							reason: lang.get('rcscript.audit_reason', wiki.href),
							text: webhook_lang.get('created', body.query.general.sitename) + ( enableFeeds && settings.feeds_only ? '' : `\n<${wiki.toLink(body.query.pages['-1'].title)}>` ) + ( enableFeeds ? `\n<${wiki.href}f>` : '' )
						} ).then( webhook => {
							if ( !webhook ) return res(`/guild/${guild}/rcscript/new`, 'savefail');
							var configid = 1;
							for ( let i of row.count ) {
								if ( configid === i ) configid++;
								else break;
							}
							db.query( 'INSERT INTO rcgcdw(guild, configid, webhook, wiki, lang, display, rcid, postid) VALUES($1, $2, $3, $4, $5, $6, $7, $8)', [guild, configid, webhook, wiki.href, settings.lang, settings.display, ( enableFeeds && settings.feeds_only ? -1 : null ), ( enableFeeds ? null : '-1' )] ).then( () => {
								console.log( `- Dashboard: RcGcDw successfully added: ${guild}#${configid}` );
								res(`/guild/${guild}/rcscript/${configid}`, 'save');
								var text = lang.get('rcscript.dashboard.added', `<@${userSettings.user.id}>`, configid);
								text += `\n${lang.get('rcscript.channel')} <#${settings.channel}>`;
								text += `\n${lang.get('rcscript.name')} \`${( settings.name || body.query.allmessages[1]['*'] || 'Recent changes' )}\``;
								if ( settings.avatar ) text += `\n${lang.get('rcscript.avatar')} <${settings.avatar}>`;
								text += `\n${lang.get('rcscript.wiki')} <${wiki.href}>`;
								text += `\n${lang.get('rcscript.lang')} \`${allLangs[settings.lang]}\``;
								text += `\n${lang.get('rcscript.display')} \`${display_types[settings.display]}\``;
								if ( enableFeeds && settings.feeds_only ) text += `\n${lang.get('rcscript.rc')} *\`${lang.get('rcscript.disabled')}\`*`;
								if ( wiki.isFandom(false) ) text += `\n${lang.get('rcscript.feeds')} *\`${lang.get('rcscript.' + ( enableFeeds ? 'enabled' : 'disabled' ))}\`*`;
								text += `\n<${new URL(`/guild/${guild}/rcscript/${configid}`, process.env.dashboard).href}>`;
								sendMsg( {
									type: 'notifyGuild', guild, text,
									file: [`./RcGcDb/locale/widgets/${settings.lang}.png`]
								} ).catch( error => {
									console.log( '- Dashboard: Error while notifying the guild: ' + error );
								} );
							}, dberror => {
								console.log( '- Dashboard: Error while adding the RcGcDw: ' + dberror );
								return res(`/guild/${guild}/rcscript/new`, 'savefail');
							} );
						}, error => {
							console.log( '- Dashboard: Error while creating the webhook: ' + error );
							return res(`/guild/${guild}/rcscript/new`, 'savefail');
						} );
					}
				}, dberror => {
					console.log( '- Dashboard: Error while getting the blocklist: ' + dberror );
					return res(`/guild/${guild}/rcscript/new`, 'savefail');
				} );
			}, error => {
				if ( error.message?.startsWith( 'connect ECONNREFUSED ' ) || error.message?.startsWith( 'Hostname/IP does not match certificate\'s altnames: ' ) || error.message === 'certificate has expired' || error.message === 'self signed certificate' ) {
					console.log( '- Dashboard: Error while testing the wiki: No HTTPS' );
					return res(`/guild/${guild}/rcscript/new`, 'savefail', 'http');
				}
				console.log( '- Dashboard: Error while testing the wiki: ' + error );
				if ( error.message === `Timeout awaiting 'request' for ${got.defaults.options.timeout.request}ms` ) {
					return res(`/guild/${guild}/rcscript/new`, 'savefail', 'timeout');
				}
				return res(`/guild/${guild}/rcscript/new`, 'savefail');
			} );
		}, dberror => {
			console.log( '- Dashboard: Error while checking for RcGcDw: ' + dberror );
			return res(`/guild/${guild}/rcscript/new`, 'savefail');
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the member: ' + error );
		return res(`/guild/${guild}/rcscript/new`, 'savefail');
	} );
	type = parseInt(type, 10);
	return db.query( 'SELECT discord.lang mainlang, webhook, rcgcdw.wiki, rcgcdw.lang, display, rcid, postid FROM discord LEFT JOIN rcgcdw ON discord.guild = rcgcdw.guild AND configid = $1 WHERE discord.guild = $2 AND discord.channel IS NULL', [type, guild] ).then( ({rows:[row]}) => {
		if ( !row?.webhook ) return res(`/guild/${guild}/rcscript`, 'savefail');
		return got.get( 'https://discord.com/api/webhooks/' + row.webhook ).then( wresponse => {
			if ( !wresponse.body?.channel_id ) {
				console.log( '- Dashboard: ' + wresponse.statusCode + ': Error while getting the webhook: ' + wresponse.body?.message );
				return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
			}
			row.channel = wresponse.body.channel_id;
			row.name = wresponse.body.name;
			row.avatar = ( wresponse.body.avatar ? `https://cdn.discordapp.com/avatars/${wresponse.body.id}/${wresponse.body.avatar}` : '' );
			var newChannel = false;
			if ( settings.save_settings && row.channel !== settings.channel ) {
				if ( !userSettings.guilds.isMember.get(guild).channels.some( channel => {
					return ( channel.id === settings.channel && !channel.isCategory );
				} ) ) return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
				newChannel = true;
			}
			return sendMsg( {
				type: 'getMember',
				member: userSettings.user.id,
				guild: guild,
				channel: row.channel,
				newchannel: ( newChannel ? settings.channel : undefined )
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
				if ( response.message === 'noChannel' ) {
					return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
				}
				if ( settings.delete_settings ) {
					if ( !hasPerm(response.userPermissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') ) {
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
					}
					return db.query( 'DELETE FROM rcgcdw WHERE webhook = $1', [row.webhook] ).then( () => {
						console.log( `- Dashboard: RcGcDw successfully removed: ${guild}#${type}` );
						res(`/guild/${guild}/rcscript`, 'save');
						var lang = new Lang(row.mainlang);
						var webhook_lang = new Lang(row.lang, 'rcscript.webhook');
						got.post( 'https://discord.com/api/webhooks/' + row.webhook, {
							json: {
								content: webhook_lang.get('deleted')
							}
						} ).then( delresponse => {
							if ( delresponse.statusCode !== 204 ) {
								console.log( '- Dashboard: ' + delresponse.statusCode + ': Error while sending to the webhook: ' + delresponse.body?.message );
							}
						}, error => {
							console.log( '- Dashboard: Error while sending to the webhook: ' + error );
						} ).finally( () => {
							got.delete( 'https://discord.com/api/webhooks/' + row.webhook, {
								headers: {
									'X-Audit-Log-Reason': lang.get('rcscript.audit_reason_delete')
								}
							} ).then( delresponse => {
								if ( delresponse.statusCode !== 204 ) {
									console.log( '- Dashboard: ' + delresponse.statusCode + ': Error while removing the webhook: ' + delresponse.body?.message );
								}
								else console.log( `- Dashboard: Webhook successfully removed: ${guild}#${row.channel}` );
							}, error => {
								console.log( '- Dashboard: Error while removing the webhook: ' + error );
							} )
						} );
						var text = lang.get('rcscript.dashboard.removed', `<@${userSettings.user.id}>`, type);
						text += `\n${lang.get('rcscript.channel')} <#${row.channel}>`;
						text += `\n${lang.get('rcscript.name')} \`${row.name}\``;
						text += `\n${lang.get('rcscript.wiki')} <${row.wiki}>`;
						text += `\n${lang.get('rcscript.lang')} \`${allLangs[row.lang]}\``;
						text += `\n${lang.get('rcscript.display')} \`${display_types[row.display]}\``;
						if ( row.rcid === -1 ) {
							text += `\n${lang.get('rcscript.rc')} *\`${lang.get('rcscript.disabled')}\`*`;
						}
						if ( new Wiki(row.wiki).isFandom(false) ) text += `\n${lang.get('rcscript.feeds')} *\`${lang.get('rcscript.' + ( row.postid === '-1' ? 'disabled' : 'enabled' ))}\`*`;
						text += `\n<${new URL(`/guild/${guild}/rcscript`, process.env.dashboard).href}>`;
						sendMsg( {
							type: 'notifyGuild', guild, text
						} ).catch( error => {
							console.log( '- Dashboard: Error while notifying the guild: ' + error );
						} );
					}, dberror => {
						console.log( '- Dashboard: Error while removing the RcGcDw: ' + dberror );
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
					} );
				}
				if ( newChannel && ( !hasPerm(response.botPermissions, 'MANAGE_WEBHOOKS') 
				|| !hasPerm(response.userPermissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') 
				|| !hasPerm(response.userPermissionsNew, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') 
				|| !hasPerm(response.botPermissionsNew, 'MANAGE_WEBHOOKS') ) ) {
					return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
				}
				var hasDiff = false;
				if ( newChannel ) hasDiff = true;
				if ( settings.name && row.name !== settings.name ) hasDiff = true;
				if ( settings.avatar && row.avatar !== settings.avatar ) hasDiff = true;
				if ( row.wiki !== settings.wiki ) hasDiff = true;
				if ( row.lang !== settings.lang ) hasDiff = true;
				if ( row.display !== settings.display ) hasDiff = true;
				if ( ( row.rcid !== -1 ) !== !( settings.feeds && settings.feeds_only ) ) hasDiff = true;
				if ( ( row.postid === '-1' ) !== !settings.feeds ) hasDiff = true;
				if ( !hasDiff ) return res(`/guild/${guild}/rcscript/${type}`, 'save');
				var wiki = Wiki.fromInput(settings.wiki);
				if ( !wiki ) return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
				return got.get( wiki + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&format=json', {
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
								return got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&format=json' );
							}
						}
					}
					return fresponse;
				} ).then( fresponse => {
					var body = fresponse.body;
					if ( fresponse.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.allmessages || !body?.query?.general ) {
						console.log( '- Dashboard: ' + fresponse.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						if ( body?.error?.info === 'You need read permission to use this module.' ) {
							return res(`/guild/${guild}/rcscript/${type}`, 'savefail', 'private');
						}
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
					}
					wiki.updateWiki(body.query.general);
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
						return res(`/guild/${guild}/rcscript/${type}`, 'mwversion', body.query.general.generator, body.query.general.sitename);
					}
					if ( row.wiki !== wiki.href && body.query.allmessages[0]['*'] !== guild ) {
						return res(`/guild/${guild}/rcscript/${type}`, 'sysmessage', guild, wiki.toLink('MediaWiki:Custom-RcGcDw', 'action=edit'));
					}
					return Promise.all([
						db.query( 'SELECT reason FROM blocklist WHERE wiki = $1', [wiki.href] ),
						( settings.avatar && row.avatar !== settings.avatar ? got.head( settings.avatar ).then( headresponse => {
							if ( avatar_content_types.includes( headresponse.headers?.['content-type'] ) ) return;
							settings.avatar = '';
						}, error => {
							console.log( '- Dashboard: Error while checking for the HEAD: ' + error );
							settings.avatar = '';
						} ) : null )
					]).then( ([{rows:[block]}]) => {
						if ( block ) {
							console.log( `- Dashboard: ${wiki.href} is blocked: ${block.reason}` );
							return res(`/guild/${guild}/rcscript/${type}`, 'wikiblocked', body.query.general.sitename, block.reason);
						}
						if ( settings.feeds && wiki.isFandom(false) ) return got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=1&format=json&cache=' + Date.now(), {
							headers: {
								Accept: 'application/hal+json'
							}
						} ).then( dsresponse => {
							var dsbody = dsresponse.body;
							if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.status === 404 ) {
								if ( dsbody?.status !== 404 ) console.log( '- Dashboard: ' + dsresponse.statusCode + ': Error while checking for discussions: ' + dsbody?.title );
								return updateWebhook();
							}
							return updateWebhook(true);
						}, error => {
							console.log( '- Dashboard: Error while checking for discussions: ' + error );
							return updateWebhook();
						} );
						return updateWebhook();

						/**
						 * Creates the webhook.
						 * @param {Boolean} enableFeeds - If feeds based changes should be enabled.
						 */
						function updateWebhook(enableFeeds = null) {
							var sqlargs = [row.webhook, wiki.href, settings.lang, settings.display];
							var sql = 'UPDATE rcgcdw SET wiki = $2, lang = $3, display = $4';
							if ( row.wiki !== wiki.href ) {
								sqlargs.push(( enableFeeds && settings.feeds_only ? -1 : null ), ( enableFeeds ? null : '-1' ));
								sql += ', rcid = $5, postid = $6';
							}
							else {
								if ( enableFeeds && settings.feeds_only ) {
									sqlargs.push(-1);
									sql += ', rcid = $' + sqlargs.length;
								}
								else if ( row.rcid === -1 ) {
									sqlargs.push(null);
									sql += ', rcid = $' + sqlargs.length;
								}
								if ( !enableFeeds ) {
									sqlargs.push('-1');
									sql += ', postid = $' + sqlargs.length;
								}
								else if ( row.postid === '-1' ) {
									sqlargs.push(null);
									sql += ', postid = $' + sqlargs.length;
								}
							}
							db.query( sql + ' WHERE webhook = $1', sqlargs ).then( () => {
								console.log( `- Dashboard: RcGcDw successfully updated: ${guild}#${type}` );
								var webhook_changes = {};
								var lang = new Lang(row.mainlang);
								var webhook_lang = new Lang(settings.lang, 'rcscript.webhook');
								var diff = [];
								var file = [];
								var webhook_diff = [];
								if ( newChannel ) {
									diff.push(lang.get('rcscript.channel') + ` ~~<#${row.channel}>~~ → <#${settings.channel}>`);
									webhook_diff.push(webhook_lang.get('dashboard.channel'));
									webhook_changes.channel = settings.channel;
								}
								if ( settings.name && row.name !== settings.name ) {
									diff.push(lang.get('rcscript.name') + ` ~~\`${row.name}\`~~ → \`${settings.name}\``);
									webhook_diff.push(webhook_lang.get('dashboard.name', settings.name));
									webhook_changes.name = settings.name;
								}
								if ( settings.avatar && row.avatar !== settings.avatar ) {
									diff.push(lang.get('rcscript.avatar') + ` <${settings.avatar}>`);
									webhook_diff.push(webhook_lang.get('dashboard.avatar'));
									webhook_changes.avatar = settings.avatar;
								}
								if ( row.wiki !== wiki.href ) {
									diff.push(lang.get('rcscript.wiki') + ` ~~<${row.wiki}>~~ → <${wiki.href}>`);
									webhook_diff.push(webhook_lang.get('dashboard.wiki', `[${body.query.general.sitename}](<${wiki.href}>)`));
								}
								if ( row.lang !== settings.lang ) {
									file.push(`./RcGcDb/locale/widgets/${settings.lang}.png`);
									diff.push(lang.get('rcscript.lang') + ` ~~\`${allLangs[row.lang]}\`~~ → \`${allLangs[settings.lang]}\``);
									webhook_diff.push(webhook_lang.get('dashboard.lang', allLangs[settings.lang]));
								}
								if ( row.display !== settings.display ) {
									diff.push(lang.get('rcscript.display') + ` ~~\`${display_types[row.display]}\`~~ → \`${display_types[settings.display]}\``);
									webhook_diff.push(webhook_lang.get('dashboard.display_' + display_types[settings.display]));
								}
								if ( ( row.rcid !== -1 ) !== !( enableFeeds && settings.feeds_only ) ) {
									diff.push(lang.get('rcscript.rc') + ` ~~*\`${lang.get('rcscript.' + ( row.rcid === -1 ? 'disabled' : 'enabled' ))}\`*~~ → *\`${lang.get('rcscript.' + ( settings.feeds_only ? 'disabled' : 'enabled' ))}\`*`);
									webhook_diff.push(webhook_lang.get('dashboard.' + ( settings.feeds_only ? 'disabled_rc' : 'enabled_rc' )));
								}
								if ( ( row.postid === '-1' ) !== !enableFeeds ) {
									diff.push(lang.get('rcscript.feeds') + ` ~~*\`${lang.get('rcscript.' + ( row.postid === '-1' ? 'disabled' : 'enabled' ))}\`*~~ → *\`${lang.get('rcscript.' + ( enableFeeds ? 'enabled' : 'disabled' ))}\`*`);
									webhook_diff.push(webhook_lang.get('dashboard.' + ( enableFeeds ? 'enabled_feeds' : 'disabled_feeds' )));
								}
								if ( Object.keys(webhook_changes).length ) return sendMsg( {
									type: 'editWebhook',
									guild: guild,
									webhook: row.webhook,
									channel: webhook_changes.channel,
									name: webhook_changes.name,
									avatar: webhook_changes.avatar,
									reason: lang.get('rcscript.audit_reason_edit'),
									text: webhook_lang.get('dashboard.updated') + '\n' + webhook_diff.join('\n')
								} ).then( webhook => {
									if ( !webhook ) return Promise.reject();
									res(`/guild/${guild}/rcscript/${type}`, 'save');
									var text = lang.get('rcscript.dashboard.updated', `<@${userSettings.user.id}>`, type);
									text += '\n' + diff.join('\n');
									text += `\n<${new URL(`/guild/${guild}/rcscript/${type}`, process.env.dashboard).href}>`;
									sendMsg( {
										type: 'notifyGuild', guild, text, file
									} ).catch( error => {
										console.log( '- Dashboard: Error while notifying the guild: ' + error );
									} );
								}, error => {
									console.log( '- Dashboard: Error while editing the webhook: ' + error );
									return Promise.reject();
								} ).catch( () => {
									Object.keys(webhook_changes).forEach( () => {
										diff.shift();
										webhook_diff.shift();
									} );
									if ( !diff.length ) {
										return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
									}
									res(`/guild/${guild}/rcscript/${type}`, 'webhookfail');
									diff.shift();
									webhook_diff.shift();
									got.post( 'https://discord.com/api/webhooks/' + row.webhook, {
										json: {
											content: webhook_lang.get('dashboard.updated') + '\n' + webhook_diff.join('\n')
										}
									} ).then( delresponse => {
										if ( delresponse.statusCode !== 204 ) {
											console.log( '- Dashboard: ' + delresponse.statusCode + ': Error while sending to the webhook: ' + delresponse.body?.message );
										}
									}, error => {
										console.log( '- Dashboard: Error while sending to the webhook: ' + error );
									} )
									var text = lang.get('rcscript.dashboard.updated', `<@${userSettings.user.id}>`, type);
									text += '\n' + diff.join('\n');
									text += `\n<${new URL(`/guild/${guild}/rcscript/${type}`, process.env.dashboard).href}>`;
									sendMsg( {
										type: 'notifyGuild', guild, text, file
									} ).catch( error => {
										console.log( '- Dashboard: Error while notifying the guild: ' + error );
									} );
								} );
								res(`/guild/${guild}/rcscript/${type}`, 'save');
								got.post( 'https://discord.com/api/webhooks/' + row.webhook, {
									json: {
										content: webhook_lang.get('dashboard.updated') + '\n' + webhook_diff.join('\n')
									}
								} ).then( delresponse => {
									if ( delresponse.statusCode !== 204 ) {
										console.log( '- Dashboard: ' + delresponse.statusCode + ': Error while sending to the webhook: ' + delresponse.body?.message );
									}
								}, error => {
									console.log( '- Dashboard: Error while sending to the webhook: ' + error );
								} )
								var text = lang.get('rcscript.dashboard.updated', `<@${userSettings.user.id}>`, type);
								text += '\n' + diff.join('\n');
								text += `\n<${new URL(`/guild/${guild}/rcscript/${type}`, process.env.dashboard).href}>`;
								sendMsg( {
									type: 'notifyGuild', guild, text, file
								} ).catch( error => {
									console.log( '- Dashboard: Error while notifying the guild: ' + error );
								} );
							}, dberror => {
								console.log( '- Dashboard: Error while updating the RcGcDw: ' + dberror );
								return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
							} );
						}
					}, dberror => {
						console.log( '- Dashboard: Error while getting the blocklist: ' + dberror );
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
					} );
				}, error => {
					if ( error.message?.startsWith( 'connect ECONNREFUSED ' ) || error.message?.startsWith( 'Hostname/IP does not match certificate\'s altnames: ' ) || error.message === 'certificate has expired' || error.message === 'self signed certificate' ) {
						console.log( '- Dashboard: Error while testing the wiki: No HTTPS' );
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail', 'http');
					}
					console.log( '- Dashboard: Error while testing the wiki: ' + error );
					if ( error.message === `Timeout awaiting 'request' for ${got.defaults.options.timeout.request}ms` ) {
						return res(`/guild/${guild}/rcscript/${type}`, 'savefail', 'timeout');
					}
					return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
				} );
			}, error => {
				console.log( '- Dashboard: Error while getting the member: ' + error );
				return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
			} );
		}, error => {
			console.log( '- Dashboard: Error while getting the webhook: ' + error );
			return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
		} );
	}, dberror => {
		console.log( '- Dashboard: Error while checking for RcGcDw: ' + dberror );
		return res(`/guild/${guild}/rcscript/${type}`, 'savefail');
	} );
}

export {
	dashboard_rcscript as get,
	update_rcscript as post
};

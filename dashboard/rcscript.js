const {defaultSettings, limit: {rcgcdw: rcgcdwLimit}} = require('../util/default.json');
const {RcGcDw: allLangs} = require('../i18n/allLangs.json');
const {got, db, sendMsg, hasPerm} = require('./util.js');

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>',
	wiki: '<label for="wb-settings-wiki">Wiki:</label>'
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
	display: '<span>Display mode:</span>'
	+ '<div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-0" name="display" value="0" required>'
	+ '<label for="wb-settings-display-0">Compact text messages with inline links.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-1" name="display" value="1" required>'
	+ '<label for="wb-settings-display-1">Embed messages with edit tags and category changes.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-2" name="display" value="2" required>'
	+ '<label for="wb-settings-display-2">Embed messages with image previews.</label>'
	+ '</div><div class="wb-settings-display">'
	+ '<input type="radio" id="wb-settings-display-3" name="display" value="3" required>'
	+ '<label for="wb-settings-display-3">Embed messages with image previews and edit differences.</label>'
	+ '</div>',
	feeds: '<label for="wb-settings-feeds">Feeds based changes:</label>'
	+ '<input type="checkbox" id="wb-settings-feeds" name="feeds">'
	+ '<div id="wb-settings-feeds-only-hide">'
	+ '<label for="wb-settings-feeds-only">Only feeds based changes:</label>'
	+ '<input type="checkbox" id="wb-settings-feeds-only" name="feeds_only">'
	+ '</div>',
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
 * @param {Number} settings.display
 * @param {Number} settings.wikiid
 * @param {Number} settings.rcid
 * @param {Object[]} guildChannels - The guild channels
 * @param {String} guildChannels.id
 * @param {String} guildChannels.name
 * @param {Number} guildChannels.permissions
 */
function createForm($, header, settings, guildChannels) {
	var readonly = ( process.env.READONLY ? true : false );
	var fields = [];
	let channel = $('<div>').append(fieldset.channel);
	channel.find('#wb-settings-channel').append(
		...guildChannels.filter( guildChannel => {
			return ( hasPerm(guildChannel.permissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') || settings.channel === guildChannel.id );
		} ).map( guildChannel => {
			var optionChannel = $(`<option id="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id);
			if ( settings.channel === guildChannel.id ) {
				optionChannel.attr('selected', '');
				if ( !hasPerm(guildChannel.permissions, 'VIEW_CHANNEL', 'MANAGE_WEBHOOKS') ) {
					optionChannel.addClass('wb-settings-error');
					readonly = true;
				}
			}
			return optionChannel.text(`${guildChannel.id} – #${guildChannel.name}`);
		} )
	);
	if ( !settings.channel ) channel.find('#wb-settings-channel').prepend(
		$(`<option id="wb-settings-channel-default" selected>`).val('').text('-- Select a Channel --')
	);
	fields.push(channel);
	let wiki = $('<div>').append(fieldset.wiki);
	wiki.find('#wb-settings-wiki').val(settings.wiki);
	fields.push(wiki);
	let lang = $('<div>').append(fieldset.lang);
	lang.find(`#wb-settings-lang-${settings.lang}`).attr('selected', '');
	fields.push(lang);
	let display = $('<div>').append(fieldset.display);
	display.find(`#wb-settings-display-${settings.display}`).attr('checked', '');
	if ( !settings.patreon ) display.find('.wb-settings-display').filter( (i, radioDisplay) => {
		return ( i >= rcgcdwLimit.display && !$(radioDisplay).has('input:checked').length );
	} ).remove();
	fields.push(display);
	let feeds = $('<div id="wb-settings-feeds-hide">').append(fieldset.feeds);
	if ( /\.(?:fandom\.com|wikia\.org)$/.test(new URL(settings.wiki).hostname) ) {
		if ( settings.wikiid ) {
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
	fields.push($(fieldset.save).val('Save'));
	if ( settings.channel ) {
		fields.push($(fieldset.delete).val('Delete').attr('onclick', `return confirm('Are you sure?');`));
	}
	var form = $('<fieldset>').append(...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="checkbox"], input[type="radio"]:not(:checked), option').attr('disabled', '');
		form.find('input[type="submit"], button.addmore').remove();
	}
	return $('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
		$('<h2>').text(header),
		form
	);
}

/**
 * Let a user change recent changes scripts
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio')} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 */
function dashboard_rcscript(res, $, guild, args) {
	db.all( 'SELECT webhook, configid, wiki, lang, display, wikiid, rcid FROM rcgcdw WHERE guild = ? ORDER BY configid ASC', [guild.id], function(dberror, rows) {
		if ( dberror ) {
			console.log( '- Dashboard: Error while getting the RcGcDw: ' + dberror );
			$('#text .description').text('Failed to load the recent changes webhooks!');
			$('.channel#rcscript').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		$('#text .description').text(`These are the recent changes webhooks for "${guild.name}":`);
		Promise.all(rows.map( row => {
			return got.get( 'https://discord.com/api/webhooks/' + row.webhook ).then( response => {
				row.channel = response.body.channel_id;
			}, error => {
				console.log( '- Dashboard: Error while getting the webhook: ' + error );
				row.channel = 'UNKNOWN';
			} );
		} )).finally( () => {
			$('#channellist #rcscript').after(
				...rows.map( row => {
					return $('<a class="channel">').attr('id', `channel-${row.configid}`).append(
						$('<img>').attr('src', '/src/channel.svg'),
						$('<div>').text(`${row.configid} - ${( guild.channels.find( channel => {
							return channel.id === row.channel;
						} )?.name || row.channel )}`)
					).attr('href', `/guild/${guild.id}/rcscript/${row.configid}`);
				} ),
				( process.env.READONLY || rows.length >= rcgcdwLimit[( guild.patreon ? 'patreon' : 'default' )] ? '' :
				$('<a class="channel" id="channel-new">').append(
					$('<img>').attr('src', '/src/channel.svg'),
					$('<div>').text('New webhook')
				).attr('href', `/guild/${guild.id}/rcscript/new`) )
			);
			if ( args[4] === 'new' ) {
				$('.channel#channel-new').addClass('selected');
				createForm($, 'New Recent Changes Webhook', {
					wiki: defaultSettings.wiki, lang: defaultSettings.lang,
					display: 1, patreon: guild.patreon
				}, guild.channels).attr('action', `/guild/${guild.id}/rcscript/new`).appendTo('#text');
			}
			else if ( rows.some( row => row.configid == args[4] ) ) {
				let row = rows.find( row => row.configid == args[4] );
				$(`.channel#channel-${row.configid}`).addClass('selected');
				createForm($, `Recent Changes Webhook #${row.configid}`, Object.assign({
					patreon: guild.patreon
				}, row), guild.channels).attr('action', `/guild/${guild.id}/rcscript/${row.configid}`).appendTo('#text');
			}
			else {
				$('.channel#rcscript').addClass('selected');
				$('#text .description').text(`*Insert explanation about recent changes webhooks here*`);
			}
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		} );
	} );
}

/**
 * Change recent changes scripts
 * @param {Function} res - The server response
 * @param {import('./util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String} type - The setting to change
 * @param {Object} settings - The new settings
 * @param {String} settings.channel
 * @param {String} settings.wiki
 * @param {String} settings.lang
 * @param {String} settings.display
 * @param {String} [settings.feeds]
 * @param {String} [settings.feeds_only]
 * @param {String} [settings.save_settings]
 * @param {String} [settings.delete_settings]
 */
function update_rcscript(res, userSettings, guild, type, settings) {
	
	console.log( settings );
	return res(`/guild/${guild}/rcscript/${type}?save=failed`);
}

module.exports = {
	get: dashboard_rcscript,
	post: update_rcscript
};
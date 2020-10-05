const {defaultSettings} = require('../util/default.json');
const {allLangs: {names: allLangs}} = require('../i18n/allLangs.json');
const {db, settingsData, sendMsg, createNotice, hasPerm} = require('./util.js');

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
	+ Object.keys(allLangs).map( lang => {
		return `<option id="wb-settings-lang-${lang}" value="${lang}">${allLangs[lang]}</option>`
	} ).join('\n')
	+ '</select>',
	prefix: '<label for="wb-settings-prefix">Prefix:</label>'
	+ '<input type="text" id="wb-settings-prefix" name="prefix" pattern="^\\s*[^\\s`]+\\s*$" required>'
	+ '<br>'
	+ '<label for="wb-settings-prefix-space">Prefix ends with space:</label>'
	+ '<input type="checkbox" id="wb-settings-prefix-space" name="prefix-space">',
	inline: '<label for="wb-settings-inline">Inline commands:</label>'
	+ '<input type="checkbox" id="wb-settings-inline" name="inline">',
	voice: '<label for="wb-settings-voice">Voice channels:</label>'
	+ '<input type="checkbox" id="wb-settings-voice" name="voice">',
	save: '<input type="submit" id="wb-settings-save" name="save-settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete-settings">'
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
 * @param {Boolean} settings.inline
 * @param {String} settings.prefix
 * @param {Boolean} settings.voice
 * @param {Object[]} guildChannels - The guild channels
 * @param {String} guildChannels.id
 * @param {String} guildChannels.name
 * @param {Number} guildChannels.permissions
 */
function createForm($, header, settings, guildChannels) {
	var readonly = ( process.env.READONLY ? true : false );
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
			if ( !hasPerm(guildChannels[0].permissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
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
	if ( !settings.channel ) {
		let voice = $('<div>').append(fieldset.voice);
		if ( settings.voice ) voice.find('#wb-settings-voice').attr('checked', '');
		fields.push(voice);
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
	db.all( 'SELECT channel, lang, wiki, prefix, inline, voice, patreon FROM discord WHERE guild = ? ORDER BY channel ASC', [guild.id], function(dberror, rows) {
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
			}, defaultSettings)).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		let isPatreon = rows.some( row => row.patreon );
		let channellist = rows.filter( row => row.channel ).map( row => {
			let channel = guild.channels.find( channel => channel.id === row.channel );
			return ( channel || {id: row.channel, name: 'UNKNOWN', permissions: 0} );
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
				return ( hasPerm(channel.permissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && !rows.some( row => row.channel === channel.id ) );
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
			}), guild.channels.filter( channel => {
				return ( hasPerm(channel.permissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') && !rows.some( row => row.channel === channel.id ) );
			} )).attr('action', `/guild/${guild.id}/settings/new`).appendTo('#text');
		}
		else if ( channellist.some( channel => channel.id === args[4] ) ) {
			let channel = channellist.find( channel => channel.id === args[4] );
			$(`.channel#channel-${channel.id}`).addClass('selected');
			createForm($, `#${channel.name} Settings`, Object.assign({}, rows.find( row => {
				return row.channel === channel.id;
			} ), {
				patreon: isPatreon
			}), [channel]).attr('action', `/guild/${guild.id}/settings/${channel.id}`).appendTo('#text');
		}
		else {
			$('.channel#settings').addClass('selected');
			createForm($, 'Server-wide Settings', rows.find( row => !row.channel )).attr('action', `/guild/${guild.id}/settings/default`).appendTo('#text');
		}
		let body = $.html();
		res.writeHead(200, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	} );
}

function update_settings(user, guild, settings) {
	
}

module.exports = {
	get: dashboard_settings,
	post: update_settings
};
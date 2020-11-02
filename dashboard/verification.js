const {limit: {verification: verificationLimit}} = require('../util/default.json');
const {db, sendMsg, hasPerm} = require('./util.js');

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>'
	+ '<button type="button" id="wb-settings-channel-more" class="addmore">Add more</button>',
	role: '<label for="wb-settings-role">Role:</label>'
	+ '<select id="wb-settings-role" name="role" required></select>'
	+ '<button type="button" id="wb-settings-role-more" class="addmore">Add more</button>',
	usergroup: '<label for="wb-settings-usergroup">Wiki user group:</label>'
	+ '<input type="text" id="wb-settings-usergroup" name="usergroup" required>',
	editcount: '<label for="wb-settings-editcount">Minimal edit count:</label>'
	+ '<input type="number" id="wb-settings-editcount" name="editcount" min="0" required>',
	accountage: '<label for="wb-settings-accountage">Account age (in days):</label>'
	+ '<input type="number" id="wb-settings-accountage" name="accountage" min="0" required>',
	rename: '<label for="wb-settings-rename">Rename users:</label>'
	+ '<input type="checkbox" id="wb-settings-rename" name="rename">',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete_settings">'
};

/**
 * Create a settings form
 * @param {import('cheerio')} $ - The response body
 * @param {String} header - The form header
 * @param {Object} settings - The current settings
 * @param {String} settings.channel
 * @param {String} settings.role
 * @param {String} settings.usergroup
 * @param {Number} settings.editcount
 * @param {Number} settings.accountage
 * @param {Boolean} settings.rename
 * @param {Object[]} guildChannels - The guild channels
 * @param {String} guildChannels.id
 * @param {String} guildChannels.name
 * @param {Number} guildChannels.permissions
 * @param {Object[]} guildRoles - The guild roles
 * @param {String} guildRoles.id
 * @param {String} guildRoles.name
 * @param {Boolean} guildRoles.lower
 */
function createForm($, header, settings, guildChannels, guildRoles) {
	var readonly = ( process.env.READONLY ? true : false );
	readonly = true;
	var fields = [];
	let channel = $('<div>').append(fieldset.channel);
	channel.find('#wb-settings-channel').append(
		$('<option class="wb-settings-channel-default defaultSelect" hidden>').val('').text('-- Select a Channel --'),
		...guildChannels.filter( guildChannel => {
			return ( hasPerm(guildChannel.permissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') || settings.channel.includes( '|' + guildChannel.id + '|' ) );
		} ).map( guildChannel => {
			var optionChannel = $(`<option class="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id);
			if ( !hasPerm(guildChannel.permissions, 'VIEW_CHANNEL', 'SEND_MESSAGES') ) {
				optionChannel.addClass('wb-settings-error');
			}
			return optionChannel.text(`${guildChannel.id} – #${guildChannel.name}`);
		} )
	);
	if ( settings.channel ) {
		let settingsChannels = settings.channel.split('|').filter( guildChannel => guildChannel.length );
		channel.find('#wb-settings-channel').append(
			...settingsChannels.filter( guildChannel => {
				return !channel.find(`.wb-settings-channel-${guildChannel}`).length;
			} ).map( guildChannel => {
				return $(`<option class="wb-settings-channel-${guildChannel}">`).val(guildChannel).text(`${guildChannel} – #UNKNOWN`).addClass('wb-settings-error');
			} )
		);
		if ( settingsChannels.length > 1 ) channel.find('#wb-settings-channel').after(
			...settingsChannels.slice(1).map( guildChannel => {
				var additionalChannel = channel.find('#wb-settings-channel').clone();
				additionalChannel.addClass('wb-settings-additional-select');
				additionalChannel.find(`.wb-settings-channel-default`).removeAttr('hidden');
				additionalChannel.find(`.wb-settings-channel-${guildChannel}`).attr('selected', '');
				return additionalChannel.removeAttr('id').removeAttr('required');
			} )
		);
		channel.find(`#wb-settings-channel .wb-settings-channel-${settingsChannels[0]}`).attr('selected', '');
	}
	else {
		channel.find('.wb-settings-channel-default').attr('selected', '');
		channel.find('button.addmore').attr('hidden', '');
	}
	fields.push(channel);
	let role = $('<div>').append(fieldset.role);
	role.find('#wb-settings-role').append(
		$('<option class="wb-settings-role-default defaultSelect" hidden>').val('').text('-- Select a Role --'),
		...guildRoles.filter( guildRole => {
			return guildRole.lower || settings.role.split('|').includes( guildRole.id );
		} ).map( guildRole => {
			var optionRole = $(`<option class="wb-settings-role-${guildRole.id}">`).val(guildRole.id);
			if ( !guildRole.lower ) optionRole.addClass('wb-settings-error');
			return optionRole.text(`${guildRole.id} – @${guildRole.name}`);
		} )
	);
	if ( settings.role ) {
		let settingsRoles = settings.role.split('|');
		role.find('#wb-settings-role').append(
			...settingsRoles.filter( guildRole => {
				return !role.find(`.wb-settings-role-${guildRole}`).length;
			} ).map( guildRole => {
				return $(`<option class="wb-settings-role-${guildRole}">`).val(guildRole).text(`${guildRole} – @UNKNOWN`).addClass('wb-settings-error');
			} )
		);
		if ( settingsRoles.length > 1 ) role.find('#wb-settings-role').after(
			...settingsRoles.slice(1).map( guildRole => {
				var additionalRole = role.find('#wb-settings-role').clone();
				additionalRole.addClass('wb-settings-additional-select');
				additionalRole.find(`.wb-settings-role-default`).removeAttr('hidden');
				additionalRole.find(`.wb-settings-role-${guildRole}`).attr('selected', '');
				return additionalRole.removeAttr('id').removeAttr('required');
			} )
		);
		role.find(`#wb-settings-role .wb-settings-role-${settingsRoles[0]}`).attr('selected', '');
	}
	else {
		role.find('.wb-settings-role-default').attr('selected', '');
		role.find('button.addmore').attr('hidden', '');
	}
	fields.push(role);
	let usergroup = $('<div>').append(fieldset.usergroup);
	usergroup.find('#wb-settings-usergroup').val(settings.usergroup.split('|').join(', '));
	fields.push(usergroup);
	let editcount = $('<div>').append(fieldset.editcount);
	editcount.find('#wb-settings-editcount').val(settings.editcount);
	fields.push(editcount);
	let accountage = $('<div>').append(fieldset.accountage);
	accountage.find('#wb-settings-accountage').val(settings.accountage);
	fields.push(accountage);
	let rename = $('<div>').append(fieldset.rename);
	if ( settings.rename ) rename.find('#wb-settings-rename').attr('checked', '');
	fields.push(rename);
	fields.push($(fieldset.save).val('Save'));
	if ( settings.channel ) {
		fields.push($(fieldset.delete).val('Delete').attr('onclick', `return confirm('Are you sure?');`));
	}
	var form = $('<fieldset>').append(...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="checkbox"], option').attr('disabled', '');
		form.find('input[type="submit"], button.addmore').remove();
	}
	return $('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
		$('<h2>').text(header),
		form
	);
}

/**
 * Let a user change verifications
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio')} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 */
function dashboard_verification(res, $, guild, args) {
	db.all( 'SELECT configid, channel, role, editcount, usergroup, accountage, rename FROM verification WHERE guild = ? ORDER BY configid ASC', [guild.id], function(dberror, rows) {
		if ( dberror ) {
			console.log( '- Dashboard: Error while getting the verifications: ' + dberror );
			$('#text .description').text('Failed to load the verifications!');
			$('.channel#verification').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		$('#text .description').text(`These are the verifications for "${guild.name}":`);
		$('#channellist #verification').after(
			...rows.map( row => {
				return $('<a class="channel">').attr('id', `channel-${row.configid}`).append(
					$('<img>').attr('src', '/src/channel.svg'),
					$('<div>').text(`${row.configid} - ${( guild.roles.find( role => {
						return role.id === row.role.split('|')[0];
					} )?.name || guild.channels.find( channel => {
						return channel.id === row.channel.split('|')[1];
					} )?.name || row.usergroup.split('|')[0] )}`)
				).attr('href', `/guild/${guild.id}/verification/${row.configid}`);
			} ),
			( process.env.READONLY || rows.length >= verificationLimit[( guild.patreon ? 'patreon' : 'default' )] ? '' :
			$('<a class="channel" id="channel-new">').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text('New verification')
			).attr('href', `/guild/${guild.id}/verification/new`) )
		);
		if ( args[4] === 'new' ) {
			$('.channel#channel-new').addClass('selected');
			createForm($, 'New Verification', {
				channel: '', role: '', usergroup: 'user',
				editcount: 0, accountage: 0, rename: false
			}, guild.channels, guild.roles).attr('action', `/guild/${guild.id}/verification/new`).appendTo('#text');
		}
		else if ( rows.some( row => row.configid == args[4] ) ) {
			let row = rows.find( row => row.configid == args[4] );
			$(`.channel#channel-${row.configid}`).addClass('selected');
			createForm($, `Verification #${row.configid}`, row, guild.channels, guild.roles).attr('action', `/guild/${guild.id}/verification/${row.configid}`).appendTo('#text');
		}
		else {
			$('.channel#verification').addClass('selected');
			$('#text .description').text(`*Insert explanation about verification here*`);
		}
		let body = $.html();
		res.writeHead(200, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	} );
}

/**
 * Change verifications
 * @param {Function} res - The server response
 * @param {import('./util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String} type - The setting to change
 * @param {Object} settings - The new settings
 * @param {String|String[]} settings.channel
 * @param {String|String[]} settings.role
 * @param {String|String[]} settings.usergroup
 * @param {String} settings.editcount
 * @param {String} settings.accountage
 * @param {String} [settings.rename]
 * @param {String} [settings.save_settings]
 * @param {String} [settings.delete_settings]
 */
function update_verification(res, userSettings, guild, type, settings) {
	
	console.log( settings );
	return res(`/guild/${guild}/verification/${type}?save=failed`);
}

module.exports = {
	get: dashboard_verification,
	post: update_verification
};
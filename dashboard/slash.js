const Lang = require('../util/i18n.js');
const {got, db, slashCommands, sendMsg, createNotice, hasPerm} = require('./util.js');

const fieldset = {
	role: '<label for="wb-settings-addrole">Role:</label>'
	+ '<select id="wb-settings-addrole" name="role"></select>'
	+ '<button type="button" id="wb-settings-addrole-add">Add</button>'
	+ '<hr>',
	permission: '<span title="@UNKNOWN">@UNKNOWN:</span>'
	+ '<div class="wb-settings-permission">'
	+ '<input type="radio" id="wb-settings-permission-0" name="permission" value="0" required>'
	+ '<label for="wb-settings-permission-0" class="wb-settings-permission-deny">Deny</label>'
	+ '</div><div class="wb-settings-permission">'
	+ '<input type="radio" id="wb-settings-permission-1" name="permission" value="1" required>'
	+ '<label for="wb-settings-permission-1" class="wb-settings-permission-allow">Allow</label>'
	+ '</div><div class="wb-settings-permission">'
	+ '<input type="radio" id="wb-settings-permission-default" name="permission" value="" required>'
	+ '<label for="wb-settings-permission-default" class="wb-settings-permission-default">Default</label>'
	+ '</div>',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">'
};

/**
 * Create a settings form
 * @param {import('cheerio')} $ - The response body
 * @param {slashCommands[0]} slashCommand - The slash command
 * @param {import('./i18n.js')} dashboardLang - The user language
 * @param {Object[]} permissions - The current permissions
 * @param {String} permissions.id
 * @param {Number} permissions.type
 * @param {Boolean} permissions.permission
 * @param {String} guildId - The guild id
 * @param {import('./util.js').Role[]} guildRoles - The guild roles
 */
function createForm($, slashCommand, dashboardLang, permissions, guildId, guildRoles) {
	var readonly = ( process.env.READONLY ? true : false );
	var fields = [];
	if ( !readonly ) {
		$('<script>').text(`const i18nSlashPermission = ${JSON.stringify({
			allow: dashboardLang.get('slash.form.allow'),
			deny: dashboardLang.get('slash.form.deny'),
			default: dashboardLang.get('slash.form.default')
		})};`).insertBefore('script#indexjs');
		let role = $('<div>').append(fieldset.role);
		role.find('label').text(dashboardLang.get('slash.form.role'));
		role.find('#wb-settings-addrole').append(
			$(`<option id="wb-settings-channel-default" selected hidden>`).val('').text(dashboardLang.get('slash.form.select_role')),
			...guildRoles.filter( guildRole => !permissions.some( perm => perm.id === guildRole.id ) ).map( guildRole => {
				return $(`<option id="wb-settings-addrole-${guildRole.id}">`).val(guildRole.id).text(`${guildRole.id} – @${guildRole.name}`)
			} ),
			( permissions.some( perm => perm.id === guildId ) ? '' : $(`<option id="wb-settings-addrole-${guildId}">`).val(guildId).text(`@everyone`) )
		);
		role.find('#wb-settings-addrole-add').text(dashboardLang.get('slash.form.add'));
		fields.push(role);
	}
	let perms = permissions.sort( (a, b) => {
		if ( a.id === guildId ) return 1;
		if ( b.id === guildId ) return -1;
		return guildRoles.findIndex( guildRole => guildRole.id === a.id ) - guildRoles.findIndex( guildRole => guildRole.id === b.id );
	} ).map( perm => {
		let permission = $('<div>').append(fieldset.permission);
		let span = permission.find('span').attr('title', perm.id);
		if ( perm.id === guildId ) span.text('@everyone').attr('title', '@everyone');
		else span.text(`@${( guildRoles.find( guildRole => guildRole.id === perm.id )?.name || 'UNKNOWN' )}`);
		permission.find('input[name="permission"]').attr('name', `permission-${perm.id}`);
		permission.find('input#wb-settings-permission-0').attr('id', `wb-settings-permission-${perm.id}-0`);
		permission.find('label[for="wb-settings-permission-0"]').attr('for', `wb-settings-permission-${perm.id}-0`);
		permission.find('input#wb-settings-permission-1').attr('id', `wb-settings-permission-${perm.id}-1`);
		permission.find('label[for="wb-settings-permission-1"]').attr('for', `wb-settings-permission-${perm.id}-1`);
		permission.find('input#wb-settings-permission-default').attr('id', `wb-settings-permission-${perm.id}-default`);
		permission.find('label[for="wb-settings-permission-default"]').attr('for', `wb-settings-permission-${perm.id}-default`);
		permission.find(`#wb-settings-permission-${perm.id}-${( perm.permission ? '1' : '0' )}`).attr('checked', '');
		return permission;
	} );
	fields.push(...perms);
	fields.push($(fieldset.save).val(dashboardLang.get('general.save')));
	var form = $('<fieldset>').append(
		$('<legend>').text(( slashCommand.default_permission ? dashboardLang.get('slash.form.default_allow') : dashboardLang.get('slash.form.default_deny') )),
		...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="radio"]:not(:checked), option').attr('disabled', '');
		form.find('input[type="submit"]').remove();
	}
	form.find('label.wb-settings-permission-deny').text(dashboardLang.get('slash.form.deny'));
	form.find('label.wb-settings-permission-allow').text(dashboardLang.get('slash.form.allow'));
	form.find('label.wb-settings-permission-default').text(dashboardLang.get('slash.form.default'));
	return $('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
		$('<h2>').html(dashboardLang.get('slash.form.entry', true, $('<code>').text('/' + slashCommand.name))),
		form
	);
}

/**
 * Let a user change slashs
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio')} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 * @param {import('./i18n.js')} dashboardLang - The user language
 */
function dashboard_slash(res, $, guild, args, dashboardLang) {
	let suffix = ( args[0] === 'owner' ? '?owner=true' : '' );
	$('#channellist #slash').after(
		...slashCommands.filter( slashCommand => slashCommand.id ).map( slashCommand => {
			return $('<a class="channel">').attr('id', `channel-${slashCommand.id}`).append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(slashCommand.name)
			).attr('title', slashCommand.name).attr('href', `/guild/${guild.id}/slash/${slashCommand.id}${suffix}`);
		} )
	);
	if ( args[4] ) {
		let slashCommand = slashCommands.find( slashCommand => args[4] === slashCommand.id );
		if ( slashCommand ) return got.get( `https://discord.com/api/v8/applications/${process.env.bot}/guilds/${guild.id}/commands/${slashCommand.id}/permissions`, {
			headers: {
				Authorization: `Bot ${process.env.token}`
			},
			timeout: 10000
		} ).then( response=> {
			var permissions = [];
			if ( response.statusCode !== 200 || !response.body ) {
				if ( response.statusCode !== 404 || response.body?.message !== 'Unknown application command permissions' ) {
					if ( response.statusCode === 403 && response.body?.message === 'Missing Access' ) {
						createNotice($, 'noslash', dashboardLang, [guild.id]);
					}
					else {
						console.log( '- Dashboard: ' + response.statusCode + ': Error while getting the slash command permissions: ' + response.body?.message );
						createNotice($, 'error', dashboardLang);
					}
					$('#text .description').html(dashboardLang.get('slash.explanation'));
					$('.channel#slash').addClass('selected');
					return;
				}
				else if ( slashCommand.name === 'verify' ) return db.query( 'SELECT 1 FROM verification WHERE guild = $1 LIMIT 1', [guild.id] ).then( ({rows}) => {
					if ( rows.length ) {
						$('<p>').html(dashboardLang.get('slash.desc', true, $('<code>').text(guild.name))).appendTo('#text .description');
						$(`.channel#channel-${slashCommand.id}`).addClass('selected');
						createForm($, slashCommand, dashboardLang, permissions, guild.id, guild.roles).attr('action', `/guild/${guild.id}/slash/${slashCommand.id}`).appendTo('#text');
						return;
					}
					res.writeHead(302, {Location: `/guild/${guild.id}/verification/new${suffix}` + ( suffix ? '&' : '?' ) + 'slash=noverify'});
					res.end();
					return true;
				}, dberror => {
					console.log( '- Dashboard: Error while checking for verifications: ' + dberror );
					res.writeHead(302, {Location: `/guild/${guild.id}/verification/new${suffix}` + ( suffix ? '&' : '?' ) + 'slash=noverify'});
					res.end();
					return true;
				} );
			}
			else permissions = response.body.permissions;
			$('<p>').html(dashboardLang.get('slash.desc', true, $('<code>').text(guild.name))).appendTo('#text .description');
			$(`.channel#channel-${slashCommand.id}`).addClass('selected');
			createForm($, slashCommand, dashboardLang, permissions, guild.id, guild.roles).attr('action', `/guild/${guild.id}/slash/${slashCommand.id}`).appendTo('#text');
		}, error => {
			console.log( '- Dashboard: Error while getting the slash command permissions: ' + error );
			createNotice($, 'error', dashboardLang);
			$('#text .description').html(dashboardLang.get('slash.explanation'));
			$('.channel#slash').addClass('selected');
		} ).then( isRedirected => {
			if ( isRedirected ) return;
			let body = $.html();
			res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
			res.write( body );
			return res.end();
		} );
	}
	$('#text .description').html(dashboardLang.get('slash.explanation'));
	$('.channel#slash').addClass('selected');
	let body = $.html();
	res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
	res.write( body );
	return res.end();
}

/**
 * Change slashs
 * @param {Function} res - The server response
 * @param {import('./util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String} type - The setting to change
 * @param {Object} settings - The new settings
 */
function update_slash(res, userSettings, guild, type, settings) {
	if ( !slashCommands.some( slashCommand => slashCommand.id === type ) ) {
		return res(`/guild/${guild}/slash`, 'savefail');
	}
	if ( !settings.save_settings ) {
		return res(`/guild/${guild}/slash/${type}`, 'savefail');
	}
	let roles = userSettings.guilds.isMember.get(guild).roles;
	var permissions = Object.keys(settings).filter( perm => roles.some( role => ( 'permission-' + role.id === perm ) ) || perm === 'permission-' + guild ).map( perm => {
		return {
			id: perm.replace( 'permission-', '' ), type: 1,
			permission: ( settings[perm] === '1' ? true : false )
		};
	} );
	sendMsg( {
		type: 'getMember',
		member: userSettings.user.id,
		guild: guild
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
		var commandName = slashCommands.find( slashCommand => slashCommand.id === type )?.name;
		return got.get( `https://discord.com/api/v8/applications/${process.env.bot}/guilds/${guild}/commands/${type}/permissions`, {
			headers: {
				Authorization: `Bot ${process.env.token}`
			},
			timeout: 10000
		} ).then( response=> {
			if ( response.statusCode !== 200 || !response.body ) {
				if ( response.statusCode === 403 && response.body?.message === 'Missing Access' ) {
					res(`/guild/${guild}/slash/${type}`, 'noslash', guild);
					return Promise.reject();
				}
				else if ( response.statusCode !== 404 || response.body?.message !== 'Unknown application command permissions' ) {
					console.log( '- Dashboard: ' + response.statusCode + ': Error while getting the old slash command permissions: ' + response.body?.message );
				}
				else if ( commandName === 'verify' ) return db.query( 'SELECT 1 FROM verification WHERE guild = $1 LIMIT 1', [guild] ).then( ({rows}) => {
					if ( rows.length ) return [];
					res(`/guild/${guild}/verification/new`, 'noverify');
					return Promise.reject();
				}, dberror => {
					console.log( '- Dashboard: Error while checking for verifications: ' + dberror );
					res(`/guild/${guild}/verification/new`, 'noverify');
					return Promise.reject();
				} );
				return [];
			}
			return response.body.permissions;
		}, error => {
			console.log( '- Dashboard: Error while getting the old slash command permissions: ' + error );
			return [];
		} ).then( oldPermissions => {
			return got.put( `https://discord.com/api/v8/applications/${process.env.bot}/guilds/${guild}/commands/${type}/permissions`, {
				headers: {
					Authorization: `Bot ${process.env.token}`
				},
				json: {permissions},
				timeout: 10000
			} ).then( response=> {
				if ( response.statusCode !== 200 || !response.body ) {
					console.log( '- Dashboard: ' + response.statusCode + ': Error while saving the slash command permissions: ' + response.body?.message );
					return res(`/guild/${guild}/slash/${type}`, 'savefail');
				}
				res(`/guild/${guild}/slash/${type}`, 'save');
				var changes = [
					...permissions.map( perm => {
						var oldPerm = oldPermissions.find( oldPerm => oldPerm.id === perm.id );
						if ( !oldPerm ) return {
							role: ( perm.id === guild ? '@everyone' : `<@&${perm.id}>` ),
							old: 'default',
							new: ( perm.permission ? 'allow' : 'deny' )
						};
						if ( perm.permission === oldPerm.permission ) return null;
						return {
							role: ( perm.id === guild ? '@everyone' : `<@&${perm.id}>` ),
							old: ( oldPerm.permission ? 'allow' : 'deny' ),
							new: ( perm.permission ? 'allow' : 'deny' )
						};
					} ).filter( change => change ),
					...oldPermissions.filter( oldPerm => !permissions.some( perm => perm.id === oldPerm.id ) ).map( oldPerm => {
						return {
							role: ( oldPerm.id === guild ? '@everyone' : `<@&${oldPerm.id}>` ),
							old: ( oldPerm.permission ? 'allow' : 'deny' ),
							new: 'default'
						};
					} )
				];
				if ( !changes.length ) return;
				return db.query( 'SELECT lang FROM discord WHERE guild = $1 AND channel IS NULL', [guild] ).then( ({rows:[channel]}) => {
					var lang = new Lang(channel?.lang);
					var text = lang.get('interaction.dashboard.updated', `<@${userSettings.user.id}>`, '/' + commandName);
					text += '\n' + changes.map( change => {
						return change.role + ': ~~`' + lang.get('interaction.dashboard.perm_' + change.old) + '`~~ → `' + lang.get('interaction.dashboard.perm_' + change.new) + '`';
					} ).join('\n');
					text += `\n<${new URL(`/guild/${guild}/slash/${type}`, process.env.dashboard).href}>`;
					sendMsg( {
						type: 'notifyGuild', guild, text
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				}, dberror => {
					console.log( '- Dashboard: Error while notifying the guild: ' + dberror );
				} );
			}, error => {
				console.log( '- Dashboard: Error while saving the slash command permissions: ' + error );
				return res(`/guild/${guild}/slash/${type}`, 'savefail');
			} );
		}, error => {
			if ( error ) {
				console.log( '- Dashboard: Error while getting the old slash command permissions: ' + error );
				return res(`/guild/${guild}/slash/${type}`, 'savefail');
			}
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the member: ' + error );
		return res(`/guild/${guild}/slash/${type}`, 'savefail');
	} );
}

module.exports = {
	get: dashboard_slash,
	post: update_slash
};
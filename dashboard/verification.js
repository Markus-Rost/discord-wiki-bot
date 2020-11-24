const {limit: {verification: verificationLimit}, usergroups} = require('../util/default.json');
const Lang = require('../util/i18n.js');
const {got, db, sendMsg, createNotice, hasPerm} = require('./util.js');

const fieldset = {
	channel: '<label for="wb-settings-channel">Channel:</label>'
	+ '<select id="wb-settings-channel" name="channel" required></select>'
	+ '<button type="button" id="wb-settings-channel-more" class="addmore">Add more</button>',
	role: '<label for="wb-settings-role">Role:</label>'
	+ '<select id="wb-settings-role" name="role" required></select>'
	+ '<button type="button" id="wb-settings-role-more" class="addmore">Add more</button>',
	usergroup: '<label for="wb-settings-usergroup">Wiki user group:</label>'
	+ '<input type="text" id="wb-settings-usergroup" name="usergroup" list="wb-settings-usergroup-list" autocomplete="on">'
	+ '<datalist id="wb-settings-usergroup-list">'
	+ usergroups.sorted.filter( group => group !== '__CUSTOM__' ).map( group => {
		return `<option value="${group}"></option>`
	} ).join('')
	+ usergroups.global.filter( group => group !== '__CUSTOM__' ).map( group => {
		return `<option value="${group}"></option>`
	} ).join('')
	+ '</datalist>'
	+ '<div id="wb-settings-usergroup-multiple">'
	+ '<label for="wb-settings-usergroup-and">Require all user groups:</label>'
	+ '<input type="checkbox" id="wb-settings-usergroup-and" name="usergroup_and">'
	+ '</div>',
	editcount: '<label for="wb-settings-editcount">Minimal edit count:</label>'
	+ '<input type="number" id="wb-settings-editcount" name="editcount" min="0" required>',
	accountage: '<label for="wb-settings-accountage">Account age (in days):</label>'
	+ '<input type="number" id="wb-settings-accountage" name="accountage" min="0" required>',
	rename: '<label for="wb-settings-rename">Rename users:</label>'
	+ '<input type="checkbox" id="wb-settings-rename" name="rename">',
	save: '<input type="submit" id="wb-settings-save" name="save_settings">',
	delete: '<input type="submit" id="wb-settings-delete" name="delete_settings" formnovalidate>'
};

/**
 * Create a settings form
 * @param {import('cheerio')} $ - The response body
 * @param {String} header - The form header
 * @param {import('./i18n.js')} dashboardLang - The user language
 * @param {Object} settings - The current settings
 * @param {String} settings.channel
 * @param {String} settings.role
 * @param {String} settings.usergroup
 * @param {Number} settings.editcount
 * @param {Number} settings.accountage
 * @param {Boolean} settings.rename
 * @param {String} [settings.defaultrole]
 * @param {import('./util.js').Channel[]} guildChannels - The guild channels
 * @param {import('./util.js').Role[]} guildRoles - The guild roles
 */
function createForm($, header, dashboardLang, settings, guildChannels, guildRoles) {
	var readonly = ( process.env.READONLY ? true : false );
	var fields = [];
	let channel = $('<div>').append(fieldset.channel);
	channel.find('label').text(dashboardLang.get('verification.form.channel'));
	let curCat = null;
	channel.find('#wb-settings-channel').append(
		$('<option class="wb-settings-channel-default defaultSelect" hidden>').val('').text('-- Select a Channel --'),
		...guildChannels.filter( guildChannel => {
			return ( hasPerm(guildChannel.userPermissions, 'VIEW_CHANNEL') || guildChannel.isCategory || settings.channel.includes( '|' + guildChannel.id + '|' ) );
		} ).map( guildChannel => {
			if ( guildChannel.isCategory ) {
				curCat = $('<optgroup>').attr('label', guildChannel.name);
				return curCat;
			}
			var optionChannel = $(`<option class="wb-settings-channel-${guildChannel.id}">`).val(guildChannel.id).text(`${guildChannel.id} – #${guildChannel.name}`);
			if ( !hasPerm(guildChannel.userPermissions, 'VIEW_CHANNEL') ) {
				optionChannel.addClass('wb-settings-error');
			}
			if ( !curCat ) return optionChannel;
			optionChannel.appendTo(curCat);
		} ).filter( catChannel => {
			if ( !catChannel ) return false;
			if ( catChannel.is('optgroup') && !catChannel.children('option').length ) return false;
			return true;
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
	role.find('label').text(dashboardLang.get('verification.form.role'));
	role.find('#wb-settings-role').append(
		$('<option class="wb-settings-role-default defaultSelect" hidden>').val('').text(dashboardLang.get('verification.form.select_role')),
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
		if ( role.find(`.wb-settings-role-${settings.defaultrole}`).length ) {
			role.find(`.wb-settings-role-${settings.defaultrole}`).attr('selected', '');
		}
		else role.find('.wb-settings-role-default').attr('selected', '');
		role.find('button.addmore').attr('hidden', '');
	}
	fields.push(role);
	let usergroup = $('<div>').append(fieldset.usergroup);
	usergroup.find('label').eq(0).text(dashboardLang.get('verification.form.usergroup'));
	usergroup.find('label').eq(1).text(dashboardLang.get('verification.form.usergroup_and'));
	if ( settings.usergroup.startsWith( 'AND|' ) ) {
		settings.usergroup = settings.usergroup.substring(4);
		usergroup.find('#wb-settings-usergroup-and').attr('checked', '');
	}
	usergroup.find('#wb-settings-usergroup').val(settings.usergroup.split('|').join(', '));
	if ( !settings.usergroup.includes( '|' ) ) {
		usergroup.find('#wb-settings-usergroup-multiple').attr('style', 'display: none;');
	}
	fields.push(usergroup);
	let editcount = $('<div>').append(fieldset.editcount);
	editcount.find('label').text(dashboardLang.get('verification.form.editcount'));
	editcount.find('#wb-settings-editcount').val(settings.editcount);
	fields.push(editcount);
	let accountage = $('<div>').append(fieldset.accountage);
	accountage.find('label').text(dashboardLang.get('verification.form.accountage'));
	accountage.find('#wb-settings-accountage').val(settings.accountage);
	fields.push(accountage);
	if ( settings.rename || guildChannels.some( guildChannel => {
		return hasPerm(guildChannel.botPermissions, 'MANAGE_NICKNAMES');
	} ) ) {
		let rename = $('<div>').append(fieldset.rename);
		rename.find('label').text(dashboardLang.get('verification.form.rename'));
		if ( settings.rename ) rename.find('#wb-settings-rename').attr('checked', '');
		fields.push(rename);
	}
	fields.push($(fieldset.save).val(dashboardLang.get('general.save')));
	if ( settings.channel ) {
		fields.push($(fieldset.delete).val(dashboardLang.get('general.delete')).attr('onclick', `return confirm('${dashboardLang.get('verification.form.confirm').replace( /'/g, '\\$&' )}');`));
	}
	var form = $('<fieldset>').append(...fields);
	if ( readonly ) {
		form.find('input').attr('readonly', '');
		form.find('input[type="checkbox"], option, optgroup').attr('disabled', '');
		form.find('input[type="submit"], button.addmore').remove();
	}
	form.find('button.addmore').text(dashboardLang.get('verification.form.more'));
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
 * @param {import('./i18n.js')} dashboardLang - The user language
 */
function dashboard_verification(res, $, guild, args, dashboardLang) {
	if ( !hasPerm(guild.botPermissions, 'MANAGE_ROLES') ) {
		createNotice($, 'missingperm', dashboardLang, ['Manage Roles']);
		$('#text .description').html(dashboardLang.get('verification.explanation'));
		$('.channel#verification').addClass('selected');
		let body = $.html();
		res.writeHead(200, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	}
	db.all( 'SELECT wiki, discord.role defaultrole, configid, verification.channel, verification.role, editcount, usergroup, accountage, rename FROM discord LEFT JOIN verification ON discord.guild = verification.guild WHERE discord.guild = ? AND discord.channel IS NULL ORDER BY configid ASC', [guild.id], function(dberror, rows) {
		if ( dberror ) {
			console.log( '- Dashboard: Error while getting the verifications: ' + dberror );
			createNotice($, 'error', dashboardLang);
			$('#text .description').html(dashboardLang.get('verification.explanation'));
			$('.channel#verification').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		if ( rows.length === 0 ) {
			createNotice($, 'nosettings', dashboardLang, [guild.id]);
			$('#text .description').html(dashboardLang.get('verification.explanation'));
			$('.channel#verification').addClass('selected');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		var wiki = rows[0].wiki;
		var defaultrole = rows[0].defaultrole;
		if ( rows.length === 1 && rows[0].configid === null ) rows.pop();
		$('<p>').html(dashboardLang.get('verification.desc', true, $('<code>').text(guild.name))).appendTo('#text .description');
		let suffix = ( args[0] === 'owner' ? '?owner=true' : '' );
		$('#channellist #verification').after(
			...rows.map( row => {
				return $('<a class="channel">').attr('id', `channel-${row.configid}`).append(
					$('<img>').attr('src', '/src/channel.svg'),
					$('<div>').text(`${row.configid} - ${( guild.roles.find( role => {
						return role.id === row.role.split('|')[0];
					} )?.name || guild.channels.find( channel => {
						return channel.id === row.channel.split('|')[1];
					} )?.name || row.usergroup.split('|')[( row.usergroup.startsWith('AND|') ? 1 : 0 )] )}`)
				).attr('href', `/guild/${guild.id}/verification/${row.configid}${suffix}`);
			} ),
			( process.env.READONLY || rows.length >= verificationLimit[( guild.patreon ? 'patreon' : 'default' )] ? '' :
			$('<a class="channel" id="channel-new">').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('verification.new'))
			).attr('href', `/guild/${guild.id}/verification/new${suffix}`) )
		);
		if ( args[4] === 'new' && !( process.env.READONLY || rows.length >= verificationLimit[( guild.patreon ? 'patreon' : 'default' )] ) ) {
			$('.channel#channel-new').addClass('selected');
			createForm($, dashboardLang.get('verification.form.new'), dashboardLang, {
				channel: '', role: '', usergroup: 'user',
				editcount: 0, accountage: 0, rename: false, defaultrole
			}, guild.channels, guild.roles).attr('action', `/guild/${guild.id}/verification/new`).appendTo('#text');
		}
		else if ( rows.some( row => row.configid.toString() === args[4] ) ) {
			let row = rows.find( row => row.configid.toString() === args[4] );
			$(`.channel#channel-${row.configid}`).addClass('selected');
			createForm($, dashboardLang.get('verification.form.entry', false, row.configid), dashboardLang, row, guild.channels, guild.roles).attr('action', `/guild/${guild.id}/verification/${row.configid}`).appendTo('#text');
		}
		else {
			$('.channel#verification').addClass('selected');
			$('#text .description').html(dashboardLang.get('verification.explanation'));
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
 * @param {String|Number} type - The setting to change
 * @param {Object} settings - The new settings
 * @param {String[]} settings.channel
 * @param {String[]} settings.role
 * @param {String[]} [settings.usergroup]
 * @param {String} [settings.usergroup_and]
 * @param {Number} settings.editcount
 * @param {Number} settings.accountage
 * @param {String} [settings.rename]
 * @param {String} [settings.save_settings]
 * @param {String} [settings.delete_settings]
 */
function update_verification(res, userSettings, guild, type, settings) {
	if ( type === 'default' ) {
		return res(`/guild/${guild}/verification`, 'savefail');
	}
	if ( !settings.save_settings === !settings.delete_settings ) {
		return res(`/guild/${guild}/verification/${type}`, 'savefail');
	}
	if ( settings.save_settings ) {
		if ( !/^[\d|]+ [\d|]+$/.test(`${settings.channel} ${settings.role}`) ) {
			return res(`/guild/${guild}/verification/${type}`, 'savefail');
		}
		if ( !/^\d+ \d+$/.test(`${settings.editcount} ${settings.accountage}`) ) {
			return res(`/guild/${guild}/verification/${type}`, 'savefail');
		}
		settings.channel = settings.channel.split('|').filter( (channel, i, self) => {
			return ( channel.length && self.indexOf(channel) === i );
		} );
		if ( !settings.channel.length || settings.channel.length > 10 ) {
			return res(`/guild/${guild}/verification/${type}`, 'savefail');
		}
		settings.role = settings.role.split('|').filter( (role, i, self) => {
			return ( role.length && self.indexOf(role) === i );
		} );
		if ( !settings.role.length || settings.role.length > 10 ) {
			return res(`/guild/${guild}/verification/${type}`, 'savefail');
		}
		if ( !settings.usergroup ) settings.usergroup = 'user';
		settings.usergroup = settings.usergroup.replace( /_/g, ' ' ).trim().toLowerCase();
		settings.usergroup = settings.usergroup.split(/\s*[,|]\s*/).map( usergroup => {
			if ( usergroup === '*' ) return 'user';
			return usergroup.replace( / /g, '_' );
		} ).filter( (usergroup, i, self) => {
			return ( usergroup.length && self.indexOf(usergroup) === i );
		} );
		if ( !settings.usergroup.length ) settings.usergroup.push('user');
		if ( settings.usergroup.length > 10 || settings.usergroup.some( usergroup => {
			return ( usergroup.length > 100 );
		} ) ) return res(`/guild/${guild}/verification/${type}`, 'invalidusergroup');
		settings.editcount = parseInt(settings.editcount, 10);
		settings.accountage = parseInt(settings.accountage, 10);
		if ( type === 'new' ) {
			let curGuild = userSettings.guilds.isMember.get(guild);
			if ( settings.channel.some( channel => {
				return !curGuild.channels.some( guildChannel => {
					return ( guildChannel.id === channel && !guildChannel.isCategory );
				} );
			} ) || settings.role.some( role => {
				return !curGuild.roles.some( guildRole => {
					return ( guildRole.id === role && guildRole.lower );
				} );
			} ) ) return res(`/guild/${guild}/verification/new`, 'savefail');
		}
	}
	if ( settings.delete_settings && type === 'new' ) {
		return res(`/guild/${guild}/verification/new`, 'savefail');
	}
	if ( type !== 'new' ) type = parseInt(type, 10);
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
		if ( settings.delete_settings ) return db.get( 'SELECT lang, verification.channel, verification.role, editcount, usergroup, accountage, rename FROM discord LEFT JOIN verification ON discord.guild = verification.guild AND configid = ? WHERE discord.guild = ? AND discord.channel IS NULL', [type, guild], function(dberror, row) {
			if ( !dberror && !row?.channel ) return res(`/guild/${guild}/verification`, 'save');
			db.run( 'DELETE FROM verification WHERE guild = ? AND configid = ?', [guild, type], function (delerror) {
				if ( delerror ) {
					console.log( '- Dashboard: Error while removing the verification: ' + delerror );
					return res(`/guild/${guild}/verification/${type}`, 'savefail');
				}
				console.log( `- Dashboard: Verification successfully removed: ${guild}#${type}` );
				res(`/guild/${guild}/verification`, 'save');
				if ( dberror ) {
					console.log( '- Dashboard: Error while notifying the guild: ' + dberror );
					return;
				}
				var lang = new Lang(row.lang);
				var text = lang.get('verification.dashboard.removed', `<@${userSettings.user.id}>`, type);
				if ( row ) {
					text += '\n' + lang.get('verification.channel') + ' <#' + row.channel.split('|').filter( channel => channel.length ).join('>, <#') + '>';
					text += '\n' + lang.get('verification.role') + ' <@&' + row.role.split('|').join('>, <@&') + '>';
					text += '\n' + lang.get('verification.editcount') + ' `' + row.editcount + '`';
					text += '\n' + lang.get('verification.usergroup') + ' `' + ( row.usergroup.startsWith( 'AND|' ) ? row.usergroup.split('|').slice(1).join('` ' + lang.get('verification.and') + ' `') : row.usergroup.split('|').join('` ' + lang.get('verification.or') + ' `') ) + '`';
					text += '\n' + lang.get('verification.accountage') + ' `' + row.accountage + '` ' + lang.get('verification.indays');
					text += '\n' + lang.get('verification.rename') + ' *`' + lang.get('verification.' + ( row.rename ? 'enabled' : 'disabled')) + '`*';
				}
				text += `\n<${new URL(`/guild/${guild}/verification`, process.env.dashboard).href}>`;
				sendMsg( {
					type: 'notifyGuild', guild, text
				} ).catch( error => {
					console.log( '- Dashboard: Error while notifying the guild: ' + error );
				} );
			} );
		} );
		if ( !hasPerm(response.botPermissions, 'MANAGE_ROLES') ) {
			return res(`/guild/${guild}/verification`, 'savefail');
		}
		if ( type === 'new' ) return db.get( 'SELECT wiki, lang, GROUP_CONCAT(configid) count FROM discord LEFT JOIN verification ON discord.guild = verification.guild WHERE discord.guild = ? AND discord.channel IS NULL', [guild], function(curerror, row) {
			if ( curerror ) {
				console.log( '- Dashboard: Error while checking for verifications: ' + curerror );
				return res(`/guild/${guild}/verification/new`, 'savefail');
			}
			if ( !row ) return res(`/guild/${guild}/verification`, 'savefail');
			if ( row.count === null ) row.count = [];
			else row.count = row.count.split(',').map( configid => parseInt(configid, 10) );
			if ( row.count.length >= verificationLimit[( response.patreon ? 'patreon' : 'default' )] ) {
				return res(`/guild/${guild}/verification`, 'savefail');
			}
			return got.get( row.wiki + 'api.php?action=query&meta=allmessages&amprefix=group-&amincludelocal=true&amenableparser=true&format=json' ).then( gresponse => {
				var body = gresponse.body;
				if ( gresponse.statusCode !== 200 || !body || !body.query || !body.query.allmessages ) {
					console.log( '- Dashboard: ' + gresponse.statusCode + ': Error while getting the usergroups: ' + body?.error?.info );
					return;
				}
				var groups = body.query.allmessages.filter( group => {
					if ( group.name === 'group-all' ) return false;
					if ( group.name === 'group-membership-link-with-expiry' ) return false;
					if ( group.name.endsWith( '.css' ) || group.name.endsWith( '.js' ) ) return false;
					return true;
				} ).map( group => {
					return {
						name: group.name.replace( /^group-/, '' ).replace( /-member$/, '' ),
						content: group['*'].replace( / /g, '_' ).toLowerCase()
					};
				} );
				settings.usergroup = settings.usergroup.map( usergroup => {
					if ( groups.some( group => group.name === usergroup ) ) return usergroup;
					if ( groups.some( group => group.content === usergroup ) ) {
						return groups.find( group => group.content === usergroup ).name;
					}
					if ( /^admins?$/.test(usergroup) ) return 'sysop';
					if ( usergroup === '*' ) return 'user';
					return usergroup;
				} );
			}, error => {
				console.log( '- Dashboard: Error while getting the usergroups: ' + error );
			} ).finally( () => {
				if ( settings.usergroup_and ) settings.usergroup.unshift('AND');
				var configid = 1;
				for ( let i of row.count ) {
					if ( configid === i ) configid++;
					else break;
				}
				db.run( 'INSERT INTO verification(guild, configid, channel, role, editcount, usergroup, accountage, rename) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', [guild, configid, '|' + settings.channel.join('|') + '|', settings.role.join('|'), settings.editcount, settings.usergroup.join('|'), settings.accountage, ( settings.rename ? 1 : 0 )], function (dberror) {
					if ( dberror ) {
						console.log( '- Dashboard: Error while adding the verification: ' + dberror );
						return res(`/guild/${guild}/verification/new`, 'savefail');
					}
					console.log( `- Dashboard: Verification successfully added: ${guild}#${configid}` );
					res(`/guild/${guild}/verification/${configid}`, 'save');
					var lang = new Lang(row.lang);
					var text = lang.get('verification.dashboard.added', `<@${userSettings.user.id}>`, configid);
					text += '\n' + lang.get('verification.channel') + ' <#' + settings.channel.join('>, <#') + '>';
					text += '\n' + lang.get('verification.role') + ' <@&' + settings.role.join('>, <@&') + '>';
					text += '\n' + lang.get('verification.editcount') + ' `' + settings.editcount + '`';
					text += '\n' + lang.get('verification.usergroup') + ' `' + ( settings.usergroup_and ? settings.usergroup.slice(1).join('` ' + lang.get('verification.and') + ' `') : settings.usergroup.join('` ' + lang.get('verification.or') + ' `') ) + '`';
					text += '\n' + lang.get('verification.accountage') + ' `' + settings.accountage + '` ' + lang.get('verification.indays');
					text += '\n' + lang.get('verification.rename') + ' *`' + lang.get('verification.' + ( settings.rename ? 'enabled' : 'disabled')) + '`*';
					text += `\n<${new URL(`/guild/${guild}/verification/${configid}`, process.env.dashboard).href}>`;
					if ( settings.rename && !hasPerm(response.botPermissions, 'MANAGE_NICKNAMES') ) {
						text += '\n\n' + lang.get('verification.rename_no_permission', `<@${process.env.bot}>`);
					}
					if ( settings.role.some( role => {
						return !userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
							return ( guildRole.id === role && guildRole.lower );
						} );
					} ) ) {
						text += '\n';
						settings.role.forEach( role => {
							if ( !userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
								return ( guildRole.id === role );
							} ) ) {
								text += '\n' + lang.get('verification.role_deleted', `<@&${role}>`);
							}
							else if ( userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
								return ( guildRole.id === role && !guildRole.lower );
							} ) ) {
								text += '\n' + lang.get('verification.role_too_high', `<@&${role}>`, `<@${process.env.bot}>`);
							}
						} );
					}
					sendMsg( {
						type: 'notifyGuild', guild, text
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
			} );
		} );
		return db.get( 'SELECT wiki, lang, verification.channel, verification.role, editcount, usergroup, accountage, rename FROM discord LEFT JOIN verification ON discord.guild = verification.guild AND verification.configid = ? WHERE discord.guild = ? AND discord.channel IS NULL', [type, guild], function(curerror, row) {
			if ( curerror ) {
				console.log( '- Dashboard: Error while checking for verifications: ' + curerror );
				return res(`/guild/${guild}/verification/${type}`, 'savefail');
			}
			if ( !row?.channel ) return res(`/guild/${guild}/verification`, 'savefail');
			row.channel = row.channel.split('|').filter( channel => channel.length );
			var newChannel = settings.channel.filter( channel => !row.channel.includes( channel ) );
			row.role = row.role.split('|');
			var newRole = settings.role.filter( role => !row.role.includes( role ) );
			row.usergroup = row.usergroup.split('|');
			var newUsergroup = settings.usergroup.filter( group => !row.usergroup.includes( group ) );
			if ( newChannel.length || newRole.length ) {
				let curGuild = userSettings.guilds.isMember.get(guild);
				if ( newChannel.some( channel => {
					return !curGuild.channels.some( guildChannel => {
						return ( guildChannel.id === channel && !guildChannel.isCategory );
					} );
				} ) || newRole.some( role => {
					return !curGuild.roles.some( guildRole => {
						return ( guildRole.id === role && guildRole.lower );
					} );
				} ) ) return res(`/guild/${guild}/verification/${type}`, 'savefail');
			}
			( newUsergroup.length ? got.get( row.wiki + 'api.php?action=query&meta=allmessages&amprefix=group-&amincludelocal=true&amenableparser=true&format=json' ).then( gresponse => {
				var body = gresponse.body;
				if ( gresponse.statusCode !== 200 || !body || !body.query || !body.query.allmessages ) {
					console.log( '- Dashboard: ' + gresponse.statusCode + ': Error while getting the usergroups: ' + body?.error?.info );
					return;
				}
				var groups = body.query.allmessages.filter( group => {
					if ( group.name === 'group-all' ) return false;
					if ( group.name === 'group-membership-link-with-expiry' ) return false;
					if ( group.name.endsWith( '.css' ) || group.name.endsWith( '.js' ) ) return false;
					return true;
				} ).map( group => {
					return {
						name: group.name.replace( /^group-/, '' ).replace( /-member$/, '' ),
						content: group['*'].replace( / /g, '_' ).toLowerCase()
					};
				} );
				settings.usergroup = settings.usergroup.map( usergroup => {
					if ( groups.some( group => group.name === usergroup ) ) return usergroup;
					if ( groups.some( group => group.content === usergroup ) ) {
						return groups.find( group => group.content === usergroup ).name;
					}
					if ( /^admins?$/.test(usergroup) ) return 'sysop';
					if ( usergroup === '*' ) return 'user';
					return usergroup;
				} );
			}, error => {
				console.log( '- Dashboard: Error while getting the usergroups: ' + error );
			} ) : Promise.resolve() ).finally( () => {
				if ( settings.usergroup_and ) settings.usergroup.unshift('AND');
				var lang = new Lang(row.lang);
				var diff = [];
				if ( newChannel.length || row.channel.some( channel => {
					return !settings.channel.includes( channel );
				} ) ) {
					diff.push(lang.get('verification.channel') + ` ~~<#${row.channel.join('>, <#')}>~~ → <#${settings.channel.join('>, <#')}>`);
				}
				if ( newRole.length || row.role.some( role => {
					return !settings.role.includes( role );
				} ) ) {
					diff.push(lang.get('verification.role') + ` ~~<@&${row.role.join('>, <@&')}>~~ → <@&${settings.role.join('>, <@&')}>`);
				}
				if ( row.editcount !== settings.editcount ) {
					diff.push(lang.get('verification.editcount') + ` ~~\`${row.editcount}\`~~ → \`${settings.editcount}\``);
				}
				if ( newUsergroup.length || row.usergroup.some( usergroup => {
					return !settings.usergroup.includes( usergroup );
				} ) ) {
					diff.push(lang.get('verification.usergroup') + ' ~~`' + ( row.usergroup[0] === 'AND' ? row.usergroup.slice(1).join('` ' + lang.get('verification.and') + ' `') : row.usergroup.join('` ' + lang.get('verification.or') + ' `') ) + '`~~ → `' + ( settings.usergroup_and ? settings.usergroup.slice(1).join('` ' + lang.get('verification.and') + ' `') : settings.usergroup.join('` ' + lang.get('verification.or') + ' `') ) + '`');
				}
				if ( row.accountage !== settings.accountage ) {
					diff.push(lang.get('verification.accountage') + ` ~~\`${row.accountage}\`~~ → \`${settings.accountage}\``);
				}
				if ( row.rename !== ( settings.rename ? 1 : 0 ) ) {
					diff.push(lang.get('verification.rename') + ` ~~*\`${lang.get('verification.' + ( row.rename ? 'enabled' : 'disabled'))}\`*~~ → *\`${lang.get('verification.' + ( settings.rename ? 'enabled' : 'disabled'))}\`*`);
				}
				if ( !diff.length ) return res(`/guild/${guild}/verification/${type}`, 'save');
				db.run( 'UPDATE verification SET channel = ?, role = ?, editcount = ?, usergroup = ?, accountage = ?, rename = ? WHERE guild = ? AND configid = ?', ['|' + settings.channel.join('|') + '|', settings.role.join('|'), settings.editcount, settings.usergroup.join('|'), settings.accountage, ( settings.rename ? 1 : 0 ), guild, type], function (dberror) {
					if ( dberror ) {
						console.log( '- Dashboard: Error while updating the verification: ' + dberror );
						return res(`/guild/${guild}/verification/${type}`, 'savefail');
					}
					console.log( `- Dashboard: Verification successfully updated: ${guild}#${type}` );
					res(`/guild/${guild}/verification/${type}`, 'save');
					var text = lang.get('verification.dashboard.updated', `<@${userSettings.user.id}>`, type);
					text += '\n' + diff.join('\n');
					text += `\n<${new URL(`/guild/${guild}/verification/${type}`, process.env.dashboard).href}>`;
					if ( settings.rename && !hasPerm(response.botPermissions, 'MANAGE_NICKNAMES') ) {
						text += '\n\n' + lang.get('verification.rename_no_permission', `<@${process.env.bot}>`);
					}
					if ( settings.role.some( role => {
						return !userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
							return ( guildRole.id === role && guildRole.lower );
						} );
					} ) ) {
						text += '\n';
						settings.role.forEach( role => {
							if ( !userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
								return ( guildRole.id === role );
							} ) ) {
								text += '\n' + lang.get('verification.role_deleted', `<@&${role}>`);
							}
							else if ( userSettings.guilds.isMember.get(guild).roles.some( guildRole => {
								return ( guildRole.id === role && !guildRole.lower );
							} ) ) {
								text += '\n' + lang.get('verification.role_too_high', `<@&${role}>`, `<@${process.env.bot}>`);
							}
						} );
					}
					sendMsg( {
						type: 'notifyGuild', guild, text
					} ).catch( error => {
						console.log( '- Dashboard: Error while notifying the guild: ' + error );
					} );
				} );
			} );
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the member: ' + error );
		return res(`/guild/${guild}/verification/${type}`, 'savefail');
	} );
}

module.exports = {
	get: dashboard_verification,
	post: update_verification
};
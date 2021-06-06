const help_setup = require('../functions/helpsetup.js');
const {limit: {verification: verificationLimit}} = require('../util/default.json');
var db = require('../util/database.js');
const slashCommand = require('../util/functions.js').slashCommands.find( slashCommand => slashCommand.name === 'verify' );

/**
 * Processes the "verification" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 */
function cmd_verification(lang, msg, args, line, wiki) {
	if ( !msg.isAdmin() ) {
		if ( msg.channel.isGuild() && !pause[msg.guild.id] ) this.verify(lang, msg, args, line, wiki);
		else msg.reactEmoji('❌');
		return;
	}
	if ( msg.defaultSettings ) return help_setup(lang, msg);
	if ( !msg.guild.me.permissions.has('MANAGE_ROLES') ) {
		console.log( msg.guild.id + ': Missing permissions - MANAGE_ROLES' );
		return msg.replyMsg( lang.get('general.missingperm') + ' `MANAGE_ROLES`' );
	}
	
	db.query( 'SELECT configid, channel, role, editcount, postcount, usergroup, accountage, rename FROM verification WHERE guild = $1 ORDER BY configid ASC', [msg.guild.id] ).then( ({rows}) => {
		var prefix = ( patreons[msg.guild.id] || process.env.prefix );
		var button = {
			type: 2,
			style: 5,
			label: lang.get('settings.button'),
			emoji: {
				id: '588723255972593672',
				name: 'wikibot',
				animated: false
			},
			url: new URL(`/guild/${msg.guild.id}/verification`, process.env.dashboard).href,
			disabled: false
		};
		var components = [];
		if ( process.env.dashboard ) components.push({
			type: 1,
			components: [
				button
			]
		});
		if ( args[0] && args[0].toLowerCase() === 'add' ) {
			var limit = verificationLimit[( patreons[msg.guild.id] ? 'patreon' : 'default' )];
			if ( rows.length >= limit ) return msg.replyMsg( lang.get('verification.max_entries'), {}, true );
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			button.url = new URL(`/guild/${msg.guild.id}/verification/new`, process.env.dashboard).href;
			var roles = args.slice(1).join(' ').split('|').map( role => role.replace( /^\s*<?\s*(.*?)\s*>?\s*$/, '$1' ) ).filter( role => role.length );
			if ( !roles.length ) return msg.replyMsg( lang.get('verification.no_role') + '\n`' + prefix + 'verification add ' + lang.get('verification.new_role') + '`', {components}, true );
			if ( roles.length > 10 ) return msg.replyMsg( lang.get('verification.role_max'), {components}, true );
			roles = roles.map( role => {
				var new_role = ['', null];
				if ( role.startsWith( '-' ) ) {
					role = role.replace( '-', '' );
					new_role[0] = '-';
				}
				if ( /^\d+$/.test(role) ) new_role[1] = msg.guild.roles.cache.get(role);
				if ( !new_role[1] ) new_role[1] = msg.guild.roles.cache.find( gc => gc.name === role.replace( /^@/, '' ) );
				if ( !new_role[1] ) new_role[1] = msg.guild.roles.cache.find( gc => gc.name.toLowerCase() === role.toLowerCase().replace( /^@/, '' ) );
				return new_role;
			} );
			if ( roles.some( role => !role[1] ) ) return msg.replyMsg( lang.get('verification.role_missing'), {components}, true );
			if ( roles.some( role => role[1].managed || role[1].id === msg.guild.id ) ) return msg.replyMsg( lang.get('verification.role_managed'), {components}, true );
			roles = roles.map( role => role[0] + role[1].id ).join('|');
			var new_configid = 1;
			for ( let i of rows.map( row => row.configid ) ) {
				if ( new_configid === i ) new_configid++;
				else break;
			}
			return db.query( 'INSERT INTO verification(guild, configid, channel, role) VALUES($1, $2, $3, $4)', [msg.guild.id, new_configid, '|' + msg.channel.id + '|', roles] ).then( () => {
				console.log( '- Verification successfully added.' );
				if ( !rows.length && slashCommand?.id ) msg.client.api.applications(msg.client.user.id).guilds(msg.guild.id).commands(slashCommand.id).permissions.put( {
					data: {
						permissions: [
							{
								id: msg.guild.id,
								type: 1,
								permission: true
							}
						]
					}
				} ).then( () => {
					console.log( '- Slash command successfully enabled.' );
				}, error => {
					console.log( '- Error while enabling the slash command: ' + error );
				} );
				msg.replyMsg( lang.get('verification.added') + formatVerification(false, false, {configid: new_configid, role: roles}), {components}, true );
			}, dberror => {
				console.log( '- Error while adding the verification: ' + dberror );
				msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
			} );
		}
		if ( !rows.some( row => row.configid.toString() === args[0] ) ) {
			if ( args.length ) {
				if ( !pause[msg.guild.id] ) this.verify(lang, msg, args, line, wiki);
				return;
			}
			var text = '';
			if ( rows.length ) {
				text += lang.get('verification.current');
				if ( process.env.dashboard ) text += `\n<${button.url}>`;
				text += rows.map( row => formatVerification(false, true, row) ).join('');
			}
			else {
				text += lang.get('verification.missing');
				if ( process.env.dashboard ) text += `\n<${button.url}>`;
			}
			text += '\n\n' + lang.get('verification.add_more') + '\n`' + prefix + 'verification add ' + lang.get('verification.new_role') + '`';
			return msg.sendChannel( '<@' + msg.author.id + '>, ' + text, {split:true,components}, true );
		}
		var row = rows.find( row => row.configid.toString() === args[0] );
		if ( args[1] ) args[1] = args[1].toLowerCase();
		if ( args[1] === 'delete' && !args.slice(2).join('') ) {
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			return db.query( 'DELETE FROM verification WHERE guild = $1 AND configid = $2', [msg.guild.id, row.configid] ).then( () => {
				console.log( '- Verification successfully removed.' );
				if ( rows.length === 1 && slashCommand?.id ) msg.client.api.applications(msg.client.user.id).guilds(msg.guild.id).commands(slashCommand.id).permissions.put( {
					data: {
						permissions: []
					}
				} ).then( () => {
					console.log( '- Slash command successfully disabled.' );
				}, error => {
					console.log( '- Error while disabling the slash command: ' + error );
				} );
				msg.replyMsg( lang.get('verification.deleted'), {components}, true );
			}, dberror => {
				console.log( '- Error while removing the verification: ' + dberror );
				button.url = new URL(`/guild/${msg.guild.id}/verification/${row.configid}`, process.env.dashboard).href;
				msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
			} );
		}
		button.url = new URL(`/guild/${msg.guild.id}/verification/${row.configid}`, process.env.dashboard).href;
		if ( args[1] === 'rename' && !args.slice(2).join('') ) {
			if ( !row.rename && !msg.guild.me.permissions.has('MANAGE_NICKNAMES') ) {
				console.log( msg.guild.id + ': Missing permissions - MANAGE_NICKNAMES' );
				return msg.replyMsg( lang.get('general.missingperm') + ' `MANAGE_NICKNAMES`' );
			}
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			return db.query( 'UPDATE verification SET rename = $1 WHERE guild = $2 AND configid = $3', [( row.rename ? 0 : 1 ), msg.guild.id, row.configid] ).then( () => {
				console.log( '- Verification successfully updated.' );
				row.rename = ( row.rename ? 0 : 1 );
				msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.updated') + formatVerification(), {split:true,components}, true );
			}, dberror => {
				console.log( '- Error while updating the verification: ' + dberror );
				msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
			} );
		}
		if ( args[2] ) {
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			args[2] = args.slice(2).join(' ').replace( /^\s*<?\s*(.*?)\s*>?\s*$/, '$1' );
			if ( args[1] === 'channel' ) {
				var channels = args[2].replace( /\s*>?\s*[,|]\s*<?\s*/g, '|' ).split('|').filter( channel => channel.length );
				if ( channels.length > 10 ) return msg.replyMsg( lang.get('verification.channel_max'), {components}, true );
				channels = channels.map( channel => {
					var new_channel = '';
					if ( /^\d+$/.test(channel) ) new_channel = msg.guild.channels.cache.filter( tc => tc.isGuild() ).get(channel);
					if ( !new_channel ) new_channel = msg.guild.channels.cache.filter( gc => gc.isGuild() ).find( gc => gc.name === channel.replace( /^#/, '' ) );
					if ( !new_channel ) new_channel = msg.guild.channels.cache.filter( gc => gc.isGuild() ).find( gc => gc.name.toLowerCase() === channel.toLowerCase().replace( /^#/, '' ) );
					return new_channel;
				} );
				if ( channels.some( channel => !channel ) ) return msg.replyMsg( lang.get('verification.channel_missing'), {components}, true );
				channels = channels.map( channel => channel.id ).join('|');
				if ( channels.length ) return db.query( 'UPDATE verification SET channel = $1 WHERE guild = $2 AND configid = $3', ['|' + channels + '|', msg.guild.id, row.configid] ).then( () => {
					console.log( '- Verification successfully updated.' );
					row.channel = '|' + channels + '|';
					msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.updated') + formatVerification(), {split:true,components}, true );
				}, dberror => {
					console.log( '- Error while updating the verification: ' + dberror );
					msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
				} );
			}
			if ( args[1] === 'role' ) {
				var roles = args[2].replace( /\s*>?\s*[,|]\s*<?\s*/g, '|' ).split('|').filter( role => role.length );
				if ( roles.length > 10 ) return msg.replyMsg( lang.get('verification.role_max'), {components}, true );
				roles = roles.map( role => {
					var new_role = ['', null];
					if ( role.startsWith( '-' ) ) {
						role = role.replace( '-', '' );
						new_role[0] = '-';
					}
					if ( /^\d+$/.test(role) ) new_role[1] = msg.guild.roles.cache.get(role);
					if ( !new_role[1] ) new_role[1] = msg.guild.roles.cache.find( gc => gc.name === role.replace( /^@/, '' ) );
					if ( !new_role[1] ) new_role[1] = msg.guild.roles.cache.find( gc => gc.name.toLowerCase() === role.toLowerCase().replace( /^@/, '' ) );
					return new_role;
				} );
				if ( roles.some( role => !role[1] ) ) return msg.replyMsg( lang.get('verification.role_missing'), {components}, true );
				if ( roles.some( role => role[1].managed || role[1].id === msg.guild.id ) ) return msg.replyMsg( lang.get('verification.role_managed'), {components}, true );
				roles = roles.map( role => role[0] + role[1].id ).join('|');
				if ( roles.length ) return db.query( 'UPDATE verification SET role = $1 WHERE guild = $2 AND configid = $3', [roles, msg.guild.id, row.configid] ).then( () => {
					console.log( '- Verification successfully updated.' );
					row.role = roles;
					msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.updated') + formatVerification(), {split:true,components}, true );
				}, dberror => {
					console.log( '- Error while updating the verification: ' + dberror );
					msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
				} );
			}
			if ( ( ( args[1] === 'editcount' || args[1] === 'accountage' ) && /^\d+$/.test(args[2]) ) || ( args[1] === 'postcount' && /^(?:-?\d+|null)$/.test(args[2]) ) ) {
				args[2] = parseInt(args[2], 10);
				if ( isNaN(args[2]) ) args[2] = null;
				if ( args[2] > 1000000 || args[2] < -1000000 ) {
					return msg.replyMsg( lang.get('verification.value_too_high'), {components}, true );
				}
				return db.query( 'UPDATE verification SET ' + args[1] + ' = $1 WHERE guild = $2 AND configid = $3', [args[2], msg.guild.id, row.configid] ).then( () => {
					console.log( '- Verification successfully updated.' );
					row[args[1]] = args[2];
					msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.updated') + formatVerification(), {split:true,components}, true );
				}, dberror => {
					console.log( '- Error while updating the verification: ' + dberror );
					msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
				} );
			}
			if ( args[1] === 'usergroup' ) {
				var usergroups = args[2].replace( /\s*>?\s*[,|]\s*<?\s*/g, '|' ).replace( / /g, '_' ).toLowerCase().split('|').filter( usergroup => usergroup.length );
				var and_or = '';
				if ( /^\s*AND\s*\|/.test(args[2]) ) {
					usergroups = usergroups.slice(1);
					and_or = 'AND|';
				}
				if ( usergroups.length > 10 ) return msg.replyMsg( lang.get('verification.usergroup_max'), {components}, true );
				if ( usergroups.some( usergroup => usergroup.length > 100 ) ) return msg.replyMsg( lang.get('verification.usergroup_too_long'), {components}, true );
				if ( usergroups.length ) return msg.reactEmoji('⏳').then( reaction => got.get( wiki + 'api.php?action=query&meta=allmessages&amprefix=group-&amincludelocal=true&amenableparser=true&format=json' ).then( response => {
					var body = response.body;
					if ( body && body.warnings ) log_warn(body.warnings);
					if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.allmessages ) {
						if ( wiki.noWiki(response.url, response.statusCode) ) console.log( '- This wiki doesn\'t exist!' );
						else console.log( '- ' + response.statusCode + ': Error while getting the usergroups: ' + ( body && body.error && body.error.info ) );
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
					usergroups = usergroups.map( usergroup => {
						if ( groups.some( group => group.name === usergroup ) ) return usergroup;
						if ( groups.some( group => group.content === usergroup ) ) {
							return groups.find( group => group.content === usergroup ).name;
						}
						if ( /^admins?$/.test(usergroup) ) return 'sysop';
						if ( usergroup === '*' ) return 'user';
						return usergroup;
					} );
				}, error => {
					console.log( '- Error while getting the usergroups: ' + error );
				} ).finally( () => {
					usergroups = usergroups.join('|');
					db.query( 'UPDATE verification SET usergroup = $1 WHERE guild = $2 AND configid = $3', [and_or + usergroups, msg.guild.id, row.configid] ).then( () => {
						console.log( '- Verification successfully updated.' );
						row.usergroup = and_or + usergroups;
						msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.updated') + formatVerification(), {split:true,components}, true );
						
						if ( reaction ) reaction.removeEmoji();
					}, dberror => {
						console.log( '- Error while updating the verification: ' + dberror );
						msg.replyMsg( lang.get('verification.save_failed'), {components}, true );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				} ) );
			}
		}
		return msg.sendChannel( '<@' + msg.author.id + '>, ' + lang.get('verification.current_selected', row.configid) + ( process.env.dashboard ? `\n<${button.url}>` : '' ) + formatVerification(true) +'\n\n' + lang.get('verification.delete_current') + '\n`' + prefix + 'verification ' + row.configid + ' delete`', {split:true,components}, true );
		
		function formatVerification(showCommands, hideNotice, {
			configid,
			channel = '|' + msg.channel.id + '|',
			role = '',
			editcount = 0,
			postcount = 0,
			usergroup = 'user',
			accountage = 0,
			rename = 0
		} = row) {
			var roles = [
				role.split('|').filter( roleid => !roleid.startsWith( '-' ) ),
				role.split('|').filter( roleid => roleid.startsWith( '-' ) ).map( roleid => roleid.replace( '-', '' ) )
			];
			var verification_text = '\n\n`' + prefix + 'verification ' + configid + '`';
			verification_text += '\n' + lang.get('verification.channel') + ' <#' + channel.split('|').filter( channel => channel.length ).join('>, <#') + '>';
			if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' channel ' + lang.get('verification.new_channel') + '`\n';
			if ( roles[0].length ) verification_text += '\n' + lang.get('verification.role_add') + ' <@&' + roles[0].join('>, <@&') + '>';
			if ( roles[1].length ) verification_text += '\n' + lang.get('verification.role_remove') + ' <@&' + roles[1].join('>, <@&') + '>';
			if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' role ' + lang.get('verification.new_role') + '`\n';
			if ( postcount === null ) verification_text += '\n' + lang.get('verification.posteditcount') + ' `' + editcount + '`';
			else verification_text += '\n' + lang.get('verification.editcount') + ' `' + editcount + '`';
			if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' editcount ' + lang.get('verification.new_editcount') + '`\n';
			if ( postcount !== null ) {
				verification_text += '\n' + lang.get('verification.postcount') + ' `' + Math.abs(postcount) + '`';
				if ( postcount < 0 ) verification_text += ' ' + lang.get('verification.postcount_or');
				if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' postcount ' + ( postcount < 0 ? '-' : '' ) + lang.get('verification.new_postcount') + '`\n';
			}
			verification_text += '\n' + lang.get('verification.usergroup') + ' `' + ( usergroup.startsWith( 'AND|' ) ? usergroup.split('|').slice(1).join('` ' + lang.get('verification.and') + ' `') : usergroup.split('|').join('` ' + lang.get('verification.or') + ' `') ) + '`';
			if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' usergroup ' + lang.get('verification.new_usergroup') + '`\n';
			verification_text += '\n' + lang.get('verification.accountage') + ' `' + accountage + '` ' + lang.get('verification.indays');
			if ( showCommands ) verification_text += '\n`' + prefix + 'verification ' + row.configid + ' accountage ' + lang.get('verification.new_accountage') + '`\n';
			verification_text += '\n' + lang.get('verification.rename') + ' *`' + lang.get('verification.' + ( rename ? 'enabled' : 'disabled')) + '`*';
			if ( showCommands ) verification_text += ' ' + lang.get('verification.toggle') + '\n`' + prefix + 'verification ' + row.configid + ' rename`\n';
			if ( !hideNotice && rename && !msg.guild.me.permissions.has('MANAGE_NICKNAMES') ) {
				verification_text += '\n\n' + lang.get('verification.rename_no_permission', msg.guild.me.toString());
			}
			if ( !hideNotice && role.replace( /-/g, '' ).split('|').some( role => {
				return ( !msg.guild.roles.cache.has(role) || msg.guild.me.roles.highest.comparePositionTo(role) <= 0 );
			} ) ) {
				verification_text += '\n';
				role.replace( /-/g, '' ).split('|').forEach( role => {
					if ( !msg.guild.roles.cache.has(role) ) {
						verification_text += '\n' + lang.get('verification.role_deleted', '<@&' + role + '>');
					}
					else if ( msg.guild.me.roles.highest.comparePositionTo(role) <= 0 ) {
						verification_text += '\n' + lang.get('verification.role_too_high', '<@&' + role + '>', msg.guild.me.toString());
					}
				} );
			}
			return verification_text;
		}
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		msg.reactEmoji('error', true);
	} );
}

module.exports = {
	name: 'verification',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_verification
};
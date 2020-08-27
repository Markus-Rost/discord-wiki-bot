const {MessageEmbed, Util} = require('discord.js');
const {defaultSettings, defaultPermissions} = require('../util/default.json');
var db = require('../util/database.js');

/**
 * Processes the "get" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {String} wiki - The wiki for the message.
 * @async
 */
async function cmd_get(lang, msg, args, line, wiki) {
	var id = args.join().replace( /^\\?<(?:@!?|#)(\d+)>$/, '$1' );
	if ( /^\d+$/.test(id) ) {
		var guild = await msg.client.shard.broadcastEval( `if ( this.guilds.cache.has('${id}') ) {
			var {name, id, memberCount, ownerID, owner, me: {permissions}} = this.guilds.cache.get('${id}');
			( {
				name, id, memberCount, ownerID,
				owner: owner?.user?.tag,
				permissions: permissions.missing(${defaultPermissions}),
				pause: id in global.pause,
				voice: id in global.voice,
				shardId: global.shardId
			} )
		}` ).then( results => results.find( result => result !== null ) );
		if ( guild ) {
			var guildname = ['Guild:', guild.name.escapeFormatting() + ' `' + guild.id + '`' + ( guild.pause ? '\\*' : '' )];
			var guildowner = ['Owner:', ( guild.owner ? guild.owner.escapeFormatting() + ' ' : '' ) + '`' + guild.ownerID + '` <@' + guild.ownerID + '>'];
			var guildsize = ['Size:', guild.memberCount + ' members'];
			var guildshard = ['Shard:', guild.shardId];
			var guildpermissions = ['Missing permissions:', ( guild.permissions.length ? '`' + guild.permissions.join('`, `') + '`' : '*none*' )];
			var guildsettings = ['Settings:', '*unknown*'];
			
			return db.all( 'SELECT channel, prefix, lang, wiki, inline FROM discord WHERE guild = ? ORDER BY channel ASC', [guild.id], (dberror, rows) => {
				if ( dberror ) {
					console.log( '- Error while getting the settings: ' + dberror );
				}
				else if ( rows.length ) {
					row = rows.find( row => !row.channel );
					row.patreon = guild.id in patreons;
					row.voice = guild.voice;
					guildsettings[1] = '```json\n' + JSON.stringify( rows, null, '\t' ) + '\n```';
				}
				else guildsettings[1] = '*default*';
				
				if ( msg.showEmbed() ) {
					var embed = new MessageEmbed().addField( guildname[0], guildname[1] ).addField( guildowner[0], guildowner[1] ).addField( guildsize[0], guildsize[1], true ).addField( guildshard[0], guildshard[1], true ).addField( guildpermissions[0], guildpermissions[1] );
					var split = Util.splitMessage( guildsettings[1], {char:',\n',maxLength:1000,prepend:'```json\n',append:',\n```'} );
					if ( split.length > 5 ) {
						msg.sendChannel( '', {embed}, true );
						msg.sendChannel( guildsettings.join(' '), {split:{char:',\n',prepend:'```json\n',append:',\n```'}}, true );
					}
					else {
						split.forEach( guildsettingspart => embed.addField( guildsettings[0], guildsettingspart ) );
						msg.sendChannel( '', {embed}, true );
					}
				}
				else {
					var text = guildname.join(' ') + '\n' + guildowner.join(' ') + '\n' + guildsize.join(' ') + '\n' + guildshard.join(' ') + '\n' + guildpermissions.join(' ') + '\n' + guildsettings.join(' ');
					msg.sendChannel( text, {split:{char:',\n',prepend:'```json\n',append:',\n```'}}, true );
				}
			} );
		}
		
		var channel = await msg.client.shard.broadcastEval( `if ( this.channels.cache.filter( channel => channel.type === 'text' ).has('${id}') ) {
			var {name, id, guild: {name: guild, id: guildID, me}} = this.channels.cache.get('${id}');
			( {
				name, id, guild, guildID,
				permissions: me.permissionsIn(id).missing(${defaultPermissions}),
				pause: guildID in global.pause,
				shardId: global.shardId
			} )
		}` ).then( results => results.find( result => result !== null ) );
		if ( channel ) {
			var channelguild = ['Guild:', channel.guild.escapeFormatting() + ' `' + channel.guildID + '`' + ( channel.pause ? '\\*' : '' )];
			var channelname = ['Channel:', '#' + channel.name.escapeFormatting() + ' `' + channel.id + '` <#' + channel.id + '>'];
			var channelpermissions = ['Missing permissions:', ( channel.permissions.length ? '`' + channel.permissions.join('`, `') + '`' : '*none*' )];
			var channellang = ['Language:', '*unknown*'];
			var channelwiki = ['Default Wiki:', '*unknown*'];
			var channelinline = ['Inline commands:', '*unknown*'];
			
			return db.get( 'SELECT lang, wiki, inline FROM discord WHERE guild = ? AND (channel = ? OR channel IS NULL) ORDER BY channel DESC', [channel.guildID, channel.id], (dberror, row) => {
				if ( dberror ) {
					console.log( '- Error while getting the settings: ' + dberror );
				}
				else if ( row ) {
					channellang[1] = row.lang;
					channelwiki[1] = row.wiki;
					channelinline[1] = ( row.inline ? 'disabled' : 'enabled' );
				}
				else {
					channellang[1] = defaultSettings.lang;
					channelwiki[1] = defaultSettings.wiki;
					channelinline[1] = 'enabled';
				}
				
				if ( msg.showEmbed() ) {
					var text = '';
					var embed = new MessageEmbed().addField( channelguild[0], channelguild[1] ).addField( channelname[0], channelname[1] ).addField( channelpermissions[0], channelpermissions[1] ).addField( channellang[0], channellang[1] ).addField( channelwiki[0], channelwiki[1] ).addField( channelinline[0], channelinline[1] );
				}
				else {
					var embed = {};
					var text = channelguild.join(' ') + '\n' + channelname.join(' ') + '\n' + channelpermissions.join(' ') + '\n' + channellang.join(' ') + '\n' + channelwiki[0] + ' <' + channelwiki[1] + '>\n' + channelinline.join(' ');
				}
				msg.sendChannel( text, {embed}, true );
			} );
		}
		
		var user = await msg.client.users.fetch(id, false).catch( () => {} );
		if ( user ) {
			var username = ['User:', user.tag.escapeFormatting() + ' `' + user.id + '` <@' + user.id + '>'];
			var guildlist = ['Guilds:', '*none*'];
			var guilds = await msg.client.shard.broadcastEval( `this.guilds.cache.filter( guild => guild.members.cache.has('${user.id}') ).map( guild => {
				var member = guild.members.cache.get('${user.id}');
				return {
					name: guild.name,
					id: guild.id,
					isAdmin: member.permissions.has('MANAGE_GUILD'),
					shardId: global.shardId
				}
			} )` ).then( results => results.reduce( (acc, val) => acc.concat(val), [] ).map( user_guild => {
				return user_guild.name.escapeFormatting() + ' `' + user_guild.id + '`' + ( user_guild.isAdmin ? '\\*' : '' );
			} ) );
			if ( guilds.length ) guildlist[1] = guilds.join('\n');
			if ( guildlist[1].length > 1000 ) guildlist[1] = guilds.length;
			if ( msg.showEmbed() ) {
				var text = '';
				var embed = new MessageEmbed().addField( username[0], username[1] ).addField( guildlist[0], guildlist[1] );
			}
			else {
				var embed = {};
				var text = username.join(' ') + '\n' + guildlist.join('\n');
			}
			return msg.sendChannel( text, {embed}, true );
		}
		
		msg.replyMsg( 'I couldn\'t find a result for `' + id + '`', {}, true );
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) this.LINK(lang, msg, line, wiki);
}

module.exports = {
	name: 'get',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_get
};
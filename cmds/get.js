import { EmbedBuilder, ShardClientUtil, ChannelType, PermissionFlagsBits } from 'discord.js';
import { escapeFormatting, splitMessage } from '../util/functions.js';
import db from '../util/database.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultSettings, defaultPermissions} = require('../util/default.json');
const {shardIdForGuildId} = ShardClientUtil;

/**
 * Processes the "get" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 * @async
 */
export default async function cmd_get(lang, msg, args, line, wiki) {
	var id = args.join().replace( /^\\?<(?:@!?|#)(\d+)>$/, '$1' );
	if ( !/^\d+$/.test(id) ) {
		if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) this.LINK(lang, msg, line, wiki);
		return;
	}
	try {
		var guild = await msg.client.shard.broadcastEval( (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.id) ) {
				var guild = discordClient.guilds.cache.get(evalData.id);
				return {
					name: guild.name, id: guild.id, memberCount: guild.approximateMemberCount ?? guild.memberCount,
					ownerId: guild.ownerId, owner: discordClient.users.cache.get(guild.ownerId)?.tag,
					channel: guild.publicUpdatesChannelId, icon: guild.iconURL(),
					permissions: guild.members.me.permissions.missing(evalData.defaultPermissions),
					pause: pausedGuilds.has(guild.id), shardId: process.env.SHARDS
				};
			}
		}, {
			context: {id, defaultPermissions},
			shard: shardIdForGuildId(id, msg.client.shard.count)
		} );
		if ( guild ) {
			var guildname = ['Guild:', escapeFormatting(guild.name) + ' `' + guild.id + '`' + ( guild.pause ? '\\*' : '' )];
			var guildowner = ['Owner:', ( guild.owner ? escapeFormatting(guild.owner) + ' ' : '' ) + '`' + guild.ownerId + '` <@' + guild.ownerId + '>'];
			var guildsize = ['Size:', guild.memberCount + ' members'];
			var guildshard = ['Shard:', guild.shardId];
			var guildpermissions = ['Missing permissions:', ( guild.permissions.length ? '`' + guild.permissions.join('`, `') + '`' : '*none*' )];
			var guildchannel = ['Updates channel:', '`' + guild.channel + '`'];
			var guildsettings = ['Settings:', '*unknown*'];
			
			return db.query( 'SELECT channel, wiki, lang, role, inline, prefix, (SELECT array_agg(ARRAY[prefixchar, prefixwiki] ORDER BY prefixchar) FROM subprefix WHERE guild = $1) AS subprefixes FROM discord WHERE guild = $1 ORDER BY channel ASC NULLS FIRST', [guild.id] ).then( ({rows}) => {
				if ( rows.length ) {
					let row = rows.find( row => !row.channel );
					row.patreon = patreonGuildsPrefix.has(guild.id);
					let subprefixes = {};
					row.subprefixes?.forEach( subprefix => subprefixes[subprefix[0]] = subprefix[1] );
					row.subprefixes = subprefixes;
					rows.filter( row => row.channel ).forEach( row => delete row.subprefixes );
					guildsettings[1] = '```json\n' + JSON.stringify( rows, null, '\t' ) + '\n```';
				}
				else guildsettings[1] = '*default*';
			}, dberror => {
				console.log( '- Error while getting the settings: ' + dberror );
			} ).then( () => {
				if ( msg.showEmbed() ) {
					var embed = new EmbedBuilder().setThumbnail( guild.icon ).addFields(...[
						{name: guildname[0], value: guildname[1]},
						{name: guildowner[0], value: guildowner[1]},
						{name: guildsize[0], value: guildsize[1]},
						{name: guildshard[0], value: guildshard[1]},
						{name: guildpermissions[0], value: guildpermissions[1]}
					]);
					if ( guild.channel ) embed.addFields( {name: guildchannel[0], value: guildchannel[1]} );
					var split = splitMessage( guildsettings[1], {char:',\n',maxLength:1000,prepend:'```json\n',append:',\n```'} );
					if ( split.length > 5 ) {
						msg.sendChannel( {embeds: [embed]}, true );
						splitMessage( guildsettings.join(' '), {
							char: ',\n',
							maxLength: 2000,
							prepend: '```json\n',
							append: ',\n```'
						} ).forEach( textpart => msg.sendChannel( textpart, true ) );
					}
					else {
						split.forEach( textpart => embed.addFields( {name: guildsettings[0], value: textpart} ) );
						msg.sendChannel( {embeds: [embed]}, true );
					}
				}
				else {
					var text = guildname.join(' ') + '\n' + guildowner.join(' ') + '\n' + guildsize.join(' ') + '\n' + guildshard.join(' ') + '\n' + guildpermissions.join(' ') + ( guild.channel ? '\n' + guildchannel.join(' ') : '' ) + '\n' + guildsettings.join(' ');
					splitMessage( text, {
						char: ',\n',
						maxLength: 2000,
						prepend: '```json\n',
						append: ',\n```'
					} ).forEach( textpart => msg.sendChannel( textpart, true ) );
				}
			} );
		}
		
		var channel = await msg.client.shard.broadcastEval( (discordClient, evalData) => {
			if ( discordClient.channels.cache.filter( channel => ( channel.isTextBased() && channel.guildId ) || channel.type === evalData.GuildCategory ).has(evalData.id) ) {
				var channel = discordClient.channels.cache.get(evalData.id);
				return {
					name: channel.name, id: channel.id, type: channel.type, parentId: channel.parentId,
					isThread: channel.isThread(), threadParentId: channel.parent?.parentId,
					guild: channel.guild.name, guildId: channel.guildId,
					permissions: channel.guild.members.me.permissionsIn(channel.id).missing(evalData.defaultPermissions),
					pause: pausedGuilds.has(channel.guildId),
					shardId: process.env.SHARDS
				};
			}
		}, {context: {id, defaultPermissions, GuildCategory: ChannelType.GuildCategory}} ).then( results => results.find( result => result ) );
		if ( channel ) {
			var channelguild = ['Guild:', escapeFormatting(channel.guild) + ' `' + channel.guildId + '`' + ( channel.pause ? '\\*' : '' )];
			var channelname = ['Channel:', '#' + escapeFormatting(channel.name) + ' `' + channel.id + '` <#' + channel.id + '>'];
			var channeldetails = ['Details:', '`' + ( ChannelType[channel.type] ?? channel.type ) + '`' + ( channel.parentId ? ' – `' + channel.parentId + '` <#' + channel.parentId + '>' + ( channel.isThread ? ' – `' + channel.threadParentId + '` <#' + channel.threadParentId + '>' : '' ) : '' )];
			var channelpermissions = ['Missing permissions:', ( channel.permissions.length ? '`' + channel.permissions.join('`, `') + '`' : '*none*' )];
			var channellang = ['Language:', '*unknown*'];
			var channelwiki = ['Default Wiki:', '*unknown*'];
			var channelrole = ['Minimal Role:', '*unknown*'];
			var channelinline = ['Inline commands:', '*unknown*'];
			
			let sqlargs = [channel.guildId];
			if ( channel.isThread ) sqlargs.push(channel.parentId, '#' + channel.threadParentId);
			else sqlargs.push(channel.id, '#' + ( channel.type === ChannelType.GuildCategory ? channel.id : channel.parentId ));
			return db.query( 'SELECT wiki, lang, role, inline FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
				if ( row ) {
					channellang[1] = row.lang;
					channelwiki[1] = row.wiki;
					channelrole[1] = ( row.role ? '`' + row.role + '` <@&' + row.role + '>' : '@everyone' );
					channelinline[1] = ( row.inline ? 'disabled' : 'enabled' );
				}
				else {
					channellang[1] = defaultSettings.lang;
					channelwiki[1] = defaultSettings.wiki;
					channelrole[1] = '@everyone';
					channelinline[1] = 'enabled';
				}
			}, dberror => {
				console.log( '- Error while getting the settings: ' + dberror );
			} ).then( () => {
				var text = null;
				var embed = null;
				if ( msg.showEmbed() ) {
					embed = new EmbedBuilder().addFields(...[
						{name: channelguild[0], value: channelguild[1]},
						{name: channelname[0], value: channelname[1]},
						{name: channeldetails[0], value: channeldetails[1]},
						{name: channelpermissions[0], value: channelpermissions[1]},
						{name: channellang[0], value: channellang[1]},
						{name: channelwiki[0], value: channelwiki[1]},
						{name: channelrole[0], value: channelrole[1]},
						{name: channelinline[0], value: channelinline[1]}
					]);
				}
				else {
					text = channelguild.join(' ') + '\n' + channelname.join(' ') + '\n' + channeldetails.join(' ') + '\n' + channelpermissions.join(' ') + '\n' + channellang.join(' ') + '\n' + channelwiki[0] + ' <' + channelwiki[1] + '>\n' + channelrole.join(' ') + '\n' + channelinline.join(' ');
				}
				msg.sendChannel( {content: text, embeds: [embed]}, true );
			} );
		}
		
		var user = await msg.client.users.fetch(id).catch( () => {} );
		if ( user ) {
			var username = ['User:', escapeFormatting(user.tag) + ' `' + user.id + '` <@' + user.id + '>'];
			var guildlist = ['Guilds:', '*none*'];
			var guilds = await msg.client.shard.broadcastEval( (discordClient, evalData) => {
				return discordClient.guilds.cache.filter( guild => guild.members.cache.has(evalData.user) ).map( guild => {
					var member = guild.members.cache.get(evalData.user);
					return {
						name: guild.name,
						id: guild.id,
						isAdmin: member.permissions.has(evalData.ManageGuild),
						shardId: process.env.SHARDS
					}
				} );
			}, {context: {user: user.id, ManageGuild: PermissionFlagsBits.ManageGuild.toString()}} ).then( results => {
				return results.reduce( (acc, val) => acc.concat(val), [] ).map( user_guild => {
					return escapeFormatting(user_guild.name) + ' `' + user_guild.id + '`' + ( user_guild.isAdmin ? '\\*' : '' );
				} );
			} );
			if ( guilds.length ) guildlist[1] = guilds.join('\n');
			if ( guildlist[1].length > 1000 ) guildlist[1] = guilds.length.toLocaleString();
			var text = null;
			var embed = null;
			if ( msg.showEmbed() ) embed = new EmbedBuilder().setThumbnail( user.displayAvatarURL() ).addFields(...[
				{name: username[0], value: username[1]},
				{name: guildlist[0], value: guildlist[1]}
			]);
			else text = username.join(' ') + '\n' + guildlist.join('\n');
			return msg.sendChannel( {content: text, embeds: [embed]}, true );
		}
		
		return db.query( 'SELECT guild, channel, wiki, lang, role, inline, prefix, patreon FROM discord WHERE guild = $1 OR channel = $1 OR channel = $2 ORDER BY guild, channel DESC NULLS LAST LIMIT 1', [id, '#' + id] ).then( ({rows}) => {
			if ( !rows.length ) return msg.replyMsg( 'I couldn\'t find a result for `' + id + '`', true );
			var result = '```json\n' + JSON.stringify( rows, null, '\t' ) + '\n```';
			if ( msg.showEmbed() ) {
				var split = splitMessage( result, {char:',\n',maxLength:1000,prepend:'```json\n',append:',\n```'} );
				if ( split.length > 5 ) {
					splitMessage( '`' + id + '`: ' + result, {
						char: ',\n',
						maxLength: 2000,
						prepend: '```json\n',
						append: ',\n```'
					} ).forEach( textpart => msg.sendChannel( textpart, true ) );
				}
				else {
					var embed = new EmbedBuilder().addFields(...split.map( textpart => {
						return {name: '`' + id + '`: ', value: textpart};
					} ));
					msg.sendChannel( {embeds: [embed]}, true );
				}
			}
			else {
				splitMessage( '`' + id + '`: ' + result, {
					char: ',\n',
					maxLength: 2000,
					prepend: '```json\n',
					append: ',\n```'
				} ).forEach( textpart => msg.sendChannel( textpart, true ) );
			}
		}, dberror => {
			console.log( '- Error while getting the settings: ' + dberror );
			msg.reactEmoji('error');
		} );
	} catch ( error ) {
		log_error(error);
		msg.reactEmoji('error');
	}
}

export const cmdData = {
	name: 'get',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_get
};

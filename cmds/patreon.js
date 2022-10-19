import { ShardClientUtil, OAuth2Scopes, ChannelType } from 'discord.js';
import db from '../util/database.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultPermissions, limit: {verification: verificationLimit, rcgcdw: rcgcdwLimit}} = require('../util/default.json');
const {shardIdForGuildId} = ShardClientUtil;

/**
 * Processes the "patreon" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
export default function cmd_patreon(lang, msg, args, line, wiki) {
	if ( !( process.env.channel.split('|').includes( msg.channelId ) && args.join('') ) ) {
		if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) this.LINK(lang, msg, line, wiki);
		return;
	}
	
	if ( args[0] === 'enable' && /^\d+$/.test(args.slice(1).join(' ')) ) return msg.client.shard.broadcastEval( (discordClient, evalData) => {
		return discordClient.guilds.cache.get(evalData)?.name;
	}, {
		context: args[1],
		shard: shardIdForGuildId(args[1], msg.client.shard.count)
	} ).then( guild => {
		if ( !guild ) {
			let invite = msg.client.generateInvite({
				scopes: [
					OAuth2Scopes.Bot,
					OAuth2Scopes.ApplicationsCommands
				],
				permissions: defaultPermissions,
				guild: args[1],
				disableGuildSelect: true
			});
			return msg.replyMsg( 'I\'m not on a server with the id `' + args[1] + '`.\n<' + invite + '>', true );
		}
		if ( patreonGuildsPrefix.has(args[1]) ) return msg.replyMsg( '"' + guild + '" has the patreon features already enabled.', true );
		db.query( 'SELECT count, COUNT(guild) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [msg.author.id] ).then( ({rows:[row]}) => {
			if ( !row ) return msg.replyMsg( 'You can\'t have any servers.', true );
			if ( row.count <= row.guilds ) return msg.replyMsg( 'You already reached your maximal server count.', true );
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			db.query( 'UPDATE discord SET patreon = $1 WHERE guild = $2 AND channel IS NULL', [msg.author.id, args[1]] ).then( ({rowCount}) => {
				if ( !rowCount ) return db.query( 'INSERT INTO discord(main, guild, patreon) VALUES ($1, $1, $2)', [args[1], msg.author.id] ).then( () => {
					console.log( '- Guild successfully added.' );
					msg.client.shard.broadcastEval( (discordClient, evalData) => {
						globalThis.patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
					}, {context: {guild: args[1], prefix: process.env.prefix}} );
					msg.replyMsg( 'The patreon features are now enabled on "' + guild + '".', true );
				}, dberror => {
					console.log( '- Error while adding the guild: ' + dberror );
					msg.replyMsg( 'I got an error while updating the server, please try again later.', true );
				} );
				console.log( '- Guild successfully updated.' );
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					globalThis.patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
				}, {context: {guild: args[1], prefix: process.env.prefix}} );
				msg.replyMsg( 'The patreon features are now enabled on "' + guild + '".', true );
			}, dberror => {
				console.log( '- Error while updating the guild: ' + dberror );
				msg.replyMsg( 'I got an error while updating the server, please try again later.', true );
			} );
		}, dberror => {
			console.log( '- Error while getting the patreon: ' + dberror );
			msg.replyMsg( 'I got an error while searching for you, please try again later.', true );
		} );
	} );
	
	if ( args[0] === 'disable' && /^\d+$/.test(args.slice(1).join(' ')) ) return msg.client.shard.broadcastEval( (discordClient, evalData) => {
		return discordClient.guilds.cache.get(evalData)?.name;
	}, {
		context: args[1],
		shard: shardIdForGuildId(args[1], msg.client.shard.count)
	} ).then( guild => {
		if ( !guild ) return msg.replyMsg( 'I\'m not on a server with the id `' + args[1] + '`.', true );
		if ( !patreonGuildsPrefix.has(args[1]) ) return msg.replyMsg( '"' + guild + '" doesn\'t have the patreon features enabled.', true );
		return db.connect().then( client => {
			return client.query( 'SELECT lang, role, inline FROM discord WHERE guild = $1 AND patreon = $2', [args[1], msg.author.id] ).then( ({rows:[row]}) => {
				if ( !row ) {
					msg.replyMsg( 'You didn\'t enable the patreon features for "' + guild + '"!', true );
					return Promise.reject();
				}
				if ( process.env.READONLY ) {
					msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
					return Promise.reject();
				}
				return client.query( 'UPDATE discord SET lang = $1, role = $2, inline = $3, prefix = $4, patreon = NULL WHERE guild = $5', [row.lang, row.role, row.inline, process.env.prefix, args[1]] ).then( () => {
					console.log( '- Guild successfully updated.' );
					msg.client.shard.broadcastEval( (discordClient, evalData) => {
						globalThis.patreonGuildsPrefix.delete(evalData);
					}, {context: args[1]} );
					msg.replyMsg( 'The patreon features are now disabled on "' + guild + '".', true );
				}, dberror => {
					console.log( '- Error while updating the guild: ' + dberror );
					msg.replyMsg( 'I got an error while searching for the server, please try again later.', true );
					return Promise.reject();
				} ).then( () => {
					return client.query( 'DELETE FROM discord WHERE guild = $1 AND channel LIKE $2 RETURNING channel, wiki', [args[1], '#%'] ).then( ({rows}) => {
						if ( rows.length ) {
							console.log( '- Channel categories successfully deleted.' );
							return msg.client.shard.broadcastEval( (discordClient, evalData) => {
								if ( discordClient.guilds.cache.has(evalData.guild) ) {
									return discordClient.guilds.cache.get(evalData.guild).channels.cache.filter( channel => {
										return ( ( ( channel.isTextBased() && !channel.isThread() ) || channel.type === ChannelType.GuildForum ) && evalData.rows.some( row => {
											return ( row.channel === '#' + channel.parentId );
										} ) );
									} ).map( channel => {
										return {
											id: channel.id,
											wiki: evalData.rows.find( row => {
												return ( row.channel === '#' + channel.parentId );
											} ).wiki
										};
									} );
								}
							}, {
								context: {guild: args[1], rows},
								shard: shardIdForGuildId(args[1], msg.client.shard.count)
							} ).then( channels => {
								if ( channels.length ) return Promise.all(channels.map( channel => {
									return client.query( 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)', [channel.wiki, args[1], channel.id, row.lang, row.role, row.inline, process.env.prefix] ).catch( dberror => {
										if ( dberror.message !== 'duplicate key value violates unique constraint "discord_guild_channel_key"' ) {
											console.log( '- Error while adding category settings to channels: ' + dberror );
										}
									} );
								} ));
							}, error => {
								console.log( '- Error while getting the channels in categories: ' + error );
							} );
						}
					}, dberror => {
						console.log( '- Error while deleting the channel categories: ' + dberror );
					} );
				} );
			}, dberror => {
				console.log( '- Error while getting the guild: ' + dberror );
				msg.replyMsg( 'I got an error while searching for the server, please try again later.', true );
				return Promise.reject();
			} ).then( () => {
				return client.query( 'SELECT configid FROM verification WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [args[1], verificationLimit.default] ).then( ({rows}) => {
					if ( rows.length ) {
						return client.query( 'DELETE FROM verification WHERE guild = $1 AND configid IN (' + rows.map( (row, i) => '$' + ( i + 2 ) ).join(', ') + ')', [args[1], ...rows.map( row => row.configid )] ).then( () => {
							console.log( '- Verifications successfully deleted.' );
						}, dberror => {
							console.log( '- Error while deleting the verifications: ' + dberror );
						} );
					}
				}, dberror => {
					console.log( '- Error while getting the verifications: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'SELECT webhook FROM rcgcdw WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [args[1], rcgcdwLimit.default] ).then( ({rows}) => {
					if ( rows.length ) {
						return client.query( 'DELETE FROM rcgcdw WHERE webhook IN (' + rows.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', rows.map( row => row.webhook ) ).then( () => {
							console.log( '- RcGcDw successfully deleted.' );
							rows.forEach( row => msg.client.fetchWebhook(...row.webhook.split('/')).then( webhook => {
								webhook.delete('Removed extra recent changes webhook').catch(log_error);
							}, log_error ) );
						}, dberror => {
							console.log( '- Error while deleting the RcGcDw: ' + dberror );
						} );
					}
				}, dberror => {
					console.log( '- Error while getting the RcGcDw: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'UPDATE rcgcdw SET display = $1 WHERE guild = $2 AND display > $1', [rcgcdwLimit.display, args[1]] ).then( () => {
					console.log( '- RcGcDw successfully updated.' );
				}, dberror => {
					console.log( '- Error while updating the RcGcDw: ' + dberror );
				} );
			} ).catch( error => {
				if ( error ) console.log( '- Error while removing the patreon features: ' + error );
			} ).finally( () => {
				client.release();
			} );
		}, dberror => {
			console.log( '- Error while connecting to the database client: ' + dberror );
			msg.replyMsg( 'I got an error while searching for the server, please try again later.', true );
		} );
	} );
	
	if ( args[1] ) args[1] = args[1].replace( /^\\?<@!?(\d+)>$/, '$1' );
	
	if ( args[0] === 'check' ) {
		if ( !args.slice(1).join('') ) return db.query( 'SELECT count, ARRAY_REMOVE(ARRAY_AGG(guild), NULL) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [msg.author.id] ).then( ({rows:[row]}) => {
			if ( !row ) return msg.replyMsg( 'You can\'t have any servers.', true );
			var text = 'You can have up to ' + row.count + ' servers.\n\n';
			if ( row.guilds.length ) {
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					return evalData.map( guild => discordClient.guilds.cache.get(guild)?.name );
				}, {context: row.guilds} ).then( results => {
					var guilds = row.guilds.map( (guild, i) => '`' + guild + '` ' + ( results.find( result => result[i] !== null )?.[i] || '' ) );
					text += 'Currently you have ' + guilds.length + ' servers:\n' + guilds.join('\n');
					if ( row.count < guilds.length ) text += '\n\n**You are above your server limit!**';
					msg.replyMsg( text, true );
				} );
			}
			else {
				text += '*You don\'t have any servers yet.*';
				msg.replyMsg( text, true );
			}
		}, dberror => {
			console.log( '- Error while getting the patreon: ' + dberror );
			msg.replyMsg( 'I got an error while searching for you, please try again later.', true );
		} );
		if ( msg.isOwner() && /^\d+$/.test(args.slice(1).join(' ')) ) return db.query( 'SELECT count, ARRAY_REMOVE(ARRAY_AGG(guild), NULL) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [args[1]] ).then( ({rows:[row]}) => {
			if ( !row ) return msg.replyMsg( '<@' + args[1] + '> can\'t have any servers.', true );
			var text = '<@' + args[1] + '> can have up to ' + row.count + ' servers.\n\n';
			if ( row.guilds.length ) {
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					return evalData.map( guild => discordClient.guilds.cache.get(guild)?.name );
				}, {context: row.guilds} ).then( results => {
					var guilds = row.guilds.map( (guild, i) => '`' + guild + '` ' + ( results.find( result => result[i] !== null )?.[i] || '' ) );
					text += 'Currently they have ' + guilds.length + ' servers:\n' + guilds.join('\n');
					if ( row.count < guilds.length ) text += '\n\n**They are above their server limit!**';
					msg.replyMsg( text, true );
				} );
			}
			else {
				text += '*They don\'t have any servers yet.*';
				msg.replyMsg( text, true );
			}
		}, dberror => {
			console.log( '- Error while getting the patreon: ' + dberror );
			msg.replyMsg( 'I got an error while searching for <@' + args[1] + '>, please try again later.', true );
		} );
	}
	
	if ( args[0] === 'edit' && msg.isOwner() && /^\d+ [\+\-]?\d+$/.test(args.slice(1).join(' ')) ) return db.query( 'SELECT count, ARRAY_REMOVE(ARRAY_AGG(guild), NULL) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [args[1]] ).then( ({rows:[row]}) => {
		var value = parseInt(args[2], 10);
		var count = ( row ? row.count : 0 );
		var guilds = ( row ? row.guilds : [] );
		if ( args[2].startsWith( '+' ) || args[2].startsWith( '-' ) ) count += value;
		else count = value;
		if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
		if ( count <= 0 ) return db.connect().then( client => {
			return client.query( 'DELETE FROM patreons WHERE patreon = $1', [args[1]] ).then( () => {
				console.log( '- Patreon successfully deleted.' );
				msg.replyMsg( '<@' + args[1] + '> is no longer a patreon.', true );
				if ( !guilds.length ) return Promise.reject();
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					return evalData.map( guild => {
						globalThis.patreonGuildsPrefix.delete(guild);
					} );
				}, {context: row.guilds} );
			}, dberror => {
				console.log( '- Error while deleting the patreon: ' + dberror );
				msg.replyMsg( 'I got an error while deleting <@' + args[1] + '>, please try again later.', true );
				return Promise.reject();
			} ).then( () => {
				return client.query( 'SELECT guild, lang, role, inline FROM discord WHERE guild IN (' + guilds.map( (guild, i) => '$' + ( i + 1 ) ).join(', ') + ') AND channel IS NULL', guilds ).then( ({rows}) => {
					return Promise.all(rows.map( row => {
						return client.query( 'UPDATE discord SET lang = $1, role = $2, inline = $3, prefix = $4, patreon = NULL WHERE guild = $5', [row.lang, row.role, row.inline, process.env.prefix, row.guild] ).then( () => {
							console.log( '- Guild successfully updated.' );
						}, dberror => {
							console.log( '- Error while updating the guild: ' + dberror );
						} );
					} ));
				}, dberror => {
					console.log( '- Error while getting the guilds: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'DELETE FROM discord WHERE guild IN (' + guilds.map( (guild, i) => '$' + ( i + 2 ) ).join(', ') + ') AND channel LIKE $1 RETURNING wiki, guild, channel, lang, role, inline', ['#%', ...guilds] ).then( ({rows}) => {
					if ( rows.length ) {
						console.log( '- Channel categories successfully deleted.' );
						return msg.client.shard.broadcastEval( (discordClient, evalData) => {
							return [].concat(...evalData.guilds.filter( guild => {
								return discordClient.guilds.cache.has(guild);
							} ).map( guild => {
								return discordClient.guilds.cache.get(guild).channels.cache.filter( channel => {
									return ( ( ( channel.isTextBased() && !channel.isThread() ) || channel.type === ChannelType.GuildForum ) && evalData.rows.some( row => {
										return ( row.channel === '#' + channel.parentId );
									} ) );
								} ).map( channel => {
									let row = evalData.rows.find( row => {
										return ( row.channel === '#' + channel.parentId );
									} );
									return {
										id: channel.id, guild: row.guild, wiki: row.wiki,
										lang: row.lang, role: row.role, inline: row.inline
									};
								} );
							} ));
						}, {context: {rows, guilds}} ).then( response => {
							var channels = [].concat(...response);
							if ( channels.length ) return Promise.all(channels.map( channel => {
								return client.query( 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)', [channel.wiki, channel.guild, channel.id, channel.lang, channel.role, channel.inline, process.env.prefix] ).catch( dberror => {
									if ( dberror.message !== 'duplicate key value violates unique constraint "discord_guild_channel_key"' ) {
										console.log( '- Error while adding category settings to channels: ' + dberror );
									}
								} );
							} ));
						}, error => {
							console.log( '- Error while getting the channels in categories: ' + error );
						} );
					}
				}, dberror => {
					console.log( '- Error while deleting the channel categories: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'SELECT guild, (ARRAY_AGG(configid ORDER BY configid))[' + ( verificationLimit.default + 1 ) + ':] configids FROM verification WHERE guild IN (' + guilds.map( (guild, i) => '$' + ( i + 1 ) ).join(', ') + ') GROUP BY guild', guilds ).then( ({rows}) => {
					if ( !rows.length ) return;
					rows = rows.filter( row => row.configids.length );
					if ( rows.length ) return Promise.all(rows.map( row => {
						return client.query( 'DELETE FROM verification WHERE guild = $1 AND configid IN (' + row.configids.map( (configid, i) => '$' + ( i + 2 ) ).join(', ') + ')', [row.guild, ...row.configids] ).then( () => {
							console.log( '- Verifications successfully deleted.' );
						}, dberror => {
							console.log( '- Error while deleting the verifications: ' + dberror );
						} );
					} ));
				}, dberror => {
					console.log( '- Error while getting the verifications: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'SELECT (ARRAY_AGG(webhook ORDER BY configid))[' + ( rcgcdwLimit.default + 1 ) + ':] webhooks FROM rcgcdw WHERE guild IN (' + guilds.map( (guild, i) => '$' + ( i + 1 ) ).join(', ') + ') GROUP BY guild', guilds ).then( ({rows}) => {
					if ( !rows.length ) return;
					var webhooks = [].concat(...rows.map( row => row.webhooks ));
					if ( webhooks.length ) {
						return client.query( 'DELETE FROM rcgcdw WHERE webhook IN (' + webhooks.map( (webhook, i) => '$' + ( i + 1 ) ).join(', ') + ')', webhooks ).then( () => {
							console.log( '- RcGcDw successfully deleted.' );
							webhooks.forEach( hook => msg.client.fetchWebhook(...hook.split('/')).then( webhook => {
								webhook.delete('Removed extra recent changes webhook').catch(log_error);
							}, log_error ) );
						}, dberror => {
							console.log( '- Error while deleting the RcGcDw: ' + dberror );
						} );
					}
				}, dberror => {
					console.log( '- Error while getting the RcGcDw: ' + dberror );
				} );
			} ).then( () => {
				return client.query( 'UPDATE rcgcdw SET display = $1 WHERE guild IN (' + guilds.map( (guild, i) => '$' + ( i + 2 ) ).join(', ') + ') AND display > $1', [rcgcdwLimit.display, ...guilds] ).then( () => {
					console.log( '- RcGcDw successfully updated.' );
				}, dberror => {
					console.log( '- Error while updating the RcGcDw: ' + dberror );
				} );
			} ).catch( error => {
				if ( error ) console.log( '- Error while removing the patreon features: ' + error );
			} ).finally( () => {
				client.release();
			} );
		}, dberror => {
			console.log( '- Error while connecting to the database client: ' + dberror );
			msg.replyMsg( 'I got an error while updating <@' + args[1] + '>, please try again later.', true );
		} );
		if ( !row ) return db.query( 'INSERT INTO patreons(patreon, count) VALUES ($1, $2)', [args[1], count] ).then( () => {
			console.log( '- Patreon successfully added.' );
			msg.replyMsg( '<@' + args[1] + '> can now have up to ' + count + ' servers.', true );
		}, dberror => {
			console.log( '- Error while adding the patreon: ' + dberror );
			msg.replyMsg( 'I got an error while adding <@' + args[1] + '>, please try again later.', true );
		} );
		db.query( 'UPDATE patreons SET count = $1 WHERE patreon = $2', [count, args[1]] ).then( () => {
			console.log( '- Patreon successfully updated.' );
			var text = '<@' + args[1] + '> can now have up to ' + count + ' servers.';
			if ( count < guilds.length ) text += '\n\n**They are now above their server limit!**';
			msg.replyMsg( text, true );
		}, dberror => {
			console.log( '- Error while updating the patreon: ' + dberror );
			msg.replyMsg( 'I got an error while updating <@' + args[1] + '>, please try again later.', true );
		} );
	}, dberror => {
		console.log( '- Error while getting the patreon: ' + dberror );
		msg.replyMsg( 'I got an error while searching for <@' + args[1] + '>, please try again later.', true );
	} );
	
	if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) this.LINK(lang, msg, line, wiki);
}

export const cmdData = {
	name: 'patreon',
	everyone: true,
	pause: true,
	owner: true,
	run: cmd_patreon
};
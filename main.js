import 'dotenv/config';
import { fork as forkChildProcess } from 'node:child_process';
import gotDefault from 'got';
import { gotSsrf } from 'got-ssrf';
import { ShardingManager, ShardClientUtil, ShardEvents } from 'discord.js';
const {shardIdForGuildId} = ShardClientUtil;

var isDebug = ( process.argv[2] === 'debug' );
if ( process.argv[2] === 'readonly' ) process.env.READONLY = 'true';
import db from './database.js';

const got = gotDefault.extend( {
	throwHttpErrors: false,
	timeout: {
		request: 30_000
	},
	headers: {
		'user-agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json',
	hooks: ( process.env.x_origin_guild ? {
		beforeRequest: [
			options => {
				if ( options.context?.guildId ) options.headers['x-origin-guild'] = options.context.guildId;
				else if ( options.context?.guildId === null ) options.headers['x-origin-guild'] = 'DM';
			}
		]
	} : {} )
}, gotSsrf );

const manager = new ShardingManager( './bot.js', {
	execArgv: ['--icu-data-dir=node_modules/full-icu'],
	shardArgs: ( isDebug ? ['debug'] : [] ),
	token: process.env.token
} );

var diedShards = 0;
manager.on( 'shardCreate', shard => {
	console.log( `- Shard[${shard.id}]: Launched` );
	var isStarting = true;
	
	shard.on( ShardEvents.Spawn, () => {
		console.log( `- Shard[${shard.id}]: Spawned` );
	} );
	
	shard.on( ShardEvents.Ready, () => {
		isStarting = false;
	} );
	
	shard.on( ShardEvents.Message, message => {
		if ( message?.id === 'verifyUser' && server ) {
			return server.send( message );
		}
		if ( message === 'SIGKILL' ) {
			console.log( '\n- Killing all shards!\n\n' );
			graceful('SIGKILL');
			manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
			if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		}
		if ( message === 'toggleDebug' ) {
			console.log( '\n- Toggle debug logging for all shards!\n' );
			isDebug = !isDebug;
			manager.broadcastEval( () => {
				globalThis.isDebug = !globalThis.isDebug;
			} );
			if ( typeof server !== 'undefined' ) server.send( 'toggleDebug' );
		}
		if ( message === 'postStats' && process.env.botlist ) postStats();
	} );
	
	shard.on( ShardEvents.Death, message => {
		if ( manager.respawn === false ) diedShards++;
		if ( message.exitCode ) {
			if ( isStarting ) {
				manager.respawn = false;
				console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error, disable respawn!\n\n` );
			}
			else console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error!\n\n` );
			if ( isDebug || diedShards >= manager.totalShards ) {
				graceful('SIGKILL');
				manager.shards.filter( leftShard => leftShard !== shard && leftShard.process && !leftShard.process.killed ).forEach( leftShard => leftShard.kill() );
				if ( typeof server !== 'undefined' && !server.killed ) server.kill();
				process.exit(1);
			};
		}
	} );

	shard.on( ShardEvents.Error, error => {
		console.log( `- Shard[${shard.id}]: Error received!`, error );
	} );
} );

manager.spawn( {
	delay: 0,
	timeout: -1
} ).then( shards => {
	if ( !isDebug && process.env.botlist ) {
		var botList = JSON.parse(process.env.botlist);
		for ( let [key, value] of Object.entries(botList) ) {
			if ( !value ) delete botList[key];
		}
		if ( Object.keys(botList).length ) {
			setInterval( postStats, 10_800_000, botList, shards.size ).unref();
		}
	}
}, error => {
	console.error( '- Error while spawning the shards: ' + error );
	manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
	if ( isDebug ) {
		graceful('SIGKILL');
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		process.exit(1);
	}
	else manager.spawn( {
		delay: 5_000,
		timeout: 90_000
	} ).catch( error2 => {
		console.error( '- Error while spawning the shards: ' + error2 );
		graceful('SIGKILL');
		manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		process.exit(1);
	} );
} );

/** @type {import('node:child_process').ChildProcess|undefined} */
var server;
if ( process.env.dashboard ) {
	const dashboard = forkChildProcess('./dashboard/index.js', ( isDebug ? ['debug'] : [] ));
	server = dashboard;

	/** @type {Object.<string, function(import('discord.js').Client, Object)>} */
	const evalFunctions = {
		getGuilds: (discordClient, evalData) => {
			/** @type {import('discord.js').ChannelType.GuildForum} */
			const GuildForum = 15;
			/** @type {import('discord.js').ChannelType.GuildCategory} */
			const GuildCategory = 4;
			return Promise.all(
				evalData.guilds.map( id => {
					if ( discordClient.guilds.cache.has(id) ) {
						let guild = discordClient.guilds.cache.get(id);
						return guild.members.fetch(evalData.member).then( member => {
							return {
								patreon: globalThis.patreonGuildsPrefix.has(guild.id),
								memberCount: guild.memberCount,
								botPermissions: guild.members.me.permissions.bitfield.toString(),
								channels: guild.channels.cache.filter( channel => {
									return ( ( channel.isTextBased() && !channel.isThread() ) || channel.type === GuildForum || channel.type === GuildCategory );
								} ).sort( (a, b) => {
									let aVal = a.rawPosition + 1;
									if ( a.isVoiceBased() ) aVal *= 1_000;
									if ( a.type === GuildCategory ) aVal *= 1_000_000;
									else if ( !a.parent ) aVal -= 1_000_000;
									else aVal += ( a.parent.rawPosition + 1 ) * 1_000_000;
									let bVal = b.rawPosition + 1;
									if ( b.isVoiceBased() ) bVal *= 1_000;
									if ( b.type === GuildCategory ) bVal *= 1_000_000;
									else if ( !b.parent ) bVal -= 1_000_000;
									else bVal += ( b.parent.rawPosition + 1 ) * 1_000_000;
									return aVal - bVal;
								} ).map( channel => {
									return {
										id: channel.id,
										name: channel.name,
										isForum: ( channel.type === GuildForum ),
										isCategory: ( channel.type === GuildCategory ),
										userPermissions: member.permissionsIn(channel).bitfield.toString(),
										botPermissions: guild.members.me.permissionsIn(channel).bitfield.toString()
									};
								} ),
								roles: guild.roles.cache.filter( role => {
									return ( role.id !== guild.id );
								} ).sort( (a, b) => {
									return b.rawPosition - a.rawPosition;
								} ).map( role => {
									return {
										id: role.id,
										name: role.name,
										lower: ( guild.members.me.roles.highest.comparePositionTo(role) > 0 && !role.managed )
									};
								} ),
								locale: guild.preferredLocale
							};
						}, error => {
							return 'noMember';
						} );
					}
				} )
			);
		},
		getMember: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				/** @type {import('discord.js').ChannelType.GuildForum} */
				const GuildForum = 15;
				/** @type {import('discord.js').ChannelType.GuildCategory} */
				const GuildCategory = 4;
				let guild = discordClient.guilds.cache.get(evalData.guild);
				return guild.members.fetch(evalData.member).then( async member => {
					var response = {
						patreon: globalThis.patreonGuildsPrefix.has(guild.id),
						userPermissions: member.permissions.bitfield.toString(),
						botPermissions: guild.members.me.permissions.bitfield.toString()
					};
					if ( evalData.channel ) {
						/** @type {import('discord.js').BaseGuildTextChannel} */
						let channel = guild.channels.cache.get(evalData.channel);
						if ( ( channel?.isTextBased() && !channel.isThread() ) || ( evalData.allowForum && channel?.type === GuildForum ) || ( response.patreon && evalData.allowCategory && channel?.type === GuildCategory ) ) {
							response.userPermissions = channel.permissionsFor(member).bitfield.toString();
							response.botPermissions = channel.permissionsFor(guild.members.me).bitfield.toString();
							response.isForum = ( channel.type === GuildForum );
							response.isCategory = ( channel.type === GuildCategory );
							response.parentId = channel.parentId;
							if ( evalData.thread ) {
								let thread = await channel.threads?.fetchActive().then( ({threads}) => {
									if ( threads.has(evalData.thread) ) return threads.get(evalData.thread);
									return threads.find( thread => thread.name.toLowerCase() === evalData.thread.toLowerCase() );
								}, () => {} );
								response.thread = thread?.id || null;
							}
						}
						else response.message = 'noChannel';
					}
					if ( evalData.newchannel ) {
						let newchannel = guild.channels.cache.get(evalData.newchannel);
						if ( ( newchannel?.isTextBased() && !newchannel.isThread() ) || ( evalData.allowForum && channel?.type === GuildForum ) ) {
							response.userPermissionsNew = newchannel.permissionsFor(member).bitfield.toString();
							response.botPermissionsNew = newchannel.permissionsFor(guild.members.me).bitfield.toString();
						}
						else response.message = 'noChannel';
					}
					return response;
				}, error => {
					return 'noMember';
				} );
			}
		},
		notifyGuild: (discordClient, evalData) => {
			if ( evalData.prefix ) {
				globalThis.patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
			}
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				let channel = discordClient.guilds.cache.get(evalData.guild).publicUpdatesChannel;
				if ( channel ) channel.send( {
					content: evalData.text,
					embeds: evalData.embeds ?? [],
					files: evalData.file,
					allowedMentions: {parse: []}
				} ).catch( error => {
					if ( error?.code === 50001 ) return; // Missing Access
					if ( error?.code === 50013 ) return; // Missing Permissions
					globalThis.log_error(error);
				} );
			}
		},
		notifyUser: (discordClient, evalData) => {
			discordClient.users.createDM(evalData.user).then( channel => {
				return channel.send( {
					content: evalData.text,
					embeds: evalData.embeds ?? [],
					files: evalData.file,
					allowedMentions: {parse: []},
					flags: 4096 // SuppressNotifications
				} );
			} ).catch( error => {
				if ( error?.code === 50007 ) return; // CANNOT_MESSAGE_USER
				globalThis.log_error(error);
			} );
		},
		createWebhook: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				/** @type {import('discord.js').ComponentType.ActionRow} */
				const ActionRow = 1;
				/** @type {import('discord.js').ComponentType.Button} */
				const Button = 2;
				/** @enum {import('discord.js').ButtonStyle} */
				const ButtonStyle = {
					/** @type {import('discord.js').ButtonStyle.Primary} */
					Primary: 1,
					/** @type {import('discord.js').ButtonStyle.Secondary} */
					Secondary: 2,
					/** @type {import('discord.js').ButtonStyle.Success} */
					Success: 3,
					/** @type {import('discord.js').ButtonStyle.Danger} */
					Danger: 4,
				};
				let guild = discordClient.guilds.cache.get(evalData.guild);
				/** @type {import('discord.js').BaseGuildTextChannel} */
				let channel = guild.channels.cache.get(evalData.channel);
				if ( channel ) return channel.createWebhook( {
					name: evalData.name,
					avatar: discordClient.user.displayAvatarURL({extension:'png',size:4096}),
					reason: evalData.reason
				} ).then( webhook => {
					console.log( `- Dashboard: Webhook successfully created: ${evalData.guild}#${evalData.channel}` );
					return webhook.send( {
						avatarURL: evalData.avatar,
						content: evalData.text,
						components: ( evalData.button_text && evalData.button_id && ButtonStyle.hasOwnProperty(evalData.button_style) ? [{
							type: ActionRow,
							components: [{
								type: Button,
								style: ButtonStyle[evalData.button_style],
								customId: evalData.button_id,
								label: evalData.button_text,
								emoji: ( evalData.button_emoji ? ( guild.emojis.cache.find( emoji => {
									return emoji.name === evalData.button_emoji;
								} )?.toString() ?? evalData.button_emoji ) : null )
							}]
						}] : [] ),
						embeds: evalData.embeds ?? [],
						threadId: evalData.thread,
						allowedMentions: {parse: []}
					} ).then( message => message?.id, globalThis.log_error ).then( message => {
						if ( evalData.deleteWebhook ) webhook.delete(evalData.reason).catch(globalThis.log_error);
						return {message, webhook: webhook.id + '/' + webhook.token};
					} );
				}, error => {
					console.log( '- Dashboard: Error while creating the webhook: ' + error );
				} );
			}
		},
		editWebhook: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				return discordClient.fetchWebhook(...evalData.webhook.split('/')).then( webhook => {
					var changes = {};
					if ( evalData.reason ) changes.reason = evalData.reason;
					if ( evalData.channel ) changes.channel = evalData.channel;
					return webhook.edit( changes ).then( newWebhook => {
						console.log( `- Dashboard: Webhook successfully edited: ${evalData.guild}#` + ( evalData.channel || webhook.channelId ) );
						newWebhook.send( evalData.text ).catch(globalThis.log_error);
						return true;
					}, error => {
						console.log( '- Dashboard: Error while editing the webhook: ' + error );
					} );
				}, error => {
					console.log( '- Dashboard: Error while editing the webhook: ' + error );
				} );
			}
		},
		verifyUser: (discordClient, evalData) => {
			globalThis.verifyOauthUser(evalData.state, evalData.access_token);
		}
	};

	dashboard.on( 'message', message => {
		if ( message.id ) {
			var data = {
				type: message.data.type,
				response: null,
				error: null
			};
			switch ( message.data.type ) {
				case 'getGuilds':
					return manager.broadcastEval( evalFunctions.getGuilds, {context: message.data} ).then( results => {
						data.response = message.data.guilds.map( (guild, i) => {
							return results.find( result => result[i] )?.[i];
						} );
					}, error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'getMember':
				case 'createWebhook':
				case 'editWebhook':
					return manager.broadcastEval( evalFunctions[message.data.type], {
						context: message.data,
						shard: shardIdForGuildId(message.data.guild, manager.totalShards)
					} ).then( result => {
						data.response = result;
					}, error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'notifyGuild':
					return manager.broadcastEval( evalFunctions.notifyGuild, {
						context: message.data,
						shard: ( message.data.prefix ? null : shardIdForGuildId(message.data.guild, manager.totalShards) )
					} ).catch( error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'notifyUser':
					return manager.broadcastEval( evalFunctions.notifyUser, {context: message.data, shard: 0} ).catch( error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'verifyUser':
					return manager.broadcastEval( evalFunctions.verifyUser, {
						context: message.data,
						shard: message.data.state.split(' ')[1][0]
					} ).catch( error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				default:
					console.log( '- [Dashboard]: Unknown message received!', message.data );
					data.error = 'Unknown message type: ' + message.data.type;
					return dashboard.send( {id: message.id, data} );
			}
		}
		console.log( '- [Dashboard]: Message received!', message );
	} );

	dashboard.on( 'error', error => {
		console.log( '- [Dashboard]: Error received!', error );
	} );

	dashboard.on( 'exit', (code) => {
		if ( code ) console.log( '- [Dashboard]: Process exited!', code );
		if ( isDebug ) {
			graceful('SIGKILL');
			manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
			process.exit(1);
		}
	} );
}

/**
 * Post bot statistics to bot lists.
 * @param {Object} botList - The list of bot lists to post to.
 * @param {Number} shardCount - The total number of shards.
 */
function postStats(botList = JSON.parse(process.env.botlist), shardCount = manager.totalShards) {
	manager.fetchClientValues('guilds.cache.size').then( results => {
		var guildCount = results.reduce( (acc, val) => acc + val, 0 );
		console.log( '- Current server count: ' + guildCount + '\n' + results.map( (count, i) => {
			return '-- Shard[' + i + ']: ' + count;
		} ).join('\n') );
		got.post( 'https://botblock.org/api/count', {
			json: Object.assign( {
				bot_id: process.env.bot,
				server_count: guildCount,
				shard_count: shardCount,
				shards: results
			}, botList )
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body.error ) {
				console.log( '- ' + response.statusCode + ': Error while posting statistics to BotBlock.org: ' + body?.message );
				return;
			}
			for ( let [key, value] of Object.entries(body.failure) ) {
				console.log( '- ' + value[0] + ': Error while posting statistics to ' + key + ': ' + value[1]?.trim?.().replaceAll('\n', ' ').substring(0, 500) );
			}
		}, error => {
			console.log( '- Error while posting statistics to BotBlock.org: ' + error );
		} );
	}, error => console.log( '- Error while getting the guild count: ' + error ) );
}

db.query( 'LISTEN debugresponse' ).then( () => {
	console.log( '- Added database debug response listener.' );
}, dberror => {
	console.log( '- Error while adding the database debug response listener: ' + dberror );
} );

db.on( 'notification', msg => {
	if ( isDebug ) console.log( '- Database notification received:', msg );
	if ( msg.channel !== 'debugresponse' || !msg.payload ) return;
	let [type, part, listener, ...payload] = msg.payload.split(' ');
	if ( !type || !part || !listener ) return;
	if ( type === 'DUMP' ) {
		if ( typeof server !== 'undefined' && server.connected ) {
			return server.send( {
				id: 'debugresponse',
				type, part, listener,
				data: payload.join(' ')
			} );
		};
		return;
	}
	if ( type === 'SITE' ) {
		let shard = +listener.split('+')[0]
		if ( Number.isNaN(shard) || shard >= manager.totalShards ) return;
		if ( shard === -1 ) {
			if ( typeof server !== 'undefined' && server.connected ) {
				return server.send( {
					id: 'debugresponse',
					type, part, listener,
					data: payload.join(' ')
				} );
			};
			return;
		}
		manager.broadcastEval( (discordClient, message) => {
			let listener = globalThis.dbListenerMap.get(message.listener);
			if ( !listener ) return;
			if ( message.part === 'CHUNK' ) {
				return listener.body += message.data;
			}
			if ( message.part === 'END' ) {
				globalThis.dbListenerMap.delete(message.listener);
				clearTimeout(listener.timeout);
				listener.resolve(listener.body);
				return;
			}
		}, {context: {
			type, part, listener,
			data: payload.join(' ')
		}, shard} );
	}
} );


/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
function graceful(signal) {
	console.log( '- ' + signal + ': Disabling respawn...' );
	manager.respawn = false;
	db.end().then( () => {
		console.log( '- ' + signal + ': Closed the listener database connection.' );
	}, dberror => {
		console.log( '- ' + signal + ': Error while closing the listener database connection: ' + dberror );
	} );
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

if ( isDebug && process.argv[3]?.startsWith( '--timeout:' ) ) {
	let timeout = process.argv[3].split(':')[1];
	console.log( `\n- Close process in ${timeout} seconds!\n` );
	setTimeout( () => {
		console.log( `\n- Running for ${timeout} seconds, closing process!\n` );
		isDebug = false;
		graceful('SIGKILL');
		manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
	}, timeout * 1_000 ).unref();
}
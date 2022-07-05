import 'dotenv/config';
import { fork as forkChildProcess } from 'node:child_process';
import gotDefault from 'got';
import { gotSsrf } from 'got-ssrf';
import { ShardingManager, ShardClientUtil } from 'discord.js';
const {shardIdForGuildId} = ShardClientUtil;

var isDebug = ( process.argv[2] === 'debug' );
if ( process.argv[2] === 'readonly' ) process.env.READONLY = 'true';
import './database.js';

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
	
	shard.on( 'spawn', () => {
		console.log( `- Shard[${shard.id}]: Spawned` );
	} );
	
	shard.on( 'message', message => {
		if ( message?.id === 'verifyUser' && server ) {
			return server.send( message );
		}
		if ( message === 'SIGKILL' ) {
			console.log( '\n- Killing all shards!\n\n' );
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
	
	shard.on( 'death', message => {
		if ( manager.respawn === false ) diedShards++;
		if ( message.exitCode ) {
			if ( !shard.ready ) {
				manager.respawn = false;
				console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error, disable respawn!\n\n` );
			}
			else console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error!\n\n` );
		}
	} );

	shard.on( 'error', error => {
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
		manager.respawn = false;
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		process.exit(1);
	}
	else manager.spawn( {
		delay: 5_000,
		timeout: 90_000
	} ).catch( error2 => {
		console.error( '- Error while spawning the shards: ' + error2 );
		manager.respawn = false;
		manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		process.exit(1);
	} );
} );

var server;
if ( process.env.dashboard ) {
	const dashboard = forkChildProcess('./dashboard/index.js', ( isDebug ? ['debug'] : [] ));
	server = dashboard;

	/** @type {Object.<string, function(import('discord.js').Client, Object)>} */
	const evalFunctions = {
		getGuilds: (discordClient, evalData) => {
			return Promise.all(
				evalData.guilds.map( id => {
					if ( discordClient.guilds.cache.has(id) ) {
						let guild = discordClient.guilds.cache.get(id);
						return guild.members.fetch(evalData.member).then( member => {
							return {
								patreon: globalThis.patreonGuildsPrefix.has(guild.id),
								memberCount: guild.memberCount,
								botPermissions: guild.me.permissions.bitfield.toString(),
								channels: guild.channels.cache.filter( channel => {
									return ( ( channel.isText() && !channel.isThread() ) || channel.type === 'GUILD_CATEGORY' );
								} ).sort( (a, b) => {
									let aVal = a.rawPosition + 1;
									if ( a.type === 'GUILD_CATEGORY' ) aVal *= 1000;
									else if ( !a.parent ) aVal -= 1000;
									else aVal += ( a.parent.rawPosition + 1 ) * 1000;
									let bVal = b.rawPosition + 1;
									if ( b.type === 'GUILD_CATEGORY' ) bVal *= 1000;
									else if ( !b.parent ) bVal -= 1000;
									else bVal += ( b.parent.rawPosition + 1 ) * 1000;
									return aVal - bVal;
								} ).map( channel => {
									return {
										id: channel.id,
										name: channel.name,
										isCategory: ( channel.type === 'GUILD_CATEGORY' ),
										userPermissions: member.permissionsIn(channel).bitfield.toString(),
										botPermissions: guild.me.permissionsIn(channel).bitfield.toString()
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
										lower: ( guild.me.roles.highest.comparePositionTo(role) > 0 && !role.managed )
									};
								} ),
								locale: guild.preferredLocale
							};
						}, error => {
							return 'noMember';
						} );
					}
				} )
			)
		},
		getMember: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				let guild = discordClient.guilds.cache.get(evalData.guild);
				return guild.members.fetch(evalData.member).then( member => {
					var response = {
						patreon: globalThis.patreonGuildsPrefix.has(guild.id),
						userPermissions: member.permissions.bitfield.toString(),
						botPermissions: guild.me.permissions.bitfield.toString()
					};
					if ( evalData.channel ) {
						let channel = guild.channels.cache.get(evalData.channel);
						if ( ( channel?.isText() && !channel.isThread() ) || ( response.patreon && evalData.allowCategory && channel?.type === 'GUILD_CATEGORY' ) ) {
							response.userPermissions = channel.permissionsFor(member).bitfield.toString();
							response.botPermissions = channel.permissionsFor(guild.me).bitfield.toString();
							response.isCategory = ( channel.type === 'GUILD_CATEGORY' );
							response.parentId = channel.parentId;
						}
						else response.message = 'noChannel';
					}
					if ( evalData.newchannel ) {
						let newchannel = guild.channels.cache.get(evalData.newchannel);
						if ( newchannel?.isText() && !newchannel.isThread() ) {
							response.userPermissionsNew = newchannel.permissionsFor(member).bitfield.toString();
							response.botPermissionsNew = newchannel.permissionsFor(guild.me).bitfield.toString();
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
				} ).catch(globalThis.log_error);
			}
		},
		createWebhook: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				let channel = discordClient.guilds.cache.get(evalData.guild).channels.cache.get(evalData.channel);
				if ( channel ) return channel.createWebhook( evalData.name, {
					avatar: discordClient.user.displayAvatarURL({format:'png',size:4096}),
					reason: evalData.reason
				} ).then( webhook => {
					console.log( `- Dashboard: Webhook successfully created: ${evalData.guild}#${evalData.channel}` );
					webhook.send( evalData.text ).catch(globalThis.log_error);
					return webhook.id + '/' + webhook.token;
				}, error => {
					console.log( '- Dashboard: Error while creating the webhook: ' + error );
				} );
			}
		},
		editWebhook: (discordClient, evalData) => {
			if ( discordClient.guilds.cache.has(evalData.guild) ) {
				return discordClient.fetchWebhook(...evalData.webhook.split('/')).then( webhook => {
					var changes = {};
					if ( evalData.channel ) changes.channel = evalData.channel;
					return webhook.edit( changes, evalData.reason ).then( newWebhook => {
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
					return manager.broadcastEval( evalFunctions.notifyGuild, {context: message.data} ).catch( error => {
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
				console.log( '- ' + response.statusCode + ': Error while posting statistics to BotBlock.org: ' + ( body && body.message ) );
				return;
			}
			for ( let [key, value] of Object.entries(body.failure) ) {
				console.log( '- ' + value[0] + ': Error while posting statistics to ' + key + ': ' + value[1]?.substring?.(0, 500) );
			}
		}, error => {
			console.log( '- Error while posting statistics to BotBlock.org: ' + error );
		} );
	}, error => console.log( '- Error while getting the guild count: ' + error ) );
}


/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
function graceful(signal) {
	console.log( '- ' + signal + ': Disabling respawn...' );
	manager.respawn = false;
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

process.on( 'exit', code => {
	if ( diedShards >= manager.totalShards ) process.exit(1);
} );

if ( isDebug && process.argv[3]?.startsWith( '--timeout:' ) ) {
	let timeout = process.argv[3].split(':')[1];
	console.log( `\n- Close process in ${timeout} seconds!\n` );
	setTimeout( () => {
		console.log( `\n- Running for ${timeout} seconds, closing process!\n` );
		isDebug = false;
		manager.shards.filter( shard => shard.process && !shard.process.killed ).forEach( shard => shard.kill() );
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
	}, timeout * 1_000 ).unref();
}
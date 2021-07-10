require('dotenv').config();

var isDebug = ( process.argv[2] === 'debug' );
if ( process.argv[2] === 'readonly' ) process.env.READONLY = true;

require('./database.js').then( () => {

const child_process = require('child_process');

const got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 30000,
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );
const {ShardingManager, ShardClientUtil: {shardIDForGuildID}} = require('discord.js');
const manager = new ShardingManager( './bot.js', {
	execArgv: ['--icu-data-dir=node_modules/full-icu'],
	shardArgs: ( isDebug ? ['debug'] : [] ),
	token: process.env.token
} );

var diedShards = 0;
manager.on( 'shardCreate', shard => {
	console.log( `- Shard[${shard.id}]: Launched` );
	
	shard.on( 'spawn', message => {
		console.log( `- Shard[${shard.id}]: Spawned` );
		shard.send( {
			shard: {
				id: shard.id
			}
		} );
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
			manager.broadcastEval( `global.isDebug = !global.isDebug` );
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
} );

manager.spawn("auto", 5500, -1).then( shards => {
	if ( !isDebug && process.env.botlist ) {
		var botList = JSON.parse(process.env.botlist);
		for ( let [key, value] of Object.entries(botList) ) {
			if ( !value ) delete botList[key];
		}
		if ( Object.keys(botList).length ) {
			setInterval( postStats, 10800000, botList, shards.size ).unref();
		}
	}
}, error => {
	console.error( '- Error while spawning the shards: ' + error );
	if ( isDebug ) {
		if ( typeof server !== 'undefined' && !server.killed ) server.kill();
		process.exit(1);
	}
	else manager.respawnAll();
} );

var server;
if ( process.env.dashboard ) {
	const dashboard = child_process.fork('./dashboard/index.js', ( isDebug ? ['debug'] : [] ));
	server = dashboard;

	dashboard.on( 'message', message => {
		if ( message.id ) {
			var data = {
				type: message.data.type,
				response: null,
				error: null
			};
			switch ( message.data.type ) {
				case 'getGuilds':
					return manager.broadcastEval(`Promise.all(
						${JSON.stringify(message.data.guilds)}.map( id => {
							if ( this.guilds.cache.has(id) ) {
								let guild = this.guilds.cache.get(id);
								return guild.members.fetch(${JSON.stringify(message.data.member)}).then( member => {
									return {
										patreon: global.patreons.hasOwnProperty(guild.id),
										memberCount: guild.memberCount,
										botPermissions: guild.me.permissions.bitfield,
										channels: guild.channels.cache.filter( channel => {
											return ( channel.isGuild() || channel.type === 'category' );
										} ).sort( (a, b) => {
											let aVal = a.rawPosition + 1;
											if ( a.type === 'category' ) aVal *= 1000;
											else if ( !a.parent ) aVal -= 1000;
											else aVal += ( a.parent.rawPosition + 1 ) * 1000;
											let bVal = b.rawPosition + 1;
											if ( b.type === 'category' ) bVal *= 1000;
											else if ( !b.parent ) bVal -= 1000;
											else bVal += ( b.parent.rawPosition + 1 ) * 1000;
											return aVal - bVal;
										} ).map( channel => {
											return {
												id: channel.id,
												name: channel.name,
												isCategory: ( channel.type === 'category' ),
												userPermissions: member.permissionsIn(channel).bitfield,
												botPermissions: guild.me.permissionsIn(channel).bitfield
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
								} )
							}
						} )
					)`).then( results => {
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
					return manager.broadcastEval(`if ( this.guilds.cache.has(${JSON.stringify(message.data.guild)}) ) {
						let guild = this.guilds.cache.get(${JSON.stringify(message.data.guild)});
						guild.members.fetch(${JSON.stringify(message.data.member)}).then( member => {
							var response = {
								patreon: global.patreons.hasOwnProperty(guild.id),
								userPermissions: member.permissions.bitfield,
								botPermissions: guild.me.permissions.bitfield
							};
							if ( ${JSON.stringify(message.data.channel)} ) {
								let channel = guild.channels.cache.get(${JSON.stringify(message.data.channel)});
								if ( channel?.isText() || ( response.patreon && ${JSON.stringify(message.data.allowCategory)} && channel?.type === 'category' ) ) {
									response.userPermissions = channel.permissionsFor(member).bitfield;
									response.botPermissions = channel.permissionsFor(guild.me).bitfield;
									response.isCategory = ( channel.type === 'category' );
									response.parentID = channel.parentID;
								}
								else response.message = 'noChannel';
							}
							if ( ${JSON.stringify(message.data.newchannel)} ) {
								let newchannel = guild.channels.cache.get(${JSON.stringify(message.data.newchannel)});
								if ( newchannel?.isText() ) {
									response.userPermissionsNew = newchannel.permissionsFor(member).bitfield;
									response.botPermissionsNew = newchannel.permissionsFor(guild.me).bitfield;
								}
								else response.message = 'noChannel';
							}
							return response;
						}, error => {
							return 'noMember';
						} );
					}`, shardIDForGuildID(message.data.guild, manager.totalShards)).then( result => {
						data.response = result;
					}, error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'notifyGuild':
					return manager.broadcastEval(`if ( ${JSON.stringify(message.data.prefix)} ) {
						global.patreons[${JSON.stringify(message.data.guild)}] = ${JSON.stringify(message.data.prefix)};
					}
					if ( ${JSON.stringify(message.data.voice)} && global.voice.hasOwnProperty(${JSON.stringify(message.data.guild)}) ) {
						global.voice[${JSON.stringify(message.data.guild)}] = ${JSON.stringify(message.data.voice)};
					}
					if ( this.guilds.cache.has(${JSON.stringify(message.data.guild)}) ) {
						let channel = this.guilds.cache.get(${JSON.stringify(message.data.guild)}).publicUpdatesChannel;
						if ( channel ) channel.send( ${JSON.stringify(message.data.text)}, {
							embed: ${JSON.stringify(message.data.embed)},
							files: ${JSON.stringify(message.data.file)},
							allowedMentions: {parse: []}, split: true
						} ).catch( error => {} );
					}`).catch( error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'createWebhook':
					return manager.broadcastEval(`if ( this.guilds.cache.has(${JSON.stringify(message.data.guild)}) ) {
						let channel = this.guilds.cache.get(${JSON.stringify(message.data.guild)}).channels.cache.get(${JSON.stringify(message.data.channel)});
						if ( channel ) channel.createWebhook( ${JSON.stringify(message.data.name)}, {
							avatar: ( ${JSON.stringify(message.data.avatar)} || this.user.displayAvatarURL({format:'png',size:4096}) ),
							reason: ${JSON.stringify(message.data.reason)}
						} ).then( webhook => {
							console.log( '- Dashboard: Webhook successfully created: ${message.data.guild}#${message.data.channel}' );
							webhook.send( ${JSON.stringify(message.data.text)} ).catch(log_error);
							return webhook.id + '/' + webhook.token;
						}, error => {
							console.log( '- Dashboard: Error while creating the webhook: ' + error );
						} );
					}`, shardIDForGuildID(message.data.guild, manager.totalShards)).then( result => {
						data.response = result;
					}, error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'editWebhook':
					return manager.broadcastEval(`if ( this.guilds.cache.has(${JSON.stringify(message.data.guild)}) ) {
						this.fetchWebhook(...${JSON.stringify(message.data.webhook.split('/'))}).then( webhook => {
							var changes = {};
							if ( ${JSON.stringify(message.data.channel)} ) changes.channel = ${JSON.stringify(message.data.channel)};
							if ( ${JSON.stringify(message.data.name)} ) changes.name = ${JSON.stringify(message.data.name)};
							if ( ${JSON.stringify(message.data.avatar)} ) changes.avatar = ${JSON.stringify(message.data.avatar)};
							return webhook.edit( changes, ${JSON.stringify(message.data.reason)} ).then( newwebhook => {
								console.log( '- Dashboard: Webhook successfully edited: ${message.data.guild}#' + ( ${JSON.stringify(message.data.channel)} || webhook.channelID ) );
								webhook.send( ${JSON.stringify(message.data.text)} ).catch(log_error);
								return true;
							}, error => {
								console.log( '- Dashboard: Error while editing the webhook: ' + error );
							} );
						}, error => {
							console.log( '- Dashboard: Error while editing the webhook: ' + error );
						} );
					}`, shardIDForGuildID(message.data.guild, manager.totalShards)).then( result => {
						data.response = result;
					}, error => {
						data.error = error.toString();
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'verifyUser':
					return manager.broadcastEval(`global.verifyOauthUser(${JSON.stringify(message.data.state)}, ${JSON.stringify(message.data.access_token)})`, message.data.state.split(' ')[1][0]).catch( error => {
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
	}, timeout * 1000 ).unref();
}

}, () => {
	process.exit(1);
} )

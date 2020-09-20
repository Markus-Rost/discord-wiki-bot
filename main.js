require('dotenv').config();
const child_process = require('child_process');

const isDebug = ( process.argv[2] === 'debug' );
if ( process.argv[2] === 'readonly' ) process.env.READONLY = true;
const got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 30000,
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );
const {ShardingManager} = require('discord.js');
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
		if ( message === 'SIGKILL' ) {
			console.log( '\n- Killing all shards!\n\n' );
			manager.shards.forEach( shard => shard.kill() );
			if ( typeof server !== 'undefined' ) server.kill();
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

manager.spawn().then( shards => {
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
	manager.respawnAll();
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
								return guild.members.fetch('${message.data.member}').then( member => {
									return {
										botPermissions: guild.me.permissions.bitfield,
										channels: guild.channels.cache.filter( channel => {
											return ( channel.type === 'text' );
										} ).sort( (a, b) => {
											return a.rawPosition - b.rawPosition;
										} ).map( channel => {
											return {
												id: channel.id,
												name: channel.name,
												permissions: member.permissionsIn(channel).bitfield
											};
										} )
									};
								} )
							}
						} )
					)`).then( results => {
						data.response = message.data.guilds.map( (guild, i) => {
							return results.find( result => result[i] )?.[i];
						} );
					}, error => {
						data.error = error;
					} ).finally( () => {
						return dashboard.send( {id: message.id, data} );
					} );
					break;
				case 'getMember':
					return manager.broadcastEval(`if ( this.guilds.cache.has('${message.data.guild}') ) {
						let guild = this.guilds.cache.get('${message.data.guild}');
						guild.members.fetch('${message.data.member}').then( member => {
							return member.permissions.bitfield;
						} );
					}`).then( results => {
						data.response = results.find( result => result );
					}, error => {
						data.error = error;
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
				console.log( '- ' + value[0] + ': Error while posting statistics to ' + key + ': ' + value[1] );
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
		manager.shards.forEach( shard => shard.kill() );
		if ( typeof server !== 'undefined' ) server.kill();
	}, timeout * 1000 ).unref();
}
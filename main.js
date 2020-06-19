require('dotenv').config();

const isDebug = ( process.argv[2] === 'debug' );
const got = require('got').extend( {
	throwHttpErrors: true,
	timeout: 5000,
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ')'
	}
} );
const {ShardingManager} = require('discord.js');
const manager = new ShardingManager( './bot.js', {
	execArgv: ['--icu-data-dir=node_modules/full-icu'],
	shardArgs: ( isDebug ? ['debug'] : [] ),
	token: process.env.token
} );

var diedShards = 0;
manager.on( 'shardCreate', shard => {
	console.log( `\n- Shard[${shard.id}]: Launched` );
	
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
		}
		if ( message === 'postStats' ) postStats();
	} );
	
	shard.on( 'death', message => {
		if ( manager.respawn === false ) diedShards++;
		if ( message.exitCode !== 0 ) {
			if ( !shard.ready ) {
				manager.respawn = false;
				console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error, disable respawn!\n\n` );
			}
			else console.log( `\n\n- Shard[${shard.id}]: Died due to fatal error!\n\n` );
		}
	} );
} );

manager.spawn().then( shards => {
	if ( !isDebug ) setInterval( postStats, 10800000, shards.size ).unref();
}, error => {
	console.error( '- Error while spawning the shards: ' + error );
	manager.respawnAll();
} );

function postStats(shardCount = manager.totalShards) {
	manager.fetchClientValues('guilds.cache.size').then( results => {
		var guildCount = results.reduce( (acc, val) => acc + val, 0 );
		console.log( '- Current server count: ' + guildCount + '\n' + results.map( (count, i) => {
			return '-- Shard[' + i + ']: ' + count;
		} ).join('\n') );
		if ( process.env.toptoken ) got.post( 'https://top.gg/api/bots/' + process.env.bot + '/stats', {
			headers: {
				Authorization: process.env.toptoken
			},
			json: {
				server_count: guildCount,
				shards: results,
				shard_count: shardCount
			},
			responseType: 'json'
		} ).catch( error => {
			console.log( '- Error while posting statistics to https://top.gg/bot/' + process.env.bot + ': ' + error );
		} );
		if ( process.env.dbggtoken ) got.post( 'https://discord.bots.gg/api/v1/bots/' + process.env.bot + '/stats', {
			headers: {
				Authorization: process.env.dbggtoken
			},
			json: {
				guildCount: guildCount
			},
			responseType: 'json'
		} ).catch( error => {
			console.log( '- Error while posting statistics to https://discord.bots.gg/bots/' + process.env.bot + ': ' + error );
		} );
		if ( process.env.bodtoken ) got.post( 'https://bots.ondiscord.xyz/bot-api/bots/' + process.env.bot + '/guilds', {
			headers: {
				Authorization: process.env.bodtoken
			},
			json: {
				guildCount: guildCount
			},
			responseType: 'json'
		} ).catch( error => {
			console.log( '- Error while posting statistics to https://bots.ondiscord.xyz/bots/' + process.env.bot + ': ' + error );
		} );
		if ( process.env.dbltoken ) got.post( 'https://discordbotlist.com/api/v1/bots/' + process.env.bot + '/stats', {
			headers: {
				Authorization: process.env.dbltoken
			},
			json: {
				guilds: guildCount
			},
			responseType: 'json'
		} ).catch( error => {
			console.log( '- Error while posting statistics to https://discordbotlist.com/bots/' + process.env.bot + ': ' + error );
		} );
	}, error => console.log( '- Error while getting the guild count: ' + error ) );
}


async function graceful(signal) {
	console.log( '- ' + signal + ': Disabling respawn...' );
	manager.respawn = false;
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

process.on( 'exit', code => {
	if ( diedShards >= manager.totalShards ) process.exit(1);
} );
require('dotenv').config();
const {ShardingManager} = require('discord.js');
const manager = new ShardingManager( './bot.js', {
	execArgv: ['--icu-data-dir=node_modules/full-icu'],
	shardArgs: ( process.argv[2] === 'debug' ? ['debug'] : [] ),
	token: process.env.token
} );

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
	} );
} );

manager.spawn();

async function graceful(signal) {
	console.log( '- ' + signal + ': Disabling respawn...' );
	manager.respawn = false;
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
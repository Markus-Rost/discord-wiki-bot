require('dotenv').config();
const {ShardingManager} = require('discord.js');
const manager = new ShardingManager( './bot.js', {
	execArgv: ['--icu-data-dir=node_modules/full-icu'],
	shardArgs: ( process.argv[2] === 'debug' ? ['debug'] : [] ),
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

manager.spawn().catch( error => {
	console.error( '- ' + error.name + ': ' + error.message );
	manager.respawnAll();
} );

async function graceful(signal) {
	console.log( '- ' + signal + ': Disabling respawn...' );
	manager.respawn = false;
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

process.on( 'exit', code => {
	if ( diedShards >= manager.totalShards ) process.exit(1);
} );
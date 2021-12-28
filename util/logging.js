import { createWriteStream } from 'fs';

/**
 * Log wikis by usage.
 * @param {import('./wiki.js').default} wiki - The wiki.
 * @param {String} [guild] - The guild.
 * @param {String[]} [notes] - The notes about the usage.
 */
var logging = function(wiki, guild, ...notes) {};

if ( process.env.usagelog ) {
	const usageLog = createWriteStream(process.env.usagelog, {flags:'a'});
	
	usageLog.on( 'error', (error) => {
		console.log( '- ' + process.env.SHARDS + ': Error while logging the usage: ' + error );
	} );
	
	/**
	 * Log wikis by usage.
	 * @param {import('./wiki.js').default} wiki - The wiki.
	 * @param {String} [guild] - The guild.
	 * @param {String[]} [notes] - The notes about the usage.
	 */
	logging = function(wiki, guild, ...notes) {
		usageLog.write( [new Date().toISOString(), wiki, ( guild || 'DM' ), ...notes].join('\t') + '\n', 'utf8' );
	};
}

export default logging;
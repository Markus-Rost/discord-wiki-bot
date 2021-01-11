if ( !process.env.usagelog ) {
	module.exports = function() {};
	return;
}

const fs = require('fs');
const usageLog = fs.createWriteStream(process.env.usagelog, {flags:'a'});

usageLog.on( 'error', (error) => {
	console.log( '- ' + shardId + ': Error while logging the usage: ' + error );
} );

/**
 * Log wikis by usage.
 * @param {import('./wiki.js')} wiki - The wiki.
 * @param {String} [guild] - The guild.
 * @param {String[]} [notes] - The notes about the usage.
 */
function logging(wiki, guild = 'DM', ...notes) {
	usageLog.write( [new Date().toISOString(), wiki.href, guild, ...notes].join('\t') + '\n', 'utf8' );
}

module.exports = logging;
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
 * @param {String[]} notes - The notes about the usage.
 * @returns {Boolean}
 */
function logging(wiki, ...notes) {
	return usageLog.write( `${new Date().toISOString()}\t${wiki.href}\t${notes.join('\t')}\n`, 'utf8' );
}

module.exports = logging;
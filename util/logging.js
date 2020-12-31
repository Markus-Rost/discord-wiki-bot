if ( !process.env.usagelog ) {
	module.exports = function() {};
	return;
}

const fs = require('fs');
const usageLog = fs.createWriteStream(process.env.usagelog, {flags:'a'});

/**
 * Log wikis by usage.
 * @param {import('./wiki.js')} wiki - The wiki.
 * @param {String[]} notes - The notes about the usage.
 * @returns {Boolean}
 */
function logging(wiki, ...notes) {
	return usageLog.write( `${new Date().toISOString()} ${wiki.href} ${notes.join(' ')}\n`, 'utf8' );
}

module.exports = logging;
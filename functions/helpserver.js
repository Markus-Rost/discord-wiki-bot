const help_setup = require('./helpsetup.js');

/**
 * Post a message about the help server.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 */
function help_server(lang, msg) {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	msg.sendChannel( lang.get('helpserver') + '\n' + process.env.invite );
}

module.exports = help_server;
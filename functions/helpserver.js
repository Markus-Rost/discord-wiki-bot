const help_setup = require('./helpsetup.js');

function help_server(lang, msg) {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	msg.sendChannel( lang.get('helpserver') + '\n' + process.env.invite );
}

module.exports = help_server;
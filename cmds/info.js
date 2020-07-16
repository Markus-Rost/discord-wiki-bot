const help_server = require('../functions/helpserver.js');

function cmd_info(lang, msg, args, line, wiki) {
	if ( args.join('') ) this.LINK(lang, msg, line, wiki);
	else {
		msg.sendChannel( lang.get('disclaimer', '*MarkusRost*') + '\n<' + process.env.patreon + '>' );
		help_server(lang, msg);
		this.invite(lang, msg, args, line, wiki);
	}
}

module.exports = {
	name: 'info',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_info
};
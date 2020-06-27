const {defaultPermissions} = require('../util/default.json');

function cmd_invite(lang, msg, args, line, wiki) {
	if ( args.join('') ) {
		this.LINK(lang, msg, line, wiki);
	} else {
		msg.client.generateInvite(defaultPermissions).then( invite => msg.sendChannel( lang.get('invite.bot') + '\n<' + invite + '>' ), log_error );
	}
}

module.exports = {
	name: 'invite',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_invite
};
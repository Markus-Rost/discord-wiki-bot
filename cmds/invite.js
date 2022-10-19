import { OAuth2Scopes } from 'discord.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultPermissions} = require('../util/default.json');

/**
 * Processes the "invite" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
export default function cmd_invite(lang, msg, args, line, wiki) {
	if ( args.join('') ) {
		this.LINK(lang, msg, line, wiki);
	}
	else {
		let invite = msg.client.generateInvite({
			scopes: [
				OAuth2Scopes.Bot,
				OAuth2Scopes.ApplicationsCommands
			],
			permissions: defaultPermissions
		});
		msg.sendChannel( lang.get('invite.bot') + '\n<' + invite + '>' );
	}
}

export const cmdData = {
	name: 'invite',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_invite
};
import help_server from '../functions/helpserver.js';

/**
 * Processes the "info" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
function cmd_info(lang, msg, args, line, wiki) {
	if ( args.join('') ) this.LINK(lang, msg, line, wiki);
	else {
		msg.sendChannel( lang.get('general.disclaimer', '*MarkusRost*') + '\n<' + process.env.patreon + '>' );
		help_server(lang, msg);
		this.invite(lang, msg, args, line, wiki);
	}
}

export default {
	name: 'info',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_info
};
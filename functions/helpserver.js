import help_setup from './helpsetup.js';

/**
 * Post a message about the help server.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 */
export default function help_server(lang, msg) {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	msg.sendChannel( lang.get('general.helpserver') + '\n' + process.env.invite );
}
/**
 * Send send message to setup the bot.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 */
export default function help_setup(lang, msg) {
	msg.defaultSettings = false;
	msg.replyMsg( lang.get('general.default', '`' + process.env.prefix + 'settings`') + ( process.env.dashboard ? '\n' + new URL(`/guild/${msg.guildId}/settings`, process.env.dashboard).href : '' ) );
}
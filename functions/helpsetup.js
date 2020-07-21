/**
 * Send send message to setup the bot.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 */
function help_setup(lang, msg) {
	msg.defaultSettings = false;
	msg.replyMsg( lang.get('settings.missing', '`' + process.env.prefix + 'settings lang`', '`' + process.env.prefix + 'settings wiki`') );
}

module.exports = help_setup;
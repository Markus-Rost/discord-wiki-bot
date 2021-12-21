/**
 * Processes the "pause" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
function cmd_pause(lang, msg, args, line, wiki) {
	if ( msg.inGuild() && args.join(' ').split('\n')[0].isMention(msg.guild) && ( msg.isAdmin() || msg.isOwner() ) ) {
		if ( pausedGuilds.has(msg.guildId) ) {
			pausedGuilds.delete(msg.guildId);
			console.log( '- Pause ended.' );
			msg.replyMsg( lang.get('pause.off'), true );
		} else {
			msg.replyMsg( lang.get('pause.on'), true );
			console.log( '- Pause started.' );
			pausedGuilds.add(msg.guildId);
		}
	} else if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) {
		this.LINK(lang, msg, line, wiki);
	}
}

export default {
	name: 'pause',
	everyone: true,
	pause: true,
	owner: true,
	run: cmd_pause
};
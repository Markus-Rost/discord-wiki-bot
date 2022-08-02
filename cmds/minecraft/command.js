/**
 * Processes Minecraft commands.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
function minecraft_command(lang, msg, wiki, args, title, cmd, reaction, spoiler, noEmbed) {
	if ( args.join('') ) {
		if ( args[0].startsWith( '/' ) ) return this.SYNTAX(lang, msg, wiki, args[0].substring(1), args.slice(1), title, cmd, reaction, spoiler, noEmbed);
		return this.SYNTAX(lang, msg, wiki, args[0], args.slice(1), title, cmd, reaction, spoiler, noEmbed);
	}
	msg.notMinecraft = true;
	return this.WIKI(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed);
}

export default {
	name: 'command',
	run: minecraft_command
};
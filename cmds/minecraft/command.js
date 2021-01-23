/**
 * Processes Minecraft commands.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../util/wiki.js')} wiki - The wiki.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function minecraft_command(lang, msg, wiki, args, title, cmd, reaction, spoiler) {
	if ( args.join('') ) {
		if ( args[0].startsWith( '/' ) ) this.SYNTAX(lang, msg, wiki, args[0].substring(1), args.slice(1), title, cmd, reaction, spoiler);
		else this.SYNTAX(lang, msg, wiki, args[0], args.slice(1), title, cmd, reaction, spoiler);
	}
	else {
		msg.notMinecraft = true;
		this.WIKI.general(lang, msg, title, wiki, cmd, reaction, spoiler);
	}
}

module.exports = {
	name: 'command',
	run: minecraft_command
};
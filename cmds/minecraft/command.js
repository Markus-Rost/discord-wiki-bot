const Wiki = require('../../util/wiki.js');

/**
 * Processes Minecraft commands.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function minecraft_command(lang, msg, args, title, cmd, querystring, fragment, reaction, spoiler) {
	if ( args.join('') ) {
		if ( args[0].startsWith( '/' ) ) this.SYNTAX(lang, msg, args[0].substring(1), args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
		else this.SYNTAX(lang, msg, args[0], args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
	}
	else {
		msg.notMinecraft = true;
		this.WIKI.general(lang, msg, title, new Wiki(lang.get('minecraft.link')), cmd, reaction, spoiler, querystring, fragment);
	}
}

module.exports = {
	name: 'command',
	run: minecraft_command
};
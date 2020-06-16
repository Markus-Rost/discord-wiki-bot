function minecraft_command(lang, msg, args, title, cmd, querystring, fragment, reaction, spoiler) {
	if ( args.join('') ) {
		if ( args[0].startsWith( '/' ) ) this.SYNTAX(lang, msg, args[0].substring(1), args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
		else this.SYNTAX(lang, msg, args[0], args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
	}
	else {
		msg.notMinecraft = true;
		this.WIKI.gamepedia(lang, msg, title, lang.minecraft.link, cmd, reaction, spoiler, querystring, fragment);
	}
}

module.exports = {
	name: 'command',
	run: minecraft_command
};
const Wiki = require('../../util/wiki.js');
const commands = require('./commands.json');

/**
 * Sends a Minecraft command.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} mccmd - The Minecraft command argument.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function minecraft_syntax(lang, msg, mccmd, args, title, cmd, querystring, fragment, reaction, spoiler) {
	mccmd = mccmd.toLowerCase();
	var aliasCmd = ( commands.aliases[mccmd] || mccmd );
	
	if ( aliasCmd in commands.list ) {
		var cmdSyntaxMap = commands.list[aliasCmd].map( command => {
			var cmdargs = command.split(' ');
			if ( cmdargs[0].startsWith( '/' ) ) cmdargs = cmdargs.slice(1);
			var argmatches = cmdargs.map( (arg, i) => {
				if ( arg === args[i] ) return true;
			} );
			var matchCount = 0;
			argmatches.forEach( match => {
				if ( match ) matchCount++;
			} );
			return [argmatches.lastIndexOf(true),matchCount];
		} );
		var lastIndex = Math.max(...cmdSyntaxMap.map( command => command[0] ));
		var matchCount = Math.max(...cmdSyntaxMap.filter( command => command[0] === lastIndex ).map( command => command[1] ));
		var regex = new RegExp('/' + aliasCmd, 'g');
		var cmdSyntax = commands.list[aliasCmd].filter( (command, i) => ( lastIndex === -1 || cmdSyntaxMap[i][0] === lastIndex ) && cmdSyntaxMap[i][1] === matchCount ).join('\n').replaceSave( regex, '/' + mccmd );
		msg.sendChannel( spoiler + '```md\n' + cmdSyntax + '```<' + lang.get('minecraft.link') + lang.get('minecraft.cmdpage') + aliasCmd + '>' + spoiler, {split:{maxLength:2000,prepend:spoiler + '```md\n',append:'```' + spoiler}} );
		if ( reaction ) reaction.removeEmoji();
	}
	else {
		msg.reactEmoji('❓');
		msg.notMinecraft = true;
		this.WIKI.general(lang, msg, title, new Wiki(lang.get('minecraft.link')), cmd, reaction, spoiler, querystring, fragment);
	}
}

module.exports = {
	name: 'SYNTAX',
	run: minecraft_syntax
};
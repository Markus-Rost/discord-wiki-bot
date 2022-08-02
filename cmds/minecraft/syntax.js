import { got, splitMessage } from '../../util/functions.js';
import Wiki from '../../util/wiki.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const commands = require('./commands.json');

/**
 * Sends a Minecraft command.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki.
 * @param {String} mccmd - The Minecraft command argument.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
function minecraft_syntax(lang, msg, wiki, mccmd, args, title, cmd, reaction, spoiler, noEmbed) {
	mccmd = mccmd.toLowerCase();
	var aliasCmd = ( commands.aliases[mccmd] || mccmd );
	var cmdpage = commands.wikis[wiki.href];
	if ( commands.list.hasOwnProperty(aliasCmd) ) {
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
		return got.get( wiki + ( cmdpage.endsWith( '/' ) ? 'api.php?action=query&redirects=true&converttitles=true&titles=%1F' + encodeURIComponent( cmdpage + aliasCmd ) : 'api.php?action=parse&redirects=true&prop=sections&page=' + encodeURIComponent( cmdpage ) ) + '&format=json', {
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warning(body.warnings);
			if ( response.statusCode !== 200 || !( body?.query?.pages || body?.parse?.sections?.length ) ) {
				console.log( '- ' + response.statusCode + ': Error while getting the command page: ' + ( body && body.error && body.error.info ) );
			}
			else if ( cmdpage.endsWith( '/' ) ) {
				if ( body.query.pages['-1'] ) {
					wiki = new Wiki('https://minecraft.fandom.com/');
					cmdpage = 'Commands/';
				}
				else {
					cmdpage = Object.values(body.query.pages)[0].title;
					aliasCmd = ( body.query.redirects?.[0]?.tofragment || '' );
				}
			}
			else {
				cmdpage = body.parse.title;
				if ( !body.parse.sections.some( section => section.anchor === aliasCmd ) ) {
					if ( body.parse.sections.some( section => section.anchor === mccmd ) ) {
						aliasCmd = mccmd;
					}
					else {
						wiki = new Wiki('https://minecraft.fandom.com/');
						cmdpage = 'Commands/';
					}
				}
			}
		}, error => {
			console.log( '- Error while getting the command page: ' + error );
		} ).then( () => {
			return {message: splitMessage( spoiler + '```md\n' + cmdSyntax + '```<' + wiki.toLink(( cmdpage.endsWith( '/' ) ? cmdpage + aliasCmd : cmdpage ), '', ( cmdpage.endsWith( '/' ) ? '' : aliasCmd )) + '>' + spoiler, {maxLength: 2000, prepend: spoiler + '```md\n', append: '```' + spoiler} )};
		} );
	}
	msg.notMinecraft = true;
	return this.WIKI(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed);
}

export default {
	name: 'SYNTAX',
	run: minecraft_syntax
};
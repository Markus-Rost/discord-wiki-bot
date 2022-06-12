import help_server from '../functions/helpserver.js';
import { splitMessage } from '../util/functions.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {wikis: mcw} = require('./minecraft/commands.json');

const helpmap = {
	linkHelp: ['default', 'inline.link', 'inline.template', 'gamepedia', 'fandom', 'wikia'],
	link: ['default', 'inline.link', 'inline.template', 'gamepedia', 'fandom', 'wikia', 'mwprojects'],
	inline: ['inline.link', 'inline.template'],
	user: ['user'],
	overview: ['overview'],
	random: ['random'],
	diff: ['diff.name', 'diff.id'],
	page: ['page'],
	search: ['search'],
	minecraftHelp: ['minecraft.default', 'minecraft.bug'],
	command: ['minecraft.default', 'minecraft.command'],
	bug: ['minecraft.bug'],
	discussion: ['discussion.thread', 'discussion.post'],
	info: ['info'],
	help: ['help.default', 'help.command', 'help.admin'],
	settings: ['settings.default', 'settings.wiki', 'settings.lang', 'settings.role', 'settings.inline', 'settings.prefix', 'settings.channel'],
	verify: ['verify'],
	verification: ['verification.default', 'verification.add', 'verification.channel', 'verification.role', 'verification.editcount', 'verification.postcount', 'verification.usergroup', 'verification.accountage', 'verification.rename', 'verification.delete'],
	rcscript: ['rcscript.default', 'rcscript.add', 'rcscript.wiki', 'rcscript.lang', 'rcscript.display', 'rcscript.feeds', 'rcscript.delete'],
	pause: ['pause.inactive'],
	test: ['test'],
}

const helplist = {
	default: [
		'linkHelp',
		'user',
		'overview',
		'random',
		'diff',
		'minecraftHelp',
		'discussion',
		'info',
		'help',
		'test'
	],
	admin: [
		'help.admin',
		'settings.default',
		'verification.default',
		'rcscript.default',
		'pause.inactive'
	],
	pause: [
		'pause.active',
		'settings.default',
		'verification.default',
		'rcscript.default',
		'test'
	],
	minecraft: [
		'minecraft.default',
		'minecraft.bug'
	]
}

const restrictions = {
	fandom: ['discussion'],
	minecraft: ['minecraftHelp', 'command', 'bug'],
	admin: ['settings', 'verification', 'rcscript', 'pause'],
	inline: ['inline.link', 'inline.template'],
	patreon: ['settings.prefix'],
	experimental: []
}

/**
 * Processes the "help" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
function cmd_help(lang, msg, args, line, wiki) {
	if ( msg.inGuild() && pausedGuilds.has(msg.guildId) && ( args.join('') || !msg.isAdmin() ) ) return;
	if ( msg.isAdmin() && msg.defaultSettings ) help_server(lang, msg);
	var isMinecraft = mcw.hasOwnProperty(wiki.href);
	var maxLength = ( ['hi', 'bn'].includes( lang.lang ) ? 480 : 2000 );
	if ( args.join('') ) {
		if ( args.join(' ').isMention(msg.guild) ) {
			if ( !( msg.isAdmin() && msg.defaultSettings ) ) help_server(lang, msg);
			return;
		}
		var invoke = args[0].toLowerCase();
		var cmd = ( lang.aliases[invoke] || invoke );
		if ( cmd === 'admin' ) {
			if ( !msg.inGuild() || msg.isAdmin() ) {
				var cmdlist = lang.get('help.admin') + '\n';
				if ( process.env.READONLY ) cmdlist = msg.author.toString() + ', ' + lang.get('general.readonly') + '\n' + process.env.invite + '\n\n' + cmdlist;
				cmdlist += formathelp(helplist.admin, msg, lang);
				cmdlist += '\n\n🔸 ' + lang.get('help.adminfooter');
				if ( process.env.dashboard ) cmdlist += '\n\t\t' + new URL(( msg.inGuild() ? `/guild/${msg.guildId}/settings` : '/' ), process.env.dashboard).href;
				splitMessage( cmdlist, {char: '\n🔹', maxLength, prepend: '🔹'} ).forEach( textpart => msg.sendChannel( textpart ) );
			}
			else {
				msg.replyMsg( {content: lang.get('help.noadmin'), allowedMentions: {repliedUser: false}} );
			}
		}
		else if ( cmd === 'minecraft' ) {
			var cmdlist = '<' + ( isMinecraft ? wiki : 'https://minecraft.fandom.com/' ) + '>\n';
			cmdlist += formathelp(helplist.minecraft, msg, lang);
			splitMessage( cmdlist, {char: '\n🔹', maxLength, prepend: '🔹'} ).forEach( textpart => msg.sendChannel( textpart ) );
		}
		else if ( helpmap.hasOwnProperty(cmd) && 
		( !restrictions.fandom.includes( cmd ) || wiki.isFandom(false) ) && 
		( !restrictions.minecraft.includes( cmd ) || isMinecraft ) && 
		( !restrictions.admin.includes( cmd ) || msg.isAdmin() ) ) {
			var cmdlist = formathelp(helpmap[cmd], msg, lang);
			if ( !cmdlist.length ) msg.reactEmoji('❓');
			else splitMessage( cmdlist, {char: '\n🔹', maxLength, prepend: '🔹'} ).forEach( textpart => msg.sendChannel( textpart ) );
		}
		else msg.reactEmoji('❓');
	}
	else if ( msg.isAdmin() && pausedGuilds.has(msg.guildId) ) {
		var cmdlist = lang.get('help.pause') + '\n';
		cmdlist += formathelp(helplist.pause, msg, lang);
		splitMessage( cmdlist, {char: '\n🔹', maxLength, prepend: '🔹'} ).forEach( textpart => msg.sendChannel( textpart ) );
	}
	else {
		var cmdlist = lang.get('help.all') + '\n';
		helplist.default.forEach( cmd => {
			if ( ( !restrictions.fandom.includes( cmd ) || wiki.isFandom(false) ) && 
			( !restrictions.minecraft.includes( cmd ) || isMinecraft ) ) {
				cmdlist += formathelp(helpmap[cmd], msg, lang) + '\n';
			}
		} );
		cmdlist += '\n🔸 ' + lang.get('help.footer');
		splitMessage( cmdlist, {char: '\n🔹', maxLength, prepend: '🔹'} ).forEach( textpart => msg.sendChannel( textpart ) );
	}
}

/**
 * Format the help messages.
 * @param {String[]} messages - The help messages.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../util/i18n.js').default} lang - The user language.
 */
function formathelp(messages, msg, lang) {
	var prefix = ( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix );
	var mention = '@' + ( msg.inGuild() ? msg.guild.me.displayName : msg.client.user.username );
	return messages.filter( message => {
		if ( restrictions.inline.includes( message ) && msg.noInline ) return false;
		if ( !restrictions.patreon.includes( message ) ) return true;
		return ( msg.inGuild() && patreonGuildsPrefix.has(msg.guildId) );
	} ).map( message => {
		var cmd = message.split('.')[0];
		var intro = ( restrictions.inline.includes( message ) ? '' : prefix );
		return '🔹 `' + intro + lang.get('help.list.' + message + '.cmd', mention).replace( new RegExp( '^' + cmd ), ( lang.localNames[cmd] || cmd ) ) + '`\n\t' + ( restrictions.experimental.includes( message ) ? lang.get('general.experimental') + '\n\t' : '' ) + lang.get('help.list.' + message + '.desc', prefix)
	} ).join('\n');
}

export default {
	name: 'help',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_help
};
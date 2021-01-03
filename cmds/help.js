const help_server = require('../functions/helpserver.js');

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
	verification: ['verification.default', 'verification.add', 'verification.channel', 'verification.role', 'verification.editcount', 'verification.usergroup', 'verification.accountage', 'verification.rename', 'verification.delete'],
	rcscript: ['rcscript.default', 'rcscript.add', 'rcscript.wiki', 'rcscript.lang', 'rcscript.display', 'rcscript.feeds', 'rcscript.delete'],
	voice: ['voice'],
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
		'voice',
		'pause.inactive'
	],
	pause: [
		'pause.active',
		'settings.default',
		'verification.default',
		'rcscript.default',
		'voice',
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
	admin: ['settings', 'verification', 'rcscript', 'voice', 'pause'],
	inline: ['inline.link', 'inline.template'],
	patreon: ['settings.prefix'],
	experimental: []
}

/**
 * Processes the "help" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 */
function cmd_help(lang, msg, args, line, wiki) {
	if ( msg.channel.isGuild() && pause[msg.guild.id] && ( args.join('') || !msg.isAdmin() ) ) return;
	if ( msg.isAdmin() && msg.defaultSettings ) help_server(lang, msg);
	var isMinecraft = ( wiki.href === lang.get('minecraft.link') );
	var maxLength = ( ['hi', 'bn'].includes( lang.lang ) ? 480 : 2000 );
	if ( args.join('') ) {
		if ( args.join(' ').isMention(msg.guild) ) {
			if ( !( msg.isAdmin() && msg.defaultSettings ) ) help_server(lang, msg);
			return;
		}
		var invoke = args[0].toLowerCase();
		var cmd = ( lang.aliases[invoke] || invoke );
		if ( cmd === 'admin' ) {
			if ( !msg.channel.isGuild() || msg.isAdmin() ) {
				var embed = new MessageEmbed().setTitle( lang.get('help.admin') ).setFooter( 'Admin Help' ).setTimestamp();
				var cmdlist = formathelp(helplist.admin, msg, lang);
				cmdlist += '\n\n🔸 ' + lang.get('help.adminfooter');
				cmdlist += '\n\t\t' + new URL(( msg.channel.isGuild() ? `/guild/${msg.guild.id}/settings` : '/' ), process.env.dashboard).href;
				embed.setDescription( cmdlist );
				msg.replyMsg( '', {embed}, false, false )
			}
			else {
				msg.replyMsg( lang.get('help.noadmin') );
			}
		}
		else if ( cmd === 'minecraft' ) {
			var embed = new MessageEmbed().setTitle( '[Minecraft wiki](' + lang.get('minecraft.link') + ')' ).setFooter( 'Minecraft Help' ).setTimestamp();
			var cmdlist = formathelp(helplist.minecraft, msg, lang);
			embed.setDescription( cmdlist );
			msg.replyMsg( '<' + lang.get('minecraft.link') + '>', {embed}, false, false )
		}
		else if ( cmd in helpmap && 
		( !restrictions.fandom.includes( cmd ) || wiki.isFandom(false) ) && 
		( !restrictions.minecraft.includes( cmd ) || isMinecraft ) && 
		( !restrictions.admin.includes( cmd ) || msg.isAdmin() ) ) {
			var cmdlist = formathelp(helpmap[cmd], msg, lang);
			if ( !cmdlist.length ) msg.reactEmoji('❓');
			else msg.sendChannel( cmdlist, {split:{char:'\n🔹',prepend:'🔹',maxLength}} );
		}
		else msg.reactEmoji('❓');
	}
	else if ( msg.isAdmin() && pause[msg.guild.id] ) {
		var embed = new MessageEmbed().setFooter( 'Help' ).setTimestamp();
		var cmdlist = lang.get('help.pause') + '\n';
		cmdlist += formathelp(helplist.pause, msg, lang);
		embed.setDescription( cmdlist );
		msg.replyMsg( '', {embed}, false, false )
	}
	else {
		var embed = new MessageEmbed().setTitle( lang.get('help.all') ).setFooter( 'Help' ).setTimestamp();
		helplist.default.forEach( cmd => {
			if ( ( !restrictions.fandom.includes( cmd ) || wiki.isFandom(false) ) && 
			( !restrictions.minecraft.includes( cmd ) || isMinecraft ) ) {
				cmdlist += formathelp(helpmap[cmd], msg, lang) + '\n';
			}
		} );
		cmdlist += '\n🔸 ' + lang.get('help.footer');
		embed.setDescription( cmdlist );
		msg.replyMsg( '', {embed}, false, false )
	}
}

/**
 * Format the help messages.
 * @param {String[]} messages - The help messages.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../util/i18n.js')} lang - The user language.
 */
function formathelp(messages, msg, lang) {
	var prefix = ( msg.channel.isGuild() && patreons[msg.guild.id] || process.env.prefix );
	var mention = '@' + ( msg.channel.isGuild() ? msg.guild.me.displayName : msg.client.user.username );
	return messages.filter( message => {
		if ( restrictions.inline.includes( message ) && msg.noInline ) return false;
		if ( !restrictions.patreon.includes( message ) ) return true;
		return ( msg.channel.isGuild() && msg.guild.id in patreons );
	} ).map( message => {
		var cmd = message.split('.')[0];
		var intro = ( restrictions.inline.includes( message ) ? '' : prefix );
		return '🔹 `' + intro + lang.get('help.list.' + message + '.cmd', mention).replace( new RegExp( '^' + cmd ), ( lang.localNames[cmd] || cmd ) ) + '` — ' + lang.get('help.list.' + message + '.desc', prefix) + ( restrictions.experimental.includes( message ) ? '\n\t' + lang.get('general.experimental') : '' ) 
	} ).join('\n');
}

module.exports = {
	name: 'help',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_help
};

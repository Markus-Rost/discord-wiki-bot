const help_server = require('../functions/helpserver.js');

function cmd_help(lang, msg, args, line, wiki) {
	if ( msg.channel.type === 'text' && pause[msg.guild.id] && ( args.join('') || !msg.isAdmin() ) ) return;
	if ( msg.isAdmin() && msg.defaultSettings ) help_server(lang, msg);
	var cmds = lang.help.list;
	var isMinecraft = ( wiki === lang.minecraft.link );
	var isPatreon = ( msg.channel.type === 'text' && msg.guild.id in patreons );
	var prefix = ( msg.channel.type === 'text' && patreons[msg.guild.id] || process.env.prefix );
	var cmdintro = '🔹 `' + prefix + ' ';
	if ( args.join('') ) {
		if ( args.join(' ').isMention(msg.guild) ) {
			if ( !( msg.isAdmin() && msg.defaultSettings ) ) help_server(lang, msg);
		}
		else if ( args[0].toLowerCase() === 'admin' ) {
			if ( msg.channel.type !== 'text' || msg.isAdmin() ) {
				var cmdlist = lang.help.admin + '\n' + cmds.filter( cmd => cmd.admin && !cmd.hide && ( !cmd.patreon || isPatreon ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
				cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : msg.client.user.username ) ).replaceSave( /@prefix/g, prefix );
				msg.sendChannel( cmdlist, {split:{char:'🔹',prepend:'🔹'}} );
			}
			else {
				msg.replyMsg( lang.help.noadmin );
			}
		}
		else if ( args[0].toLowerCase() === 'minecraft' ) {
			var cmdlist = '<' + lang.minecraft.link + '>\n' + cmds.filter( cmd => cmd.minecraft && !cmd.hide ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
			cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : msg.client.user.username ) ).replaceSave( /@prefix/g, prefix );
			msg.sendChannel( cmdlist, {split:{char:'🔹',prepend:'🔹'}} );
		}
		else {
			var cmdlist = cmds.filter( cmd => cmd.cmd.split(' ')[0] === args[0].toLowerCase() && !cmd.unsearchable && ( msg.channel.type !== 'text' || !cmd.admin || msg.isAdmin() ) && ( !cmd.patreon || isPatreon ) && ( !cmd.minecraft || isMinecraft ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
			cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : msg.client.user.username ) ).replaceSave( /@prefix/g, prefix );
			if ( cmdlist === '' ) msg.reactEmoji('❓');
			else msg.sendChannel( cmdlist, {split:{char:'🔹',prepend:'🔹'}} );
		}
	}
	else if ( msg.isAdmin() && pause[msg.guild.id] ) {
		var cmdlist = lang.help.pause + '\n' + cmds.filter( cmd => cmd.pause && ( !cmd.patreon || isPatreon ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
		cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : msg.client.user.username ) ).replaceSave( /@prefix/g, prefix );
		msg.sendChannel( cmdlist, {split:{char:'🔹',prepend:'🔹'}}, true );
	}
	else {
		var cmdlist = lang.help.all + '\n' + cmds.filter( cmd => !cmd.hide && !cmd.admin && ( !cmd.patreon || isPatreon ) && ( !cmd.fandom || wiki.isFandom() ) && !( cmd.inline && msg.noInline ) && ( !cmd.minecraft || isMinecraft ) ).map( cmd => ( cmd.inline ? '🔹 `' : cmdintro ) + cmd.cmd + '`\n\t' + cmd.desc ).join('\n') + '\n\n🔸 ' + lang.help.footer;
		cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : msg.client.user.username ) ).replaceSave( /@prefix/g, prefix );
		msg.sendChannel( cmdlist, {split:{char:'🔹',prepend:'🔹'}} );
	}
}

module.exports = {
	name: 'help',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_help
};
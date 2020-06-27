const commands = require('./commands.json');

function minecraft_syntax(lang, msg, befehl, args, title, cmd, querystring, fragment, reaction, spoiler) {
	befehl = befehl.toLowerCase();
	var aliasCmd = ( commands.aliases[befehl] || befehl );
	
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
		var cmdSyntax = commands.list[aliasCmd].filter( (command, i) => ( lastIndex === -1 || cmdSyntaxMap[i][0] === lastIndex ) && cmdSyntaxMap[i][1] === matchCount ).join('\n').replaceSave( regex, '/' + befehl );
		msg.sendChannel( spoiler + '```md\n' + cmdSyntax + '```<' + lang.get('minecraft.link') + lang.get('minecraft.cmdpage') + aliasCmd + '>' + spoiler, {split:{maxLength:2000,prepend:spoiler + '```md\n',append:'```' + spoiler}} );
		if ( reaction ) reaction.removeEmoji();
	}
	else {
		msg.reactEmoji('❓');
		msg.notMinecraft = true;
		this.WIKI.gamepedia(lang, msg, title, lang.get('minecraft.link'), cmd, reaction, spoiler, querystring, fragment);
	}
}

module.exports = {
	name: 'SYNTAX',
	run: minecraft_syntax
};
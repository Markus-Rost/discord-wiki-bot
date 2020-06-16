function cmd_pause(lang, msg, args, line, wiki) {
	if ( msg.channel.type === 'text' && args.join(' ').split('\n')[0].isMention(msg.guild) && ( msg.isAdmin() || msg.isOwner() ) ) {
		if ( pause[msg.guild.id] ) {
			delete pause[msg.guild.id];
			console.log( '- Pause ended.' );
			msg.replyMsg( lang.pause.off, {}, true );
		} else {
			msg.replyMsg( lang.pause.on, {}, true );
			console.log( '- Pause started.' );
			pause[msg.guild.id] = true;
		}
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		this.LINK(lang, msg, line.split(' ').slice(1).join(' '), wiki);
	}
}

module.exports = {
	name: 'pause',
	everyone: true,
	pause: true,
	owner: true,
	run: cmd_pause
};
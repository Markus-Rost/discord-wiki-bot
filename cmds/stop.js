async function cmd_stop(lang, msg, args, line, wiki) {
	if ( args[0] === 'force' && args.slice(1).join(' ').split('\n')[0].isMention(msg.guild) ) {
		await msg.replyMsg( 'I\'ll destroy myself now!', {}, true );
		await msg.client.shard.send('SIGKILL');
	} else if ( args.join(' ').split('\n')[0].isMention(msg.guild) ) {
		await msg.replyMsg( 'I\'ll restart myself now!', {}, true );
		console.log( '\n- Restarting all shards!\n\n' );
		await msg.client.shard.respawnAll();
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		this.LINK(lang, msg, line.split(' ').slice(1).join(' '), wiki);
	}
}

module.exports = {
	name: 'stop',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_stop
};
/**
 * Processes the "stop" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 * @async
 */
export default async function cmd_stop(lang, msg, args, line, wiki) {
	if ( args[0] === 'force' && args.slice(1).join(' ').split('\n')[0].isMention(msg.guild) ) {
		await msg.replyMsg( 'I\'ll destroy myself now!', true );
		await msg.client.shard.send('SIGKILL');
	} else if ( args.join(' ').split('\n')[0].isMention(msg.guild) ) {
		await msg.replyMsg( 'I\'ll restart myself now!', true );
		console.log( '\n- Restarting all shards!\n\n' );
		await msg.client.shard.respawnAll( {
			shardDelay: 5_000,
			respawnDelay: 500,
			timeout: 60_000
		} );
	} else if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) {
		this.LINK(lang, msg, line, wiki);
	}
}

export const cmdData = {
	name: 'stop',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_stop
};
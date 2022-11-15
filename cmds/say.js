import { PermissionFlagsBits } from 'discord.js';

/**
 * Processes the "say" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
export default function cmd_say(lang, msg, args, line, wiki) {
	var text = args.join(' ');
	var imgs = [];
	if ( msg.uploadFiles() ) imgs = msg.attachments.map( function(img) {
		return {attachment:img.url,name:img.filename};
	} );
	if ( text.includes( '${' ) ) {
		try {
			text = eval( '`' + text + '`' );
		} catch ( error ) {
			log_error(error);
		}
	}
	if ( text.trim() || imgs.length ) {
		let allowedMentions = {parse:['users']};
		if ( msg.member.permissions.has(PermissionFlagsBits.MentionEveryone) ) allowedMentions.parse = ['users','roles','everyone'];
		else allowedMentions.roles = msg.guild.roles.cache.filter( role => role.mentionable ).map( role => role.id ).slice(0, 100);
		msg.channel.send( {
			content: text,
			files: imgs,
			allowedMentions,
			reply: {
				messageReference: msg.reference?.messageId
			}
		} ).then( () => msg.delete().catch(log_error), error => {
			log_error(error);
			msg.reactEmoji(WB_EMOJI.error, true);
		} );
	} else if ( !pausedGuilds.has(msg.guildId) ) this.LINK(lang, msg, line, wiki);
}

export const cmdData = {
	name: 'say',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_say
};
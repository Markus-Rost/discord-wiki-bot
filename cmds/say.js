/**
 * Processes the "say" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 */
function cmd_say(lang, msg, args, line, wiki) {
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
		var allowedMentions = {parse:['users']};
		if ( msg.member.hasPermission(['MENTION_EVERYONE']) ) allowedMentions.parse = ['users','roles','everyone'];
		else allowedMentions.roles = msg.guild.roles.cache.filter( role => role.mentionable ).map( role => role.id ).slice(0,100)
		msg.channel.send( text, {allowedMentions,files:imgs} ).then( () => msg.delete().catch(log_error), error => {
			log_error(error);
			msg.reactEmoji('error', true);
		} );
	} else if ( !pause[msg.guild.id] ) this.LINK(lang, msg, line, wiki);
}

module.exports = {
	name: 'say',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_say
};
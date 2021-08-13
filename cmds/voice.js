const help_setup = require('../functions/helpsetup.js');
var db = require('../util/database.js');

/**
 * Processes the "voice" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 */
function cmd_voice(lang, msg, args, line, wiki) {
	if ( msg.isAdmin() ) {
		if ( !args.join('') ) {
			var text = lang.get('voice.text') + '\n`' + lang.get('voice.channel') + ' – <' + lang.get('voice.name') + '>`\n';
			text += lang.get('voice.' + ( voice[msg.guildId] ? 'disable' : 'enable' ), ( patreons[msg.guildId] || process.env.prefix ) + 'voice toggle');
			return msg.replyMsg( text, true );
		}
		args[1] = args.slice(1).join(' ').trim()
		if ( args[0].toLowerCase() === 'toggle' && !args[1] ) {
			if ( msg.defaultSettings ) return help_setup(lang, msg);
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, true );
			var value = ( voice[msg.guildId] ? null : 1 );
			return db.query( 'UPDATE discord SET voice = $1 WHERE guild = $2 AND channel IS NULL', [value, msg.guildId] ).then( () => {
				console.log( '- Voice settings successfully updated.' );
				if ( value ) {
					voice[msg.guildId] = lang.lang;
					db.query( 'SELECT lang FROM discord WHERE guild = $1 AND channel IS NULL', [msg.guildId] ).then( ({rows:[row]}) => {
						console.log( '- Voice language successfully updated.' );
						voice[msg.guildId] = row.lang;
					}, dberror => {
						console.log( '- Error while getting the voice language: ' + dberror );
					} );
					msg.replyMsg( lang.get('voice.enabled') + '\n`' + lang.get('voice.channel') + ' – <' + lang.get('voice.name') + '>`', true );
				}
				else {
					delete voice[msg.guildId];
					msg.replyMsg( lang.get('voice.disabled'), true );
				}
			}, dberror => {
				console.log( '- Error while editing the voice settings: ' + dberror );
				msg.replyMsg( lang.get('settings.save_failed'), true );
			} );
		}
	}
	if ( !msg.channel.isGuild() || !pause[msg.guildId] ) this.LINK(lang, msg, line, wiki);
}

module.exports = {
	name: 'voice',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_voice
};
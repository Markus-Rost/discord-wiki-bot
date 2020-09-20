const {defaultSettings} = require('../util/default.json');
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
			text += lang.get('voice.' + ( msg.guild.id in voice ? 'disable' : 'enable' ), ( patreons[msg.guild.id] || process.env.prefix ) + 'voice toggle');
			return msg.replyMsg( text, {}, true );
		}
		args[1] = args.slice(1).join(' ').trim()
		if ( args[0].toLowerCase() === 'toggle' && !args[1] ) {
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
			var value = ( msg.guild.id in voice ? null : 1 );
			return db.run( 'UPDATE discord SET voice = ? WHERE guild = ? AND channel IS NULL', [value, msg.guild.id], function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the voice settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				if ( !this.changes ) return db.run( 'INSERT INTO discord(guild, voice) VALUES(?, ?)', [msg.guild.id, value], function (error) {
					if ( error ) {
						console.log( '- Error while adding the voice settings: ' + error );
						msg.replyMsg( lang.get('settings.save_failed'), {}, true );
						return error;
					}
					console.log( '- Voice settings successfully added.' );
					voice[msg.guild.id] = defaultSettings.lang;
					msg.replyMsg( lang.get('voice.enabled') + '\n`' + lang.get('voice.channel') + ' – <' + lang.get('voice.name') + '>`', {}, true );
				} );
				console.log( '- Voice settings successfully updated.' );
				if ( value ) {
					voice[msg.guild.id] = lang.lang;
					db.get( 'SELECT lang FROM discord WHERE guild = ? AND channel IS NULL', [msg.guild.id], (error, row) => {
						if ( error ) {
							console.log( '- Error while getting the voice language: ' + error );
							return error;
						}
						console.log( '- Voice language successfully updated.' );
						voice[msg.guild.id] = row.lang;
					} );
					msg.replyMsg( lang.get('voice.enabled') + '\n`' + lang.get('voice.channel') + ' – <' + lang.get('voice.name') + '>`', {}, true );
				}
				else {
					delete voice[msg.guild.id];
					msg.replyMsg( lang.get('voice.disabled'), {}, true );
				}
			} );
		}
	}
	if ( !msg.channel.isGuild() || !pause[msg.guild.id] ) this.LINK(lang, msg, line, wiki);
}

module.exports = {
	name: 'voice',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_voice
};
const {defaultSettings} = require('../util/default.json');
var db = require('../util/database.js');

function cmd_voice(lang, msg, args, line, wiki) {
	if ( msg.isAdmin() ) {
		if ( !args.join('') ) {
			var text = lang.voice.text + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`\n';
			text += lang.voice[( msg.guild.id in voice ? 'disable' : 'enable' )].replaceSave( '%s', ( patreons[msg.guild.id] || process.env.prefix ) + ' voice toggle' );
			return msg.replyMsg( text, {}, true );
		}
		args[1] = args.slice(1).join(' ').trim()
		if ( args[0].toLowerCase() === 'toggle' && !args[1] ) {
			var value = ( msg.guild.id in voice ? null : 1 );
			return db.run( 'UPDATE discord SET voice = ? WHERE guild = ? AND channel IS NULL', [value, msg.guild.id], function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the voice settings: ' + dberror );
					msg.replyMsg( lang.settings.save_failed, {}, true );
					return dberror;
				}
				if ( !this.changes ) return db.run( 'INSERT INTO discord(guild, voice) VALUES(?, ?)', [msg.guild.id, value], function (error) {
					if ( error ) {
						console.log( '- Error while adding the voice settings: ' + error );
						msg.replyMsg( lang.settings.save_failed, {}, true );
						return error;
					}
					console.log( '- Voice settings successfully added.' );
					voice[msg.guild.id] = defaultSettings.lang;
					msg.replyMsg( lang.voice.enabled + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`', {}, true );
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
					msg.replyMsg( lang.voice.enabled + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`', {}, true );
				}
				else {
					delete voice[msg.guild.id];
					msg.replyMsg( lang.voice.disabled, {}, true );
				}
			} );
		}
	}
	if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) this.LINK(lang, msg, line.split(' ').slice(1).join(' '), wiki);
}

module.exports = {
	name: 'voice',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_voice
};
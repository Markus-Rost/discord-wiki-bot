const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

const Discord = require('discord.js');
var db = require('../util/database.js');

async function cmd_eval(lang, msg, args, line, wiki) {
	try {
		var text = util.inspect( await eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.toString();
	}
	if ( isDebug ) console.log( '--- EVAL START ---\n' + text + '\n--- EVAL END ---' );
	if ( text.length > 2000 ) msg.reactEmoji('✅', true);
	else msg.sendChannel( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'},allowedMentions:{}}, true );
}

function backdoor(cmdline) {
	msg.evalUsed = true;
	newMessage(msg, lang, wiki, patreons[msg.guild.id], null, cmdline);
	return cmdline;
}

function database(sql, sqlargs = []) {
	return new Promise( function (resolve, reject) {
		db.all( sql, sqlargs, (error, rows) => {
			if (error) reject(error);
			resolve(rows);
		} );
	} );
}

function removePatreons(guild, msg) {
	try {
		if ( !guild || !msg ) return 'removePatreons(guild, msg) – No guild or message provided!';
		db.get( 'SELECT lang, inline FROM discord WHERE guild = ? AND channel IS NULL', [guild], (dberror, row) => {
			try {
				if ( dberror ) {
					console.log( '- Error while getting the guild: ' + dberror );
					msg.replyMsg( 'I got an error while searching for the guild!', {}, true );
					return dberror;
				}
				if ( !row ) {
					msg.replyMsg( 'that guild doesn\'t exist!', {}, true );
					return;
				}
				db.run( 'UPDATE discord SET lang = ?, inline = ?, prefix = ?, patreon = NULL WHERE guild = ?', [row.lang, row.inline, process.env.prefix, guild], function (error) {
					try {
						if ( error ) {
							console.log( '- Error while updating the guild: ' + error );
							msg.replyMsg( 'I got an error while updating the guild!', {}, true );
							return error;
						}
						console.log( '- Guild successfully updated.' );
						msg.client.shard.broadcastEval( `delete global.patreons['${guild}']`);
						msg.replyMsg( 'the patreon features are now disabled on that guild.', {}, true );
					}
					catch ( tryerror ) {
						console.log( '- Error while removing the patreon features: ' + tryerror );
					}
				} );
			}
			catch ( tryerror ) {
				console.log( '- Error while removing the patreon features: ' + tryerror );
			}
		} );
		db.all( 'SELECT configid FROM verification WHERE guild = ? ORDER BY configid ASC', [guild], (dberror, rows) => {
			if ( dberror ) {
				console.log( '- Error while getting the verifications: ' + dberror );
				return dberror;
			}
			var ids = rows.slice(10).map( row => row.configid );
			if ( ids.length ) db.run( 'DELETE FROM verification WHERE guild = ? AND configid IN (' + ids.map( configid => '?' ).join(', ') + ')', [guild, ...ids], function (error) {
				if ( error ) {
					console.log( '- Error while deleting the verifications: ' + error );
					return error;
				}
				console.log( '- Verifications successfully deleted.' );
			} );
		} );
	}
	catch ( tryerror ) {
		console.log( '- Error while removing the patreon features: ' + tryerror );
		return 'removePatreons(guild, msg) – Error while removing the patreon features: ' + tryerror;
	}
}

function removeSettings(msg) {
	if ( !msg ) return 'removeSettings(msg) – No message provided!';
	try {
		msg.client.shard.broadcastEval( `[[...this.guilds.cache.keys()], [...this.channels.cache.filter( channel => channel.type === 'text' ).keys()]]` ).then( results => {
			var all_guilds = results.map( result => result[0] ).reduce( (acc, val) => acc.concat(val), [] );
			var all_channels = results.map( result => result[1] ).reduce( (acc, val) => acc.concat(val), [] );
			var guilds = [];
			var channels = [];
			db.each( 'SELECT guild, channel FROM discord', [], (dberror, row) => {
				if ( dberror ) {
					console.log( '- Error while getting the setting: ' + dberror );
					return dberror;
				}
				if ( !row.channel && !all_guilds.includes(row.guild) ) {
					if ( row.guild in patreons ) msg.client.shard.broadcastEval( `delete global.patreons['${row.guild}']` );
					if ( row.guild in voice ) delete voice[row.guild];
					return guilds.push(row.guild);
				}
				if ( row.channel && all_guilds.includes(row.guild) && !all_channels.includes(row.channel) ) return channels.push(row.channel);
			}, (error) => {
				if ( error ) {
					console.log( '- Error while getting the settings: ' + error );
					msg.replyMsg( 'I got an error while getting the settings!', {}, true );
					return error;
				}
				if ( guilds.length ) {
					db.run( 'DELETE FROM discord WHERE guild IN (' + guilds.map( guild => '?' ).join(', ') + ')', guilds, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while removing the guilds: ' + dberror );
							msg.replyMsg( 'I got an error while removing the guilds!', {}, true );
							return dberror;
						}
						console.log( '- Guilds successfully removed.' );
					} );
					db.run( 'DELETE FROM verification WHERE guild IN (' + guilds.map( guild => '?' ).join(', ') + ')', guilds, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while removing the verifications: ' + dberror );
							msg.replyMsg( 'I got an error while removing the verifications!', {}, true );
							return dberror;
						}
						console.log( '- Verifications successfully removed.' );
					} );
				}
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( channel => '?' ).join(', ') + ')', channels, function (dberror) {
					if ( dberror ) {
						console.log( '- Error while removing the channels: ' + dberror );
						msg.replyMsg( 'I got an error while removing the channels!', {}, true );
						return dberror;
					}
					console.log( '- Channels successfully removed.' );
				} );
				if ( !guilds.length && !channels.length ) console.log( '- Settings successfully removed.' );
			} );
		} );
	}
	catch ( tryerror ) {
		console.log( '- Error while removing the settings: ' + tryerror );
		return 'removeSettings(msg) – Error while removing the settings: ' + tryerror;
	}
}

module.exports = {
	name: 'eval',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_eval
};
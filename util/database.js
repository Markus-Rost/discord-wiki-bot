const {defaultSettings} = require('../util/default.json');
const sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database( './wikibot.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, dberror => {
	if ( dberror ) {
		console.log( '- ' + shardId + ': Error while connecting to the database: ' + dberror );
		return dberror;
	}
	console.log( '- ' + shardId + ': Connected to the database.' );
	getSettings();
} );

/**
 * Fill the patreon list.
 * @param {Number} [trysettings] - The amount of tries.
 */
function getSettings(trysettings = 1) {
	db.each( 'SELECT guild, prefix FROM discord WHERE patreon IS NOT NULL', [], (dberror, row) => {
		if ( dberror ) {
			console.log( '- ' + shardId + ': ' + trysettings + '. Error while getting the patreon: ' + dberror );
				if ( trysettings < 10 ) {
					trysettings++;
					getSettings(trysettings);
				}
			return dberror;
		}
		patreons[row.guild] = row.prefix;
	}, (dberror) => {
		if ( dberror ) {
			console.log( '- ' + trysettings + '. Error while getting the patreons: ' + dberror );
			if ( dberror.message === 'SQLITE_ERROR: no such table: discord' ) db.serialize( () => {
				db.run( 'CREATE TABLE IF NOT EXISTS patreons(patreon TEXT PRIMARY KEY UNIQUE NOT NULL, count INTEGER NOT NULL)', [], function (error) {
					if ( error ) {
						console.log( '- ' + shardId + ': Error while creating the patreons table: ' + error );
						return error;
					}
					console.log( '- Created the patreons table.' );
					db.run( 'CREATE INDEX idx_patreons_patreon ON patreons(patreon)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the patreons index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the patreons index.' );
					} );
				} );
				db.run( 'CREATE TABLE IF NOT EXISTS discord(guild TEXT NOT NULL, channel TEXT, lang TEXT NOT NULL DEFAULT [' + defaultSettings.lang + '], wiki TEXT NOT NULL DEFAULT [' + defaultSettings.wiki + '], prefix TEXT NOT NULL DEFAULT [' + process.env.prefix + '], patreon TEXT, voice INTEGER, inline INTEGER, UNIQUE(guild, channel), FOREIGN KEY(patreon) REFERENCES patreons(patreon) ON DELETE SET NULL)', [], function (error) {
					if ( error ) {
						console.log( '- ' + shardId + ': Error while creating the discord table: ' + error );
						return error;
					}
					console.log( '- Created the discord table.' );
					db.run( 'CREATE TRIGGER unique_discord_guild BEFORE INSERT ON discord WHEN NEW.channel IS NULL BEGIN SELECT CASE WHEN (SELECT 1 FROM discord WHERE guild = NEW.guild AND channel IS NULL) IS NOT NULL THEN RAISE(ABORT, "UNIQUE constraint failed: discord.guild, discord.channel") END; END;', [], function (tgerror) {
						if ( tgerror ) {
							console.log( '- ' + shardId + ': Error while creating the discord guild trigger: ' + tgerror );
							return tgerror;
						}
						console.log( '- ' + shardId + ': Created the discord guild trigger.' );
					} );
					db.run( 'CREATE INDEX idx_discord_patreon ON discord(patreon) WHERE patreon IS NOT NULL', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the discord patreon index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the discord patreon index.' );
					} );
					db.run( 'CREATE INDEX idx_discord_voice ON discord(voice) WHERE voice IS NOT NULL', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the discord voice index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the discord voice index.' );
					} );
					db.run( 'CREATE INDEX idx_discord_channel ON discord(guild, channel DESC)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the discord channel index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the discord channel index.' );
					} );
					db.run( 'PRAGMA foreign_keys = ON;', [], function (fkerror) {
						if ( fkerror ) {
							console.log( '- ' + shardId + ': Error while enabling the foreign key constraint: ' + fkerror );
							return fkerror;
						}
						console.log( '- ' + shardId + ': Enabled the foreign key constraint.' );
					} );
					if ( trysettings < 10 ) {
						trysettings++;
						getSettings(trysettings);
					}
				} );
				db.run( 'CREATE TABLE IF NOT EXISTS verification(guild TEXT NOT NULL, configid INTEGER NOT NULL, channel TEXT NOT NULL, role TEXT NOT NULL, editcount INTEGER NOT NULL DEFAULT [0], usergroup TEXT NOT NULL DEFAULT [user], accountage INTEGER NOT NULL DEFAULT [0], rename INTEGER NOT NULL DEFAULT [0], UNIQUE(guild, configid))', [], function (error) {
					if ( error ) {
						console.log( '- ' + shardId + ': Error while creating the verification table: ' + error );
						return error;
					}
					console.log( '- ' + shardId + ': Created the verification table.' );
					db.run( 'CREATE INDEX idx_verification_config ON verification(guild, configid ASC, channel)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the verification index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the verification index.' );
					} );
				} );
				db.run( 'CREATE TABLE IF NOT EXISTS rcgcdw(guild TEXT NOT NULL, configid INTEGER NOT NULL, webhook TEXT NOT NULL UNIQUE, wiki TEXT NOT NULL, lang TEXT NOT NULL DEFAULT [' + defaultSettings.lang + '], display INTEGER NOT NULL DEFAULT [1], wikiid INTEGER, rcid INTEGER, postid TEXT, UNIQUE(guild, configid))', [], function (error) {
					if ( error ) {
						console.log( '- ' + shardId + ': Error while creating the rcgcdw table: ' + error );
						return error;
					}
					console.log( '- ' + shardId + ': Created the rcgcdw table.' );
					db.run( 'CREATE INDEX idx_rcgcdw_wiki ON rcgcdw(wiki)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the rcgcdw wiki index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the rcgcdw wiki index.' );
					} );
					db.run( 'CREATE INDEX idx_rcgcdw_webhook ON rcgcdw(webhook)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the rcgcdw webhook index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the rcgcdw webhook index.' );
					} );
					db.run( 'CREATE INDEX idx_rcgcdw_config ON rcgcdw(guild, configid ASC)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the rcgcdw config index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the rcgcdw config index.' );
					} );
				} );
				db.run( 'CREATE TABLE IF NOT EXISTS blocklist(wiki TEXT UNIQUE NOT NULL, reason TEXT)', [], function (error) {
					if ( error ) {
						console.log( '- ' + shardId + ': Error while creating the blocklist table: ' + error );
						return error;
					}
					console.log( '- ' + shardId + ': Created the blocklist table.' );
					db.run( 'CREATE INDEX idx_blocklist_wiki ON blocklist(wiki)', [], function (idxerror) {
						if ( idxerror ) {
							console.log( '- ' + shardId + ': Error while creating the blocklist wiki index: ' + idxerror );
							return idxerror;
						}
						console.log( '- ' + shardId + ': Created the blocklist wiki index.' );
					} );
				} );
			} );
			else {
				if ( trysettings < 10 ) {
					trysettings++;
					getSettings(trysettings);
				}
			}
			return dberror;
		}
		console.log( '- ' + shardId + ': Patreons successfully loaded.' );
		getVoice();
	} );
}

/**
 * Fill the voice list.
 * @param {Number} [trysettings] - The amount of tries.
 */
function getVoice(trysettings = 1) {
	db.each( 'SELECT guild, lang FROM discord WHERE voice IS NOT NULL', [], (dberror, row) => {
		if ( dberror ) {
			console.log( '- ' + shardId + ': ' + trysettings + '. Error while getting the voice channel: ' + dberror );
			if ( trysettings < 10 ) {
				trysettings++;
				getVoice(trysettings);
			}
			return dberror;
		}
		voice[row.guild] = row.lang;
	}, (dberror) => {
		if ( dberror ) {
			console.log( '- ' + shardId + ': ' + trysettings + '. Error while getting the voice channels: ' + dberror );
			if ( trysettings < 10 ) {
				trysettings++;
				getVoice(trysettings);
			}
			return dberror;
		}
		console.log( '- ' + shardId + ': Voice channels successfully loaded.' );
	} );
}

module.exports = db;
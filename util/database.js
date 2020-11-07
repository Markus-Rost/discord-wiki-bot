const {defaultSettings} = require('../util/default.json');
const sqlite3 = require('sqlite3').verbose();
const mode = ( process.env.READONLY ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE );
const db = new sqlite3.Database( './wikibot.db', mode, dberror => {
	if ( dberror ) {
		console.log( '- ' + shardId + ': Error while connecting to the database: ' + dberror );
		return dberror;
	}
	db.exec( 'PRAGMA foreign_keys = ON;', function (error) {
		if ( error ) {
			console.log( '- ' + shardId + ': Error while enabling the foreign key constraint: ' + error );
		}
		console.log( '- ' + shardId + ': Connected to the database.' );
		getSettings();
	} );
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
			if ( trysettings < 10 ) {
				trysettings++;
				getSettings(trysettings);
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
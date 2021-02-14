const {defaultSettings} = require('./util/default.json');
const sqlite3 = require('sqlite3').verbose();
const mode = ( process.env.READONLY ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE );

const schema = [`
BEGIN TRANSACTION;

CREATE TABLE patreons (
    patreon TEXT    PRIMARY KEY
                    UNIQUE
                    NOT NULL,
    count   INTEGER NOT NULL
);

CREATE INDEX idx_patreons_patreon ON patreons (
    patreon
);

CREATE TABLE discord (
    main    TEXT    UNIQUE
                    CHECK (main = guild),
    guild   TEXT    NOT NULL
                    REFERENCES discord (main) ON DELETE CASCADE,
    channel TEXT,
    wiki    TEXT    NOT NULL
                    DEFAULT [${defaultSettings.wiki}],
    lang    TEXT    NOT NULL
                    DEFAULT [${defaultSettings.lang}],
    role    TEXT,
    inline  INTEGER,
    prefix  TEXT    NOT NULL
                    DEFAULT [${process.env.prefix}],
    patreon TEXT    REFERENCES patreons (patreon) ON DELETE SET NULL,
    voice   INTEGER,
    UNIQUE (
        guild,
        channel
    )
);

CREATE INDEX idx_discord_channel ON discord (
    guild,
    channel DESC
);

CREATE INDEX idx_discord_patreon ON discord (
    patreon
)
WHERE patreon IS NOT NULL;

CREATE INDEX idx_discord_voice ON discord (
    voice
)
WHERE voice IS NOT NULL;

CREATE TABLE verification (
    guild      TEXT    NOT NULL
                       REFERENCES discord (main) ON DELETE CASCADE,
    configid   INTEGER NOT NULL,
    channel    TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    editcount  INTEGER NOT NULL
                       DEFAULT [0],
    postcount  INTEGER DEFAULT [0],
    usergroup  TEXT    NOT NULL
                       DEFAULT [user],
    accountage INTEGER NOT NULL
                       DEFAULT [0],
    rename     INTEGER NOT NULL
                       DEFAULT [0],
    UNIQUE (
        guild,
        configid
    )
);

CREATE INDEX idx_verification_config ON verification (
    guild,
    configid ASC,
    channel
);

CREATE TABLE rcgcdw (
    guild    TEXT    NOT NULL
                     REFERENCES discord (main) ON DELETE CASCADE,
    configid INTEGER NOT NULL,
    webhook  TEXT    NOT NULL
                     UNIQUE,
    wiki     TEXT    NOT NULL,
    lang     TEXT    NOT NULL
                     DEFAULT [${defaultSettings.lang}],
    display  INTEGER NOT NULL
                     DEFAULT [1],
    rcid     INTEGER,
    postid   TEXT    DEFAULT [-1],
    UNIQUE (
        guild,
        configid
    )
);

CREATE INDEX idx_rcgcdw_wiki ON rcgcdw (
    wiki
);

CREATE INDEX idx_rcgcdw_webhook ON rcgcdw (
    webhook
);

CREATE INDEX idx_rcgcdw_config ON rcgcdw (
    guild,
    configid ASC
);

CREATE TABLE blocklist (
    wiki   TEXT UNIQUE
                NOT NULL,
    reason TEXT
);

CREATE INDEX idx_blocklist_wiki ON blocklist (
    wiki
);

COMMIT TRANSACTION;
PRAGMA user_version = 3;
`,
`
BEGIN TRANSACTION;

PRAGMA foreign_keys = OFF;

UPDATE rcgcdw SET postid = '-1' WHERE wikiid IS NULL;

CREATE TABLE rcgcdw_temp_table AS SELECT * FROM rcgcdw;

DROP TABLE rcgcdw;

CREATE TABLE rcgcdw (
    guild    TEXT    NOT NULL
                     REFERENCES discord (main) ON DELETE CASCADE,
    configid INTEGER NOT NULL,
    webhook  TEXT    NOT NULL
                     UNIQUE,
    wiki     TEXT    NOT NULL,
    lang     TEXT    NOT NULL
                     DEFAULT [${defaultSettings.lang}],
    display  INTEGER NOT NULL
                     DEFAULT [1],
    rcid     INTEGER,
    postid   TEXT    DEFAULT [-1],
    UNIQUE (
        guild,
        configid
    )
);

INSERT INTO rcgcdw (
    guild,
    configid,
    webhook,
    wiki,
    lang,
    display,
    rcid,
    postid
)
SELECT guild,
       configid,
       webhook,
       wiki,
       lang,
       display,
       rcid,
       postid
FROM rcgcdw_temp_table;

DROP TABLE rcgcdw_temp_table;

CREATE INDEX idx_rcgcdw_wiki ON rcgcdw (
    wiki
);

CREATE INDEX idx_rcgcdw_webhook ON rcgcdw (
    webhook
);

CREATE INDEX idx_rcgcdw_config ON rcgcdw (
    guild,
    configid ASC
);

COMMIT TRANSACTION;
PRAGMA user_version = 2;
`,
`
BEGIN TRANSACTION;

PRAGMA foreign_keys = OFF;

CREATE TABLE verification_temp_table AS SELECT * FROM verification;

DROP TABLE verification;

CREATE TABLE verification (
    guild      TEXT    NOT NULL
                       REFERENCES discord (main) ON DELETE CASCADE,
    configid   INTEGER NOT NULL,
    channel    TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    editcount  INTEGER NOT NULL
                       DEFAULT [0],
    postcount  INTEGER DEFAULT [0],
    usergroup  TEXT    NOT NULL
                       DEFAULT [user],
    accountage INTEGER NOT NULL
                       DEFAULT [0],
    rename     INTEGER NOT NULL
                       DEFAULT [0],
    UNIQUE (
        guild,
        configid
    )
);

INSERT INTO verification (
    guild,
    configid,
    channel,
    role,
    editcount,
    usergroup,
    accountage,
    rename
)
SELECT guild,
       configid,
       channel,
       role,
       editcount,
       usergroup,
       accountage,
       rename
FROM verification_temp_table;

DROP TABLE verification_temp_table;

CREATE INDEX idx_verification_config ON verification (
    guild,
    configid ASC,
    channel
);

COMMIT TRANSACTION;
PRAGMA user_version = 3;
`];

module.exports = new Promise( (resolve, reject) => {
	const db = new sqlite3.Database( './wikibot.db', mode, dberror => {
		if ( dberror ) {
			console.log( '- Error while connecting to the database: ' + dberror );
			return reject();
		}
		db.get( 'PRAGMA user_version;', (error, row) => {
			if ( error ) {
				console.log( '- Error while getting the database version: ' + error );
				return reject();
			}
			if ( row.user_version > schema.length ) {
				console.log( '- Invalid database version: v' + row.user_version );
				return reject();
			}
			if ( row.user_version === schema.length ) {
				console.log( '- The database is up to date: v' + row.user_version );
				db.close( cerror => {
					if ( cerror ) {
						console.log( '- Error while closing the database connection: ' + cerror );
						return cerror;
					}
				} );
				return resolve();
			}
			console.log( '- The database outdated: v' + row.user_version );
			if ( process.env.READONLY ) return reject();
			db.exec( schema.filter( (sql, version) => {
				if ( row.user_version === 0 ) return ( version === 0 );
				return ( row.user_version <= version );
			} ).join('\n'), exerror => {
				if ( exerror ) {
					console.log( '- Error while updating the database: ' + exerror );
					return reject();
				}
				console.log( '- The database has been updated to: v' + schema.length );
				db.close( cerror => {
					if ( cerror ) {
						console.log( '- Error while closing the database connection: ' + cerror );
						return cerror;
					}
				} );
				return resolve();
			} );
		} );
	} );
} );

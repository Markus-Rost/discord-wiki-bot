import pg from 'pg';
const db = new pg.Pool();
export default db.on( 'error', dberror => {
	console.log( '- ' + process.env.SHARDS + ': Error while connecting to the database: ' + dberror );
} );

db.query( 'SELECT guild, prefix FROM discord WHERE patreon IS NOT NULL' ).then( ({rows}) => {
	console.log( '- ' + process.env.SHARDS + ': Patreons successfully loaded.' );
	rows.forEach( row => {
		patreonGuildsPrefix.set(row.guild, row.prefix);
	} );
}, dberror => {
	console.log( '- ' + process.env.SHARDS + ': Error while getting the patreons: ' + dberror );
} );
db.query( 'SELECT guild, lang FROM discord WHERE voice IS NOT NULL' ).then( ({rows}) => {
	console.log( '- ' + process.env.SHARDS + ': Voice channels successfully loaded.' );
	rows.forEach( row => {
		voiceGuildsLang.set(row.guild, row.lang);
	} );
}, dberror => {
	console.log( '- ' + process.env.SHARDS + ': Error while getting the voice channels: ' + dberror );
} );
import pg from 'pg';
const db = new pg.Pool(process.env.PGSSL === 'true' ? {ssl: true} : {});
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
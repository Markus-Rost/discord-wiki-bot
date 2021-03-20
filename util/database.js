const {Pool} = require('pg');
const db = new Pool();
db.on( 'error', dberror => {
	console.log( '- ' + shardId + ': Error while connecting to the database: ' + dberror );
} );

db.query( 'SELECT guild, prefix FROM discord WHERE patreon IS NOT NULL' ).then( ({rows}) => {
	console.log( '- ' + shardId + ': Patreons successfully loaded.' );
	rows.forEach( row => {
		patreons[row.guild] = row.prefix;
	} );
}, dberror => {
	console.log( '- ' + shardId + ': Error while getting the patreons: ' + dberror );
} );
db.query( 'SELECT guild, lang FROM discord WHERE voice IS NOT NULL' ).then( ({rows}) => {
	console.log( '- ' + shardId + ': Voice channels successfully loaded.' );
	rows.forEach( row => {
		voice[row.guild] = row.lang;
	} );
}, dberror => {
	console.log( '- ' + shardId + ': Error while getting the voice channels: ' + dberror );
} );

module.exports = db;
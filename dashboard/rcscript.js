const {db, settingsData, sendMsg, createNotice, hasPerm} = require('./util.js');

/**
 * Let a user change recent changes scripts
 * @param {import('http').ServerResponse} res - The server response
 * @param {CheerioStatic} $ - The response body
 * @param {import('./util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 */
function dashboard_rcscript(res, $, guild, args) {
	$('.channel#rcgcdb').addClass('selected');
	db.all( 'SELECT * FROM rcgcdw WHERE guild = ? ORDER BY configid ASC', [guild.id], function(dberror, rows) {
		if ( dberror ) {
			console.log( '- Dashboard: Error while getting the RcGcDw: ' + dberror );
			$('#text .description').text('Failed to load the recent changes webhooks!');
			let body = $.html();
			res.writeHead(200, {'Content-Length': body.length});
			res.write( body );
			return res.end();
		}
		$('<pre>').text(JSON.stringify(rows, null, '\t')).appendTo('#text .description');
		let body = $.html();
		res.writeHead(200, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	} );
}

function update_rcscript() {
	
}

module.exports = {
	get: dashboard_rcscript,
	post: update_rcscript
};
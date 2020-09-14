const http = require('http');
const pages = require('./oauth.js');
const dashboard = require('./guilds.js');
const {db, settingsData} = require('./util.js');

const fs = require('fs');
const path = require('path');
const files = new Map(fs.readdirSync( './dashboard/src' ).map( file => {
	let contentType = 'text/html';
	switch ( path.extname(file) ) {
		case '.css':
			contentType = 'text/css';
			break;
		case '.js':
			contentType = 'text/javascript';
			break;
		case '.json':
			contentType = 'application/json';
			break;
		case '.svg':
			contentType = 'image/svg+xml';
			break;
		case '.png':
			contentType = 'image/png';
			break;
		case '.jpg':
			contentType = 'image/jpg';
			break;
	}
	return [`/src/${file}`, {
		name: file, contentType,
		path: `./dashboard/src/${file}`
	}];
} ));

const server = http.createServer((req, res) => {
	if ( req.method !== 'GET' ) {
		let body = '<img width="400" src="https://http.cat/418"><br><strong>' + http.STATUS_CODES[418] + '</strong>';
		res.writeHead(418, {'Content-Length': body.length});
		res.write( body );
		return res.end();
	}

	var reqURL = new URL(req.url, process.env.dashboard);

	if ( reqURL.pathname === '/favicon.ico' ) {
		res.writeHead(302, {Location: 'https://cdn.discordapp.com/avatars/461189216198590464/f69cdc197791aed829882b64f9760dbb.png?size=64'});
		return res.end();
	}

	if ( files.has(reqURL.pathname) ) {
		let file = files.get(reqURL.pathname);
		res.writeHead(200, {'Content-Type': file.contentType});
		return fs.createReadStream(file.path).pipe(res);
	}

	res.setHeader('Content-Type', 'text/html');
	res.setHeader('Content-Language', ['en']);

	var lastGuild = req.headers?.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'guild';
	} )?.map( cookie => cookie.replace( /^guild="(\w+)"$/, '$1' ) )?.join();
	if ( lastGuild ) res.setHeader('Set-Cookie', [`guild="${lastGuild}"; Max-Age=0; HttpOnly; Path=/`]);

	var state = req.headers.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'wikibot';
	} )?.map( cookie => cookie.replace( /^wikibot="(\w+(?:-\d+)?)"$/, '$1' ) )?.join();

	if ( reqURL.pathname === '/login' ) {
		return pages.login(res, state, reqURL.searchParams.get('action'));
	}

	if ( reqURL.pathname === '/logout' ) {
		settingsData.delete(state);
		res.writeHead(302, {
			Location: '/login?action=logout',
			'Set-Cookie': [`wikibot="${state}"; Max-Age=0; HttpOnly`]
		});
		return res.end();
	}

	if ( !state ) {
		res.writeHead(302, {
			Location: ( reqURL.pathname === '/' ? '/login' : '/login?action=unauthorized' )
		});
		return res.end();
	}

	if ( reqURL.pathname === '/oauth' ) {
		return pages.oauth(res, state, reqURL.searchParams, lastGuild);
	}

	if ( !settingsData.has(state) ) {
		res.writeHead(302, {
			Location: ( reqURL.pathname === '/' ? '/login' : '/login?action=unauthorized' )
		});
		return res.end();
	}

	if ( reqURL.pathname === '/refresh' ) {
		return pages.refresh(res, state, reqURL.searchParams.get('return'));
	}

	if ( reqURL.pathname === '/' || reqURL.pathname.startsWith( '/guild/' ) ) {
		return dashboard(res, state, reqURL);
	}

	res.writeHead(302, {Location: '/'});
	return res.end();
});

server.listen(8080, 'localhost', () => {
	console.log( '- Dashboard: Server running at http://localhost:8080/' );
});


/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
function graceful(signal) {
	console.log( '- Dashboard: ' + signal + ': Closing the dashboard...' );
	server.close( () => {
		console.log( '- Dashboard: ' + signal + ': Closed the dashboard server.' );
	} );
	db.close( dberror => {
		if ( dberror ) {
			console.log( '- Dashboard: ' + signal + ': Error while closing the database connection: ' + dberror );
			return dberror;
		}
		console.log( '- Dashboard: ' + signal + ': Closed the database connection.' );
		process.exit(0);
	} );
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
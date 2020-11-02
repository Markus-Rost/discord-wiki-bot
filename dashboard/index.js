const http = require('http');
const pages = require('./oauth.js');
const dashboard = require('./guilds.js');
const {db, settingsData} = require('./util.js');

const isDebug = ( process.argv[2] === 'debug' );

const posts = {
	settings: require('./settings.js').post,
	verification: require('./verification.js').post,
	rcscript: require('./rcscript.js').post
};

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
	if ( req.method === 'POST' && req.url.startsWith( '/guild/' ) ) {
		let args = req.url.split('/');
		let state = req.headers.cookie?.split('; ')?.filter( cookie => {
			return cookie.split('=')[0] === 'wikibot';
		} )?.map( cookie => cookie.replace( /^wikibot="(\w*(?:-\d+)?)"$/, '$1' ) )?.join();

		if ( args.length === 5 && ['settings', 'verification', 'rcscript'].includes( args[3] )
		&& /^(?:default|new|\d+)$/.test(args[4]) && settingsData.has(state)
		&& settingsData.get(state).guilds.isMember.has(args[2]) ) {
			if ( process.env.READONLY ) return save_response(`${req.url}?save=failed`);
			let body = '';
			req.on( 'data', chunk => {
				body += chunk.toString();
			} );
			req.on( 'error', () => {
				console.log( error );
				res.end('error');
			} );
			return req.on( 'end', () => {
				var settings = {};
				body.split('&').forEach( arg => {
					if ( arg ) {
						let setting = decodeURIComponent(arg.replace( /\+/g, ' ' )).split('=');
						if ( setting[0] && setting.slice(1).join('=').trim() ) {
							if ( settings[setting[0]] ) {
								settings[setting[0]] += '|' + setting.slice(1).join('=').trim();
							}
							else settings[setting[0]] = setting.slice(1).join('=').trim();
						}
					}
				} );
				if ( isDebug ) console.log( settings );
				return posts[args[3]](save_response, settingsData.get(state), args[2], args[4], settings);
			} );

			/**
			 * @param {String} [resURL]
			 */
			function save_response(resURL = '/') {
				return dashboard(res, state, new URL(resURL, process.env.dashboard));
			}
		}
	}

	if ( req.method !== 'GET' ) {
		let body = '<img width="400" src="https://http.cat/418"><br><strong>' + http.STATUS_CODES[418] + '</strong>';
		res.writeHead(418, {
			'Content-Type': 'text/html',
			'Content-Length': body.length
		});
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
	} )?.map( cookie => cookie.replace( /^guild="(\w*)"$/, '$1' ) )?.join();
	if ( lastGuild ) res.setHeader('Set-Cookie', ['guild=""; HttpOnly; Path=/; Max-Age=0']);

	var state = req.headers.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'wikibot';
	} )?.map( cookie => cookie.replace( /^wikibot="(\w*(?:-\d+)?)"$/, '$1' ) )?.join();

	if ( reqURL.pathname === '/login' ) {
		return pages.login(res, state, reqURL.searchParams.get('action'));
	}

	if ( reqURL.pathname === '/logout' ) {
		settingsData.delete(state);
		res.setHeader('Set-Cookie', [
			...( res.getHeader('Set-Cookie') || [] ),
			'wikibot=""; HttpOnly; Path=/; Max-Age=0'
		]);
		return pages.login(res, state, 'logout');
	}

	if ( !state ) {
		return pages.login(res, state, ( reqURL.pathname === '/' ? '' : 'unauthorized' ));
	}

	if ( reqURL.pathname === '/oauth' ) {
		return pages.oauth(res, state, reqURL.searchParams, lastGuild);
	}

	if ( !settingsData.has(state) ) {
		return pages.login(res, state, ( reqURL.pathname === '/' ? '' : 'unauthorized' ));
	}

	if ( reqURL.pathname === '/refresh' ) {
		let returnLocation = reqURL.searchParams.get('return');
		if ( returnLocation && ( !returnLocation.startsWith('/') || returnLocation.startsWith('//') ) ) {
			returnLocation = '/';
		}
		return pages.refresh(res, state, returnLocation);
	}

	if ( reqURL.pathname === '/' || reqURL.pathname.startsWith( '/guild/' ) ) {
		return dashboard(res, state, reqURL);
	}

	return dashboard(res, state, new URL('/', process.env.dashboard));
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
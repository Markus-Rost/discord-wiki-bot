const http = require('http');
const pages = require('./oauth.js');
const dashboard = require('./guilds.js');
const {db, sessionData, settingsData} = require('./util.js');
const Lang = require('./i18n.js');
const allLangs = Lang.allLangs();

global.isDebug = ( process.argv[2] === 'debug' );

const posts = {
	settings: require('./settings.js').post,
	verification: require('./verification.js').post,
	rcscript: require('./rcscript.js').post,
	slash: require('./slash.js').post
};

const fs = require('fs');
const path = require('path');
const files = new Map([
	...fs.readdirSync( './dashboard/src' ).map( file => {
		return [`/src/${file}`, `./dashboard/src/${file}`];
	} ),
	...fs.readdirSync( './i18n/widgets' ).map( file => {
		return [`/src/widgets/${file}`, `./i18n/widgets/${file}`];
	} ),
	...( fs.existsSync('./RcGcDb/start.py') ? fs.readdirSync( './RcGcDb/locale/widgets' ).map( file => {
		return [`/src/widgets/RcGcDb/${file}`, `./RcGcDb/locale/widgets/${file}`];
	} ) : [] )
].map( ([file, filepath]) => {
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
	return [file, {path: filepath, contentType}];
} ));

const server = http.createServer( (req, res) => {
	if ( req.method === 'POST' && req.headers['content-type'] === 'application/x-www-form-urlencoded' && req.url.startsWith( '/guild/' ) ) {
		let args = req.url.split('/');
		let state = req.headers.cookie?.split('; ')?.filter( cookie => {
			return cookie.split('=')[0] === 'wikibot' && /^"(\w*(?:-\d+)*)"$/.test(( cookie.split('=')[1] || '' ));
		} )?.map( cookie => cookie.replace( /^wikibot="(\w*(?:-\d+)*)"$/, '$1' ) )?.join();

		if ( args.length === 5 && ['settings', 'verification', 'rcscript', 'slash'].includes( args[3] )
		&& /^(?:default|new|\d+)$/.test(args[4]) && sessionData.has(state) && settingsData.has(sessionData.get(state).user_id)
		&& settingsData.get(sessionData.get(state).user_id).guilds.isMember.has(args[2]) ) {
			if ( process.env.READONLY ) return save_response(`${req.url}?save=failed`);
			let body = [];
			req.on( 'data', chunk => {
				body.push(chunk);
			} );
			req.on( 'error', () => {
				console.log( '- Dashboard: ' + error );
				res.end('error');
			} );
			return req.on( 'end', () => {
				var settings = {};
				Buffer.concat(body).toString().split('&').forEach( arg => {
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
				if ( isDebug ) console.log( '- Dashboard:', req.url, settings, sessionData.get(state).user_id );
				return posts[args[3]](save_response, settingsData.get(sessionData.get(state).user_id), args[2], args[4], settings);
			} );

			/**
			 * @param {String} [resURL]
			 * @param {String} [action]
			 * @param {String[]} [actionArgs]
			 */
			function save_response(resURL = '/', action, ...actionArgs) {
				var themeCookie = ( req.headers?.cookie?.split('; ')?.find( cookie => {
					return cookie.split('=')[0] === 'theme' && /^"(?:light|dark)"$/.test(( cookie.split('=')[1] || '' ));
				} ) || 'dark' ).replace( /^theme="(light|dark)"$/, '$1' );
				var langCookie = ( req.headers?.cookie?.split('; ')?.filter( cookie => {
					return cookie.split('=')[0] === 'language' && /^"[a-z\-]+"$/.test(( cookie.split('=')[1] || '' ));
				} )?.map( cookie => cookie.replace( /^language="([a-z\-]+)"$/, '$1' ) ) || [] );
				var dashboardLang = new Lang(...langCookie, ...( req.headers?.['accept-language']?.split(',')?.map( lang => {
					lang = lang.split(';')[0].toLowerCase();
					if ( allLangs.map.hasOwnProperty(lang) ) return lang;
					lang = lang.replace( /-\w+$/, '' );
					if ( allLangs.map.hasOwnProperty(lang) ) return lang;
					lang = lang.replace( /-\w+$/, '' );
					if ( allLangs.map.hasOwnProperty(lang) ) return lang;
					return '';
				} ) || [] ));
				dashboardLang.fromCookie = langCookie;
				return dashboard(res, dashboardLang, themeCookie, sessionData.get(state), new URL(resURL, process.env.dashboard), action, actionArgs);
			}
		}
	}

	if ( req.method !== 'GET' ) {
		let body = '<img width="400" src="https://http.cat/418"><br><strong>' + http.STATUS_CODES[418] + '</strong>';
		res.writeHead(418, {
			'Content-Type': 'text/html',
			'Content-Length': Buffer.byteLength(body)
		});
		res.write( body );
		return res.end();
	}

	var reqURL = new URL(req.url, process.env.dashboard);

	if ( reqURL.pathname === '/favicon.ico' ) reqURL.pathname = '/src/icon.png';
	if ( files.has(reqURL.pathname) ) {
		let file = files.get(reqURL.pathname);
		res.writeHead(200, {'Content-Type': file.contentType});
		return fs.createReadStream(file.path).pipe(res);
	}

	res.setHeader('Content-Type', 'text/html');

	var themeCookie = ( req.headers?.cookie?.split('; ')?.find( cookie => {
		return cookie.split('=')[0] === 'theme' && /^"(?:light|dark)"$/.test(( cookie.split('=')[1] || '' ));
	} ) || 'dark' ).replace( /^theme="(light|dark)"$/, '$1' );

	var langCookie = ( req.headers?.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'language' && /^"[a-z\-]+"$/.test(( cookie.split('=')[1] || '' ));
	} )?.map( cookie => cookie.replace( /^language="([a-z\-]+)"$/, '$1' ) ) || [] );
	var dashboardLang = new Lang(...langCookie, ...( req.headers?.['accept-language']?.split(',')?.map( lang => {
		lang = lang.split(';')[0].toLowerCase();
		if ( allLangs.map.hasOwnProperty(lang) ) return lang;
		lang = lang.replace( /-\w+$/, '' );
		if ( allLangs.map.hasOwnProperty(lang) ) return lang;
		lang = lang.replace( /-\w+$/, '' );
		if ( allLangs.map.hasOwnProperty(lang) ) return lang;
		return '';
	} ) || [] ));
	dashboardLang.fromCookie = langCookie;
	res.setHeader('Content-Language', [dashboardLang.lang]);

	var lastGuild = req.headers?.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'guild' && /^"\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?"$/.test(( cookie.split('=')[1] || '' ));
	} )?.map( cookie => cookie.replace( /^guild="(\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?)"$/, '$1' ) )?.join();
	if ( lastGuild ) res.setHeader('Set-Cookie', ['guild=""; HttpOnly; Path=/; Max-Age=0']);

	var state = req.headers.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'wikibot' && /^"(\w*(?:-\d+)*)"$/.test(( cookie.split('=')[1] || '' ));
	} )?.map( cookie => cookie.replace( /^wikibot="(\w*(?:-\d+)*)"$/, '$1' ) )?.join();

	if ( reqURL.pathname === '/login' ) {
		let action = '';
		if ( reqURL.searchParams.get('action') === 'failed' ) action = 'loginfail';
		return pages.login(res, dashboardLang, themeCookie, state, action);
	}

	if ( reqURL.pathname === '/logout' ) {
		sessionData.delete(state);
		res.setHeader('Set-Cookie', [
			...( res.getHeader('Set-Cookie') || [] ),
			'wikibot=""; HttpOnly; Path=/; Max-Age=0'
		]);
		return pages.login(res, dashboardLang, themeCookie, state, 'logout');
	}

	if ( !state ) {
		if ( reqURL.pathname.startsWith( '/guild/' ) ) {
			let pathGuild = reqURL.pathname.split('/').slice(2, 5).join('/');
			if ( /^\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?$/.test(pathGuild) ) {
				res.setHeader('Set-Cookie', [`guild="${pathGuild}"; HttpOnly; Path=/`]);
			}
		}
		return pages.login(res, dashboardLang, themeCookie, state, ( reqURL.pathname === '/' ? '' : 'unauthorized' ));
	}

	if ( reqURL.pathname === '/oauth' ) {
		return pages.oauth(res, state, reqURL.searchParams, lastGuild);
	}

	if ( !sessionData.has(state) || !settingsData.has(sessionData.get(state).user_id) ) {
		if ( reqURL.pathname.startsWith( '/guild/' ) ) {
			let pathGuild = reqURL.pathname.split('/').slice(2, 5).join('/');
			if ( /^\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?$/.test(pathGuild) ) {
				res.setHeader('Set-Cookie', [`guild="${pathGuild}"; HttpOnly; Path=/`]);
			}
		}
		return pages.login(res, dashboardLang, themeCookie, state, ( reqURL.pathname === '/' ? '' : 'unauthorized' ));
	}

	if ( reqURL.pathname === '/refresh' ) {
		let returnLocation = reqURL.searchParams.get('return');
		if ( !/^\/guild\/\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?$/.test(returnLocation) ) {
			returnLocation = '/';
		}
		return pages.refresh(res, sessionData.get(state), returnLocation);
	}

	if ( reqURL.pathname === '/api' ) {
		let wiki = reqURL.searchParams.get('wiki');
		if ( wiki ) return pages.api(res, wiki);
	}

	let action = '';
	if ( reqURL.searchParams.get('refresh') === 'success' ) action = 'refresh';
	if ( reqURL.searchParams.get('refresh') === 'failed' ) action = 'refreshfail';
	return dashboard(res, dashboardLang, themeCookie, sessionData.get(state), reqURL, action);
} );

server.listen( 8080, 'localhost', () => {
	console.log( '- Dashboard: Server running at http://localhost:8080/' );
} );


String.prototype.replaceSave = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replace( /\$/g, '$$$$' ) : replacement ) );
};

/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
function graceful(signal) {
	console.log( '- Dashboard: ' + signal + ': Closing the dashboard...' );
	server.close( () => {
		console.log( '- Dashboard: ' + signal + ': Closed the dashboard server.' );
		db.end().then( () => {
			console.log( '- Dashboard: ' + signal + ': Closed the database connection.' );
			process.exit(0);
		}, dberror => {
			console.log( '- Dashboard: ' + signal + ': Error while closing the database connection: ' + dberror );
		} );
	} );
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
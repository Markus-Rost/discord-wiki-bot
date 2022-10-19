import './globals.js';
import { createServer, STATUS_CODES } from 'node:http';
import { createReadStream, readdirSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import * as pages from './oauth.js';
import dashboard from './guilds.js';
import { posts } from './functions.js';
import { db, sessionData, settingsData } from './util.js';
import Lang from './i18n.js';
const allLangs = Lang.allLangs();

const files = new Map([
	...readdirSync( './dashboard/src' ).map( file => {
		return [`/src/${file}`, `./dashboard/src/${file}`];
	} ),
	...readdirSync( './i18n/widgets' ).map( file => {
		return [`/src/widgets/${file}`, `./i18n/widgets/${file}`];
	} ),
	...( existsSync('./RcGcDb/start.py') ? readdirSync( './RcGcDb/locale/widgets' ).map( file => {
		return [`/src/widgets/RcGcDb/${file}`, `./RcGcDb/locale/widgets/${file}`];
	} ) : [] )
].map( ([file, filepath]) => {
	let contentType = 'text/html';
	switch ( extname(file) ) {
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

const server = createServer( (req, res) => {
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	if ( req.method === 'POST' && req.headers['content-type'] === 'application/x-www-form-urlencoded' && ( req.url.startsWith( '/guild/' ) || req.url === '/user' ) ) {
		/** @type {String[]} */
		let args = req.url.split('/');
		let state = req.headers.cookie?.split('; ')?.filter( cookie => {
			return cookie.split('=')[0] === 'wikibot' && /^"([\da-f]+(?:-\d+)*)"$/.test(( cookie.split('=')[1] || '' ));
		} )?.map( cookie => cookie.replace( /^wikibot="([\da-f]+(?:-\d+)*)"$/, '$1' ) )?.join();

		if ( state && sessionData.has(state) && settingsData.has(sessionData.get(state).user_id) &&
		( ( args.length === 5 && ['settings', 'verification', 'rcscript'].includes( args[3] ) && /^(?:default|new|notice|button|\d+)$/.test(args[4])
		&& settingsData.get(sessionData.get(state).user_id).guilds.isMember.has(args[2]) ) || req.url === '/user' ) ) {
			let body = [];
			req.on( 'data', chunk => {
				body.push(chunk);
			} );
			req.on( 'error', () => {
				console.log( '- Dashboard: ' + error );
				res.end('error');
			} );
			return req.on( 'end', () => {
				if ( process.env.READONLY && args.slice(3).join('/') !== 'verification/button' ) return save_response(`${req.url}?save=failed`);
				var settings = {};
				Buffer.concat(body).toString().split('&').forEach( arg => {
					if ( arg ) {
						let setting = decodeURIComponent(arg.replaceAll( '+', ' ' )).split('=');
						if ( setting[0] && setting.slice(1).join('=').trim() ) {
							if ( settings[setting[0]] ) {
								settings[setting[0]] += '|' + setting.slice(1).join('=').trim();
							}
							else settings[setting[0]] = setting.slice(1).join('=').trim();
						}
					}
				} );
				if ( isDebug ) console.log( '- Dashboard:', req.url, settings, sessionData.get(state).user_id );
				if ( req.url === '/user' ) {
					let setting = Object.keys(settings);
					if ( setting.length === 1 && setting[0].startsWith( 'oauth_' ) && setting[0].split('_').length >= 3 ) {
						setting = setting[0].split('_');
						return posts.user(save_response, sessionData.get(state).user_id, setting[1], setting.slice(2).join('_'));
					}
				}
				else return posts[args[3]](save_response, settingsData.get(sessionData.get(state).user_id), args[2], args[4], settings);

				/**
				 * @param {String} [resURL]
				 * @param {String} [action]
				 * @param {String[]} [actionArgs]
				 */
				function save_response(resURL = '/', action, ...actionArgs) {
					if ( action === 'REDIRECT' && resURL.startsWith( 'https://' ) ) {
						res.writeHead(303, {Location: resURL});
						return res.end();
					}
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
			} );
		}
	}

	var reqURL = new URL(req.url, process.env.dashboard);

	if ( req.method === 'HEAD' && files.has(reqURL.pathname) ) {
		let file = files.get(reqURL.pathname);
		res.writeHead(200, {'Content-Type': file.contentType});
		return res.end();
	}
	if ( req.method !== 'GET' ) {
		let body = '<img width="400" src="https://http.cat/418"><br><strong>' + STATUS_CODES[418] + '</strong>';
		res.writeHead(418, {
			'Content-Type': 'text/html',
			'Content-Length': Buffer.byteLength(body)
		});
		res.write( body );
		return res.end();
	}

	if ( reqURL.pathname === '/favicon.ico' ) reqURL.pathname = '/src/icon.png';
	if ( files.has(reqURL.pathname) ) {
		let file = files.get(reqURL.pathname);
		res.writeHead(200, {'Content-Type': file.contentType});
		return createReadStream(file.path).pipe(res);
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
		return cookie.split('=')[0] === 'guild' && /^"(?:user|\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?)"$/.test(( cookie.split('=')[1] || '' ));
	} )?.map( cookie => cookie.replace( /^guild="(user|\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?)"$/, '$1' ) )?.join();
	if ( lastGuild ) res.setHeader('Set-Cookie', ['guild=""; SameSite=Lax; Path=/; Max-Age=0']);

	var state = req.headers.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'wikibot' && /^"([\da-f]+(?:-\d+)*)"$/.test(( cookie.split('=')[1] || '' ));
	} )?.map( cookie => cookie.replace( /^wikibot="([\da-f]+(?:-\d+)*)"$/, '$1' ) )?.join();

	if ( reqURL.pathname === '/login' ) {
		let action = '';
		if ( reqURL.searchParams.get('action') === 'failed' ) action = 'loginfail';
		return pages.login(res, dashboardLang, themeCookie, state, action);
	}

	if ( reqURL.pathname === '/logout' ) {
		sessionData.delete(state);
		res.setHeader('Set-Cookie', [
			...( res.getHeader('Set-Cookie') || [] ),
			'wikibot=""; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
		]);
		return pages.login(res, dashboardLang, themeCookie, state, 'logout');
	}

	if ( reqURL.pathname === '/oauth/mw' ) {
		return pages.verify(res, reqURL.searchParams, sessionData.get(state)?.user_id);
	}

	if ( !state ) {
		let action = '';
		if ( reqURL.pathname !== '/' ) action = 'unauthorized';
		if ( reqURL.pathname.startsWith( '/guild/' ) ) {
			let pathGuild = reqURL.pathname.split('/').slice(2, 5).join('/');
			if ( /^\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?$/.test(pathGuild) ) {
				res.setHeader('Set-Cookie', [`guild="${pathGuild}"; SameSite=Lax; Path=/`]);
			}
		}
		else if ( reqURL.pathname === '/user' ) {
			if ( reqURL.searchParams.get('oauth') === 'success' ) action = 'oauth';
			if ( reqURL.searchParams.get('oauth') === 'failed' ) action = 'oauthfail';
			if ( reqURL.searchParams.get('oauth') === 'verified' ) action = 'oauthverify';
			if ( reqURL.searchParams.get('oauth') === 'other' ) action = 'oauth';
			res.setHeader('Set-Cookie', ['guild="user"; SameSite=Lax; Path=/']);
		}
		return pages.login(res, dashboardLang, themeCookie, state, action);
	}

	if ( reqURL.pathname === '/oauth' ) {
		return pages.oauth(res, state, reqURL.searchParams, lastGuild);
	}

	if ( !sessionData.has(state) || !settingsData.has(sessionData.get(state).user_id) ) {
		let action = '';
		if ( reqURL.pathname !== '/' ) action = 'unauthorized';
		if ( reqURL.pathname.startsWith( '/guild/' ) ) {
			let pathGuild = reqURL.pathname.split('/').slice(2, 5).join('/');
			if ( /^\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?$/.test(pathGuild) ) {
				res.setHeader('Set-Cookie', [`guild="${pathGuild}"; SameSite=Lax; Path=/`]);
			}
		}
		else if ( reqURL.pathname === '/user' ) {
			if ( reqURL.searchParams.get('oauth') === 'success' ) action = 'oauth';
			if ( reqURL.searchParams.get('oauth') === 'failed' ) action = 'oauthfail';
			if ( reqURL.searchParams.get('oauth') === 'verified' ) action = 'oauthverify';
			if ( reqURL.searchParams.get('oauth') === 'other' ) action = 'oauth';
			res.setHeader('Set-Cookie', ['guild="user"; SameSite=Lax; Path=/']);
		}
		return pages.login(res, dashboardLang, themeCookie, state, action);
	}

	if ( reqURL.pathname === '/refresh' ) {
		let returnLocation = reqURL.searchParams.get('return');
		if ( !/^\/(?:user|guild\/\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?)$/.test(returnLocation) ) {
			returnLocation = '/';
		}
		return pages.refresh(res, sessionData.get(state), returnLocation);
	}

	if ( reqURL.pathname === '/api' ) {
		let wiki = reqURL.searchParams.get('wiki');
		let [, guild] = req.headers.referer.match( /\/guild\/(\d+)\// );
		if ( wiki ) return pages.api(res, wiki, guild || null);
	}

	let action = '';
	if ( reqURL.searchParams.get('refresh') === 'success' ) action = 'refresh';
	if ( reqURL.searchParams.get('refresh') === 'failed' ) action = 'refreshfail';
	if ( reqURL.pathname === '/user' ) {
		if ( reqURL.searchParams.get('oauth') === 'success' ) action = 'oauth';
		if ( reqURL.searchParams.get('oauth') === 'failed' ) action = 'oauthfail';
		if ( reqURL.searchParams.get('oauth') === 'verified' ) action = 'oauthverify';
		if ( reqURL.searchParams.get('oauth') === 'other' ) action = 'oauthother';
	}
	return dashboard(res, dashboardLang, themeCookie, sessionData.get(state), reqURL, action);
} );

server.listen( 8080, 'localhost', () => {
	console.log( '- Dashboard: Server running at http://localhost:8080/' );
} );


String.prototype.replaceSafe = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replaceAll( '$', '$$$$' ) : replacement ) );
};

String.prototype.replaceAllSafe = function(pattern, replacement) {
	return this.replaceAll( pattern, ( typeof replacement === 'string' ? replacement.replaceAll( '$', '$$$$' ) : replacement ) );
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
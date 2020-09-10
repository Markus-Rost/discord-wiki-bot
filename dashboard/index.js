const http = require('http');
const crypto = require('crypto');
const db = require('./util/database.js');
const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

var messageId = 1;
var messages = new Map();

process.on( 'message', message => {
	messages.get(message.id).resolve(message.data);
	messages.delete(message.id);
} );

function sendMsg(message) {
	var id = messageId++;
	var promise = new Promise( (resolve, reject) => {
		messages.set(id, {resolve, reject});
		process.send( {id, data: message} );
	} );
	return promise;
}

/**
 * @typedef Settings
 * @property {String} state
 * @property {String} access_token
 * @property {User} user
 * @property {Map<String, Guild>} guilds
 */

/**
 * @typedef User
 * @property {String} id
 * @property {String} username
 * @property {String} discriminator
 * @property {String} avatar
 * @property {String} locale
 */

/**
 * @typedef Guild
 * @property {String} id
 * @property {String} name
 * @property {String} icon
 * @property {String} permissions
 */

/**
 * @type {Map<String, Settings>}
 */
var settingsData = new Map();

const server = http.createServer((req, res) => {
	if ( req.method !== 'GET' ) {
		res.writeHead(418, {'Content-Type': 'text/html'});
		res.write( '<img width="400" src="https://http.cat/418"><br><strong>' + http.STATUS_CODES[418] + '</strong>' );
		return res.end();
	}
	res.setHeader('Content-Type', 'text/html');
	res.setHeader('Content-Language', ['en']);
	var reqURL = new URL(req.url, process.env.dashboard);
	if ( reqURL.pathname === '/login' ) {
		let responseCode = 200;
		let notice = '';
		if ( reqURL.searchParams.get('action') === 'failed' ) {
			responseCode = 400;
			notice = '<img width="400" src="https://http.cat/' + responseCode + '"><br><strong>Login failed, please try again!</strong><br><br>';
		}
		if ( reqURL.searchParams.get('action') === 'missing' ) {
			responseCode = 404;
			notice = '<img width="400" src="https://http.cat/' + responseCode + '"><br><strong>404, could not find the page!</strong><br><br>';
		}
		let state = crypto.randomBytes(16).toString("hex");
		while ( settingsData.has(state) ) {
			state = crypto.randomBytes(16).toString("hex");
		}
		let url = oauth.generateAuthUrl( {
			scope: ['identify', 'guilds'],
			promt: 'none', state
		} );
		res.writeHead(responseCode, {
			'Set-Cookie': [`wikibot="${state}"`, 'HttpOnly', 'SameSite=Strict']
		});
		res.write( notice + `<a href="${url}">Login</a>` );
		return res.end();
	}
	var state = req.headers?.cookie?.split('; ')?.filter( cookie => {
		return cookie.split('=')[0] === 'wikibot';
	} )?.map( cookie => cookie.replace( /^wikibot="(\w+)"$/, '$1' ) )?.join();
	if ( reqURL.pathname === '/logout' ) {
		settingsData.delete(state);
		res.writeHead(302, {
			Location: '/?action=logout',
			'Set-Cookie': [`wikibot="${state}"`, 'Max-Age=0', 'HttpOnly', 'SameSite=Strict']
		});
		return res.end();
	}
	if ( reqURL.pathname === '/oauth' ) {
		if ( state !== reqURL.searchParams.get('state') || !reqURL.searchParams.get('code') ) {
			res.writeHead(302, {
				Location: '/login?action=failed'
			});
			return res.end();
		}
		return oauth.tokenRequest( {
			scope: ['identify', 'guilds'],
			code: reqURL.searchParams.get('code'),
			grantType: 'authorization_code'
		} ).then( ({access_token}) => {
			return Promise.all([
				oauth.getUser(access_token),
				oauth.getUserGuilds(access_token)
			]).then( ([user, guilds]) => {
				settingsData.set(state, {
					state, access_token,
					user: {
						id: user.id,
						username: user.username,
						discriminator: user.discriminator,
						avatar: 'https://cdn.discordapp.com/' + ( user.avatar ? 
							`embed/avatars/${user.discriminator % 5}.png` : 
							`avatars/${user.id}/${user.avatar}.webp` ),
						locale: user.locale
					},
					guilds: new Map(guilds.filter( guild => {
						return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
					} ).map( guild => [guild.id, {
						id: guild.id,
						name: guild.name,
						icon: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp`,
						permissions: guild.permissions
					}] ))
				});
				res.writeHead(302, {
					Location: '/'
				});
				return res.end();
			}, error => {
				console.log( '- Dashboard: Error while getting user and guilds: ' + error );
				res.writeHead(302, {
					Location: '/login?action=failed'
				});
				return res.end();
			} );
		}, error => {
			console.log( '- Dashboard: Error while getting the token: ' + error );
			res.writeHead(302, {
				Location: '/login?action=failed'
			});
			return res.end();
		} );
	}
	if ( reqURL.pathname === '/refresh' ) {
		if ( !settingsData.has(state) ) {
			res.writeHead(302, {
				Location: '/login?action=failed'
			});
			return res.end();
		}
		let settings = settingsData.get(state)
		return oauth.getUserGuilds(settings.access_token).then( guilds => {
			settings.guilds = new Map(guilds.filter( guild => {
				return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
			} ).map( guild => [guild.id, {
				id: guild.id,
				name: guild.name,
				icon: guild.icon,
				permissions: guild.permissions
			}] ));
			res.writeHead(302, {
				Location: ( reqURL.searchParams.get('returnTo') || '/' )
			});
			return res.end();
		}, error => {
			console.log( '- Dashboard: Error while refreshing guilds: ' + error );
			res.writeHead(302, {
				Location: '/login?action=failed'
			});
			return res.end();
		} );
	}
	if ( reqURL.pathname === '/' ) {
		if ( !settingsData.has(state) ) {
			let notice = '';
			if ( reqURL.searchParams.get('action') === 'logout' ) {
				notice = '<strong>Successfully logged out!</strong><br><br>';
			}
			res.write( notice + '<a href="/login">Login</a>' );
			return res.end();
		}
		let notice = 'Guilds:';
		settingsData.get(state)?.guilds.forEach( guild => {
			notice += '\n\n' + guild.name;
		} );
		res.write( '<a href="/refresh">Refresh guild list.</a><pre>' + notice.replace( /</g, '&lt;' ) + '</pre>' );
		return res.end();
	}
	if ( /^\/guild\/\d+$/.test(reqURL.pathname) && settingsData.get(state)?.guilds?.has(reqURL.pathname.replace( '/guild/', '' )) ) {
		res.write( settingsData.get(state).guilds.get(reqURL.pathname.replace( '/guild/', '' )).name.replace( /</g, '&lt;' ) );
		return res.end();
	}
	if ( reqURL.pathname === '/guild' || reqURL.pathname.startsWith( '/guild/' ) ) {
		res.writeHead(302, {
			Location: '/'
		});
		return res.end();
	}
	res.writeHead(302, {'Location': '/login?action=missing'});
	return res.end();
});

server.listen(8080, 'localhost', () => {
	console.log( '- Dashboard: Server running at http://localhost:8080/' );
});

const permissions = {
	ADMINISTRATOR: 1 << 3,
	MANAGE_CHANNELS: 1 << 4,
	MANAGE_GUILD: 1 << 5,
	MANAGE_MESSAGES: 1 << 13,
	MENTION_EVERYONE: 1 << 17,
	MANAGE_NICKNAMES: 1 << 27,
	MANAGE_ROLES: 1 << 28,
	MANAGE_WEBHOOKS: 1 << 29,
	MANAGE_EMOJIS: 1 << 30
}

/**
 * Check if a permission is included in the BitField
 * @param {String|Number} all - BitField of multiple permissions
 * @param {String} permission - Name of the permission to check for
 * @param {Boolean} [admin] - If administrator permission can overwrite
 * @returns {Boolean}
 */
function hasPerm(all, permission, admin = true) {
	var bit = permissions[permission];
	var adminOverwrite = ( admin && (all & permissions.ADMINISTRATOR) === permissions.ADMINISTRATOR );
	return ( adminOverwrite || (all & bit) === bit )
}


/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
async function graceful(signal) {
	console.log( '- Dashboard: ' + signal + ': Closing the dashboard...' );
	server.close( () => {
		console.log( '- Dashboard: ' + signal + ': Closed the dashboard server.' );
	} );
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
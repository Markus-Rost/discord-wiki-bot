const http = require('http');
const crypto = require('crypto');
const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');

const sqlite3 = require('sqlite3').verbose();
const mode = ( process.env.READONLY ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE );
const db = new sqlite3.Database( './wikibot.db', mode, dberror => {
	if ( dberror ) {
		console.log( '- Dashboard: Error while connecting to the database: ' + dberror );
		return dberror;
	}
	console.log( '- Dashboard: Connected to the database.' );
} );

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const fs = require('fs');
const files = {
	index: fs.readFileSync('./dashboard/index.html'),
	login: fs.readFileSync('./dashboard/login.html')
}

/**
 * @type {Map<Number, PromiseConstructor>}
 */
var messages = new Map();
var messageId = 1;

process.on( 'message', message => {
	if ( message.id ) {
		if ( message.data.error ) messages.get(message.id).reject(message.data.error);
		else messages.get(message.id).resolve(message.data.response);
		return messages.delete(message.id);
	}
	console.log( '- [Dashboard]: Message received!', message );
} );

/**
 * Send messages to the manager.
 * @param {Object} [message] - The message.
 * @returns {Promise<Object>}
 */
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
 * @property {Object} guilds
 * @property {Map<String, Guild>} guilds.isMember
 * @property {Map<String, Guild>} guilds.notMember
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
 * @property {String} acronym
 * @property {String} [icon]
 * @property {String} permissions
 */

/**
 * @type {Map<String, Settings>}
 */
var settingsData = new Map();

const server = http.createServer((req, res) => {
	if ( req.method !== 'GET' ) {
		let notice = '<img width="400" src="https://http.cat/418"><br><strong>' + http.STATUS_CODES[418] + '</strong>';
		res.writeHead(418, {'Content-Length': notice.length});
		res.write( notice );
		return res.end();
	}

	if ( req.url === '/favicon.ico' ) {
		res.writeHead(302, {Location: 'https://cdn.discordapp.com/avatars/461189216198590464/f69cdc197791aed829882b64f9760dbb.png?size=64'});
		return res.end();
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

	var reqURL = new URL(req.url, process.env.dashboard);

	if ( reqURL.pathname === '/login' ) {
		if ( settingsData.has(state) ) {
			res.writeHead(302, {Location: '/'});
			return res.end();
		}
		if ( state ) res.setHeader('Set-Cookie', [`wikibot="${state}"; Max-Age=0; HttpOnly`]);
		var $ = cheerio.load(files.login);
		$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
			scope: ['identify', 'guilds', 'bot'],
			permissions: defaultPermissions, state
		} ));
		let responseCode = 200;
		if ( reqURL.searchParams.get('action') === 'failed' ) {
			responseCode = 400;
			$('replace#notice').replaceWith(`<div class="notice">
				<b>Login failed!</b>
				<div>An error occurred while logging you in, please try again.</div>
			</div>`);
		}
		if ( reqURL.searchParams.get('action') === 'unauthorized' ) {
			responseCode = 401;
			$('replace#notice').replaceWith(`<div class="notice">
				<b>Not logged in!</b>
				<div>Please login before you can change any settings.</div>
			</div>`);
		}
		if ( reqURL.searchParams.get('action') === 'logout' ) {
			$('replace#notice').replaceWith(`<div class="notice">
				<b>Successfully logged out!</b>
				<div>You have been successfully logged out. To change any settings you need to login again.</div>
			</div>`);
		}
		$('replace#notice').replaceWith('');
		state = crypto.randomBytes(16).toString("hex");
		while ( settingsData.has(state) ) {
			state = crypto.randomBytes(16).toString("hex");
		}
		let url = oauth.generateAuthUrl( {
			scope: ['identify', 'guilds'],
			prompt: 'none', state
		} );
		$('replace#text').replaceWith(`<a href="${url}">Login</a>`);
		let notice = $.html();
		res.writeHead(responseCode, {
			'Set-Cookie': [`wikibot="${state}"; HttpOnly`],
			'Content-Length': notice.length
		});
		res.write( notice );
		return res.end();
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
		if ( settingsData.has(state) ) {
			res.writeHead(302, {Location: '/'});
			return res.end();
		}
		if ( state !== reqURL.searchParams.get('state') || !reqURL.searchParams.get('code') ) {
			res.writeHead(302, {Location: '/login?action=unauthorized'});
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
				guilds = guilds.filter( guild => {
					return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
				} ).map( guild => {
					return {
						id: guild.id,
						name: guild.name,
						acronym: guild.name.replace( /'s /g, ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
						icon: ( guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.`
						+ ( guild.icon.startsWith( 'a_' ) ? 'gif' : 'png' ) + '?size=128' : null ),
						permissions: guild.permissions
					};
				} );
				sendMsg( {
					type: 'isMemberAll',
					guilds: guilds.map( guild => guild.id )
				} ).then( response => {
					let isMember = new Map();
					let notMember = new Map();
					response.forEach( (guild, i) => {
						if ( guild ) isMember.set(guilds[i].id, guilds[i]);
						else notMember.set(guilds[i].id, guilds[i]);
					} );
					settingsData.set(`${state}-${user.id}`, {
						state: `${state}-${user.id}`,
						access_token,
						user: {
							id: user.id,
							username: user.username,
							discriminator: user.discriminator,
							avatar: 'https://cdn.discordapp.com/' + ( user.avatar ? 
								`avatars/${user.id}/${user.avatar}.` + 
								( user.avatar.startsWith( 'a_' ) ? 'gif' : 'png' ) : 
								`embed/avatars/${user.discriminator % 5}.png` ) + '?size=64',
							locale: user.locale
						},
						guilds: {isMember, notMember}
					});
					res.writeHead(302, {
						Location: ( lastGuild ? '/guild/' + lastGuild : '/' ),
						'Set-Cookie': [
							`wikibot="${state}"; Max-Age=0; HttpOnly`,
							`wikibot="${state}-${user.id}"; HttpOnly`
						]
					});
					return res.end();
				}, error => {
					console.log( '- Dashboard: Error while checking the guilds:', error );
					res.writeHead(302, {Location: '/login?action=failed'});
					return res.end();
				} );
			}, error => {
				console.log( '- Dashboard: Error while getting user and guilds: ' + error );
				res.writeHead(302, {Location: '/login?action=failed'});
				return res.end();
			} );
		}, error => {
			console.log( '- Dashboard: Error while getting the token: ' + error );
			res.writeHead(302, {Location: '/login?action=failed'});
			return res.end();
		} );
	}

	if ( !settingsData.has(state) ) {
		res.writeHead(302, {
			Location: ( reqURL.pathname === '/' ? '/login' : '/login?action=unauthorized' )
		});
		return res.end();
	}
	var settings = settingsData.get(state);

	if ( reqURL.pathname === '/refresh' ) {
		return oauth.getUserGuilds(settings.access_token).then( guilds => {
			guilds = guilds.filter( guild => {
				return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
			} ).map( guild => {
				return {
					id: guild.id,
					name: guild.name,
					acronym: guild.name.replace( /'s /g, ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
					icon: ( guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.`
					+ ( guild.icon.startsWith( 'a_' ) ? 'gif' : 'png' ) + '?size=128' : null ),
					permissions: guild.permissions
				};
			} );
			sendMsg( {
				type: 'isMemberAll',
				guilds: guilds.map( guild => guild.id )
			} ).then( response => {
				let isMember = new Map();
				let notMember = new Map();
				response.forEach( (guild, i) => {
					if ( guild ) isMember.set(guilds[i].id, guilds[i]);
					else notMember.set(guilds[i].id, guilds[i]);
				} );
				settings.guilds = {isMember, notMember};
				res.writeHead(302, {
					Location: ( reqURL.searchParams.get('return') || '/' )
				});
				return res.end();
			}, error => {
				console.log( '- Dashboard: Error while checking refreshed guilds:', error );
				res.writeHead(302, {Location: '/login?action=failed'});
				return res.end();
			} );
		}, error => {
			console.log( '- Dashboard: Error while refreshing guilds: ' + error );
			res.writeHead(302, {Location: '/login?action=failed'});
			return res.end();
		} );
	}

	var $ = cheerio.load(files.index);
	$('replace#notice').replaceWith('');
	$('.navbar #logout img').attr('src', settings.user.avatar);
	$('.navbar #logout span').text(`${settings.user.username} #${settings.user.discriminator}`);
	$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot'],
		permissions: defaultPermissions, state
	} ));
	$('.guild#refresh a').attr('href', '/refresh?return=' + reqURL.pathname);
	let guilds = '';
	if ( settings.guilds.isMember.size ) {
		guilds += `<div class="guild">
			<div class="separator"></div>
		</div>`;
		settings.guilds.isMember.forEach( guild => {
			guilds += `<div class="guild" id="${guild.id}">
				<div class="bar"></div>
				<a href="/guild/${guild.id}" alt="${guild.name}">` + ( guild.icon ? 
					`<img class="avatar" src="${guild.icon}" alt="${guild.acronym}" width="48" height="48">`
					: `<div class="avatar noicon">${guild.acronym}</div>` ) + 
				`</a>
			</div>`;
		} );
	}
	if ( settings.guilds.notMember.size ) {
		guilds += `<div class="guild">
			<div class="separator"></div>
		</div>`;
		settings.guilds.notMember.forEach( guild => {
			guilds += `<div class="guild" id="${guild.id}">
				<div class="bar"></div>
				<a href="/guild/${guild.id}" alt="${guild.name}">` + ( guild.icon ? 
					`<img class="avatar" src="${guild.icon}" alt="${guild.acronym}" width="48" height="48">`
					: `<div class="avatar noicon">${guild.acronym}</div>` ) + 
				`</a>
			</div>`;
		} );
	}
	$('replace#guilds').replaceWith(guilds);

	if ( reqURL.pathname.startsWith( '/guild/' ) ) {
		let id = reqURL.pathname.replace( '/guild/', '' );
		if ( settings.guilds.isMember.has(id) ) {
			$('.guild#' + id).addClass('selected');
			let guild = settings.guilds.isMember.get(id);
			$('head title').text(guild.name + ' – ' + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${id}"; HttpOnly; Path=/`]);
			$('replace#text').replaceWith(`${guild.permissions}`);
		}
		if ( settings.guilds.notMember.has(id) ) {
			$('.guild#' + id).addClass('selected');
			let guild = settings.guilds.notMember.get(id);
			$('head title').text(guild.name + ' – ' + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${id}"; HttpOnly; Path=/`]);
			let url = oauth.generateAuthUrl( {
				scope: ['identify', 'guilds', 'bot'],
				permissions: defaultPermissions,
				guild_id: id, state
			} );
			$('replace#text').replaceWith(`<a href="${url}">${guild.permissions}</a>`);
		}
		$('replace#text').replaceWith('You are missing the <code>MANAGE_GUILD</code> permission.');
	}

	$('replace#text').replaceWith('Keks');
	let notice = $.html();
	res.writeHead(200, {'Content-Length': notice.length});
	res.write( notice );
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
 * @param {String?} permission - Name of the permission to check for
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
	await server.close( () => {
		console.log( '- Dashboard: ' + signal + ': Closed the dashboard server.' );
	} );
	await db.close( dberror => {
		if ( dberror ) {
			console.log( '- Dashboard: ' + signal + ': Error while closing the database connection: ' + dberror );
			return dberror;
		}
		console.log( '- Dashboard: ' + signal + ': Closed the database connection.' );
	} );
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
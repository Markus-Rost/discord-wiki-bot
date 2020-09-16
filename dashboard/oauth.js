const crypto = require('crypto');
const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');
const {settingsData, sendMsg, createNotice, hasPerm} = require('./util.js');

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const file = require('fs').readFileSync('./dashboard/login.html');

/**
 * Let a user login
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} [state] - The user state
 * @param {String} [action] - The action the user made
 */
function dashboard_login(res, state, action) {
	if ( state ) {
		if ( settingsData.has(state) ) {
			res.writeHead(302, {Location: '/'});
			return res.end();
		}
		res.setHeader('Set-Cookie', [`wikibot="${state}"; Max-Age=0; HttpOnly`]);
	}
	var $ = cheerio.load(file);
	let invite = oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot'],
		permissions: defaultPermissions, state
	} );
	$('.guild#invite a').attr('href', invite);
	$('.channel#invite-wikibot').attr('href', invite);
	let responseCode = 200;
	if ( action === 'failed' ) {
		responseCode = 400;
		createNotice($, {
			title: 'Login failed!',
			text: 'An error occurred while logging you in, please try again.'
		}).prependTo('#text');
	}
	if ( action === 'unauthorized' ) {
		responseCode = 401;
		createNotice($, {
			title: 'Not logged in!',
			text: 'Please login before you can change any settings.'
		}).prependTo('#text');
	}
	if ( action === 'logout' ) {
		createNotice($, {
			title: 'Successfully logged out!',
			text: 'You have been successfully logged out. To change any settings you need to login again.'
		}).prependTo('#text');
	}
	state = crypto.randomBytes(16).toString("hex");
	while ( settingsData.has(state) ) {
		state = crypto.randomBytes(16).toString("hex");
	}
	let url = oauth.generateAuthUrl( {
		scope: ['identify', 'guilds'],
		prompt: 'none', state
	} );
	$('.channel#login').attr('href', url);
	$('<a>').attr('href', url).text('Login').appendTo('#text .description');
	let body = $.html();
	res.writeHead(responseCode, {
		'Set-Cookie': [`wikibot="${state}"; HttpOnly`],
		'Content-Length': body.length
	});
	res.write( body );
	return res.end();
}

/**
 * Load oauth data of a user
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} state - The user state
 * @param {URLSearchParams} searchParams - The url parameters
 * @param {String} [lastGuild] - The guild to return to
 */
function dashboard_oauth(res, state, searchParams, lastGuild) {
	if ( settingsData.has(state) ) {
		res.writeHead(302, {Location: '/'});
		return res.end();
	}
	if ( state !== searchParams.get('state') || !searchParams.get('code') ) {
		res.writeHead(302, {Location: '/login?action=unauthorized'});
		return res.end();
	}
	return oauth.tokenRequest( {
		scope: ['identify', 'guilds'],
		code: searchParams.get('code'),
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
					+ ( guild.icon.startsWith( 'a_' ) ? 'gif' : 'png' ) : null ),
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
					guilds: {count: guilds.length, isMember, notMember}
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

/**
 * Reload the guild of a user
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} state - The user state
 * @param {String} [returnLocation] - The return location
 */
function dashboard_refresh(res, state, returnLocation = '/') {
	var settings = settingsData.get(state);
	return oauth.getUserGuilds(settings.access_token).then( guilds => {
		guilds = guilds.filter( guild => {
			return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
		} ).map( guild => {
			return {
				id: guild.id,
				name: guild.name,
				acronym: guild.name.replace( /'s /g, ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
				icon: ( guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.`
				+ ( guild.icon.startsWith( 'a_' ) ? 'gif' : 'png' ) : null ),
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
			settings.guilds = {count: guilds.length, isMember, notMember};
			res.writeHead(302, {Location: returnLocation});
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

module.exports = {
	login: dashboard_login,
	oauth: dashboard_oauth,
	refresh: dashboard_refresh
};
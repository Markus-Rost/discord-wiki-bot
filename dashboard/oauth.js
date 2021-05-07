const crypto = require('crypto');
const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');
const Wiki = require('../util/wiki.js');
const allLangs = require('./i18n.js').allLangs().names;
const {got, oauth, sessionData, settingsData, sendMsg, addWidgets, createNotice, hasPerm} = require('./util.js');

const file = require('fs').readFileSync('./dashboard/login.html');

/**
 * Let a user login
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('./i18n.js')} dashboardLang - The user language.
 * @param {String} theme - The display theme
 * @param {String} [state] - The user state
 * @param {String} [action] - The action the user made
 */
function dashboard_login(res, dashboardLang, theme, state, action) {
	if ( state && sessionData.has(state) ) {
		if ( !action ) {
			res.writeHead(302, {Location: '/'});
			return res.end();
		}
		sessionData.delete(state);
	}
	var $ = cheerio.load(file);
	$('html').attr('lang', dashboardLang.lang);
	if ( theme === 'light' ) $('html').addClass('theme-light');
	$('<script>').text(`
		const selectLanguage = '${dashboardLang.get('general.language').replace( /'/g, '\\$&' )}';
		const allLangs = ${JSON.stringify(allLangs)};
	`).insertBefore('script#langjs');
	$('head title').text(dashboardLang.get('general.login') + ' – ' + dashboardLang.get('general.title'));
	$('#login-button span, .channel#login div').text(dashboardLang.get('general.login'));
	$('.channel#login').attr('title', dashboardLang.get('general.login'));
	$('.channel#invite-wikibot div').text(dashboardLang.get('general.invite'));
	$('.channel#invite-wikibot').attr('title', dashboardLang.get('general.invite'));
	$('.guild#invite a').attr('alt', dashboardLang.get('general.invite'));
	$('.guild#theme-dark a').attr('alt', dashboardLang.get('general.theme-dark'));
	$('.guild#theme-light a').attr('alt', dashboardLang.get('general.theme-light'));
	$('#support span').text(dashboardLang.get('general.support'));
	$('#main .description #welcome').html(dashboardLang.get('general.welcome'));
	let responseCode = 200;
	let prompt = 'none';
	if ( process.env.READONLY ) createNotice($, 'readonly', dashboardLang);
	if ( action ) createNotice($, action, dashboardLang);
	if ( action === 'unauthorized' ) $('head').append(
		$('<script>').text('history.replaceState(null, null, "/login");')
	);
	if ( action === 'logout' ) prompt = 'consent';
	if ( action === 'loginfail' ) responseCode = 400;
	state = Date.now().toString(16) + crypto.randomBytes(16).toString("hex");
	while ( sessionData.has(state) ) {
		state = Date.now().toString(16) + crypto.randomBytes(16).toString("hex");
	}
	let invite = oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot', 'applications.commands'],
		permissions: defaultPermissions, state
	} );
	$('.guild#invite a, .channel#invite-wikibot').attr('href', invite);
	let url = oauth.generateAuthUrl( {
		scope: ['identify', 'guilds'],
		prompt, state
	} );
	$('.channel#login, #login-button').attr('href', url);
	addWidgets($, dashboardLang);
	let body = $.html();
	res.writeHead(responseCode, {
		'Set-Cookie': [
			...( res.getHeader('Set-Cookie') || [] ),
			`wikibot="${state}"; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`
		],
		'Content-Length': Buffer.byteLength(body)
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
	if ( searchParams.get('error') === 'access_denied' && state === searchParams.get('state') && sessionData.has(state) ) {
		res.writeHead(302, {Location: '/'});
		return res.end();
	}
	if ( state !== searchParams.get('state') || !searchParams.get('code') ) {
		res.writeHead(302, {Location: '/login?action=failed'});
		return res.end();
	}
	sessionData.delete(state);
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
					userPermissions: guild.permissions
				};
			} );
			sendMsg( {
				type: 'getGuilds',
				member: user.id,
				guilds: guilds.map( guild => guild.id )
			} ).then( response => {
				var userSession = {
					state: `${state}-${user.id}`,
					access_token,
					user_id: user.id
				};
				sessionData.set(userSession.state, userSession);
				/** @type {import('./util.js').Settings} */
				var settings = ( settingsData.has(user.id) ? settingsData.get(user.id) : {
					user: {},
					guilds: {}
				} );
				settings.user.id = user.id;
				settings.user.username = user.username;
				settings.user.discriminator = user.discriminator;
				settings.user.avatar = 'https://cdn.discordapp.com/' + ( user.avatar ? `avatars/${user.id}/${user.avatar}.` + ( user.avatar.startsWith( 'a_' ) ? 'gif' : 'png' ) : `embed/avatars/${user.discriminator % 5}.png` ) + '?size=64';
				settings.user.locale = user.locale;
				settings.guilds.count = guilds.length;
				settings.guilds.isMember = new Map();
				settings.guilds.notMember = new Map();
				response.forEach( (guild, i) => {
					if ( guild ) {
						if ( guild === 'noMember' ) return;
						settings.guilds.isMember.set(guilds[i].id, Object.assign(guilds[i], guild));
					}
					else settings.guilds.notMember.set(guilds[i].id, guilds[i]);
				} );
				settingsData.set(user.id, settings);
				if ( searchParams.has('guild_id') && !lastGuild.startsWith( searchParams.get('guild_id') + '/' ) ) {
					lastGuild = searchParams.get('guild_id') + '/settings';
				}
				res.writeHead(302, {
					Location: ( lastGuild && /^\d+\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?$/.test(lastGuild) ? `/guild/${lastGuild}` : '/' ),
					'Set-Cookie': [`wikibot="${userSession.state}"; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`]
				});
				return res.end();
			}, error => {
				console.log( '- Dashboard: Error while getting the guilds:', error );
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
 * @param {import('./util.js').UserSession} userSession - The user session
 * @param {String} [returnLocation] - The return location
 */
function dashboard_refresh(res, userSession, returnLocation = '/') {
	return oauth.getUserGuilds(userSession.access_token).then( guilds => {
		guilds = guilds.filter( guild => {
			return ( guild.owner || hasPerm(guild.permissions, 'MANAGE_GUILD') );
		} ).map( guild => {
			return {
				id: guild.id,
				name: guild.name,
				acronym: guild.name.replace( /'s /g, ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
				icon: ( guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.`
				+ ( guild.icon.startsWith( 'a_' ) ? 'gif' : 'png' ) : null ),
				userPermissions: guild.permissions
			};
		} );
		var settings = settingsData.get(userSession.user_id);
		sendMsg( {
			type: 'getGuilds',
			member: settings.user.id,
			guilds: guilds.map( guild => guild.id )
		} ).then( response => {
			let isMember = new Map();
			let notMember = new Map();
			response.forEach( (guild, i) => {
				if ( guild ) {
					if ( guild === 'noMember' ) return;
					isMember.set(guilds[i].id, Object.assign(guilds[i], guild));
				}
				else notMember.set(guilds[i].id, guilds[i]);
			} );
			settings.guilds = {count: guilds.length, isMember, notMember};
			res.writeHead(302, {Location: returnLocation + '?refresh=success'});
			return res.end();
		}, error => {
			console.log( '- Dashboard: Error while getting the refreshed guilds:', error );
			res.writeHead(302, {Location: returnLocation + '?refresh=failed'});
			return res.end();
		} );
	}, error => {
		console.log( '- Dashboard: Error while refreshing guilds: ' + error );
		res.writeHead(302, {Location: returnLocation + '?refresh=failed'});
		return res.end();
	} );
}

/**
 * Check if a wiki is availabe
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} input - The wiki to check
 */
function dashboard_api(res, input) {
	var wiki = Wiki.fromInput('https://' + input + '/');
	var result = {
		api: true,
		error: false,
		error_code: '',
		wiki: wiki.href,
		MediaWiki: false,
		TextExtracts: false,
		PageImages: false,
		RcGcDw: '',
		customRcGcDw: wiki.toLink('MediaWiki:Custom-RcGcDw', 'action=edit')
	};
	return got.get( wiki + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general|extensions&format=json', {
		responseType: 'text'
	} ).then( response => {
		try {
			response.body = JSON.parse(response.body);
		}
		catch (error) {
			if ( response.statusCode === 404 && typeof response.body === 'string' ) {
				let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
				if ( api ) {
					wiki = new Wiki(api.split('api.php?')[0], wiki);
					return got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general|extensions&format=json' );
				}
			}
		}
		return response;
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.allmessages || !body?.query?.general || !body?.query?.extensions ) {
			console.log( '- Dashboard: ' + response.statusCode + ': Error while checking the wiki: ' + body?.error?.info );
			if ( body?.error?.info === 'You need read permission to use this module.' ) {
				result.error_code = 'private';
			}
			result.error = true;
			return;
		}
		wiki.updateWiki(body.query.general);
		result.wiki = wiki.href;
		if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) >= 30 ) {
			result.MediaWiki = true;
		}
		if ( body.query.extensions.some( extension => extension.name === 'TextExtracts' ) ) {
			result.TextExtracts = true;
		}
		if ( body.query.extensions.some( extension => extension.name === 'PageImages' ) ) {
			result.PageImages = true;
		}
		if ( body.query.allmessages[0]['*'] ) {
			result.RcGcDw = body.query.allmessages[0]['*'];
		}
		result.customRcGcDw = wiki.toLink('MediaWiki:Custom-RcGcDw', 'action=edit');
		if ( wiki.isFandom() ) return;
	}, error => {
		if ( error.message?.startsWith( 'connect ECONNREFUSED ' ) || error.message?.startsWith( 'Hostname/IP does not match certificate\'s altnames: ' ) || error.message === 'certificate has expired' || error.message === 'self signed certificate' ) {
			console.log( '- Dashboard: Error while testing the wiki: No HTTPS' );
			result.error_code = 'http';
			result.error = true;
			return;
		}
		console.log( '- Dashboard: Error while checking the wiki: ' + error );
		if ( error.message === `Timeout awaiting 'request' for ${got.defaults.options.timeout.request}ms` ) {
			result.error_code = 'timeout';
		}
		result.error = true;
	} ).finally( () => {
		let body = JSON.stringify(result);
		res.writeHead(200, {
			'Content-Length': Buffer.byteLength(body),
			'Content-Type': 'application/json'
		});
		res.write( body );
		return res.end();
	} );
}

module.exports = {
	login: dashboard_login,
	oauth: dashboard_oauth,
	refresh: dashboard_refresh,
	api: dashboard_api
};

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { load as cheerioLoad } from 'cheerio';
import Wiki from '../util/wiki.js';
import { allLangs } from './i18n.js';
import { got, db, oauth, enabledOAuth2, canRcGcDwButtons, sessionData, settingsData, oauthVerify, sendMsg, addWidgets, createNotice, hasPerm, PermissionFlagsBits, OAuth2Scopes } from './util.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultPermissions} = require('../util/default.json');
const allLangNames = allLangs().names;

const file = readFileSync('./dashboard/login.html');

/**
 * Let a user login
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('./i18n.js').default} dashboardLang - The user language.
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
	var $ = cheerioLoad(file, {baseURI: new URL('/login', process.env.dashboard)});
	$('html').attr('lang', dashboardLang.lang);
	if ( theme === 'light' ) $('html').addClass('theme-light');
	$('<script>').text(`
		const selectLanguage = '${dashboardLang.get('general.language').replaceAll( '\'', '\\$&' )}';
		const allLangs = ${JSON.stringify(allLangNames)};
	`).insertBefore('script#langjs');
	$('head title').text(dashboardLang.get('general.login') + ' – ' + dashboardLang.get('general.title'));
	$('#login-button span, .channel#login div').text(dashboardLang.get('general.login'));
	$('.channel#login').attr('title', dashboardLang.get('general.login'));
	$('#invite-button span, .channel#invite-wikibot div').text(dashboardLang.get('general.invite'));
	$('#user-invite-button span, .channel#user-invite-wikibot div').text(dashboardLang.get('general.userinvite'));
	$('.channel#invite-wikibot').attr('title', dashboardLang.get('general.invite'));
	$('.channel#user-invite-wikibot').attr('title', dashboardLang.get('general.userinvite'));
	$('.guild#invite a').attr('alt', dashboardLang.get('general.invite'));
	$('.guild#theme-dark a').attr('alt', dashboardLang.get('general.theme-dark'));
	$('.guild#theme-light a').attr('alt', dashboardLang.get('general.theme-light'));
	$('#support span').text(dashboardLang.get('general.support'));
	$('#user-invite').attr('alt', dashboardLang.get('general.userinvite'));
	$('#text .description #welcome').html(dashboardLang.get('general.welcome'));
	let responseCode = 200;
	let prompt = 'none';
	if ( process.env.READONLY ) createNotice($, 'readonly', dashboardLang);
	if ( action ) createNotice($, action, dashboardLang);
	if ( action === 'unauthorized' ) $('<script>').text('history.replaceState(null, null, "/login");').appendTo('head');
	else if ( action.startsWith( 'oauth' ) ) {
		if ( action === 'oauth' ) createNotice($, 'oauthlogin', dashboardLang);
		$('<script>').text('history.replaceState(null, null, "/user");').appendTo('head');
	}
	if ( action === 'logout' ) prompt = 'consent';
	if ( action === 'loginfail' ) responseCode = 400;
	state = Date.now().toString(16) + randomBytes(16).toString('hex');
	while ( sessionData.has(state) ) {
		state = Date.now().toString(16) + randomBytes(16).toString('hex');
	}
	let invite = oauth.generateAuthUrl( {
		scope: [
			OAuth2Scopes.Identify,
			OAuth2Scopes.Guilds,
			OAuth2Scopes.Bot,
			OAuth2Scopes.ApplicationsCommands
		],
		permissions: defaultPermissions, state
	} );
	$('.guild#invite a, .channel#invite-wikibot, #invite-button').attr('href', invite);
	let userInvite = oauth.generateAuthUrl( {
		scope: [
			OAuth2Scopes.ApplicationsCommands
		],
		integrationType: 1, state
	} );
	if ( !userInvite.includes( 'integration_type' ) ) userInvite += '&integration_type=1';
	$('#navbar #user-invite, .channel#user-invite-wikibot, #user-invite-button').attr('href', userInvite);
	let url = oauth.generateAuthUrl( {
		scope: [
			OAuth2Scopes.Identify,
			OAuth2Scopes.Guilds
		],
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
	let sessionReturnLocation = sessionData.get(state)?.returnLocation;
	sessionData.delete(state);
	return oauth.tokenRequest( {
		scope: [
			OAuth2Scopes.Identify,
			OAuth2Scopes.Guilds
		],
		code: searchParams.get('code'),
		grantType: 'authorization_code'
	} ).then( ({scope, access_token, guild: {id: guildId} = {}}) => {
		scope = scope.split(' ');
		if ( !scope.includes( OAuth2Scopes.Identify ) || !scope.includes( OAuth2Scopes.Guilds ) ) {
			if ( scope.includes( OAuth2Scopes.ApplicationsCommands ) ) {
				res.writeHead(302, {Location: '/settings'});
				return res.end();
			}
			console.log( '- Dashboard: Error while getting user and guilds: Insufficient scopes authorized: ' + scope.join(' ') );
			res.writeHead(302, {Location: '/login?action=failed'});
			return res.end();
		}
		return Promise.all([
			oauth.getUser(access_token),
			oauth.getUserGuilds(access_token)
		]).then( ([user, guilds]) => {
			db.query( 'SELECT channel FROM discord WHERE guild = $1 AND channel IS NOT NULL', ['@' + user.id] ).then( ({rows}) => {
				return rows.map( row => row.channel );
			}, dberror => {
				console.log( '- Dashboard: Error while getting the user guilds: ' + dberror );
				return [];
			} ).then( userGuilds => {
				guilds.sort( (a, b) => {
					return ( b.owner - a.owner
					|| hasPerm(b.permissions, PermissionFlagsBits.Administrator) - hasPerm(a.permissions, PermissionFlagsBits.Administrator)
					|| hasPerm(b.permissions, PermissionFlagsBits.ManageGuild) - hasPerm(a.permissions, PermissionFlagsBits.ManageGuild)
					|| hasPerm(b.permissions, PermissionFlagsBits.ManageMessages) - hasPerm(a.permissions, PermissionFlagsBits.ManageMessages)
					|| userGuilds.includes( b.id ) - userGuilds.includes( a.id )
					|| a.name.localeCompare(b.name) );
				} );
				return Promise.all([
					sendMsg( {
						type: 'getGuilds',
						member: user.id,
						guilds: guilds.map( guild => guild.id )
					} ),
					userGuilds
				]);
			} ).then( ([response, userGuilds]) => {
				state = Date.now().toString(16) + randomBytes(16).toString('hex');
				while ( sessionData.has(state) || sessionData.has(`${state}-${user.id}`) ) {
					state = Date.now().toString(16) + randomBytes(16).toString('hex');
				}
				var userSession = {
					state: `${state}-${user.id}`,
					access_token,
					user_id: user.id,
					csrf_token: randomBytes(16).toString('base64')
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
				settings.user.global_name = user.global_name ?? user.username;
				settings.user.avatar = 'https://cdn.discordapp.com/' + ( user.avatar ? `avatars/${user.id}/${user.avatar}.` + ( user.avatar.startsWith( 'a_' ) ? 'gif' : 'png' ) : `embed/avatars/${( user.discriminator === '0' ? ( BigInt(user.id) >> 22n ) % 6n : user.discriminator % 5 )}.png` ) + '?size=64';
				settings.user.locale = user.locale;
				/** @type {import('./util.js').Guild[]} */
				var isMemberGuilds = [];
				settings.guilds.notMember = new Map();
				settings.guilds.notAdmin = new Map();
				response.forEach( (guild, i) => {
					let isAdmin = ( guilds[i].owner || hasPerm(guilds[i].permissions, PermissionFlagsBits.ManageGuild) );
					let partialGuild = {
						id: guilds[i].id,
						name: guilds[i].name,
						acronym: guilds[i].name.replaceAll( '\'s ', ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
						icon: ( guilds[i].icon ? `https://cdn.discordapp.com/icons/${guilds[i].id}/${guilds[i].icon}.`
						+ ( guilds[i].icon.startsWith( 'a_' ) ? 'gif' : 'png' ) : null ),
						userPermissions: guilds[i].permissions
					};
					if ( guild ) {
						if ( !isAdmin || guild === 'noMember' ) return;
						isMemberGuilds.push(Object.assign(partialGuild, guild));
					}
					else {
						if ( isAdmin ) settings.guilds.notMember.set(partialGuild.id, partialGuild);
						else settings.guilds.notAdmin.set(partialGuild.id, partialGuild);
					}
				} );
				settings.guilds.isMember = new Map(isMemberGuilds.sort( (a, b) => {
					return ( b.patreon - a.patreon || b.memberCount - a.memberCount );
				} ).map( guild => {
					return [guild.id, guild];
				} ));
				settings.guilds.count = settings.guilds.isMember.size + settings.guilds.notMember.size + settings.guilds.notAdmin.size;
				settingsData.set(user.id, settings);
				userGuilds = userGuilds.filter( userGuild => !( settings.guilds.notMember.has(userGuild) || settings.guilds.notAdmin.has(userGuild) ) );
				if ( userGuilds.length ) db.query( 'DELETE FROM discord WHERE guild = $1 AND channel IN (' + userGuilds.map( (row, i) => '$' + ( i + 2 ) ).join(', ') + ')', ['@' + user.id, ...userGuilds] ).then( () => {
					console.log( '- Dashboard: User guilds successfully removed.' );
				}, dberror => {
					console.log( '- Dashboard: Error while removing the user guilds: ' + dberror );
				} );
				if ( guildId && !lastGuild.startsWith( guildId + '/' ) ) {
					lastGuild = guildId + '/settings';
				}
				let returnLocation = '/';
				if ( lastGuild ) {
					if ( lastGuild === 'settings' || lastGuild === 'user' ) returnLocation += lastGuild;
					else if ( /^\d+\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?(?:\?beta=\w+)?$/.test(lastGuild) ) returnLocation += 'guild/' + lastGuild;
				}
				if ( sessionReturnLocation ) returnLocation = sessionReturnLocation;
				res.writeHead(302, {
					Location: returnLocation,
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
 * @param {String} [beta] - The beta feature
 */
function dashboard_refresh(res, userSession, returnLocation = '/', beta = '') {
	return oauth.getUserGuilds(userSession.access_token).then( guilds => {
		var settings = settingsData.get(userSession.user_id);
		db.query( 'SELECT channel FROM discord WHERE guild = $1 AND channel IS NOT NULL', ['@' + settings.user.id] ).then( ({rows}) => {
			return rows.map( row => row.channel );
		}, dberror => {
			console.log( '- Dashboard: Error while getting the user guilds: ' + dberror );
			return [];
		} ).then( userGuilds => {
			guilds.sort( (a, b) => {
				return ( b.owner - a.owner
				|| hasPerm(b.permissions, PermissionFlagsBits.Administrator) - hasPerm(a.permissions, PermissionFlagsBits.Administrator)
				|| hasPerm(b.permissions, PermissionFlagsBits.ManageGuild) - hasPerm(a.permissions, PermissionFlagsBits.ManageGuild)
				|| hasPerm(b.permissions, PermissionFlagsBits.ManageMessages) - hasPerm(a.permissions, PermissionFlagsBits.ManageMessages)
				|| userGuilds.includes( b.id ) - userGuilds.includes( a.id )
				|| a.name.localeCompare(b.name) );
			} );
			return Promise.all([
				sendMsg( {
					type: 'getGuilds',
					member: settings.user.id,
					guilds: guilds.map( guild => guild.id )
				} ),
				userGuilds
			]);
		} ).then( ([response, userGuilds]) => {
			/** @type {import('./util.js').Guild[]} */
			var isMemberGuilds = [];
			settings.guilds.notMember = new Map();
			settings.guilds.notAdmin = new Map();
			response.forEach( (guild, i) => {
				let isAdmin = ( guilds[i].owner || hasPerm(guilds[i].permissions, PermissionFlagsBits.ManageGuild) );
				let partialGuild = {
					id: guilds[i].id,
					name: guilds[i].name,
					acronym: guilds[i].name.replaceAll( '\'s ', ' ' ).replace( /\w+/g, e => e[0] ).replace( /\s/g, '' ),
					icon: ( guilds[i].icon ? `https://cdn.discordapp.com/icons/${guilds[i].id}/${guilds[i].icon}.`
					+ ( guilds[i].icon.startsWith( 'a_' ) ? 'gif' : 'png' ) : null ),
					userPermissions: guilds[i].permissions
				};
				if ( guild ) {
					if ( !isAdmin || guild === 'noMember' ) return;
					isMemberGuilds.push(Object.assign(partialGuild, guild));
				}
				else {
					if ( isAdmin ) settings.guilds.notMember.set(partialGuild.id, partialGuild);
					else settings.guilds.notAdmin.set(partialGuild.id, partialGuild);
				}
			} );
			settings.guilds.isMember = new Map(isMemberGuilds.sort( (a, b) => {
				return ( b.patreon - a.patreon || b.memberCount - a.memberCount );
			} ).map( guild => {
				return [guild.id, guild];
			} ));
			settings.guilds.count = settings.guilds.isMember.size + settings.guilds.notMember.size + settings.guilds.notAdmin.size;
			userGuilds = userGuilds.filter( userGuild => !( settings.guilds.notMember.has(userGuild) || settings.guilds.notAdmin.has(userGuild) ) );
			if ( userGuilds.length ) db.query( 'DELETE FROM discord WHERE guild = $1 AND channel IN (' + userGuilds.map( (row, i) => '$' + ( i + 2 ) ).join(', ') + ')', ['@' + settings.user.id, ...userGuilds] ).then( () => {
				console.log( '- Dashboard: User guilds successfully removed.' );
			}, dberror => {
				console.log( '- Dashboard: Error while removing the user guilds: ' + dberror );
			} );
			res.writeHead(302, {Location: returnLocation + '?' + ( beta ? `beta=${beta}&` : '' ) + 'refresh=success'});
			return res.end();
		}, error => {
			console.log( '- Dashboard: Error while getting the refreshed guilds:', error );
			res.writeHead(302, {Location: returnLocation + '?' + ( beta ? `beta=${beta}&` : '' ) + 'refresh=failed'});
			return res.end();
		} );
	}, error => {
		console.log( '- Dashboard: Error while refreshing guilds: ' + error );
		let url = returnLocation + '?' + ( beta ? `beta=${beta}&` : '' ) + 'refresh=failed';
		if ( error.name === 'DiscordHTTPError' && error.code === 401 ) {
			userSession.returnLocation = returnLocation + '?' + ( beta ? `beta=${beta}&` : '' ) + 'refresh=success';
			url = oauth.generateAuthUrl( {
				scope: [
					OAuth2Scopes.Identify,
					OAuth2Scopes.Guilds
				],
				prompt: 'none',
				state: userSession.state
			} );
		}
		res.writeHead(302, {Location: url});
		return res.end();
	} );
}

/**
 * Check if a wiki is availabe
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} input - The wiki to check
 * @param {String} [guild] - The guild the check is for
 */
function dashboard_api(res, input, guild = null) {
	var wiki = Wiki.fromInput('https://' + input + '/');
	var result = {
		api: true,
		error: false,
		error_code: '',
		wiki: wiki?.name,
		base: '',
		sitename: '',
		logo: '',
		oauth: false,
		MediaWiki: false,
		RcGcDw: [],
		customRcGcDw: wiki?.toLink('MediaWiki:Custom-RcGcDw', 'action=edit')
	};
	if ( !wiki ) {
		result.error = true;
		let body = JSON.stringify(result);
		res.writeHead(200, {
			'Content-Length': Buffer.byteLength(body),
			'Content-Type': 'application/json'
		});
		res.write( body );
		return res.end();
	}
	return got.get( wiki + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&format=json', {
		responseType: 'text',
		context: {
			guildId: guild
		}
	} ).then( response => {
		try {
			response.body = JSON.parse(response.body);
		}
		catch (error) {
			if ( response.statusCode === 404 && typeof response.body === 'string' ) {
				let api = cheerioLoad(response.body, {baseURI: response.url})('head link[rel="EditURI"]').prop('href');
				if ( api ) {
					wiki = new Wiki(api.split('api.php?')[0], wiki);
					return got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&format=json', {
						context: {
							guildId: guild
						}
					} );
				}
				return got.get( wiki, {
					responseType: 'text',
					context: {
						guildId: guild
					}
				} ).then( tresponse => {
					if ( typeof tresponse.body === 'string' ) {
						let api = cheerioLoad(tresponse.body, {baseURI: tresponse.url})('head link[rel="EditURI"]').prop('href');
						if ( api ) {
							wiki = new Wiki(api.split('api.php?')[0], wiki);
							return got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&format=json', {
								context: {
									guildId: guild
								}
							} );
						}
					}
					return response;
				} );
			}
		}
		return response;
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.allmessages || !body?.query?.general ) {
			console.log( '- Dashboard: ' + response.statusCode + ': Error while checking the wiki: ' + body?.error?.info );
			if ( body?.error?.code === 'readapidenied' || body?.error?.info === 'You need read permission to use this module.' ) {
				result.error_code = 'private';
			}
			result.error = true;
			return;
		}
		wiki.updateWiki(body.query.general);
		result.wiki = wiki.name;
		result.base = body.query.general.base;
		result.sitename = body.query.general.sitename;
		result.logo = body.query.general.logo;
		result.oauth = canRcGcDwButtons(wiki);
		if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) >= 30 ) {
			result.MediaWiki = true;
		}
		if ( body.query.allmessages[0]['*'] ) {
			result.RcGcDw = body.query.allmessages[0]['*'].split('\n').map( guildId => guildId.trim() );
		}
		result.customRcGcDw = wiki.toLink('MediaWiki:Custom-RcGcDw', 'action=edit');
		if ( wiki.wikifarm === 'fandom' ) return;
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

/**
 * Load oauth data of a wiki user
 * @param {import('http').ServerResponse} res - The server response
 * @param {URLSearchParams} searchParams - The url parameters
 * @param {String} [user_id] - The current user
 */
function mediawiki_oauth(res, searchParams, user_id) {
	if ( !searchParams.get('code') || !searchParams.get('state') ) {
		res.writeHead(302, {Location: '/user?oauth=failed'});
		return res.end();
	}
	var state = searchParams.get('state');
	var site = state.split(' ');
	var oauthSite = enabledOAuth2.find( oauthSite => ( site[2] || site[0] ) === oauthSite.id );
	if ( !oauthSite || ( !oauthVerify.has(state) && !user_id ) ) {
		res.writeHead(302, {Location: '/user?oauth=failed'});
		return res.end();
	}
	var url = oauthSite.url;
	if ( oauthVerify.has(state) && site[2] === oauthSite.id ) url = 'https://' + site[0] + '/';
	got.post( url + 'rest.php/oauth2/access_token', {
		form: {
			grant_type: 'authorization_code',
			code: searchParams.get('code'),
			redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
			client_id: process.env['oauth_' + oauthSite.id],
			client_secret: process.env['oauth_' + oauthSite.id + '_secret']
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body?.access_token ) {
			console.log( '- Dashboard: ' + response.statusCode + ': Error while getting the mediawiki token: ' + ( body?.message || body?.error ) );
			res.writeHead(302, {Location: '/user?oauth=failed'});
			return res.end();
		}
		if ( !oauthVerify.has(state) ) {
			if ( !body?.refresh_token || !user_id ) {
				res.writeHead(302, {Location: '/user?oauth=failed'});
				return res.end();
			}
			return db.query( 'INSERT INTO oauthusers(userid, site, token) VALUES ($1, $2, $3)', [user_id, oauthSite.id, body.refresh_token] ).then( () => {
				console.log( '- Dashboard: OAuth2 token on ' + oauthSite.id + ' for ' + user_id + ' successfully saved.' );
				res.writeHead(302, {Location: '/user?oauth=success'});
				return res.end();
			}, dberror => {
				console.log( '- Dashboard: Error while saving the OAuth2 token on ' + oauthSite.id + ' for ' + user_id + ': ' + dberror );
				res.writeHead(302, {Location: '/user?oauth=failed'});
				return res.end();
			} );
		}
		sendMsg( {
			type: 'verifyUser', state,
			access_token: body.access_token
		} ).then( () => {
			let userid = oauthVerify.get(state);
			if ( userid && body?.refresh_token ) db.query( 'INSERT INTO oauthusers(userid, site, token) VALUES ($1, $2, $3)', [userid, oauthSite.id, body.refresh_token] ).then( () => {
				console.log( '- Dashboard: OAuth2 token on ' + oauthSite.id + ' for ' + userid + ' successfully saved.' );
			}, dberror => {
				console.log( '- Dashboard: Error while saving the OAuth2 token on ' + oauthSite.id + ' for ' + userid + ': ' + dberror );
			} );
			oauthVerify.delete(state);
			if ( !userid ) res.writeHead(302, {Location: '/user?oauth=verified'});
			else if ( user_id && userid !== user_id ) res.writeHead(302, {Location: '/user?oauth=other'});
			else res.writeHead(302, {Location: '/user?oauth=success'});
			return res.end();
		}, error => {
			console.log( '- Dashboard: Error while sending the mediawiki token: ' + error );
			res.writeHead(302, {Location: '/user?oauth=failed'});
			return res.end();
		} );
	}, error => {
		console.log( '- Dashboard: Error while getting the mediawiki token: ' + error );
		res.writeHead(302, {Location: '/user?oauth=failed'});
		return res.end();
	} );
}

export {
	dashboard_login as login,
	dashboard_oauth as oauth,
	dashboard_refresh as refresh,
	dashboard_api as api,
	mediawiki_oauth as verify
};
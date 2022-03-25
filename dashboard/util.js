import gotDefault from 'got';
import pg from 'pg';
import DiscordOauth2 from 'discord-oauth2';
import { oauthSites } from '../util/wiki.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const slashCommands = require('../interactions/commands.json');

globalThis.isDebug = ( process.argv[2] === 'debug' );

const got = gotDefault.extend( {
	throwHttpErrors: false,
	timeout: {
		request: 5000
	},
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + '/dashboard (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json'
} );

const db = new pg.Pool();
db.on( 'error', dberror => {
	console.log( '- Dashboard: Error while connecting to the database: ' + dberror );
} );

const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const enabledOAuth2 = [
	...oauthSites.filter( oauthSite => {
		let site = new URL(oauthSite);
		site = site.hostname + site.pathname.slice(0, -1);
		return ( process.env[`oauth_${site}`] && process.env[`oauth_${site}_secret`] );
	} ).map( oauthSite => {
		let site = new URL(oauthSite);
		return {
			id: site.hostname + site.pathname.slice(0, -1),
			name: oauthSite, url: oauthSite,
		};
	} )
];
if ( process.env.oauth_miraheze && process.env.oauth_miraheze_secret ) {
	enabledOAuth2.unshift({
		id: 'miraheze',
		name: 'Miraheze',
		url: 'https://meta.miraheze.org/w/',
	});
}
if ( process.env.oauth_wikimedia && process.env.oauth_wikimedia_secret ) {
	enabledOAuth2.unshift({
		id: 'wikimedia',
		name: 'Wikimedia (Wikipedia)',
		url: 'https://meta.wikimedia.org/w/',
	});
}

got.get( `https://discord.com/api/v8/applications/${process.env.bot}/commands`, {
	headers: {
		Authorization: `Bot ${process.env.token}`
	},
	timeout: {
		request: 10000
	}
} ).then( response=> {
	if ( response.statusCode !== 200 || !response.body ) {
		console.log( '- Dashboard: ' + response.statusCode + ': Error while getting the global slash commands: ' + response.body?.message );
		return;
	}
	console.log( '- Dashboard: Slash commands successfully loaded.' );
	response.body.forEach( command => {
		var slashCommand = slashCommands.find( slashCommand => slashCommand.name === command.name );
		if ( slashCommand ) {
			slashCommand.id = command.id;
			slashCommand.application_id = command.application_id;
		}
		else slashCommands.push(slashCommand);
	} );
}, error => {
	console.log( '- Dashboard: Error while getting the global slash commands: ' + error );
} );

/**
 * @typedef UserSession
 * @property {String} state
 * @property {String} access_token
 * @property {String} user_id
 */

/**
 * @typedef Settings
 * @property {User} user
 * @property {Object} guilds
 * @property {Number} guilds.count
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
 * @property {String} userPermissions
 * @property {Boolean} [patreon]
 * @property {Number} [memberCount]
 * @property {String} [botPermissions]
 * @property {Channel[]} [channels]
 * @property {Role[]} [roles]
 * @property {String} [locale]
 */

/**
 * @typedef Channel
 * @property {String} id
 * @property {String} name
 * @property {Boolean} isCategory
 * @property {Number} userPermissions
 * @property {Number} botPermissions
 */

/**
 * @typedef Role
 * @property {String} id
 * @property {String} name
 * @property {Boolean} lower
 */

/**
 * @type {Map<String, UserSession>}
 */
const sessionData = new Map();

/**
 * @type {Map<String, Settings>}
 */
const settingsData = new Map();

/**
 * @type {Map<String, String>}
 */
const oauthVerify = new Map();

/**
 * @type {Map<Number, PromiseConstructor>}
 */
const messages = new Map();
var messageId = 1;

process.on( 'message', message => {
	if ( message?.id === 'verifyUser' ) return oauthVerify.set(message.state, message.user);
	if ( message?.id ) {
		if ( message.data.error ) messages.get(message.id).reject(message.data.error);
		else messages.get(message.id).resolve(message.data.response);
		return messages.delete(message.id);
	}
	if ( message === 'toggleDebug' ) isDebug = !isDebug;
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

var botLists = [];
if ( process.env.botlist ) {
	let supportedLists = {
		'blist.xyz': {
			link: 'https://blist.xyz/bot/' + process.env.bot,
			widget: 'https://blist.xyz/api/v2/bot/' + process.env.bot + '/widget'
		},
		'botlists.com': {
			link: 'https://botlists.com/bot/' + process.env.bot,
			widget: 'https://botlists.com/bot/' + process.env.bot + '/widget'
		},
		'bots.ondiscord.xyz': {
			link: 'https://bots.ondiscord.xyz/bots/' + process.env.bot,
			widget: 'https://bots.ondiscord.xyz/bots/' + process.env.bot + '/embed?theme=dark&showGuilds=true'
		},
		'discord.boats': {
			link: 'https://discord.boats/bot/' + process.env.bot,
			widget: 'https://discord.boats/api/widget/' + process.env.bot
		},
		'discords.com': {
			link: 'https://discords.com/bots/bot/' + process.env.bot,
			widget: 'https://discords.com/bots/api/bot/' + process.env.bot + '/widget?theme=dark'
		},
		'infinitybotlist.com': {
			link: 'https://infinitybotlist.com/bots/' + process.env.bot,
			widget: 'https://infinitybotlist.com/bots/' + process.env.bot + '/widget?size=medium'
		},
		'top.gg': {
			link: 'https://top.gg/bot/' + process.env.bot,
			widget: 'https://top.gg/api/widget/' + process.env.bot + '.svg'
		},
		'voidbots.net': {
			link: 'https://voidbots.net/bot/' + process.env.bot,
			widget: 'https://voidbots.net/api/embed/' + process.env.bot + '?theme=dark'
		}
	};

	botLists = Object.keys(JSON.parse(process.env.botlist)).filter( botList => {
		return supportedLists.hasOwnProperty(botList);
	} ).map( botList => {
		return `<a href="${supportedLists[botList].link}" target="_blank">
			<img src="${supportedLists[botList].widget}" alt="${botList}" height="150px" loading="lazy" />
		</a>`;
	} );
}

/**
 * Add bot list widgets.
 * @param {import('cheerio').CheerioAPI} $ - The cheerio static
 * @param {import('./i18n.js').default} dashboardLang - The user language
 * @returns {import('cheerio').CheerioAPI}
*/
function addWidgets($, dashboardLang) {
	if ( !botLists.length ) return;
	return $('<div class="widgets">').append(
		$('<h3 id="bot-lists">').text(dashboardLang.get('general.botlist.title')),
		$('<p>').text(dashboardLang.get('general.botlist.text')),
		...botLists
	).appendTo('#text');
}

/**
 * Create a red notice
 * @param {import('cheerio').CheerioAPI} $ - The cheerio static
 * @param {String} notice - The notice to create
 * @param {import('./i18n.js').default} dashboardLang - The user language
 * @param {String[]} [args] - The arguments for the notice
 * @returns {import('cheerio').CheerioAPI}
 */
function createNotice($, notice, dashboardLang, args = []) {
	if ( !notice ) return;
	var type = 'info';
	var title = $('<b>');
	var text = $('<div>');
	var note;
	switch (notice) {
		case 'unauthorized':
			type = 'info';
			title.text(dashboardLang.get('notice.unauthorized.title'));
			text.text(dashboardLang.get('notice.unauthorized.text'));
			break;
		case 'save':
			type = 'success';
			title.text(dashboardLang.get('notice.save.title'));
			text.text(dashboardLang.get('notice.save.text'));
			break;
		case 'nosettings':
			type = 'info';
			title.text(dashboardLang.get('notice.nosettings.title'));
			text.text(dashboardLang.get('notice.nosettings.text'));
			if ( args[0] ) note = $('<a>').text(dashboardLang.get('notice.nosettings.note')).attr('href', `/guild/${args[0]}/settings`);
			break;
		case 'logout':
			type = 'success';
			title.text(dashboardLang.get('notice.logout.title'));
			text.text(dashboardLang.get('notice.logout.text'));
			break;
		case 'refresh':
			type = 'success';
			title.text(dashboardLang.get('notice.refresh.title'));
			text.text(dashboardLang.get('notice.refresh.text'));
			break;
		case 'missingperm':
			type = 'error';
			title.text(dashboardLang.get('notice.missingperm.title'));
			text.html(dashboardLang.get('notice.missingperm.text', true, $('<code>').text(args[0])));
			break;
		case 'loginfail':
			type = 'error';
			title.text(dashboardLang.get('notice.loginfail.title'));
			text.text(dashboardLang.get('notice.loginfail.text'));
			break;
		case 'sysmessage':
			type = 'info';
			title.text(dashboardLang.get('notice.sysmessage.title'));
			text.html(dashboardLang.get('notice.sysmessage.text', true, $('<a target="_blank">').append(
				$('<code>').text('MediaWiki:Custom-RcGcDw')
			).attr('href', args[1]), $('<code class="user-select">').text(args[0])));
			note = $('<a target="_blank">').text(args[1]).attr('href', args[1]);
			break;
		case 'mwversion':
			type = 'error';
			title.text(dashboardLang.get('notice.mwversion.title'));
			text.text(dashboardLang.get('notice.mwversion.text', false, args[0], args[1]));
			note = $('<a target="_blank">').text('https://www.mediawiki.org/wiki/MediaWiki_1.30').attr('href', 'https://www.mediawiki.org/wiki/MediaWiki_1.30');
			break;
		case 'oauth':
			type = 'success';
			title.text(dashboardLang.get('notice.oauth.title'));
			text.text(dashboardLang.get('notice.oauth.text'));
			break;
		case 'oauthfail':
			type = 'error';
			title.text(dashboardLang.get('notice.oauthfail.title'));
			text.text(dashboardLang.get('notice.oauthfail.text'));
			break;
		case 'oauthverify':
			type = 'success';
			title.text(dashboardLang.get('notice.oauthverify.title'));
			text.text(dashboardLang.get('notice.oauthverify.text'));
			break;
		case 'oauthother':
			type = 'info';
			title.text(dashboardLang.get('notice.oauthother.title'));
			text.text(dashboardLang.get('notice.oauthother.text'));
			note = $('<a>').text(dashboardLang.get('notice.oauthother.note')).attr('href', args[0]);
			break;
		case 'oauthlogin':
			type = 'info';
			title.text(dashboardLang.get('notice.oauthlogin.title'));
			text.text(dashboardLang.get('notice.oauthlogin.text'));
			break;
		case 'nochange':
			type = 'info';
			title.text(dashboardLang.get('notice.nochange.title'));
			text.text(dashboardLang.get('notice.nochange.text'));
			break;
		case 'invalidusergroup':
			type = 'error';
			title.text(dashboardLang.get('notice.invalidusergroup.title'));
			text.text(dashboardLang.get('notice.invalidusergroup.text'));
			break;
		case 'noverify':
			type = 'info';
			title.text(dashboardLang.get('notice.noverify.title'));
			text.html(dashboardLang.get('notice.noverify.text', true, $('<code>').text('/verify')));
			break;
		case 'noslash':
			type = 'error';
			title.text(dashboardLang.get('notice.noslash.title'));
			text.text(dashboardLang.get('notice.noslash.text'));
			note = $('<a target="_blank">').text(dashboardLang.get('notice.noslash.note')).attr('href', `https://discord.com/api/oauth2/authorize?client_id=${process.env.bot}&scope=applications.commands&guild_id=${args[0]}&disable_guild_select=true`);
			break;
		case 'wikiblocked':
			type = 'error';
			title.text(dashboardLang.get('notice.wikiblocked.title'));
			text.text(dashboardLang.get('notice.wikiblocked.text', false, args[0]));
			if ( args[1] ) note = $('<div>').append(
				dashboardLang.get('notice.wikiblocked.note', true) + ' ',
				$('<code>').text(args[1])
			);
			break;
		case 'savefail':
			type = 'error';
			title.text(dashboardLang.get('notice.savefail.title'));
			text.text(dashboardLang.get('notice.savefail.text'));
			if ( typeof args[0] === 'string' ) {
				note = $('<div>').text(dashboardLang.get('notice.savefail.note_' + args[0]));
			}
			break;
		case 'webhookfail':
			type = 'info';
			title.text(dashboardLang.get('notice.webhookfail.title'));
			text.text(dashboardLang.get('notice.webhookfail.text'));
			note = $('<div>').text(dashboardLang.get('notice.webhookfail.note'));
			break;
		case 'refreshfail':
			type = 'error';
			title.text(dashboardLang.get('notice.refreshfail.title'));
			text.text(dashboardLang.get('notice.refreshfail.text'));
			break;
		case 'error':
			type = 'error';
			title.text(dashboardLang.get('notice.error.title'));
			text.text(dashboardLang.get('notice.error.text'));
			break;
		case 'readonly':
			type = 'info';
			title.text(dashboardLang.get('notice.readonly.title'));
			text.text(dashboardLang.get('notice.readonly.text'));
			break;
		default:
			return;
	}
	return $(`<div class="notice notice-${type}">`).append(
		title,
		text,
		note
	).appendTo('#text #notices');
}

/**
 * HTML escape text
 * @param {String} text - The text to escape
 * @returns {String}
 */
function escapeText(text) {
	return text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

const permissions = {
	ADMINISTRATOR: 1n << 3n,
	MANAGE_CHANNELS: 1n << 4n,
	MANAGE_GUILD: 1n << 5n,
	ADD_REACTIONS: 1n << 6n,
	VIEW_CHANNEL: 1n << 10n,
	SEND_MESSAGES: 1n << 11n,
	MANAGE_MESSAGES: 1n << 13n,
	EMBED_LINKS: 1n << 14n,
	ATTACH_FILES: 1n << 15n,
	READ_MESSAGE_HISTORY: 1n << 16n,
	MENTION_EVERYONE: 1n << 17n,
	USE_EXTERNAL_EMOJIS: 1n << 18n,
	MANAGE_NICKNAMES: 1n << 27n,
	MANAGE_ROLES: 1n << 28n,
	MANAGE_WEBHOOKS: 1n << 29n,
	SEND_MESSAGES_IN_THREADS: 1n << 38n
}

/**
 * Check if a permission is included in the BitField
 * @param {String|Number|BigInt} all - BitField of multiple permissions
 * @param {String[]} permission - Name of the permission to check for
 * @returns {Boolean}
 */
function hasPerm(all = 0n, ...permission) {
	all = BigInt(all);
	if ( (all & permissions.ADMINISTRATOR) === permissions.ADMINISTRATOR ) return true;
	return permission.every( perm => {
		let bit = permissions[perm];
		return ( (all & bit) === bit );
	} );
}

export {
	got,
	db,
	oauth,
	enabledOAuth2,
	slashCommands,
	sessionData,
	settingsData,
	oauthVerify,
	sendMsg,
	addWidgets,
	createNotice,
	escapeText,
	hasPerm
};
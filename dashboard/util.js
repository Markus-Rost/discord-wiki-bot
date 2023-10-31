import { PermissionFlagsBits, OAuth2Scopes } from 'discord.js';
import gotDefault from 'got';
import { gotSsrf } from 'got-ssrf';
import pg from 'pg';
import DiscordOauth2 from 'discord-oauth2';
import { inputToWikiProject } from 'mediawiki-projects-list';
import Wiki from '../util/wiki.js';

const got = gotDefault.extend( {
	throwHttpErrors: false,
	http2: true,
	timeout: {
		request: 5000
	},
	headers: {
		'user-agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + '/dashboard (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json',
	hooks: ( process.env.x_origin_guild ? {
		beforeRequest: [
			options => {
				if ( options.context?.guildId ) options.headers['x-origin-guild'] = options.context.guildId;
				else if ( options.context?.guildId === null ) options.headers['x-origin-guild'] = 'DM';
			}
		]
	} : {} )
}, gotSsrf );

const db = new pg.Pool(process.env.PGSSL === 'true' ? {ssl: true} : {});
db.on( 'error', dberror => {
	console.log( '- Dashboard: Error while connecting to the database: ' + dberror );
} );

const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const enabledOAuth2 = [
	...Wiki.oauthSites.filter( oauthSite => {
		let project = inputToWikiProject(oauthSite);
		if ( project ) return ( process.env[`oauth_${project.wikiProject.name}`] && process.env[`oauth_${project.wikiProject.name}_secret`] );
		let site = new URL(oauthSite);
		site = site.hostname + site.pathname.slice(0, -1);
		return ( process.env[`oauth_${site}`] && process.env[`oauth_${site}_secret`] );
	} ).map( oauthSite => {
		let project = inputToWikiProject(oauthSite);
		if ( project ) return {
			id: project.wikiProject.name,
			name: project.wikiProject.name,
			url: oauthSite,
			manage: project.fullArticlePath.replace( '$1', 'Special:OAuthManageMyGrants' )
		};
		let site = new URL(oauthSite);
		return {
			id: site.hostname + site.pathname.slice(0, -1),
			name: oauthSite,
			url: oauthSite,
			manage: oauthSite + 'index.php?title=Special:OAuthManageMyGrants'
		};
	} )
];
if ( process.env.oauth_telepedia && process.env.oauth_telepedia_secret ) {
	enabledOAuth2.unshift({
		id: 'telepedia',
		name: 'Telepedia',
		url: 'https://meta.telepedia.net/',
		manage: 'https://meta.telepedia.net/wiki/Special:OAuthManageMyGrants'
	});
}
if ( process.env.oauth_wikitide && process.env.oauth_wikitide_secret ) {
	enabledOAuth2.unshift({
		id: 'wikitide',
		name: 'WikiTide',
		url: 'https://meta.wikitide.com/w/',
		manage: 'https://meta.wikitide.com/wiki/Special:OAuthManageMyGrants'
	});
}
if ( process.env.oauth_miraheze && process.env.oauth_miraheze_secret ) {
	enabledOAuth2.unshift({
		id: 'miraheze',
		name: 'Miraheze',
		url: 'https://meta.miraheze.org/w/',
		manage: 'https://meta.miraheze.org/wiki/Special:OAuthManageMyGrants'
	});
}
if ( process.env.oauth_wikigg && process.env.oauth_wikigg_secret ) {
	enabledOAuth2.unshift({
		id: 'wikigg',
		name: 'wiki.gg',
		url: 'https://support.wiki.gg/',
		manage: 'https://support.wiki.gg/wiki/Special:OAuthManageMyGrants'
	});
}
if ( process.env.oauth_wikimedia && process.env.oauth_wikimedia_secret ) {
	enabledOAuth2.unshift({
		id: 'wikimedia',
		name: 'Wikimedia (Wikipedia)',
		url: 'https://meta.wikimedia.org/w/',
		manage: 'https://meta.wikimedia.org/wiki/Special:OAuthManageMyGrants'
	});
}

/**
 * @param {String|Wiki} wiki
 * @returns {Boolean}
 */
function canRcGcDwButtons(wiki) {
	try {
		if ( !( wiki instanceof Wiki ) ) wiki = new Wiki(wiki);
	}
	catch {
		return false;
	}
	if ( !wiki.hasOAuth2() ) return false;
	if ( wiki.wikifarm === 'wiki.gg' ) return true;
	if ( wiki.wikifarm === 'miraheze' ) return true;
	if ( wiki.wikifarm === 'wikitide' ) return true;
	if ( wiki.wikifarm === 'telepedia' ) return true;
	if ( wiki.href === 'https://minecraft.wiki/' ) return true;
	if ( wiki.href === 'https://lakeus.xyz/' ) return true;
	return false;
}

/**
 * @typedef UserSession
 * @property {String} state
 * @property {String} access_token
 * @property {String} user_id
 * @property {String?} returnLocation
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
 * @property {String} global_name
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
 * @property {Boolean} isForum
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
		case 'send':
			type = 'success';
			title.text(dashboardLang.get('notice.send.title'));
			text.text(dashboardLang.get('notice.send.text'));
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
		case 'sendfail':
			type = 'error';
			title.text(dashboardLang.get('notice.sendfail.title'));
			text.text(dashboardLang.get('notice.sendfail.text'));
			if ( typeof args[0] === 'string' ) {
				note = $('<div>').text(dashboardLang.get('notice.sendfail.note_' + args[0]));
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
		case 'beta':
			type = 'info';
			title.text(dashboardLang.get('notice.beta.title'));
			text.text(dashboardLang.get('notice.beta.text'));
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
	return text.replaceAll( '&', '&amp;' ).replaceAll( '<', '&lt;' ).replaceAll( '>', '&gt;' );
}

/**
 * Check if a permission is included in the BitField
 * @param {String|Number|BigInt} all - BitField of multiple permissions
 * @param {(String|BigInt)[]} permission - Name of the permission to check for
 * @returns {Boolean}
 */
function hasPerm(all = 0n, ...permission) {
	all = BigInt(all);
	if ( (all & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator ) return true;
	return permission.every( perm => {
		let bit = ( typeof perm === 'bigint' ? perm : PermissionFlagsBits[perm] );
		return ( (all & bit) === bit );
	} );
}

export {
	got,
	db,
	oauth,
	enabledOAuth2,
	canRcGcDwButtons,
	sessionData,
	settingsData,
	oauthVerify,
	sendMsg,
	addWidgets,
	createNotice,
	escapeText,
	hasPerm,
	PermissionFlagsBits,
	OAuth2Scopes
};
const got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 5000,
	headers: {
		'User-Agent': 'Wiki-Bot/dashboard (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );
const {Pool} = require('pg');
const db = new Pool();
db.on( 'error', dberror => {
	console.log( '- Dashboard: Error while connecting to the database: ' + dberror );
} );

const slashCommands = require('../interactions/commands.json');

got.get( `https://discord.com/api/v8/applications/${process.env.bot}/commands`, {
	headers: {
		Authorization: `Bot ${process.env.token}`
	},
	timeout: 10000
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
 * @extends PartialGuild
 * @property {String} id
 * @property {String} name
 * @property {String} acronym
 * @property {String} [icon]
 * @property {String} userPermissions
 * @property {Boolean} [patreon]
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
 * @type {Map<Number, PromiseConstructor>}
 */
const messages = new Map();
var messageId = 1;

process.on( 'message', message => {
	if ( message.id ) {
		if ( message.data.error ) messages.get(message.id).reject(message.data.error);
		else messages.get(message.id).resolve(message.data.response);
		return messages.delete(message.id);
	}
	if ( message === 'toggleDebug' ) global.isDebug = !global.isDebug;
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
		'botsfordiscord.com': {
			link: 'https://botsfordiscord.com/bots/' + process.env.bot,
			widget: 'https://botsfordiscord.com/api/bot/' + process.env.bot + '/widget?theme=dark'
		},
		'discord.boats': {
			link: 'https://discord.boats/bot/' + process.env.bot,
			widget: 'https://discord.boats/api/widget/' + process.env.bot
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
 * @param {import('cheerio')} $ - The cheerio static
 * @param {import('./i18n.js')} dashboardLang - The user language
 * @returns {import('cheerio')}
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
 * @param {import('cheerio')} $ - The cheerio static
 * @param {String} notice - The notice to create
 * @param {import('./i18n.js')} dashboardLang - The user language
 * @param {String[]} [args] - The arguments for the notice
 * @returns {import('cheerio')}
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
		case 'movefail':
			type = 'info';
			title.text(dashboardLang.get('notice.movefail.title'));
			text.text(dashboardLang.get('notice.movefail.text'));
			note = $('<div>').text(dashboardLang.get('notice.movefail.note'));
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
	ADMINISTRATOR: 1 << 3,
	MANAGE_CHANNELS: 1 << 4,
	MANAGE_GUILD: 1 << 5,
	ADD_REACTIONS: 1 << 6,
	VIEW_CHANNEL: 1 << 10,
	SEND_MESSAGES: 1 << 11,
	MANAGE_MESSAGES: 1 << 13,
	EMBED_LINKS: 1 << 14,
	ATTACH_FILES: 1 << 15,
	READ_MESSAGE_HISTORY: 1 << 16,
	MENTION_EVERYONE: 1 << 17,
	USE_EXTERNAL_EMOJIS: 1 << 18,
	MANAGE_NICKNAMES: 1 << 27,
	MANAGE_ROLES: 1 << 28,
	MANAGE_WEBHOOKS: 1 << 29
}

/**
 * Check if a permission is included in the BitField
 * @param {String|Number} all - BitField of multiple permissions
 * @param {String[]} permission - Name of the permission to check for
 * @returns {Boolean}
 */
function hasPerm(all = 0, ...permission) {
	if ( (all & permissions.ADMINISTRATOR) === permissions.ADMINISTRATOR ) return true;
	return permission.map( perm => {
		let bit = permissions[perm];
		return ( (all & bit) === bit );
	} ).every( perm => perm );
}

module.exports = {got, db, slashCommands, sessionData, settingsData, sendMsg, addWidgets, createNotice, escapeText, hasPerm};
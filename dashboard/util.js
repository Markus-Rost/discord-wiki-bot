const got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 5000,
	headers: {
		'User-Agent': 'Wiki-Bot/dashboard (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );
const sqlite3 = require('sqlite3').verbose();
const mode = ( process.env.READONLY ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE );
const db = new sqlite3.Database( './wikibot.db', mode, dberror => {
	if ( dberror ) {
		console.log( '- Dashboard: Error while connecting to the database: ' + dberror );
		return dberror;
	}
	db.exec( 'PRAGMA foreign_keys = ON;', function (error) {
		if ( error ) {
			console.log( '- Dashboard: Error while enabling the foreign key constraint: ' + error );
		}
		console.log( '- Dashboard: Connected to the database.' );
	} );
} );

/**
 * @typedef Settings
 * @property {String} state
 * @property {String} access_token
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
 * @property {String} [botPermissions]
 * @property {{id: String, name: String, userPermissions: Number, botPermissions: Number}[]} [channels]
 * @property {{id: String, name: String, lower: Boolean}[]} [roles]
 */

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
 * Create a red notice
 * @param {import('cheerio')} $ - The cheerio static
 * @param {String} notice - The notice to create
 * @param {String[]} [args] - The arguments for the notice
 * @returns {import('cheerio')}
 */
function createNotice($, notice, args) {
	if ( !notice ) return;
	var type = 'info';
	var title = $('<b>');
	var text = $('<div>');
	var note;
	switch (notice) {
		case 'unauthorized':
			type = 'info';
			title.text('Not logged in!');
			text.text('Please login before you can change any settings.');
			break;
		case 'save':
			type = 'success';
			title.text('Settings saved!');
			text.text('The settings have been updated successfully.');
			break;
		case 'logout':
			type = 'success';
			title.text('Successfully logged out!');
			text.text('You have been successfully logged out. To change any settings you need to login again.');
			break;
		case 'refresh':
			type = 'success';
			title.text('Refresh successful!');
			text.text('Your server list has been successfully refeshed.');
			break;
		case 'loginfail':
			type = 'error';
			title.text('Login failed!');
			text.text('An error occurred while logging you in, please try again.');
			break;
		case 'sysmessage':
			type = 'info';
			title.text('System message does not match!');
			text.text(`The page "MediaWiki:Custom-RcGcDw" need to be the server id "${args[0]}".`);
			note = $('<a target="_blank">').text(args[1]).attr('href', args[1]);
			break;
		case 'mwversion':
			type = 'error';
			title.text('Outdated MediaWiki version!');
			text.text(`Requires at least MediaWiki 1.30, found ${args[0]} on ${args[1]}.`);
			note = $('<a target="_blank">').text('https://www.mediawiki.org/wiki/MediaWiki_1.30').attr('href', 'https://www.mediawiki.org/wiki/MediaWiki_1.30');
			break;
		case 'nochange':
			type = 'info';
			title.text('Save failed!');
			text.text('The settings matched the current default settings.');
			break;
		case 'invalidusergroup':
			type = 'error';
			title.text('Invalid user group!');
			text.text('The user group name was too long or you provided too many.');
			break;
		case 'wikiblocked':
			type = 'error';
			title.text('Wiki is blocked!');
			text.text(`${args[0]} has been blocked from being added as a recent changes webhook.`);
			if ( args[1] ) note = $('<div>').text(`Reason: ${args[1]}`);
			break;
		case 'savefail':
			type = 'error';
			title.text('Save failed!');
			text.text('The settings could not be saved, please try again.');
			break;
		case 'movefail':
			type = 'info';
			title.text('Settings partially saved!');
			text.text('The settings have only been partially updated.');
			note = $('<div>').text('The webhook channel could not be changed!');
			break;
		case 'refreshfail':
			type = 'error';
			title.text('Refresh failed!');
			text.text('You server list could not be refreshed, please try again.');
			break;
		case 'readonly':
			type = 'info';
			title.text('Read-only database!');
			text.text('You can currently only view your settings, but not change them.');
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

module.exports = {got, db, settingsData, sendMsg, createNotice, hasPerm};
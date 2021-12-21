import {inspect} from 'util';
inspect.defaultOptions = {compact: false, breakLength: Infinity};

/**
 * If debug logging is enabled.
 * @type {Boolean}
 * @global
 */
globalThis.isDebug = ( process.argv[2] === 'debug' );

/**
 * Prefix of guilds with patreon features enabled.
 * @type {Map<String, String>}
 * @global
 */
globalThis.patreonGuildsPrefix = new Map();

/**
 * Language code of guilds with voice channel role enabled.
 * @type {Map<String, String>}
 * @global
 */
globalThis.voiceGuildsLang = new Map();

/**
 * Guilds with pause activated.
 * @type {Set<String>}
 * @global
 */
globalThis.pausedGuilds = new Set();

/**
 * Logs an error.
 * @param {Error} error - The error.
 * @param {Boolean} isBig - If the error should get a big log.
 * @param {String} type - Type of the error.
 * @global
 */
globalThis.log_error = function(error, isBig = false, type = '') {
	var time = new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
	if ( isDebug ) {
		console.error( '--- ' + type + 'ERROR START ' + time + ' ---\n', error, '\n--- ' + type + 'ERROR END ' + time + ' ---' );
	} else {
		if ( isBig ) console.log( '--- ' + type + 'ERROR: ' + time + ' ---\n-', error );
		else console.log( '- ' + error.name + ': ' + error.message );
	}
}

const common_warnings = {
	main: [
		'Unrecognized parameters: piprop, explaintext, exsectionformat, exlimit.',
		'Unrecognized parameters: explaintext, exsectionformat, exlimit.',
		'Unrecognized parameter: piprop.'
	],
	query: [
		'Unrecognized values for parameter "prop": pageimages, extracts.',
		'Unrecognized values for parameter "prop": pageimages, extracts',
		'Unrecognized value for parameter "prop": extracts.',
		'Unrecognized value for parameter "prop": extracts',
		'Unrecognized value for parameter "prop": pageimages.',
		'Unrecognized value for parameter "prop": pageimages'
	]
}

/**
 * Logs a warning.
 * @param {Object} warning - The warning.
 * @param {Boolean} api - If the warning is from the MediaWiki API.
 * @global
 */
globalThis.log_warning = function(warning, api = true) {
	if ( isDebug ) {
		console.warn( '--- Warning start ---\n' + inspect( warning ) + '\n--- Warning end ---' );
	}
	else if ( api ) {
		if ( common_warnings.main.includes( warning?.main?.['*'] ) ) delete warning.main;
		if ( common_warnings.query.includes( warning?.query?.['*'] ) ) delete warning.query;
		var warningKeys = Object.keys(warning);
		if ( warningKeys.length ) console.warn( '- Warning: ' + warningKeys.join(', ') );
	}
	else console.warn( '--- Warning ---\n' + inspect( warning ) );
}

if ( !globalThis.verifyOauthUser ) {
	/**
	 * Oauth wiki user verification.
	 * @param {String} state - Unique state for the authorization.
	 * @param {String} access_token - Access token.
	 * @param {Object} [settings] - Settings to skip oauth.
	 * @param {import('discord.js').TextChannel} settings.channel - The channel.
	 * @param {String} settings.user - The user id.
	 * @param {String} settings.wiki - The OAuth2 wiki.
	 * @param {import('discord.js').CommandInteraction|import('discord.js').ButtonInteraction} [settings.interaction] - The interaction.
	 * @param {Function} [settings.fail] - The function to call when the verifiction errors.
	 * @param {import('discord.js').Message} [settings.sourceMessage] - The source message with the command.
	 * @global
	 */
	globalThis.verifyOauthUser = function(state, access_token, settings) {
		return settings?.fail?.();
	};
}
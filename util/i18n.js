const {defaultSettings} = require('./default.json');
var i18n = require('../i18n/allLangs.json');
Object.keys(i18n.allLangs.names).forEach( lang => i18n[lang] = require('../i18n/' + lang + '.json') );

const defaultAliases = ( i18n?.[defaultSettings.lang]?.aliases || {} );

/**
 * A language.
 * @class
 */
class Lang {
	/**
	 * Creates a new language.
	 * @param {String} [lang] - The language code.
	 * @param {String} [namespace] - The namespace for the language.
	 * @constructs Lang
	 */
	constructor(lang = defaultSettings.lang, namespace = '') {
		this.lang = lang;
		this.namespace = namespace;
		this.fallback = ( i18n?.[lang]?.fallback.slice() || [defaultSettings.lang] ).filter( fb => fb.trim() );

		this.localNames = {};
		this.aliases = {};
		let aliases = ( i18n?.[lang]?.aliases || {} );
		Object.keys(aliases).forEach( cmd => {
			if ( aliases[cmd][0].trim() && !( cmd in this.localNames ) ) {
				this.localNames[cmd] = aliases[cmd][0];
			}
			aliases[cmd].forEach( alias => {
				if ( alias.trim() && !( alias in this.aliases ) ) this.aliases[alias] = cmd;
			} );
		} );
		Object.keys(defaultAliases).forEach( cmd => {
			if ( defaultAliases[cmd][0].trim() && !( cmd in this.localNames ) ) {
				this.localNames[cmd] = defaultAliases[cmd][0];
			}
			defaultAliases[cmd].forEach( alias => {
				if ( alias.trim() && !( alias in this.aliases ) ) this.aliases[alias] = cmd;
			} );
		} );
	}

	/**
	 * Get a localized message.
	 * @param {String} message - Name of the message.
	 * @param {String[]} args - Arguments for the message.
	 * @returns {String}
	 */
	get(message = '', ...args) {
		if ( this.namespace.length ) message = this.namespace + '.' + message;
		let keys = ( message.length ? message.split('.') : [] );
		let lang = this.lang;
		let text = i18n?.[lang];
		let fallback = 0;
		for (let n = 0; n < keys.length; n++) {
			if ( text ) {
				text = text?.[keys[n]];
				if ( typeof text === 'string' ) text = text.trim()
			}
			if ( !text ) {
				if ( fallback < this.fallback.length ) {
					lang = this.fallback[fallback];
					fallback++;
					text = i18n?.[lang];
					n = -1;
				}
				else {
					n = keys.length;
				}
			}
		}
		if ( typeof text === 'string' ) {
			args.forEach( (arg, i) => {
				text = text.replaceSave( new RegExp( `\\$${i + 1}`, 'g' ), arg );
			} );
			text = text.replace( /{{\s*PLURAL:\s*[+-]?(\d+)\s*\|\s*([^\{\}]*?)\s*}}/g, (m, number, cases) => {
				return plural(lang, parseInt(number, 10), cases.split(/\s*\|\s*/));
			} );
		}
		return ( text || '⧼' + message + ( isDebug && args.length ? ': ' + args.join(', ') : '' ) + '⧽' );
	}

//	/**
//	 * Get a localized message.
//	 * @param {String} message - Name of the message.
//	 * @param {String[]} args - Arguments for the message.
//	 * @returns {String}
//	 */
//	get(message = '', ...args) {
//		if ( this.namespace.length ) message = this.namespace + '.' + message;
//		let lang = this.lang;
//		let text = i18n?.[lang]?.[message];
//		let fallback = 0;
//		while ( !text ) {
//			if ( fallback < this.fallback.length ) {
//				lang = this.fallback[fallback];
//				fallback++;
//				text = i18n?.[lang]?.[message];
//			}
//			else break;
//		}
//		if ( typeof text === 'string' ) {
//			args.forEach( (arg, i) => {
//				text = text.replaceSave( new RegExp( `\\$${i + 1}`, 'g' ), arg );
//			} );
//			text = text.replace( /{{\s*PLURAL:\s*[+-]?(\d+)\s*\|\s*([^\{\}]*?)\s*}}/g, (m, number, cases) => {
//				return plural(lang, parseInt(number, 10), cases.split(/\s*\|\s*/));
//			} );
//		}
//		return ( text || '⧼' + message + ( isDebug && args.length ? ': ' + args.join(', ') : '' ) + '⧽' );
//	}

	/**
	 * Get names for all languages.
	 * @param {Boolean} isRcGcDw - Get the languages for RcGcDw?
	 * @returns {Object}
	 * @static
	 */
	static allLangs(isRcGcDw = false) {
		if ( isRcGcDw ) return i18n.RcGcDw;
		return i18n.allLangs;
	}
}

/**
 * Parse plural text.
 * @param {String} lang - The language code.
 * @param {Number} number - The amount.
 * @param {String[]} args - The possible text.
 * @returns {String}
 */
function plural(lang, number, args) {
	var text = args[args.length - 1];
	switch ( lang ) {
		case 'fr':
			if ( number <= 1 ) text = getArg(args, 0);
			else text = getArg(args, 1);
			break;
		case 'pl':
			if ( number === 1 ) text = getArg(args, 0);
			else if ( [2,3,4].includes( number % 10 ) && ![12,13,14].includes( number % 100 ) ) {
				text = getArg(args, 1);
			}
			else text = getArg(args, 2);
			break;
		case 'ru':
			if ( args.length > 2 ) {
				if ( number % 10 === 1 && number % 100 !== 11 ) text = getArg(args, 0);
				else if ( [2,3,4].includes( number % 10 ) && ![12,13,14].includes( number % 100 ) ) {
					text = getArg(args, 1);
				}
				else text = getArg(args, 2);
			}
			else {
				if ( number === 1 ) text = getArg(args, 0);
				else text = getArg(args, 1);
			}
			break;
		case 'de':
		case 'en':
		case 'nl':
		case 'pt':
		case 'tr':
		case 'zh-hans':
		case 'zh-hant':
		default:
			if ( number === 1 ) text = getArg(args, 0);
			else text = getArg(args, 1);
	}
	return text;
}

/**
 * Get text option.
 * @param {String[]} args - The list of options.
 * @param {Number} index - The preferred option.
 * @returns {String}
 */
function getArg(args, index) {
	return ( args.length > index ? args[index] : args[args.length - 1] );
}

module.exports = Lang;
const {defaultSettings} = require('./default.json');
var i18n = require('../i18n/allLangs.json');
Object.keys(i18n.allLangs.names).forEach( lang => i18n[lang] = require('../i18n/' + lang + '.json') );

class Lang {
	constructor(lang = defaultSettings.lang, namespace = '') {
		this.lang = lang;
		this.namespace = namespace;
		this.fallback = ( i18n?.[lang]?.fallback || [] );
	}

	get(message = '', ...args) {
		if ( this.namespace.length ) message = this.namespace + '.' + message;
		let keys = ( message.length ? message.split('.') : [] );
		let lang = this.lang;
		let text = i18n?.[lang];
		let fallback = 0;
		for (let n = 0; n < keys.length; n++) {
			if ( text ) {
				text = text?.[keys[n]];
			}
			else if ( fallback < this.fallback.length ) {
				lang = this.fallback[fallback];
				fallback++;
				text = i18n?.[lang];
				n = 0;
			}
			else {
				n = keys.length;
			}
		}
		if ( typeof text === 'string' ) {
			args.forEach( (arg, i) => {
				text = text.replaceSave( new RegExp( `\\$${i + 1}`, 'g' ), arg );
			} );
			text = text.replace( /{{\s*PLURAL:\s*(\d+)\s*\|\s*([^\{\}]*?)\s*}}/g, (m, number, cases) => {
				return plural(lang, parseInt(number, 10), cases.split(/\s*\|\s*/));
			} );
		}
		return ( text || '⧼' + message + ( isDebug && args.length ? ': ' + args.join(', ') : '' ) + '⧽' );
	}

	static allLangs() {
		return i18n.allLangs;
	}
}

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
		case 'zh':
		default:
			if ( number === 1 ) text = getArg(args, 0);
			else text = getArg(args, 1);
	}
	return text;
}

function getArg(args, index) {
	return ( args.length > index ? args[index] : args[args.length - 1] );
}

module.exports = Lang;
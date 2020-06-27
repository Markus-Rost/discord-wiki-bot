const {defaultSettings} = require('./default.json');
var i18n = require('../i18n/allLangs.json');
Object.keys(i18n.allLangs.names).forEach( lang => i18n[lang] = require('../i18n/' + lang + '.json') );

class Lang {
	constructor(lang = defaultSettings.lang, namespace = '') {
		this.lang = lang;
		this.namespace = namespace;
	}

	get(message = '') {
		if ( this.namespace.length ) message = this.namespace + '.' + message;
		let args = ( message.length ? message.split('.') : [] );
		let lang = this.lang;
		let text = i18n?.[lang];
		for (let n = 0; n < args.length; n++) {
			if ( text ) {
				text = text?.[args[n]];
			}
			else if ( lang !== defaultSettings.lang ) {
				lang = defaultSettings.lang;
				text = i18n?.[lang];
				n = 0;
			}
			else {
				n = args.length;
			}
		}
		return ( text || '⧼' + message + '⧽' );
	}

	static allLangs() {
		return i18n.allLangs;
	}
}

module.exports = Lang;
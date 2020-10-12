const htmlparser = require('htmlparser2');
const got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 5000,
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );

/**
 * Make wikitext formatting usage.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [showEmbed] - If the text is used in an embed.
 * @param {import('./wiki.js')|String} [args] - The text contains markdown links.
 * @returns {String}
 */
function toFormatting(text = '', showEmbed = false, ...args) {
	if ( showEmbed ) return toMarkdown(text, ...args);
	else return toPlaintext(text);
};

/**
 * Turns wikitext formatting into markdown.
 * @param {String} [text] - The text to modify.
 * @param {import('./wiki.js')} [wiki] - The wiki.
 * @param {String} [title] - The page title.
 * @returns {String}
 */
function toMarkdown(text = '', wiki, title = '') {
	text = text.replace( /[()\\]/g, '\\$&' );
	var link = null;
	var regex = /\[\[(?:([^\|\]]+)\|)?([^\]]+)\]\]([a-z]*)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		var pagetitle = ( link[1] || link[2] );
		var page = wiki.toLink(( /^[#\/]/.test(pagetitle) ? title + ( pagetitle.startsWith( '/' ) ? pagetitle : '' ) : pagetitle ), '', ( pagetitle.startsWith( '#' ) ? pagetitle.substring(1) : '' ), true);
		text = text.replaceSave( link[0], '[' + link[2] + link[3] + '](' + page + ')' );
	}
	regex = /\/\*\s*([^\*]+?)\s*\*\/\s*(.)?/g;
	while ( title !== '' && ( link = regex.exec(text) ) !== null ) {
		text = text.replaceSave( link[0], '[→' + link[1] + '](' + wiki.toLink(title, '', link[1], true) + ')' + ( link[2] ? ': ' + link[2] : '' ) );
	}
	return escapeFormatting(text, true);
};

/**
 * Removes wikitext formatting.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [canHTML] - If the text can contain HTML.
 * @returns {String}
 */
function toPlaintext(text = '', fullWikitext = false) {
	text = text.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' );
	if ( fullWikitext ) {
		return htmlToPlain( text.replace( /\[(?:https?:)?\/\/(?:[^ ]+) ([^\]]+)\]/g, '$1' ) );
	}
	else return escapeFormatting(text);
};

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		ontext: (htmltext) => {
			text += escapeFormatting(htmltext);
		}
	} );
	parser.write( html );
	parser.end();
	return text;
};

/**
 * Change HTML text to markdown text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToDiscord(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		},
		ontext: (htmltext) => {
			text += escapeFormatting(htmltext);
		},
		onclosetag: (tagname) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		}
	} );
	parser.write( html );
	parser.end();
	return text;
};

/**
 * Escapes formatting.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [isMarkdown] - The text contains markdown links.
 * @returns {String}
 */
function escapeFormatting(text = '', isMarkdown = false) {
	if ( !isMarkdown ) text = text.replace( /[()\\]/g, '\\$&' );
	return text.replace( /[`_*~:<>{}@|]|\/\//g, '\\$&' );
};

module.exports = {
	got,
	toFormatting,
	toMarkdown,
	toPlaintext,
	htmlToPlain,
	htmlToDiscord,
	escapeFormatting
};
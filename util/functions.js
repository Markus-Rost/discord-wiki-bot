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
 * @returns {String}
 */
function toPlaintext(text = '') {
	return escapeFormatting(text.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' ));
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
	toFormatting,
	toMarkdown,
	toPlaintext,
	escapeFormatting
};
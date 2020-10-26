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
 * Parse infobox content
 * @param {Object} infobox - The content of the infobox.
 * @param {import('discord.js').MessageEmbed} embed - The message embed.
 * @param {String} [thumbnail] - The default thumbnail for the wiki.
 */
function parse_infobox(infobox, embed, thumbnail) {
	if ( embed.fields.length >= 25 ) return;
	switch ( infobox.type ) {
		case 'data':
			var {label = '', value = ''} = infobox.data;
			label = htmlToPlain(label).trim();
			value = htmlToPlain(value).trim();
			if ( label && value ) embed.addField( label, value, true );
			break;
		case 'group':
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, thumbnail);
			} );
			break;
		case 'header':
			var {value = ''} = infobox.data;
			value = htmlToPlain(value).trim();
			if ( value ) embed.addField( '\u200b', '__**' + value + '**__', false );
			break;
		case 'image':
			if ( embed.thumbnail?.url !== thumbnail ) return;
			var image = infobox.data.find( img => {
				return ( /^(?:https?:)?\/\//.test(img.url) && /\.(?:png|jpg|jpeg|gif)$/.test(img.name) );
			} );
			if ( image ) embed.setThumbnail( image.url );
			break;
	}
}

/**
 * Make wikitext formatting usage.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [showEmbed] - If the text is used in an embed.
 * @param {import('./wiki.js')} [wiki] - The wiki.
 * @param {String} [title] - The page title.
 * @param {Boolean} [fullWikitext] - If the text can contain full wikitext.
 * @returns {String}
 */
function toFormatting(text = '', showEmbed = false, wiki, title = '', fullWikitext = false) {
	if ( showEmbed ) return toMarkdown(text, wiki, title, fullWikitext);
	else return toPlaintext(text, fullWikitext);
};

/**
 * Turns wikitext formatting into markdown.
 * @param {String} [text] - The text to modify.
 * @param {import('./wiki.js')} wiki - The wiki.
 * @param {String} [title] - The page title.
 * @param {Boolean} [fullWikitext] - If the text can contain full wikitext.
 * @returns {String}
 */
function toMarkdown(text = '', wiki, title = '', fullWikitext = false) {
	text = text.replace( /[()\\]/g, '\\$&' );
	var link = null;
	var regex = /\[\[(?:([^\|\]]+)\|)?([^\]]+)\]\]([a-z]*)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		var pagetitle = ( link[1] || link[2] );
		var page = wiki.toLink(( /^[#\/]/.test(pagetitle) ? title + ( pagetitle.startsWith( '/' ) ? pagetitle : '' ) : pagetitle ), '', ( pagetitle.startsWith( '#' ) ? pagetitle.substring(1) : '' ), true);
		text = text.replaceSave( link[0], '[' + link[2] + link[3] + '](' + page + ')' );
	}
	if ( title !== '' ) {
		regex = /\/\*\s*([^\*]+?)\s*\*\/\s*(.)?/g;
		while ( ( link = regex.exec(text) ) !== null ) {
			text = text.replaceSave( link[0], '[→' + link[1] + '](' + wiki.toLink(title, '', link[1], true) + ')' + ( link[2] ? ': ' + link[2] : '' ) );
		}
	}
	if ( fullWikitext ) {
		regex = /\[(?:https?:)?\/\/([^ ]+) ([^\]]+)\]/g;
		while ( ( link = regex.exec(text) ) !== null ) {
			text = text.replaceSave( link[0], '[' + link[2] + '](https://' + link[1] + ')' );
		}
		return htmlToDiscord( text, true, true ).replaceSave( /'''/g, '**' ).replaceSave( /''/g, '*' );
	}
	return escapeFormatting(text, true);
};

/**
 * Removes wikitext formatting.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [fullWikitext] - If the text can contain full wikitext.
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
	var reference = false;
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( tagname === 'sup' && attribs.class === 'reference' ) reference = true;
			if ( tagname === 'br' ) text += '\n';
		},
		ontext: (htmltext) => {
			if ( !reference ) text += escapeFormatting(htmltext);
		},
		onclosetag: (tagname) => {
			if ( tagname === 'sup' ) reference = false;
		}
	} );
	parser.write( html );
	parser.end();
	return text;
};

/**
 * Change HTML text to markdown text.
 * @param {String} html - The text in HTML.
 * @param {Boolean[]} [escapeArgs] - Arguments for the escaping of text formatting.
 * @returns {String}
 */
function htmlToDiscord(html, ...escapeArgs) {
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
			text += escapeFormatting(htmltext, ...escapeArgs);
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
 * @param {Boolean} [keepLinks] - Don't escape non-markdown links.
 * @returns {String}
 */
function escapeFormatting(text = '', isMarkdown = false, keepLinks = false) {
	if ( !isMarkdown ) text = text.replace( /[()\\]/g, '\\$&' );
	if ( !keepLinks ) text = text.replace( /\/\//g, '\\$&' );
	return text.replace( /[`_*~:<>{}@|]/g, '\\$&' );
};

module.exports = {
	got,
	parse_infobox,
	toFormatting,
	toMarkdown,
	toPlaintext,
	htmlToPlain,
	htmlToDiscord,
	escapeFormatting
};
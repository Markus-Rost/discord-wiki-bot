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
 * @param {String} [serverpath] - The article path for relative links.
 * @returns {import('discord.js').MessageEmbed?}
 */
function parse_infobox(infobox, embed, thumbnail, serverpath = '') {
	if ( !infobox || embed.fields.length >= 25 || embed.length > 5400 ) return;
	if ( infobox.parser_tag_version === 2 ) {
		infobox.data.forEach( group => {
			parse_infobox(group, embed, thumbnail, serverpath);
		} );
		embed.fields = embed.fields.filter( (field, i, fields) => {
			if ( field.name !== '\u200b' || !field.value.startsWith( '__**' ) ) return true;
			return ( fields[i + 1]?.name && ( fields[i + 1].name !== '\u200b' || !fields[i + 1].value.startsWith( '__**' ) ) );
		} );
		return embed;
	}
	switch ( infobox.type ) {
		case 'data':
			var {label = '', value = '', source = '', 'item-name': name = ''} = infobox.data;
			label = htmlToPlain(label).trim();
			value = htmlToDiscord(value, serverpath, true).trim();
			if ( label.includes( '*UNKNOWN LINK*' ) ) {
				label = '`' + ( source || name )  + '`';
				embed.brokenInfobox = true;
			}
			if ( value.includes( '*UNKNOWN LINK*' ) ) {
				value = '`' + ( source || name ) + '`';
				embed.brokenInfobox = true;
			}
			if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
			if ( value.length > 500 ) value = limitLength(value, 500, 250);
			if ( label && value ) embed.addField( label, value, true );
			break;
		case 'panel':
			var embedLength = embed.fields.length;
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, thumbnail, serverpath);
			} );
			embed.fields = embed.fields.filter( (field, i, fields) => {
				if ( i < embedLength || field.name !== '\u200b' ) return true;
				if ( !field.value.startsWith( '__**' ) ) return true;
				return ( fields[i + 1]?.name && fields[i + 1].name !== '\u200b' );
			} ).filter( (field, i, fields) => {
				if ( i < embedLength || field.name !== '\u200b' ) return true;
				if ( field.value.startsWith( '__**' ) ) return true;
				return ( fields[i + 1]?.name && ( fields[i + 1].name !== '\u200b' || !fields[i + 1].value.startsWith( '__**' ) ) );
			} );
			break;
		case 'section':
			var {label = ''} = infobox.data;
			label = htmlToPlain(label).trim();
			if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
			if ( label ) embed.addField( '\u200b', '**' + label + '**', false );
		case 'group':
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, thumbnail, serverpath);
			} );
			break;
		case 'header':
			var {value = ''} = infobox.data;
			value = htmlToPlain(value).trim();
			if ( value.length > 100 ) value = value.substring(0, 100) + '\u2026';
			if ( value ) embed.addField( '\u200b', '__**' + value + '**__', false );
			break;
		case 'image':
			if ( embed.thumbnail?.url !== thumbnail ) return;
			var image = infobox.data.find( img => {
				return ( /^(?:https?:)?\/\//.test(img.url) && /\.(?:png|jpg|jpeg|gif)$/.test(img.name) );
			} );
			if ( image ) embed.setThumbnail( image.url.replace( /^(?:https?:)?\/\//, 'https://' ) );
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
		return htmlToDiscord( text, '', true, true ).replaceSave( /'''/g, '**' ).replaceSave( /''/g, '*' );
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
	var listlevel = -1;
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( tagname === 'sup' && attribs.class === 'reference' ) reference = true;
			if ( tagname === 'br' ) {
				text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel + 3);
			}
			if ( tagname === 'hr' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '─'.repeat(10) + '\n';
			}
			if ( tagname === 'p' && !text.endsWith( '\n' ) ) text += '\n';
			if ( tagname === 'ul' ) listlevel++;
			if ( tagname === 'li' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
				text += '• ';
			}
			if ( tagname === 'dl' ) listlevel++;
			if ( tagname === 'dt' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
			}
			if ( tagname === 'dd' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * (listlevel + 1));
			}
			if ( tagname === 'h1' ) text += '***__';
			if ( tagname === 'h2' ) text += '**__';
			if ( tagname === 'h3' ) text += '**';
			if ( tagname === 'h4' ) text += '__';
			if ( tagname === 'h5' ) text += '*';
			if ( tagname === 'h6' ) text += '';
		},
		ontext: (htmltext) => {
			if ( !reference ) {
				text += escapeFormatting(htmltext);
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === 'sup' ) reference = false;
			if ( tagname === 'ul' ) listlevel--;
			if ( tagname === 'dl' ) listlevel--;
			if ( tagname === 'h1' ) text += '__***';
			if ( tagname === 'h2' ) text += '__**';
			if ( tagname === 'h3' ) text += '**';
			if ( tagname === 'h4' ) text += '__';
			if ( tagname === 'h5' ) text += '*';
			if ( tagname === 'h6' ) text += '';
		},
		oncomment: (commenttext) => {
			if ( /^LINK'" \d+:\d+$/.test(commenttext) ) text += '*UNKNOWN LINK*';
		}
	} );
	parser.write( html );
	parser.end();
	return text;
};

/**
 * Change HTML text to markdown text.
 * @param {String} html - The text in HTML.
 * @param {String} [serverpath] - The article path for relative links.
 * @param {Boolean[]} [escapeArgs] - Arguments for the escaping of text formatting.
 * @returns {String}
 */
function htmlToDiscord(html, serverpath = '', ...escapeArgs) {
	var text = '';
	var code = false;
	var href = '';
	var reference = false;
	var listlevel = -1;
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( code ) return;
			if ( tagname === 'code' ) {
				code = true;
				text += '`';
			}
			if ( tagname === 'b' ) text += '**';
			if ( tagname === 'i' ) text += '*';
			if ( tagname === 's' ) text += '~~';
			if ( tagname === 'u' ) text += '__';
			if ( !serverpath ) return;
			if ( tagname === 'sup' && attribs.class === 'reference' ) reference = true;
			if ( tagname === 'br' ) {
				text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel + 3);
			}
			if ( tagname === 'hr' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '─'.repeat(10) + '\n';
			}
			if ( tagname === 'p' && !text.endsWith( '\n' ) ) text += '\n';
			if ( tagname === 'ul' ) listlevel++;
			if ( tagname === 'li' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
				text += '• ';
			}
			if ( tagname === 'dl' ) listlevel++;
			if ( tagname === 'dt' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
				text += '**';
			}
			if ( tagname === 'dd' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * (listlevel + 1));
			}
			if ( tagname === 'h1' ) text += '***__';
			if ( tagname === 'h2' ) text += '**__';
			if ( tagname === 'h3' ) text += '**';
			if ( tagname === 'h4' ) text += '__';
			if ( tagname === 'h5' ) text += '*';
			if ( tagname === 'h6' ) text += '';
			if ( tagname === 'a' && attribs.href && attribs.class !== 'new' && /^(?:(?:https?:)?\/)?\//.test(attribs.href) ) {
				href = new URL(attribs.href, serverpath).href;
				text += '[';
			}
		},
		ontext: (htmltext) => {
			if ( !reference ) {
				if ( href && !code ) htmltext = htmltext.replace( /[\[\]]/g, '\\$&' );
				if ( code ) text += htmltext.replace( /`/g, 'ˋ' );
				else text += escapeFormatting(htmltext, ...escapeArgs);
			}
		},
		onclosetag: (tagname) => {
			if ( code ) {
				if ( tagname === 'code' ) {
					code = false;
					text += '`';
				}
				return;
			}
			if ( tagname === 'b' ) text += '**';
			if ( tagname === 'i' ) text += '*';
			if ( tagname === 's' ) text += '~~';
			if ( tagname === 'u' ) text += '__';
			if ( !serverpath ) return;
			if ( tagname === 'sup' ) reference = false;
			if ( tagname === 'ul' ) listlevel--;
			if ( tagname === 'dl' ) listlevel--;
			if ( tagname === 'dt' ) text += '**';
			if ( tagname === 'h1' ) text += '__***';
			if ( tagname === 'h2' ) text += '__**';
			if ( tagname === 'h3' ) text += '**';
			if ( tagname === 'h4' ) text += '__';
			if ( tagname === 'h5' ) text += '*';
			if ( tagname === 'h6' ) text += '';
			if ( tagname === 'a' && href ) {
				if ( text.endsWith( '[' ) ) text = text.substring(0, text.length - 1);
				else text += '](' + href.replace( /[()]/g, '\\$&' ) + ')';
				href = '';
			}
		},
		oncomment: (commenttext) => {
			if ( serverpath && /^LINK'" \d+:\d+$/.test(commenttext) ) {
				text += '*UNKNOWN LINK*';
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

/**
 * Limit text length without breaking link formatting.
 * @param {String} [text] - The text to modify.
 * @param {Number} [limit] - The character limit.
 * @param {Number} [maxExtra] - The maximal allowed character limit if needed.
 * @returns {String}
 */
function limitLength(text = '', limit = 1000, maxExtra = 20) {
	var suffix = '\u2026';
	var link = null;
	var regex = /(?<!\\)\[((?:[^\[\]]|\\[\[\]])+?[^\\])\]\((?:[^()]|\\[()])+?[^\\]\)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		if ( link.index < limit && link.index + link[0].length > limit ) {
			limit = link.index;
			if ( link.index + link[0].length < limit + maxExtra ) suffix = link[0];
			else if ( link.index + link[1].length < limit + maxExtra ) suffix = link[1];
			if ( link.index + link[0].length < text.length ) suffix += '\u2026';
			break;
		}
		else if ( link.index >= limit ) break;
	}
	return text.substring(0, limit) + suffix;
};

/**
 * Try to URI decode.
 * @param {String} m - The character to decode.
 * @returns {String}
 */
function partialURIdecode(m) {
	var text = '';
	try {
		text = decodeURIComponent( m );
	}
	catch ( replaceError ) {
		if ( isDebug ) console.log( '- Failed to decode ' + m + ':' + replaceError );
		text = m;
	}
	return text;
};

module.exports = {
	got,
	parse_infobox,
	toFormatting,
	toMarkdown,
	toPlaintext,
	htmlToPlain,
	htmlToDiscord,
	escapeFormatting,
	limitLength,
	partialURIdecode
};
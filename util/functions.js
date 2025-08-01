import { Message, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Parser as HTMLParser } from 'htmlparser2';
import { urlToFix } from 'mediawiki-projects-list';
import gotDefault from 'got';
import { gotSsrf } from 'got-ssrf';
const got = gotDefault.extend( {
	throwHttpErrors: false,
	timeout: {
		request: 5_000
	},
	headers: {
		'user-agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json',
	hooks: ( process.env.x_origin_guild ? {
		beforeRequest: [
			options => {
				if ( options.context?.guildId ) options.headers['x-origin-guild'] = options.context.guildId;
				else if ( options.context?.guildId === null ) options.headers['x-origin-guild'] = 'DM';
			}
		]
	} : {} )
}, gotSsrf );

/**
 * @type {Map<String, {state: String, wiki: String, channel: import('discord.js').TextChannel, user: String}>}
 */
const oauthVerify = new Map();

/**
 * Parse infobox content
 * @param {Object} infobox - The content of the infobox.
 * @param {import('discord.js').EmbedBuilder} embed - The message embed.
 * @param {Object} [embedLimits] - The embed limits.
 * @param {Number} [embedLimits.fieldCount] - The field count.
 * @param {Number} [embedLimits.fieldLength] - The field length.
 * @param {String} [thumbnail] - The default thumbnail for the wiki.
 * @param {String} [pagelink] - The article path for relative links.
 * @returns {import('discord.js').EmbedBuilder?}
 */
function parse_infobox(infobox, embed, embedLimits = {fieldCount: 25, fieldLength: 500}, thumbnail, pagelink = '') {
	if ( !infobox || ( embed.data.fields?.length ?? 0 ) >= embedLimits.fieldCount || embed.length > ( 5_870 - embedLimits.fieldLength ) ) return;
	if ( infobox.parser_tag_version === 2 || infobox.parser_tag_version === 5 ) {
		infobox.data.forEach( group => {
			parse_infobox(group, embed, embedLimits, thumbnail, pagelink);
		} );
		embed.data.fields = embed.data.fields?.filter( (field, i, fields) => {
			// remove header followed by header
			if ( field.name !== '\u200b' || !field.value.startsWith( '__**' ) ) return true;
			return ( fields[i + 1]?.name && ( fields[i + 1].name !== '\u200b' || !fields[i + 1].value.startsWith( '__**' ) ) );
		} ).filter( (field, i, fields) => {
			// combine header followed by section
			if ( field.name !== '\u200b' || fields[i - 1]?.name !== '\u200b' ) return true;
			fields[i - 1].value += '\n' + field.value;
			fields[i] = fields[i - 1];
			return false;
		} ) ?? [];
		return embed;
	}
	switch ( infobox.type ) {
		case 'data': {
			let {label = '', value = '', source = '', 'item-name': name = ''} = infobox.data;
			label = htmlToPlain(label, true).trim();
			value = htmlToDiscord(value, pagelink).trim();
			if ( label.includes( '*UNKNOWN LINK*' ) ) {
				if ( !( source || name ) ) break;
				label = '`' + ( source || name )  + '`';
				embed.brokenInfobox = true;
			}
			if ( value.includes( '*UNKNOWN LINK*' ) ) {
				if ( !( source || name ) ) break;
				value = '`' + ( source || name ) + '`';
				embed.brokenInfobox = true;
			}
			if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
			if ( value.length > embedLimits.fieldLength ) value = limitLength(value, embedLimits.fieldLength, 20);
			if ( label && value ) embed.addFields( {name: label, value, inline: true} );
			break;
		}
		case 'panel': {
			let fieldsLength = embed.data.fields?.length ?? 0;
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, embedLimits, thumbnail, pagelink);
			} );
			embed.data.fields = embed.data.fields?.filter( (field, i, fields) => {
				if ( i < fieldsLength ) return true;
				// remove header followed by header or section
				if ( field.name !== '\u200b' || !field.value.startsWith( '__**' ) ) return true;
				return ( fields[i + 1]?.name && fields[i + 1].name !== '\u200b' );
			} ).filter( (field, i, fields) => {
				if ( i < fieldsLength ) return true;
				// remove section followed by section
				if ( field.name !== '\u200b' || field.value.startsWith( '__**' ) ) return true;
				return ( fields[i + 1]?.name && ( fields[i + 1].name !== '\u200b' || fields[i + 1].value.startsWith( '__**' ) ) );
			} ) ?? [];
			break;
		}
		case 'section': {
			let {label = ''} = infobox.data;
			label = htmlToPlain(label).trim();
			if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
			if ( label ) embed.addFields( {name: '\u200b', value: '**' + label + '**'} );
		}
		case 'group':
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, embedLimits, thumbnail, pagelink);
			} );
			break;
		case 'header': {
			let {value = ''} = infobox.data;
			value = htmlToPlain(value).trim();
			if ( value.length > 100 ) value = value.substring(0, 100) + '\u2026';
			if ( value ) embed.addFields( {name: '\u200b', value: '__**' + value + '**__'} );
			break;
		}
		case 'media':
		case 'image':
			if ( embed.data.thumbnail?.url !== thumbnail ) break;
			try {
				let image = infobox.data.find( img => {
					if ( !/\.(?:png|jpg|jpeg|gif)$/.test(img.name) ) return false;
					if ( pagelink ) return /^(?:(?:https?:)?\/)?\//.test(img.url);
					return /^(?:https?:)?\/\//.test(img.url);
				} );
				if ( image ) embed.setThumbnail( new URL(image.url.replace( /^(?:https?:)?\/\//, 'https://' ), pagelink || undefined).href );
			}
			catch {}
			break;
	}
}

/**
 * If the message is an instance of Discord.Message.
 * @param {Message|import('discord.js').Interaction} msg - The Discord message.
 * @returns {Boolean}
 */
function isMessage(msg) {
	return msg instanceof Message;
};

/**
 * If the bot can show embeds.
 * @param {Message|import('discord.js').Interaction} msg - The Discord message.
 * @returns {Boolean}
 */
function canShowEmbed(msg) {
	return !msg.inGuild() || ( msg.appPermissions ?? msg.channel.permissionsFor(msg.client.user) ).has(PermissionFlagsBits.EmbedLinks);
};

/**
 * Turns wikitext formatting into markdown.
 * @param {String} [text] - The text to modify.
 * @param {import('./wiki.js').default} wiki - The wiki.
 * @param {String} [title] - The page title.
 * @param {Boolean} [fullWikitext] - If the text can contain full wikitext.
 * @returns {String}
 */
function toMarkdown(text = '', wiki, title = '', fullWikitext = false) {
	text = text.replace( /[()\\]/g, '\\$&' );
	let lt = fullWikitext ? '&lt;' : '<';
	let gt = fullWikitext ? '&gt;' : '>';
	var link = null;
	var regex = /\[\[(?:([^\[\|\]]+)\|)?([^\[\]]+)\]\]([a-z]*)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		var [pagetitle, ...anchor] = ( link[1] || link[2] ).split('#');
		anchor = anchor.join('#');
		var page = wiki.toLink(( pagetitle.startsWith( '/' ) ? title + pagetitle : ( pagetitle || title ) ), '', anchor, true);
		text = text.replaceSafe( link[0], '[' + link[2] + link[3] + '](' + lt + page + gt + ')' );
	}
	if ( title ) {
		regex = /\/\*\s*([^\*]+?)\s*\*\/\s*(.)?/g;
		while ( ( link = regex.exec(text) ) !== null ) {
			text = text.replaceSafe( link[0], '[→' + link[1] + '](' + lt + wiki.toLink(title, '', link[1], true) + gt + ')' + ( link[2] ? ': ' + link[2] : '' ) );
		}
	}
	if ( fullWikitext ) {
		regex = /\[(?:https?:)?\/\/([^ ]+) ([^\]]+)\]/g;
		while ( ( link = regex.exec(text) ) !== null ) {
			text = text.replaceSafe( link[0], '[' + link[2] + '](' + lt + 'https://' + link[1] + gt + ')' );
		}
		return htmlToDiscord(text.replaceAll( '\n\n', '<br><br>' ), '', true, true).replaceAll( "'''", '**' ).replaceAll( "''", '*' ).replaceAll( '](\\<', '](<' ).replaceAll( '\\>)', '>)' );
	}
	return escapeFormatting(text, true);
};

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html, includeComments = false) {
	var text = '';
	var altText = '';
	var ignoredTag = ['', 0];
	var parser = new HTMLParser( {
		onopentag: (tagname, attribs) => {
			if ( text.length > 5000 ) parser.pause(); // Prevent the parser from running too long
			if ( ignoredTag[0] ) {
				if ( tagname === ignoredTag[0] ) ignoredTag[1]++;
				return;
			}
			if ( tagname === 'style' || tagname === 'script' ) {
				ignoredTag[0] = tagname;
				return;
			}
			let classes = ( attribs.class?.split(' ') ?? [] );
			if ( ( tagname === 'sup' && classes.includes( 'reference' ) ) || ( tagname === 'span' && classes.includes( 'smwttcontent' ) )
			|| classes.includes( 'noexcerpt' ) || ( classes.includes( 'mw-collapsible' ) && classes.includes( 'mw-collapsed' ) )
			|| ( attribs.style?.includes( 'display' ) && /(^|;)\s*display\s*:\s*none\s*(;|$)/.test(attribs.style) ) ) {
				ignoredTag[0] = tagname;
				return;
			}
			if ( tagname === 'br' ) text += ' ';
			if ( tagname === 'bdi' ) text += FIRST_STRONG_ISOLATE;
			if ( tagname === 'img' ) {
				if ( attribs.alt && attribs.src ) {
					let showAlt = true;
					if ( attribs['data-image-name'] === attribs.alt ) showAlt = false;
					else {
						let regex = new RegExp( '/([\\da-f])/\\1[\\da-f]/' + escapeRegExp(attribs.alt.replaceAll( ' ', '_' )) + '(?:/|\\?|$)' );
						if ( attribs.src.startsWith( 'data:' ) && attribs['data-src'] ) attribs.src = attribs['data-src'];
						if ( regex.test(attribs.src.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode )) ) showAlt = false;
					}
					if ( showAlt ) altText += escapeFormatting(attribs.alt);
				}
			}
		},
		ontext: (htmltext) => {
			if ( !ignoredTag[0] ) {
				htmltext = htmltext.replace( /[\r\n\t ]+/g, ' ' );
				if ( /[\n ]$/.test(text) && htmltext.startsWith( ' ' ) ) htmltext = htmltext.replace( /^ +/, '' );
				text += escapeFormatting(htmltext);
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === ignoredTag[0] ) {
				if ( ignoredTag[1] ) ignoredTag[1]--;
				else ignoredTag[0] = '';
				return;
			}
			if ( tagname === 'bdi' ) text += POP_DIRECTIONAL_ISOLATE;
		},
		oncomment: (commenttext) => {
			if ( includeComments && /^(?:IW)?LINK'" \d+(?::\d+)?$/.test(commenttext) ) {
				text += '*UNKNOWN LINK*';
			}
		}
	} );
	parser.write( String(html) );
	parser.end();
	return ( !text.trim() && altText ? altText : text );
};

/**
 * Change HTML text to markdown text.
 * @param {String} html - The text in HTML.
 * @param {String} [pagelink] - The article path for relative links.
 * @param {Boolean[]} [escapeArgs] - Arguments for the escaping of text formatting.
 * @returns {String}
 */
function htmlToDiscord(html, pagelink = '', ...escapeArgs) {
	var relativeFix = null;
	if ( pagelink ) relativeFix = urlToFix(pagelink);
	var text = '';
	var code = false;
	var href = '';
	var ignoredTag = ['', 0];
	var syntaxhighlight = '';
	var listlevel = -1;
	var horizontalList = '';
	var parser = new HTMLParser( {
		onopentag: (tagname, attribs) => {
			if ( text.length > 5000 ) parser.pause(); // Prevent the parser from running too long
			if ( ignoredTag[0] || code ) {
				if ( tagname === ignoredTag[0] ) ignoredTag[1]++;
				return;
			}
			if ( tagname === 'style' || tagname === 'script' ) {
				ignoredTag[0] = tagname;
				return;
			}
			let classes = ( attribs.class?.split(' ') ?? [] );
			if ( ( tagname === 'sup' && classes.includes( 'reference' ) ) || ( tagname === 'span' && classes.includes( 'smwttcontent' ) )
			|| classes.includes( 'noexcerpt' ) || classes.includes( 'mw-empty-elt' ) || ( classes.includes( 'mw-collapsible' ) && classes.includes( 'mw-collapsed' ) )
			|| ( attribs.style?.includes( 'display' ) && /(^|;)\s*display\s*:\s*none\s*(;|$)/.test(attribs.style) ) ) {
				ignoredTag[0] = tagname;
				return;
			}
			if ( classes.includes( 'hlist' ) ) horizontalList = tagname;
			if ( tagname === 'code' ) {
				code = true;
				text += '`';
			}
			if ( tagname === 'pre' ) {
				code = true;
				text += '```' + syntaxhighlight + '\n';
			}
			if ( tagname === 'div' ) {
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( classes.includes( 'mw-highlight' ) ) {
					syntaxhighlight = ( classes.find( syntax => syntax.startsWith( 'mw-highlight-lang-' ) )?.replace( 'mw-highlight-lang-', '' ) || '' );
				}
			}
			if ( tagname === 'bdi' ) text += FIRST_STRONG_ISOLATE;
			if ( tagname === 'b' || tagname === 'strong' ) text += '**';
			if ( tagname === 'i' || tagname === 'em' ) text += '*';
			if ( tagname === 's' || tagname === 'del' ) text += '~~';
			if ( tagname === 'u' || tagname === 'ins' ) text += '__';
			if ( tagname === 'br' ) {
				text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel + 3);
			}
			if ( tagname === 'hr' && text.trim() ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '─'.repeat(10) + '\n';
			}
			if ( tagname === 'p' && !text.endsWith( '\n' ) ) text += '\n';
			if ( tagname === 'ul' || tagname === 'ol' || tagname === 'dl' ) {
				if ( listlevel > -1 && horizontalList ) text += ' (';
				listlevel++;
			}
			if ( tagname === 'li' && !horizontalList ) {
				text = text.replace( /[ \u200b]+$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
				text += '• ';
			}
			if ( tagname === 'dt' && !horizontalList ) {
				text = text.replace( /[ \u200b]+$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel);
				text += '**';
			}
			if ( tagname === 'dd' && !horizontalList ) {
				text = text.replace( /[ \u200b]+$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * (listlevel + 1));
			}
			if ( tagname === 'img' ) {
				if ( attribs.alt && attribs.src ) {
					let showAlt = true;
					if ( attribs['data-image-name'] === attribs.alt ) showAlt = false;
					else {
						let regex = new RegExp( '/(?:images(?:/thumb)?|([\\da-f])/\\1[\\da-f])/' + escapeRegExp(attribs.alt.replaceAll( ' ', '_' )) + '(?:/|\\?|$)' );
						if ( attribs.src.startsWith( 'data:' ) && attribs['data-src'] ) attribs.src = attribs['data-src'];
						if ( regex.test(attribs.src.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode )) ) showAlt = false;
					}
					if ( showAlt ) {
						if ( href && !code ) attribs.alt = attribs.alt.replace( /[\[\]]/g, '\\$&' );
						if ( code ) text += attribs.alt.replaceAll( '`', 'ˋ' );
						else text += '\x1F' + escapeFormatting(attribs.alt, ...escapeArgs) + '\x1F';
					}
				}
			}
			if ( tagname === 'h1' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '# ';
			}
			if ( tagname === 'h2' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '## ';
			}
			if ( tagname === 'h3' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '### ';
			}
			if ( tagname === 'h4' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '***__';
			}
			if ( tagname === 'h5' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '**__';
			}
			if ( tagname === 'h6' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '**';
			}
			if ( !pagelink ) return;
			if ( tagname === 'a' && attribs.href && !classes.includes( 'new' ) && !classes.includes( 'ext-discussiontools-init-timestamplink' ) && /^(?:(?:https?:)?\/\/|\/|#)/.test(attribs.href) ) {
				try {
					if ( relativeFix && /^\/(?!\/)/.test(attribs.href) ) attribs.href = relativeFix(attribs.href, pagelink);
					href = new URL(attribs.href, pagelink);
					if ( text.trim().endsWith( '](<' + href + '>)' ) ) {
						let whitespace = text.match( /(?<=>\))\s*$/ )?.[0] ?? '';
						text = text.substring(0, text.length - ( href.length + 5 + whitespace.length )) + whitespace;
					}
					else text += '[';
				}
				catch {}
			}
		},
		ontext: (htmltext) => {
			if ( !ignoredTag[0] ) {
				if ( code ) text += htmltext.replaceAll( '`', 'ˋ' );
				else {
					htmltext = htmltext.replace( /[\r\n\t ]+/g, ' ' );
					if ( /[\n ]$/.test(text) && htmltext.startsWith( ' ' ) ) {
						htmltext = htmltext.replace( /^ +/, '' );
					}
					htmltext = escapeFormatting(htmltext, ...escapeArgs);
					if ( href ) htmltext = htmltext.replace( /[\[\]]/g, '\\$&' );
					text += htmltext;
				}
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === ignoredTag[0] ) {
				if ( ignoredTag[1] ) ignoredTag[1]--;
				else ignoredTag[0] = '';
				return;
			}
			if ( code ) {
				if ( tagname === 'code' ) {
					code = false;
					text += '`';
				}
				if ( tagname === 'pre' ) {
					code = false;
					text += '\n```';
				}
				return;
			}
			if ( syntaxhighlight && tagname === 'div' ) syntaxhighlight = '';
			if ( tagname === 'bdi' ) text += POP_DIRECTIONAL_ISOLATE;
			if ( tagname === 'b' || tagname === 'strong' ) text += '**';
			if ( tagname === 'i' || tagname === 'em' ) text += '*';
			if ( tagname === 's' || tagname === 'del' ) text += '~~';
			if ( tagname === 'u' || tagname === 'ins' ) text += '__';
			if ( tagname === 'dl' && horizontalList ) text = text.replace( /: $/, '' );
			if ( tagname === 'ul' || tagname === 'ol' || tagname === 'dl' ) {
				listlevel--;
				if ( horizontalList ) {
					text = text.replace( / • $/, '' );
					if ( listlevel > -1 ) text += ')';
				}
			}
			if ( ( tagname === 'li' || tagname === 'dd' ) && horizontalList ) text += ' • ';
			if ( tagname === 'dt' ) {
				text += '**';
				if ( horizontalList ) text += ': ';
			}
			if ( tagname === horizontalList ) horizontalList = '';
			if ( tagname === 'h1' ) text += '';
			if ( tagname === 'h2' ) text += '';
			if ( tagname === 'h3' ) text += '';
			if ( tagname === 'h4' ) text += '__***';
			if ( tagname === 'h5' ) text += '__**';
			if ( tagname === 'h6' ) text += '**';
			if ( !pagelink ) return;
			if ( tagname === 'a' && href ) {
				if ( text.endsWith( '[' ) ) text = text.substring(0, text.length - 1);
				else text += '](<' + href + '>)';
				href = '';
			}
		},
		oncomment: (commenttext) => {
			if ( pagelink && /^(?:IW)?LINK'" \d+(?::\d+)?$/.test(commenttext) ) {
				text += '*UNKNOWN LINK*';
			}
		}
	} );
	parser.write( String(html) );
	parser.end();
	return text.replace( /\x1F([^\x1F\n]+)\x1F[ \u00A0\u200b]{0,3}(\[?)\1/g, '$2$1' ).replaceAll( '\x1F', '' );
};

/**
 * Escapes formatting.
 * @param {String} [text] - The text to modify.
 * @param {Boolean} [isMarkdown] - The text contains markdown links.
 * @param {Boolean} [keepLinks] - Don't escape non-markdown links.
 * @returns {String}
 */
function escapeFormatting(text = '', isMarkdown = false, keepLinks = false) {
	if ( !isMarkdown ) text = text.replaceAll( '\\', '\\\\' ).replaceAll( '](', ']\\(' );
	text = text.replace( /[`_*~:<>{}@|]/g, '\\$&' ).replaceAll( '//', '/\\/' );
	text = text.replace( /^#+ /gm, '\\$&' ).replace( /^-# /gm, '\\$&' ).replace( /^(\s*)- /gm, '$1\\- ' ).replace( /^(\s*\d+)\. /gm, '$1\\. ' );
	if ( isMarkdown ) text = text.replace( /\]\(\\<([^\(\)<>\s]+?)\\>\)/g, match => {
		return match.replaceAll( '\\\\', '/' ).replaceAll( '\\', '' );
	}  );
	if ( keepLinks ) text = text.replace( /(?:\\<)?https?\\:\/\\\/(?:[^\(\)\s]+(?=\))|[^\[\]\s]+(?=\])|[^<>\s]+>?)/g, match => {
		return match.replaceAll( '\\\\', '/' ).replaceAll( '\\', '' );
	} );
	return text;
};

/**
 * Escapes RegExp formatting.
 * @param {String} [text] - The text to modify.
 * @returns {String}
 */
function escapeRegExp(text = '') {
	return text.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
};

/**
 * Limit text length without breaking link formatting.
 * @param {String} [text] - The text to modify.
 * @param {Number} [limit] - The character limit.
 * @param {Number} [maxExtra] - The maximal allowed character limit if needed.
 * @returns {String}
 */
function limitLength(text = '', limit = 1_000, maxExtra = 20) {
	var suffix = '\u2026';
	var link = null;
	var regex = /(?<!\\)\[((?:[^\[\]]|\\[\[\]])*?[^\\])\]\(<?(?:[^<>]|\\[<>])+?[^\\]>?\)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		if ( link.index < limit && link.index + link[0].length > limit ) {
			if ( link.index + link[0].length < limit + maxExtra ) suffix = link[0];
			else if ( link.index + link[1].length < limit + maxExtra ) suffix = link[1];
			if ( link.index + link[0].length < text.length ) suffix += '\u2026';
			limit = link.index;
			break;
		}
		else if ( link.index >= limit ) break;
	}
	return text.substring(0, limit) + suffix;
};

/**
 * Splits a string into multiple chunks at a designated character that do not exceed a specific length.
 * @param {string} text Content to split
 * @param {object} [options] Options controlling the behavior of the split
 * @param {number} [options.maxLength] Maximum character length per message piece
 * @param {string} [options.char] Character to split the message with
 * @param {string} [options.prepend] Text to prepend to every piece except the first
 * @param {string} [options.append] Text to append to every piece except the last
 * @returns {string[]}
 */
function splitMessage(text, { maxLength = 2_000, char = '\n', prepend = '', append = '' } = {}) {
	if ( text.length <= maxLength ) return [text];
	let messages = [];
	let msg = '';
	for ( let part of text.split(char) ) {
		if ( part.length > maxLength ) part = limitLength(part, maxLength);
		if ( msg ) {
			if ( (msg + char + part + append).length > maxLength ) {
				messages.push(msg + append);
				msg = prepend + part;
			}
			else msg += char + part;
		}
		else msg += part;
	}
	messages.push(msg);
	return messages.filter( part => part );
};

/**
 * Try to URI decode.
 * @param {String} m - The character to decode.
 * @returns {String}
 */
function partialURIdecode(m) {
	var text = '';
	try {
		text = decodeURIComponent( m.replaceAll( '.', '%' ) );
	}
	catch ( replaceError ) {
		if ( isDebug ) console.log( '- Failed to decode ' + m + ':' + replaceError );
		text = m;
	}
	return text;
};

/**
 * Check for timeout or pause.
 * @param {Message|import('discord.js').Interaction} msg - The message.
 * @param {Boolean} [ignorePause] - Ignore pause for admins.
 * @returns {Boolean}
 */
function breakOnTimeoutPause(msg, ignorePause = false) {
	if ( !msg.inGuild() ) return false;
	if ( msg.member?.isCommunicationDisabled?.() ) {
		console.log( `- Aborted, communication disabled for ${msg.member.user.id} on ${msg.guildId}.` );
		return true;
	}
	if ( msg.guild?.members?.me?.isCommunicationDisabled() ) {
		console.log( `- Aborted, communication disabled for Wiki-Bot on ${msg.guildId}.` );
		return true;
	}
	if ( pausedGuilds.has(msg.guildId) && !( ignorePause && ( msg.isAdmin?.() || msg.isOwner?.() ) ) ) {
		console.log( `- Aborted, guild paused on ${msg.guildId}.` );
		return true;
	};
	return false;
};

/**
 * Allow users to delete their command responses.
 * @param {Message} msg - The response.
 * @param {String} author - The user id.
 */
function allowDelete(msg, author) {
	msg?.awaitReactions?.( {
		filter: (reaction, user) => ( reaction.emoji.name === WB_EMOJI.delete && user.id === author ),
		max: 1, time: 300_000
	} ).then( reaction => {
		if ( reaction.size ) msg.delete().catch(log_error);
	} );
};

/**
 * Sends an interaction response.
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ButtonInteraction|import('discord.js').ModalSubmitInteraction} interaction - The interaction.
 * @param {String|import('discord.js').InteractionEditReplyOptions} message - The message.
 * @param {Boolean} [letDelete] - Let the interaction user delete the message.
 * @returns {Promise<Message?>}
 */
function sendMessage(interaction, message, letDelete = false) {
	if ( !interaction.ephemeral && letDelete && breakOnTimeoutPause(interaction) ) return Promise.resolve();
	if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
	return interaction.editReply( message ).then( msg => {
		if ( letDelete && !msg.flags.has(MessageFlags.Ephemeral) ) allowDelete(msg, interaction.user.id);
		return msg;
	}, log_error );
};

export {
	got,
	oauthVerify,
	parse_infobox,
	isMessage,
	canShowEmbed,
	toMarkdown,
	htmlToPlain,
	htmlToDiscord,
	escapeFormatting,
	escapeRegExp,
	limitLength,
	splitMessage,
	partialURIdecode,
	breakOnTimeoutPause,
	allowDelete,
	sendMessage
};

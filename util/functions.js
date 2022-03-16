import htmlparser from 'htmlparser2';
import gotDefault from 'got';
const got = gotDefault.extend( {
	throwHttpErrors: false,
	timeout: {
		request: 5_000
	},
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json'
} );

/**
 * @type {Map<String, {state: String, wiki: String, channel: import('discord.js').TextChannel, user: String}>}
 */
const oauthVerify = new Map();

/**
 * Parse infobox content
 * @param {Object} infobox - The content of the infobox.
 * @param {import('discord.js').MessageEmbed} embed - The message embed.
 * @param {String} [thumbnail] - The default thumbnail for the wiki.
 * @param {String} [pagelink] - The article path for relative links.
 * @returns {import('discord.js').MessageEmbed?}
 */
function parse_infobox(infobox, embed, thumbnail, pagelink = '') {
	if ( !infobox || embed.fields.length >= 25 || embed.length > 5400 ) return;
	if ( infobox.parser_tag_version === 5 ) {
		infobox.data.forEach( group => {
			parse_infobox(group, embed, thumbnail, pagelink);
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
			if ( value.length > 500 ) value = limitLength(value, 500, 250);
			if ( label && value ) embed.addField( label, value, true );
			break;
		case 'panel':
			var embedLength = embed.fields.length;
			infobox.data.value.forEach( group => {
				parse_infobox(group, embed, thumbnail, pagelink);
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
				parse_infobox(group, embed, thumbnail, pagelink);
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
 * @param {import('./wiki.js').default} [wiki] - The wiki.
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
 * @param {import('./wiki.js').default} wiki - The wiki.
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
		return htmlToDiscord(text, '', true, true).replaceSave( /'''/g, '**' ).replaceSave( /''/g, '*' );
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
		return htmlToDiscord( text.replace( /\[(?:https?:)?\/\/(?:[^ ]+) ([^\]]+)\]/g, '$1' ) );
	}
	else return escapeFormatting(text);
};

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html, includeComments = false) {
	var text = '';
	var ignoredTag = '';
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			let classes = ( attribs.class?.split(' ') ?? [] );
			if ( classes.includes( 'noexcerpt' ) || ( classes.includes( 'mw-collapsible' ) && classes.includes( 'mw-collapsed' ) )
			|| ( attribs.style?.includes( 'display' ) && /(^|;)\s*display\s*:\s*none\s*(;|$)/.test(attribs.style) ) ) {
				ignoredTag = tagname;
				return;
			}
			if ( tagname === 'sup' && classes.includes( 'reference' ) ) ignoredTag = 'sup';
			if ( tagname === 'span' && classes.includes( 'smwttcontent' ) ) ignoredTag = 'span';
			if ( tagname === 'br' ) text += ' ';
		},
		ontext: (htmltext) => {
			if ( !ignoredTag ) {
				htmltext = htmltext.replace( /[\r\n\t ]+/g, ' ' );
				if ( /[\n ]$/.test(text) && htmltext.startsWith( ' ' ) ) htmltext = htmltext.replace( /^ +/, '' );
				text += escapeFormatting(htmltext);
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === ignoredTag ) ignoredTag = '';
		},
		oncomment: (commenttext) => {
			if ( includeComments && /^(?:IW)?LINK'" \d+(?::\d+)?$/.test(commenttext) ) {
				text += '*UNKNOWN LINK*';
			}
		}
	} );
	parser.write( String(html) );
	parser.end();
	return text;
};

/**
 * Change HTML text to markdown text.
 * @param {String} html - The text in HTML.
 * @param {String} [pagelink] - The article path for relative links.
 * @param {Boolean[]} [escapeArgs] - Arguments for the escaping of text formatting.
 * @returns {String}
 */
function htmlToDiscord(html, pagelink = '', ...escapeArgs) {
	var text = '';
	var code = false;
	var href = '';
	var ignoredTag = '';
	var syntaxhighlight = '';
	var listlevel = -1;
	var horizontalList = '';
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( ignoredTag || code ) return;
			let classes = ( attribs.class?.split(' ') ?? [] );
			if ( classes.includes( 'noexcerpt' ) || classes.includes( 'mw-empty-elt' ) || ( classes.includes( 'mw-collapsible' ) && classes.includes( 'mw-collapsed' ) )
			|| ( attribs.style?.includes( 'display' ) && /(^|;)\s*display\s*:\s*none\s*(;|$)/.test(attribs.style) ) ) {
				ignoredTag = tagname;
				return;
			}
			if ( classes.includes( 'hlist' ) ) horizontalList = tagname;
			if ( tagname === 'sup' && classes.includes( 'reference' ) ) ignoredTag = 'sup';
			if ( tagname === 'span' && classes.includes( 'smwttcontent' ) ) ignoredTag = 'span';
			if ( tagname === 'code' ) {
				code = true;
				text += '`';
			}
			if ( tagname === 'pre' ) {
				code = true;
				text += '```' + syntaxhighlight + '\n';
			}
			if ( tagname === 'div' && classes.length ) {
				if ( classes.includes( 'mw-highlight' ) ) {
					syntaxhighlight = ( classes.find( syntax => syntax.startsWith( 'mw-highlight-lang-' ) )?.replace( 'mw-highlight-lang-', '' ) || '' );
				}
			}
			if ( tagname === 'b' || tagname === 'strong' ) text += '**';
			if ( tagname === 'i' ) text += '*';
			if ( tagname === 's' ) text += '~~';
			if ( tagname === 'u' ) text += '__';
			if ( tagname === 'br' ) {
				text += '\n';
				if ( listlevel > -1 ) text += '\u200b '.repeat(4 * listlevel + 3);
			}
			if ( tagname === 'hr' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '─'.repeat(10) + '\n';
			}
			if ( tagname === 'p' && !text.endsWith( '\n' ) ) text += '\n';
			if ( tagname === 'ul' || tagname === 'ol' || tagname === 'dl' ) {
				if ( ++listlevel ) text += ' (';
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
						let regex = new RegExp( '/([\\da-f])/\\1[\\da-f]/' + attribs.alt.replace( / /g, '_' ).replace( /\W/g, '\\$&' ) + '(?:/|\\?|$)' );
						if ( attribs.src.startsWith( 'data:' ) && attribs['data-src'] ) attribs.src = attribs['data-src'];
						if ( regex.test(attribs.src.replace( /(?:%[\dA-F]{2})+/g, partialURIdecode )) ) showAlt = false;
					}
					if ( showAlt ) {
						if ( href && !code ) attribs.alt = attribs.alt.replace( /[\[\]]/g, '\\$&' );
						if ( code ) text += attribs.alt.replace( /`/g, 'ˋ' );
						else text += escapeFormatting(attribs.alt, ...escapeArgs);
					}
				}
			}
			if ( tagname === 'h1' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '***__';
			}
			if ( tagname === 'h2' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '**__';
			}
			if ( tagname === 'h3' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '**';
			}
			if ( tagname === 'h4' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '__';
			}
			if ( tagname === 'h5' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '*';
			}
			if ( tagname === 'h6' ) {
				text = text.replace( / +$/, '' );
				if ( !text.endsWith( '\n' ) ) text += '\n';
				text += '';
			}
			if ( !pagelink ) return;
			if ( tagname === 'a' && attribs.href && !classes.includes( 'new' ) && /^(?:(?:https?:)?\/\/|\/|#)/.test(attribs.href) ) {
				href = new URL(attribs.href, pagelink).href.replace( /[()]/g, '\\$&' );
				if ( text.endsWith( '](<' + href + '>)' ) ) {
					text = text.substring(0, text.length - ( href.length + 5 ));
				}
				else text += '[';
			}
		},
		ontext: (htmltext) => {
			if ( !ignoredTag ) {
				if ( href && !code ) htmltext = htmltext.replace( /[\[\]]/g, '\\$&' );
				if ( code ) text += htmltext.replace( /`/g, 'ˋ' );
				else {
					htmltext = htmltext.replace( /[\r\n\t ]+/g, ' ' );
					if ( /[\n ]$/.test(text) && htmltext.startsWith( ' ' ) ) {
						htmltext = htmltext.replace( /^ +/, '' );
					}
					text += escapeFormatting(htmltext, ...escapeArgs);
				}
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === ignoredTag ) {
				ignoredTag = '';
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
			if ( tagname === 'b' || tagname === 'strong' ) text += '**';
			if ( tagname === 'i' ) text += '*';
			if ( tagname === 's' ) text += '~~';
			if ( tagname === 'u' ) text += '__';
			if ( tagname === 'dl' && horizontalList ) text = text.replace( /: $/, '' );
			if ( tagname === 'ul' || tagname === 'ol' || tagname === 'dl' ) {
				if ( horizontalList ) text = text.replace( / • $/, '' );
				if ( listlevel-- ) text += ')';
			}
			if ( ( tagname === 'li' || tagname === 'dd' ) && horizontalList ) text += ' • ';
			if ( tagname === 'dt' ) {
				text += '**';
				if ( horizontalList ) text += ': ';
			}
			if ( tagname === horizontalList ) horizontalList = '';
			if ( tagname === 'h1' ) text += '__***';
			if ( tagname === 'h2' ) text += '__**';
			if ( tagname === 'h3' ) text += '**';
			if ( tagname === 'h4' ) text += '__';
			if ( tagname === 'h5' ) text += '*';
			if ( tagname === 'h6' ) text += '';
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
	if ( !isMarkdown ) text = text.replace( /\\/g, '\\\\' ).replace( /\]\(/g, ']\\(' );
	text = text.replace( /[`_*~:<>{}@|]/g, '\\$&' ).replace( /\/\//g, '/\\/' );
	if ( keepLinks ) text = text.replace( /(?:\\<)?https?\\:\/\\\/(?:[^\(\)\s]+(?=\))|[^\[\]\s]+(?=\])|[^<>\s]+>?)/g, match => {
		return match.replace( /\\\\/g, '/' ).replace( /\\/g, '' );
	} );
	return text;
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
	var regex = /(?<!\\)\[((?:[^\[\]]|\\[\[\]])*?[^\\])\]\(<?(?:[^()]|\\[()])+?[^\\]>?\)/g;
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

/**
 * Check for timeout or pause.
 * @param {import('discord.js').Message|import('discord.js').Interaction} msg - The message.
 * @param {Boolean} [ignorePause] - Ignore pause for admins.
 * @returns {Boolean}
 */
function breakOnTimeoutPause(msg, ignorePause = false) {
	if ( !msg.inGuild() ) return false;
	if ( msg.member?.isCommunicationDisabled() ) {
		console.log( '- Aborted, communication disabled for User.' );
		return true;
	}
	if ( msg.guild?.me.isCommunicationDisabled() ) {
		console.log( '- Aborted, communication disabled for Wiki-Bot.' );
		return true;
	}
	if ( pausedGuilds.has(msg.guildId) && !( ignorePause && ( msg.isAdmin() || msg.isOwner() ) ) ) {
		console.log( '- Aborted, guild paused.' );
		return true;
	};
	return false;
};

/**
 * Allow users to delete their command responses.
 * @param {import('discord.js').Message} msg - The response.
 * @param {String} author - The user id.
 */
function allowDelete(msg, author) {
	msg?.awaitReactions?.( {
		filter: (reaction, user) => ( reaction.emoji.name === '🗑️' && user.id === author ),
		max: 1, time: 300_000
	} ).then( reaction => {
		if ( reaction.size ) msg.delete().catch(log_error);
	} );
};

/**
 * Sends an interaction response.
 * @param {import('discord.js').CommandInteraction|import('discord.js').ButtonInteraction} interaction - The interaction.
 * @param {import('discord.js').MessageOptions} message - The message.
 * @param {Boolean} [letDelete] - Let the interaction user delete the message.
 * @returns {Promise<import('discord.js').Message?>}
 */
function sendMessage(interaction, message, letDelete = true) {
	if ( !interaction.ephemeral && letDelete && breakOnTimeoutPause(interaction) ) return Promise.resolve();
	if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
	return interaction.editReply( message ).then( msg => {
		if ( letDelete && (msg.flags & 64) !== 64 ) allowDelete(msg, interaction.user.id);
		return msg;
	}, log_error );
};

export {
	got,
	oauthVerify,
	parse_infobox,
	toFormatting,
	toMarkdown,
	toPlaintext,
	htmlToPlain,
	htmlToDiscord,
	escapeFormatting,
	limitLength,
	partialURIdecode,
	breakOnTimeoutPause,
	allowDelete,
	sendMessage
};

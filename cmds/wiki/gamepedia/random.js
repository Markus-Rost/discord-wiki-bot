const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const parse_page = require('../../../functions/parse_page.js');
const extract_desc = require('../../../util/extract_desc.js');

/**
 * Sends a random Gamepedia page.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function gamepedia_random(lang, msg, wiki, reaction, spoiler) {
	got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&prop=pageimages|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free&explaintext=true&exsectionformat=raw&exlimit=1&generator=random&grnnamespace=0&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
			}
		}
		else {
			var querypage = Object.values(body.query.pages)[0];
			var pagelink = wiki.updateWiki(body.query.general).toLink(querypage.title);
			var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
			if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				embed.setTitle( displaytitle );
			}
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = htmlToPlain( querypage.pageprops.description );
				if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
				embed.setDescription( description );
			}
			else if ( querypage.extract ) {
				var extract = extract_desc(querypage.extract);
				embed.setDescription( extract[0] );
			}
			if ( querypage.title === body.query.general.mainpage ) {
				embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			else if ( querypage.pageimage && querypage.original ) {
				embed.setThumbnail( querypage.original.source );
			}
			else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
				embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
			}
			else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			
			msg.sendChannel( '🎲 ' + spoiler + '<' + pagelink + '>' + spoiler, {embed} ).then( message => parse_page(message, querypage.title, embed, wiki, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href )) );
		}
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
		}
	} ).finally( () => {
		if ( reaction ) reaction.removeEmoji();
	} );
}

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		}
	}, {decodeEntities:true} );
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
			text += htmltext.escapeFormatting();
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
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

module.exports = {
	name: 'random',
	run: gamepedia_random
};
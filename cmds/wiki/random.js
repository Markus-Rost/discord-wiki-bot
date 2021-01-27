const {MessageEmbed} = require('discord.js');
const fandom_random = require('./fandom/random.js').run;
const parse_page = require('../../functions/parse_page.js');
const logging = require('../../util/logging.js');
const {parse_infobox, htmlToDiscord} = require('../../util/functions.js');
const extract_desc = require('../../util/extract_desc.js');

/**
 * Sends a random Gamepedia page.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function gamepedia_random(lang, msg, wiki, reaction, spoiler) {
	got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&prop=info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&generator=random&grnnamespace=0&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else if ( body?.query?.general?.generator === 'MediaWiki 1.19.24' && wiki.isFandom(false) ) {
				return fandom_random(lang, msg, wiki, reaction, spoiler);
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
			}
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		wiki.updateWiki(body.query.general);
		logging(wiki, msg.guild?.id, 'random');
		var querypage = Object.values(body.query.pages)[0];
		var pagelink = wiki.toLink(querypage.title);
		var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
		if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
			var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
			if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
			embed.setTitle( displaytitle );
		}
		if ( querypage.pageprops && querypage.pageprops.description ) {
			var description = htmlToDiscord( querypage.pageprops.description );
			if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
			embed.backupDescription = description;
		}
		else if ( querypage.extract ) {
			var extract = extract_desc(querypage.extract);
			embed.backupDescription = extract[0];
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
		
		if ( !embed.fields.length && querypage.pageprops && querypage.pageprops.infoboxes ) {
			try {
				var infobox = JSON.parse(querypage.pageprops.infoboxes)?.[0];
				parse_infobox(infobox, embed, new URL(body.query.general.logo, wiki).href, wiki.articleURL.href);
			}
			catch ( error ) {
				console.log( '- Failed to parse the infobox: ' + error );
			}
		}
		
		parse_page(msg, '🎲 ' + spoiler + '<' + pagelink + '>' + spoiler, embed, wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ));
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
		}
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'random',
	run: gamepedia_random
};
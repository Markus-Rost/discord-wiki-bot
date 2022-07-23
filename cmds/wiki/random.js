import { EmbedBuilder } from 'discord.js';
import parse_page from '../../functions/parse_page.js';
import logging from '../../util/logging.js';
import { got, toMarkdown, htmlToDiscord, escapeFormatting } from '../../util/functions.js';
import extract_desc from '../../util/extract_desc.js';

/**
 * Sends a random Gamepedia page.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {String[]} [namespace] - The namespace to get a random page of.
 * @param {URLSearchParams} [querystring] - The querystring for the link.
 * @param {String} [fragment] - The section for the link.
 */
export default function gamepedia_random(lang, msg, wiki, reaction, spoiler, noEmbed, namespace = ['0', '*'], querystring = new URLSearchParams(), fragment = '') {
	var uselang = ( querystring.getAll('variant').pop() || querystring.getAll('uselang').pop() || lang.lang );
	got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=allmessages|siteinfo&amenableparser=true&amtitle=Special:Random&ammessages=randompage|randompage-nopages&amargs=%1F' + encodeURIComponent( namespace[1] ) + '%1F' + namespace[0].split('|').length + '&siprop=general&prop=categoryinfo|info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free|disambiguation|infoboxes&explaintext=true&exsectionformat=raw&exlimit=1&converttitles=true&generator=random&grnfilterredir=nonredirects&grnlimit=1&grnnamespace=' + encodeURIComponent( namespace[0] ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.general ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random', querystring, fragment) + '>' + spoiler );
			}
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		wiki.updateWiki(body.query.general);
		logging(wiki, msg.guildId, 'random');
		if ( !body.query.pages ) {
			var title = 'Special:Random';
			if ( namespace[0] !== '0' && namespace[0].split('|').length === 1 ) title += '/' + namespace[1];
			var pagelink = wiki.toLink(title, querystring, fragment);
			var embed = null;
			if ( msg.showEmbed() && !noEmbed ) {
				embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(title) ).setURL( pagelink ).setThumbnail( new URL(body.query.general.logo, wiki).href );
				if ( body.query.allmessages?.[0]?.['*']?.trim?.() ) {
					let displaytitle = escapeFormatting(body.query.allmessages[0]['*'].trim());
					if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
					embed.setTitle( displaytitle );
				}
				if ( body.query.allmessages?.[1]?.['*']?.trim?.() ) {
					var description = toMarkdown(body.query.allmessages[1]['*'], wiki, title, true);
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.setDescription( description );
				}
			}
			msg.sendChannel( {content: spoiler + '<' + pagelink + '>' + spoiler, embeds: [embed]} );
			
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		var querypage = Object.values(body.query.pages)[0];
		var pagelink = wiki.toLink(querypage.title, querystring, fragment);
		var text = '';
		var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
		if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
			var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
			if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
			embed.setTitle( displaytitle );
		}
		if ( querypage.extract ) {
			var extract = extract_desc(querypage.extract, fragment);
			embed.backupDescription = extract[0];
			if ( extract[1].length && extract[2].length ) {
				embed.backupField = {name: extract[1], value: extract[2]};
			}
		}
		if ( querypage.pageprops && querypage.pageprops.description ) {
			var description = htmlToDiscord( querypage.pageprops.description );
			if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
			embed.backupDescription = description;
		}
		if ( querypage.ns === 6 ) {
			var pageimage = ( querypage?.original?.source || wiki.toLink('Special:FilePath/' + querypage.title, {version:Date.now()}) );
			if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.title.toLowerCase()) ) embed.setImage( pageimage );
		}
		else if ( querypage.title === body.query.general.mainpage ) {
			embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
		}
		else if ( querypage.pageimage && querypage.original ) {
			embed.setThumbnail( querypage.original.source );
		}
		else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
			embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
		}
		else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
		if ( querypage.categoryinfo ) {
			var category = [lang.get('search.category.content')];
			if ( querypage.categoryinfo.size === 0 ) {
				category.push(lang.get('search.category.empty'));
			}
			if ( querypage.categoryinfo.pages > 0 ) {
				category.push(lang.get('search.category.pages', querypage.categoryinfo.pages.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.pages));
			}
			if ( querypage.categoryinfo.files > 0 ) {
				category.push(lang.get('search.category.files', querypage.categoryinfo.files.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.files));
			}
			if ( querypage.categoryinfo.subcats > 0 ) {
				category.push(lang.get('search.category.subcats', querypage.categoryinfo.subcats.toLocaleString(lang.get('dateformat')), querypage.categoryinfo.subcats));
			}
			if ( msg.showEmbed() && !noEmbed ) embed.addFields( {name: category[0], value: category.slice(1).join('\n')} );
			else text += '\n\n' + category.join('\n');
		}
		
		return parse_page(lang, msg, '🎲 ' + spoiler + '<' + pagelink + '>' + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, ( querypage.title === body.query.general.mainpage ? '' : new URL(body.query.general.logo, wiki).href ), fragment, pagelink);
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random', querystring, fragment) + '>' + spoiler );
		}
		if ( reaction ) reaction.removeEmoji();
	} );
}
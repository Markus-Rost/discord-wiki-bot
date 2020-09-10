const cheerio = require('cheerio');

const removeClasses = [
	'table',
	'div',
	'script',
	'input',
	'style',
	'ul.gallery',
	'.mw-editsection',
	'sup.reference',
	'ol.references',
	'.error',
	'.nomobile',
	'.noprint',
	'.noexcerpt',
	'.sortkey'
];

const keepMainPageTag = [
	'div.main-page-tag-lcs',
	'div.lcs-container'
];

/**
 * Parses a wiki page to get it's description.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The title of the page.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the page.
 * @param {import('../util/wiki.js')} wiki - The wiki for the page.
 * @param {String} thumbnail - The default thumbnail for the wiki.
 */
function parse_page(msg, title, embed, wiki, thumbnail) {
	if ( !msg || ( embed.description && embed.thumbnail?.url !== thumbnail ) ) return;
	got.get( wiki + 'api.php?action=parse&prop=text|images|parsewarnings&section=0&disablelimitreport=true&disableeditsection=true&disabletoc=true&page=' + encodeURIComponent( title ) + '&format=json' ).then( response => {
		if ( response?.body?.parse?.parsewarnings?.length ) log_warn(response.body.parse.parsewarnings);
		if ( response.statusCode !== 200 || !response?.body?.parse?.text ) {
			console.log( '- ' + response.statusCode + ': Error while parsing the page: ' + response?.body?.error?.info );
			return;
		}
		var change = false;
		var $ = cheerio.load(response.body.parse.text['*']);
		if ( embed.thumbnail?.url === thumbnail ) {
			var image = response.body.parse.images.find( pageimage => ( /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) && pageimage.toLowerCase().includes( title.toLowerCase().replace( / /g, '_' ) ) ) );
			if ( !image ) {
				thumbnail = $('img').filter( (i, img) => {
					img = $(img).prop('src')?.toLowerCase();
					return ( /^(?:https?:)?\/\//.test(img) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/.test(img) );
				} ).first().prop('src');
				if ( !thumbnail ) image = response.body.parse.images.find( pageimage => ( /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) ) );
			}
			if ( image ) thumbnail = wiki.toLink('Special:FilePath/' + image);
			if ( thumbnail ) {
				embed.setThumbnail( thumbnail.replace( /^(?:https?:)?\/\//, 'https://' ) );
				change = true;
			}
		}
		if ( !embed.description ) {
			$('h1, h2, h3, h4, h5, h6').nextAll().remove();
			$('h1, h2, h3, h4, h5, h6').remove();
			$(removeClasses.join(', '), $('.mw-parser-output')).not(keepMainPageTag.join(', ')).remove();
			var description = $.text().trim().replace( /\n{3,}/g, '\n\n' ).escapeFormatting();
			if ( description ) {
				if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
				embed.setDescription( description );
				change = true;
			}
		}
		
		if ( change ) msg.edit( msg.content, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
	}, error => {
		console.log( '- Error while parsing the page: ' + error );
	} );
}

module.exports = parse_page;
const cheerio = require('cheerio');
const {htmlToPlain} = require('../util/functions.js');

const infoboxList = [
	'.infobox',
	'.portable-infobox',
	'.infoboxtable',
	'.notaninfobox'
];

const removeClasses = [
	'table',
	'div',
	'script',
	'input',
	'style',
	'script',
	'noscript',
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
	if ( !msg || ( embed.description && embed.thumbnail?.url !== thumbnail && !embed.brokenInfobox ) ) {
		return;
	}
	got.get( wiki + 'api.php?action=parse&prop=text|images&section=0&disablelimitreport=true&disableeditsection=true&disabletoc=true&sectionpreview=true&page=' + encodeURIComponent( title ) + '&format=json' ).then( response => {
		if ( response.statusCode !== 200 || !response?.body?.parse?.text ) {
			console.log( '- ' + response.statusCode + ': Error while parsing the page: ' + response?.body?.error?.info );
			return;
		}
		var change = false;
		var $ = cheerio.load(response.body.parse.text['*'].replace( /<br\/?>/g, '\n' ));
		if ( embed.brokenInfobox && $('aside.portable-infobox').length ) {
			var infobox = $('aside.portable-infobox');
			embed.fields.forEach( field => {
				if ( embed.length > 5500 ) return;
				if ( /^`.+`$/.test(field.name) ) {
					let label = infobox.find(field.name.replace( /^`(.+)`$/, '[data-source="$1"] .pi-data-label, .pi-data-label[data-source="$1"]' )).html();
					label = htmlToPlain(label).trim();
					if ( label.length > 50 ) label = label.substring(0, 50) + '\u2026';
					if ( label ) field.name = label;
				}
				if ( /^`.+`$/.test(field.value) ) {
					let value = infobox.find(field.value.replace( /^`(.+)`$/, '[data-source="$1"] .pi-data-value, .pi-data-value[data-source="$1"]' )).html();
					value = htmlToPlain(value).trim();
					if ( value.length > 250 ) value = value.substring(0, 250) + '\u2026';
					if ( value ) field.value = value;
				}
			} );
			change = true;
		}
		if ( embed.thumbnail?.url === thumbnail ) {
			var image = response.body.parse.images.find( pageimage => ( /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) && pageimage.toLowerCase().includes( title.toLowerCase().replace( / /g, '_' ) ) ) );
			if ( !image ) {
				thumbnail = $(infoboxList.join(', ')).find('img').filter( (i, img) => {
					img = $(img).prop('src')?.toLowerCase();
					return ( /^(?:https?:)?\/\//.test(img) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/.test(img) );
				} ).first().prop('src');
				if ( !thumbnail ) thumbnail = $('img').filter( (i, img) => {
					img = $(img).prop('src')?.toLowerCase();
					return ( /^(?:https?:)?\/\//.test(img) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/.test(img) );
				} ).first().prop('src');
				if ( !thumbnail ) image = response.body.parse.images.find( pageimage => {
					return /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase());
				} );
			}
			if ( image ) thumbnail = wiki.toLink('Special:FilePath/' + image);
			if ( thumbnail ) {
				embed.setThumbnail( thumbnail.replace( /^(?:https?:)?\/\//, 'https://' ) );
				change = true;
			}
		}
		if ( !embed.description && embed.length < 5000 ) {
			$('h1, h2, h3, h4, h5, h6').nextAll().remove();
			$('h1, h2, h3, h4, h5, h6').remove();
			$(infoboxList.join(', ')).remove();
			$(removeClasses.join(', '), $('.mw-parser-output')).not(keepMainPageTag.join(', ')).remove();
			var description = $.text().trim().replace( /\n{3,}/g, '\n\n' ).escapeFormatting();
			if ( description ) {
				if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
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
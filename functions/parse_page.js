const cheerio = require('cheerio');
const {toSection} = require('../util/wiki.js');
const {htmlToPlain, htmlToDiscord, limitLength} = require('../util/functions.js');

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
 * @param {String} [fragment] - The section title to embed.
 */
function parse_page(msg, title, embed, wiki, thumbnail, fragment = '') {
	if ( !msg || ( embed.description && embed.thumbnail?.url !== thumbnail && !embed.brokenInfobox && !fragment ) ) {
		return;
	}
	var change = false;
	got.get( wiki + 'api.php?action=parse&prop=text|images' + ( fragment ? '' : '&section=0' ) + '&disablelimitreport=true&disableeditsection=true&disabletoc=true&sectionpreview=true&page=' + encodeURIComponent( title ) + '&format=json' ).then( response => {
		if ( response.statusCode !== 200 || !response?.body?.parse?.text ) {
			console.log( '- ' + response.statusCode + ': Error while parsing the page: ' + response?.body?.error?.info );
			if ( embed.backupDescription && embed.length < 5000 ) {
				embed.setDescription( embed.backupDescription );
				change = true;
			}
			if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
				change = true;
			}
			return;
		}
		var $ = cheerio.load(response.body.parse.text['*'].replace( /<br\/?>/g, '\n' ));
		if ( embed.brokenInfobox && $('aside.portable-infobox').length ) {
			var infobox = $('aside.portable-infobox');
			embed.fields.forEach( field => {
				if ( embed.length > 5400 ) return;
				if ( /^`.+`$/.test(field.name) ) {
					let label = infobox.find(field.name.replace( /^`(.+)`$/, '[data-source="$1"] .pi-data-label, .pi-data-label[data-source="$1"]' )).html();
					if ( !label ) label = infobox.find(field.name.replace( /^`(.+)`$/, '[data-item-name="$1"] .pi-data-label, .pi-data-label[data-item-name="$1"]' )).html();
					if ( label ) {
						label = htmlToPlain(label).trim();
						if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
						if ( label ) field.name = label;
					}
				}
				if ( /^`.+`$/.test(field.value) ) {
					let value = infobox.find(field.value.replace( /^`(.+)`$/, '[data-source="$1"] .pi-data-value, .pi-data-value[data-source="$1"]' )).html();
					if ( !value ) value = infobox.find(field.value.replace( /^`(.+)`$/, '[data-item-name="$1"] .pi-data-value, .pi-data-value[data-item-name="$1"]' )).html();
					if ( value ) {
						value = htmlToDiscord(value, wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
						if ( value.length > 500 ) value = limitLength(value, 500, 250);
						if ( value ) field.value = value;
					}
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
		if ( fragment && embed.length < 4750 && embed.fields.length < 25 &&
		toSection(embed.fields[0]?.name.replace( /^\**_*(.*?)_*\**$/g, '$1' )) !== toSection(fragment) ) {
			var section = $('h1, h2, h3, h4, h5, h6').children('span').filter( (i, span) => {
				return ( '#' + span.attribs.id === toSection(fragment) );
			} ).parent();
			if ( section.length ) {
				var sectionLevel = section[0].tagName.replace('h', '');
				var sectionContent = $('<div>').append(
					section.nextUntil(['h1','h2','h3','h4','h5','h6'].slice(0, sectionLevel).join(', '))
				);
				section.find(removeClasses.join(', ')).remove();
				sectionContent.find(infoboxList.join(', ')).remove();
				sectionContent.find(removeClasses.join(', ')).remove();
				var name = htmlToPlain(section).trim();
				if ( name.length > 250 ) name = name.substring(0, 250) + '\u2026';
				var value = htmlToDiscord(sectionContent, wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
				if ( value.length > 1000 ) value = limitLength(value, 1000, 20);
				if ( name.length && value.length ) {
					embed.spliceFields( 0, 0, {name, value} );
					change = true;
				}
				else if ( embed.backupField ) {
					embed.spliceFields( 0, 0, embed.backupField );
					change = true;
				}
			}
			else if ( embed.backupField ) {
				embed.spliceFields( 0, 0, embed.backupField );
				change = true;
			}
		}
		if ( !embed.description && embed.length < 5000 ) {
			$('h1, h2, h3, h4, h5, h6').nextAll().remove();
			$('h1, h2, h3, h4, h5, h6').remove();
			$(infoboxList.join(', ')).remove();
			$(removeClasses.join(', '), $('.mw-parser-output')).not(keepMainPageTag.join(', ')).remove();
			var description = htmlToDiscord($.html(), wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
			if ( description ) {
				if ( description.length > 1000 ) description = limitLength(description, 1000, 500);
				embed.setDescription( description );
				change = true;
			}
			else if ( embed.backupDescription ) {
				embed.setDescription( embed.backupDescription );
				change = true;
			}
		}
	}, error => {
		console.log( '- Error while parsing the page: ' + error );
		if ( embed.backupDescription && embed.length < 5000 ) {
			embed.setDescription( embed.backupDescription );
			change = true;
		}
		if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
			embed.spliceFields( 0, 0, embed.backupField );
			change = true;
		}
	} ).finally( () => {
		if ( change ) msg.edit( msg.content, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
	} );
}

module.exports = parse_page;
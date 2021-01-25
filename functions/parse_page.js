const cheerio = require('cheerio');
const {toSection} = require('../util/wiki.js');
const {htmlToPlain, htmlToDiscord, limitLength} = require('../util/functions.js');

// Max length of 10 characters
const contentModels = {
	Scribunto: 'lua',
	javascript: 'js',
	json: 'json',
	css: 'css'
};

const contentFormats = {
	'application/json': 'json',
	'text/javascript': 'js',
	'text/css': 'css'
};
// Max length of 10 characters

const infoboxList = [
	'.infobox',
	'.portable-infobox',
	'.infoboxtable',
	'.notaninfobox',
	'.tpl-infobox'
];

const removeClasses = [
	'table',
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
 * @param {String} content - The content for the message.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the message.
 * @param {import('../util/wiki.js')} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {Object} querypage - The details of the page.
 * @param {String} querypage.title - The title of the page.
 * @param {String} querypage.contentmodel - The content model of the page.
 * @param {String} thumbnail - The default thumbnail for the wiki.
 * @param {String} [fragment] - The section title to embed.
 */
function parse_page(msg, content, embed, wiki, reaction, {title, contentmodel}, thumbnail, fragment = '') {
	if ( !msg?.showEmbed?.() || ( embed.description && embed.thumbnail?.url !== thumbnail && !embed.brokenInfobox && !fragment ) ) {
		msg.sendChannel( content, {embed} );

		if ( reaction ) reaction.removeEmoji();
		return;
	}
	if ( contentmodel !== 'wikitext' ) return got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=content&rvslots=main&converttitles=true&titles=%1F' + encodeURIComponent( title ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		var revision = Object.values(( body?.query?.pages || {} ))?.[0]?.revisions?.[0];
		revision = ( revision?.slots?.main || revision );
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !revision?.['*'] ) {
			console.log( '- ' + response.statusCode + ': Error while getting the page content: ' + ( body && body.error && body.error.info ) );
			if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			if ( embed.backupDescription && embed.length < 5000 ) {
				embed.setDescription( embed.backupDescription );
			}
			return;
		}
		if ( !embed.description && embed.length < 4000 ) {
			var description = revision['*'];
			var regex = /^L(\d+)(?:-L?(\d+))?$/.exec(fragment);
			if ( regex ) {
				let descArray = description.split('\n').slice(regex[1] - 1, ( regex[2] || regex[1] ));
				if ( descArray.length ) {
					description = descArray.join('\n').replace( /^\n+/, '' ).replace( /\n+$/, '' );
					if ( description ) {
						if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
						description = '```' + ( contentModels[revision.contentmodel] || contentFormats[revision.contentformat] || '' ) + '\n' + description + '\n```';
						embed.setDescription( description );
					}
				}
			}
			else if ( description.trim() ) {
				description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
				if ( description.length > 500 ) description = description.substring(0, 500) + '\u2026';
				description = '```' + ( contentModels[revision.contentmodel] || contentFormats[revision.contentformat] || '' ) + '\n' + description + '\n```';
				embed.setDescription( description );
			}
			else if ( embed.backupDescription ) {
				embed.setDescription( embed.backupDescription );
			}
		}
	}, error => {
		console.log( '- Error while getting the page content: ' + error );
		if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
			embed.spliceFields( 0, 0, embed.backupField );
		}
		if ( embed.backupDescription && embed.length < 5000 ) {
			embed.setDescription( embed.backupDescription );
		}
	} ).finally( () => {
		msg.sendChannel( content, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
	} );
	got.get( wiki + 'api.php?action=parse&prop=text|images' + ( fragment ? '' : '&section=0' ) + '&disablelimitreport=true&disableeditsection=true&disabletoc=true&sectionpreview=true&page=' + encodeURIComponent( title ) + '&format=json' ).then( response => {
		if ( response.statusCode !== 200 || !response?.body?.parse?.text ) {
			console.log( '- ' + response.statusCode + ': Error while parsing the page: ' + response?.body?.error?.info );
			if ( embed.backupDescription && embed.length < 5000 ) {
				embed.setDescription( embed.backupDescription );
			}
			if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			return;
		}
		var $ = cheerio.load(response.body.parse.text['*'].replace( /<br\/?>/g, '\n' ));
		if ( embed.brokenInfobox && $('aside.portable-infobox').length ) {
			let infobox = $('aside.portable-infobox');
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
		}
		if ( !fragment && !embed.fields.length && $(infoboxList.join(', ')).length ) {
			let infobox = $(infoboxList.join(', ')).first();
			if ( embed.thumbnail?.url === thumbnail ) {
				let image = infobox.find([
					'tr:eq(1) img',
					'div.images img',
					'figure.pi-image img',
					'div.infobox-imagearea img'
				].join(', ')).toArray().find( img => {
					let imgURL = img.attribs.src;
					if ( !imgURL ) return false;
					return ( /^(?:https?:)?\/\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
				} )?.attribs.src?.replace( /^(?:https?:)?\/\//, 'https://' );
				if ( image ) embed.setThumbnail( new URL(image, wiki).href );
			}
			let rows = infobox.find([
				'> tbody > tr',
				'> table > tbody > tr',
				'div.section > div.title',
				'div.section > table > tbody > tr',
				'h2.pi-header',
				'div.pi-data',
				'table.infobox-rows > tbody > tr'
			].join(', '));
			let tdLabel = true;
			for ( let i = 0; i < rows.length; i++ ) {
				if ( embed.fields.length >= 25 || embed.length > 5400 ) break;
				let row = rows.eq(i);
				if ( row.is('tr, div.pi-data') ) {
					let label = row.children(( tdLabel ? 'td, ' : '' ) + 'th, h3.pi-data-label').eq(0);
					label.find(removeClasses.join(', ')).remove();
					let value = row.children('td, div.pi-data-value').eq(( label.is('td') ? 1 : 0 ));
					value.find(removeClasses.join(', ')).remove();
					if ( !label.is('td') && label.html()?.trim() && value.html()?.trim() ) tdLabel = false;
					label = htmlToPlain(label).trim().split('\n')[0];
					value = htmlToDiscord(value, wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
					if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
					if ( value.length > 500 ) value = limitLength(value, 500, 250);
					if ( label && value ) embed.addField( label, value, true );
				}
				else if ( row.is('div.title, h2.pi-header') ) {
					row.find(removeClasses.join(', ')).remove();
					let label = htmlToPlain(row).trim();
					if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
					if ( label ) {
						if ( embed.fields.length && embed.fields[embed.fields.length - 1].name === '\u200b' ) {
							embed.spliceFields( embed.fields.length - 1, 1, {
								name: '\u200b',
								value: '**' + label + '**',
								inline: false
							} );
						}
						else embed.addField( '\u200b', '**' + label + '**', false );
					}
				}
			}
			if ( embed.fields.length && embed.fields[embed.fields.length - 1].name === '\u200b' ) {
				embed.spliceFields( embed.fields.length - 1, 1 );
			}
		}
		if ( embed.thumbnail?.url === thumbnail ) {
			let image = response.body.parse.images.find( pageimage => ( /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) && pageimage.toLowerCase().includes( title.toLowerCase().replace( / /g, '_' ) ) ) );
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
			if ( thumbnail ) embed.setThumbnail( thumbnail.replace( /^(?:https?:)?\/\//, 'https://' ) );
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
				section.find('div, ' + removeClasses.join(', ')).remove();
				sectionContent.find(infoboxList.join(', ')).remove();
				sectionContent.find('div, ' + removeClasses.join(', ')).remove();
				var name = htmlToPlain(section).trim();
				if ( name.length > 250 ) name = name.substring(0, 250) + '\u2026';
				var value = htmlToDiscord(sectionContent, wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
				if ( value.length > 1000 ) value = limitLength(value, 1000, 20);
				if ( name.length && value.length ) {
					embed.spliceFields( 0, 0, {name, value} );
				}
				else if ( embed.backupField ) {
					embed.spliceFields( 0, 0, embed.backupField );
				}
			}
			else if ( embed.backupField ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
		}
		if ( !embed.description && embed.length < 5000 ) {
			$('h1, h2, h3, h4, h5, h6').nextAll().remove();
			$('h1, h2, h3, h4, h5, h6').remove();
			$(infoboxList.join(', ')).remove();
			$('div, ' + removeClasses.join(', '), $('.mw-parser-output')).not(keepMainPageTag.join(', ')).remove();
			var description = htmlToDiscord($.html(), wiki.articleURL.href, true).trim().replace( /\n{3,}/g, '\n\n' );
			if ( description ) {
				if ( description.length > 1000 ) description = limitLength(description, 1000, 500);
				embed.setDescription( description );
			}
			else if ( embed.backupDescription ) {
				embed.setDescription( embed.backupDescription );
			}
		}
	}, error => {
		console.log( '- Error while parsing the page: ' + error );
		if ( embed.backupDescription && embed.length < 5000 ) {
			embed.setDescription( embed.backupDescription );
		}
		if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
			embed.spliceFields( 0, 0, embed.backupField );
		}
	} ).finally( () => {
		msg.sendChannel( content, {embed} );

		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = parse_page;
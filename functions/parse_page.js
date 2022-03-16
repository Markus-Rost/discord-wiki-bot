import cheerio from 'cheerio';
import { MessageEmbed } from 'discord.js';
import { toSection } from '../util/wiki.js';
import { got, parse_infobox, htmlToPlain, htmlToDiscord, escapeFormatting, limitLength } from '../util/functions.js';

const parsedContentModels = [
	'wikitext',
	'wikibase-item',
	'wikibase-lexeme',
	'wikibase-property'
];

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
	'figure',
	'script',
	'input',
	'style',
	'script',
	'noscript',
	'ul.gallery',
	'.mw-editsection',
	'sup.reference',
	'ol.references',
	'.thumb',
	'.error',
	'.nomobile',
	'.noprint',
	'.noexcerpt',
	'.sortkey',
	'.mw-collapsible.mw-collapsed',
	'wb\\:sectionedit'
];

const removeClassesExceptions = [
	'div.main-page-tag-lcs',
	'div.lcs-container',
	'div.mw-highlight',
	'div.poem',
	'div.hlist',
	'div.treeview',
	'div.redirectMsg',
	'div.introduction',
	'div.wikibase-entityview',
	'div.wikibase-entityview-main',
	'div.wikibase-entitytermsview',
	'div.wikibase-entitytermsview-heading',
	'div.wikibase-entitytermsview-heading-description',
	'div#wb-lexeme-header',
	'div#wb-lexeme-header div:not([class]):not([id])',
	'div.language-lexical-category-widget'
];

/**
 * Parses a wiki page to get it's description.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} content - The content for the message.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the message.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {Object} querypage - The details of the page.
 * @param {Number} querypage.ns - The namespace of the page.
 * @param {String} querypage.title - The title of the page.
 * @param {String} querypage.contentmodel - The content model of the page.
 * @param {String} querypage.pagelanguage - The language of the page.
 * @param {String} [querypage.missing] - If the page doesn't exist.
 * @param {String} [querypage.known] - If the page is known.
 * @param {Object} [querypage.pageprops] - The properties of the page.
 * @param {String} [querypage.pageprops.infoboxes] - The JSON data for portable infoboxes on the page.
 * @param {String} [querypage.pageprops.disambiguation] - The disambiguation property of the page.
 * @param {String} [querypage.pageprops.uselang] - The language of the page description.
 * @param {Boolean} [querypage.pageprops.noRedirect] - If the page is allowed to be redirected.
 * @param {String} [thumbnail] - The default thumbnail for the wiki.
 * @param {String} [fragment] - The section title to embed.
 * @param {String} [pagelink] - The link to the page.
 * @returns {Promise<import('discord.js').Message>} The edited message.
 */
export default function parse_page(lang, msg, content, embed, wiki, reaction, {ns, title, contentmodel, pagelanguage, missing, known, pageprops: {infoboxes, disambiguation} = {}, uselang = lang.lang, noRedirect = false}, thumbnail = '', fragment = '', pagelink = '') {
	if ( reaction ) reaction.removeEmoji();
	if ( !msg?.showEmbed?.() || ( missing !== undefined && ( ns !== 8 || known === undefined ) ) || !embed || embed.description ) {
		if ( missing !== undefined && embed ) {
			if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			if ( embed.backupDescription && embed.length < 5000 ) {
				embed.setDescription( embed.backupDescription );
			}
		}
		return msg.sendChannel( {content: content, embeds: [embed]} );
	}
	return msg.sendChannel( {
		content,
		embeds: [new MessageEmbed(embed).setDescription( '<a:loading:641343250661113886> **' + lang.get('search.loading') + '**' )]
	} ).then( message => {
		if ( !message ) return;
		if ( ns === 8 ) {
			title = title.split(':').slice(1).join(':');
			if ( title.endsWith( '/' + pagelanguage ) ) title = title.substring(0, title.length - ( pagelanguage.length + 1 ));
			return got.get( wiki + 'api.php?action=query&meta=allmessages&amprop=default&amincludelocal=true&amlang=' + encodeURIComponent( pagelanguage ) + '&ammessages=' + encodeURIComponent( title ) + '&format=json', {
				timeout: {
					request: 10_000
				}
			} ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query?.allmessages?.[0] ) {
					console.log( '- ' + response.statusCode + ': Error while getting the system message: ' + body?.error?.info );
					if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
						embed.spliceFields( 0, 0, embed.backupField );
					}
					if ( embed.backupDescription && embed.length < 5000 ) {
						embed.setDescription( embed.backupDescription );
					}
					return;
				}
				if ( !embed.description && embed.length < 4000 ) {
					var description = body.query.allmessages[0]['*'];
					var regex = /^L(\d+)(?:-L?(\d+))?$/.exec(fragment);
					if ( regex ) {
						let descArray = description.split('\n').slice(regex[1] - 1, ( regex[2] || regex[1] ));
						if ( descArray.length ) {
							description = descArray.join('\n').replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description ) {
								if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
								description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
								embed.setDescription( description );
							}
						}
					}
					else {
						let defaultDescription = body.query.allmessages[0].default;
						if ( description.trim() ) {
							description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description.length > 500 ) description = description.substring(0, 500) + '\u2026';
							description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
							embed.setDescription( description );
						}
						else if ( embed.backupDescription ) {
							embed.setDescription( embed.backupDescription );
						}
						if ( defaultDescription?.trim() ) {
							defaultDescription = defaultDescription.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( defaultDescription.length > 250 ) defaultDescription = defaultDescription.substring(0, 250) + '\u2026';
							defaultDescription = '```' + ( contentModels[contentmodel] || '' ) + '\n' + defaultDescription + '\n```';
							embed.addField( lang.get('search.messagedefault'), defaultDescription );
						}
						else if ( body.query.allmessages[0].defaultmissing !== undefined ) {
							embed.addField( lang.get('search.messagedefault'), lang.get('search.messagedefaultnone') );
						}
					}
				}
			}, error => {
				console.log( '- Error while getting the system message: ' + error );
				if ( embed.backupField && embed.length < 4750 && embed.fields.length < 25 ) {
					embed.spliceFields( 0, 0, embed.backupField );
				}
				if ( embed.backupDescription && embed.length < 5000 ) {
					embed.setDescription( embed.backupDescription );
				}
			} ).then( () => {
				return message.edit( {content, embeds: [embed]} ).catch(log_error);
			} );
		}
		if ( !parsedContentModels.includes( contentmodel ) ) return got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=content&rvslots=main&converttitles=true&titles=%1F' + encodeURIComponent( title ) + '&format=json', {
			timeout: {
				request: 10_000
			}
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warning(body.warnings);
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
		} ).then( () => {
			return message.edit( {content, embeds: [embed]} ).catch(log_error);
		} );
		if ( !fragment && !embed.fields.length && infoboxes ) {
			try {
				var infobox = JSON.parse(infoboxes)?.[0];
				parse_infobox(infobox, embed, thumbnail, embed.url);
			}
			catch ( error ) {
				console.log( '- Failed to parse the infobox: ' + error );
			}
		}
		let extraImages = [];
		return got.get( wiki + 'api.php?uselang=' + uselang + '&action=parse' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=text|images|displaytitle' + ( contentmodel !== 'wikitext' || fragment || disambiguation !== undefined ? '' : '&section=0' ) + '&disablelimitreport=true&disableeditsection=true&disabletoc=true&sectionpreview=true&page=' + encodeURIComponent( title ) + '&format=json', {
			timeout: {
				request: 10_000
			}
		} ).then( response => {
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
			if ( !embed.forceTitle ) {
				var displaytitle = htmlToDiscord( response.body.parse.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				embed.setTitle( displaytitle );
			}
			var $ = cheerio.load(response.body.parse.text['*'].replace( /\n?<br(?: ?\/)?>\n?/g, '<br>' ));
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
							value = htmlToDiscord(value, embed.url).trim().replace( /\n{3,}/g, '\n\n' );
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
					'> tbody > tr > th.mainheader',
					'> tbody > tr > th.infobox-header',
					'> table > tbody > tr',
					'div.section > div.title',
					'div.section > table > tbody > tr',
					'h2.pi-header',
					'div.pi-data',
					'table.infobox-rows > tbody > tr',
					'div.infobox-rows:not(.subinfobox) > div.infobox-row'
				].join(', '));
				let tdLabel = true;
				for ( let i = 0; i < rows.length; i++ ) {
					if ( embed.fields.length >= 25 || embed.length > 5400 ) break;
					let row = rows.eq(i);
					if ( row.is('th.mainheader, th.infobox-header, div.title, h2.pi-header') ) {
						row.find(removeClasses.join(', ')).remove();
						let label = htmlToDiscord(row, embed.url).trim();
						if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
						if ( label ) {
							if ( !label.includes( '**' ) ) label = '**' + label + '**';
							if ( embed.fields.length && embed.fields[embed.fields.length - 1].name === '\u200b' ) {
								embed.spliceFields( embed.fields.length - 1, 1, {
									name: '\u200b',
									value: label,
									inline: false
								} );
							}
							else embed.addField( '\u200b', label, false );
						}
					}
					else if ( row.is('tr, div.pi-data, div.infobox-row') ) {
						let label = row.children(( tdLabel ? 'td, ' : '' ) + 'th, h3.pi-data-label, div.infobox-cell-header').eq(0);
						label.find(removeClasses.join(', ')).remove();
						let value = row.children('td, div.pi-data-value, div.infobox-cell-data').eq(( label.is('td') ? 1 : 0 ));
						value.find(removeClasses.join(', ')).remove();
						if ( !label.is('td') && label.html()?.trim() && value.html()?.trim() ) tdLabel = false;
						label = htmlToPlain(label).trim().split('\n')[0];
						value = htmlToDiscord(value, embed.url).trim().replace( /\n{3,}/g, '\n\n' );
						if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
						if ( value.length > 500 ) value = limitLength(value, 500, 250);
						if ( label && value ) embed.addField( label, value, true );
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
				let newFragment = '';
				let exactMatch = true;
				let allSections = $('h1, h2, h3, h4, h5, h6').children('span');
				var section = allSections.filter( (i, span) => {
					return ( '#' + span.attribs.id === toSection(fragment) );
				} ).parent();
				if ( !section.length ) {
					section = $('[id="' + toSection(fragment, false).replace( '#', '' ) + '"]');
					newFragment = section.attr('id');
					if ( section.is(':empty') ) {
						section = section.parent();
						if ( ['h1','h2','h3','h4','h5','h6'].includes( section.prev()[0]?.tagName ) ) {
							section = section.prev();
							if ( section.children('span').first().attr('id') ) {
								newFragment = section.children('span').first().attr('id');
							}
						}
					}
				}
				if ( !section.length ) exactMatch = false;
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( '#' + span.attribs.id?.toLowerCase() === toSection(fragment).toLowerCase() );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( $(span).parent().text().trim() === fragment );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( $(span).parent().text().trim().toLowerCase() === fragment.toLowerCase() );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return $(span).parent().text().toLowerCase().includes( fragment.toLowerCase() );
				} );
				if ( !exactMatch && section.length ) {
					newFragment = section.attr('id');
					section = section.parent();
				}
				if ( section.length ) {
					section = section.first();
					var sectionLevel = section[0].tagName.replace('h', '');
					if ( !['1','2','3','4','5','6'].includes( sectionLevel ) ) sectionLevel = '10';
					var sectionContent = $('<div>').append(
						section.nextUntil(['h1','h2','h3','h4','h5','h6'].slice(0, sectionLevel).join(', '))
					);
					section.find('div, ' + removeClasses.join(', ')).remove();
					extraImages.push(...new Set([
						...sectionContent.find(infoboxList.join(', ')).find([
							'tr:eq(1) img',
							'div.images img',
							'figure.pi-image img',
							'div.infobox-imagearea img'
						].join(', ')).toArray(),
						...sectionContent.find([
							'ul.gallery > li.gallerybox img',
							'div.wikia-gallery > div.wikia-gallery-item img',
							'div.ogv-gallery > div.ogv-gallery-item img'
						].join(', ')).toArray()
					].filter( img => {
						let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
						if ( !imgURL ) return false;
						return ( /^(?:https?:)?\/\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
					} ).map( img => {
						if ( img.attribs['data-image-name']?.endsWith( '.gif' ) ) return wiki.toLink('Special:FilePath/' + img.attribs['data-image-name']);
						let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
						imgURL = imgURL.replace( /\/thumb(\/[\da-f]\/[\da-f]{2}\/([^\/]+))\/\d+px-\2/, '$1' ).replace( /\/scale-to-width-down\/\d+/, '' );
						return new URL(imgURL.replace( /^(?:https?:)?\/\//, 'https://' ), wiki).href;
					} )));
					sectionContent.find(infoboxList.join(', ')).remove();
					sectionContent.find('div, ' + removeClasses.join(', ')).not(removeClassesExceptions.join(', ')).remove();
					var name = htmlToPlain(section).trim();
					if ( !name.length ) name = escapeFormatting(fragment);
					if ( name.length > 250 ) name = name.substring(0, 250) + '\u2026';
					var value = htmlToDiscord(sectionContent, embed.url).trim().replace( /\n{3,}/g, '\n\n' );
					if ( value.length > 1000 ) value = limitLength(value, 1000, 20);
					if ( name.length && value.length ) {
						embed.spliceFields( 0, 0, {name, value} );
						if ( newFragment ) {
							embed.setURL( pagelink.replace( toSection(fragment), toSection(newFragment) ) );
							content = content.replace( '<' + pagelink + '>', '<' + embed.url + '>' );
						}
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
				if ( contentmodel !== 'wikitext' || disambiguation === undefined || fragment ) {
					$('h1, h2, h3, h4, h5, h6').nextAll().remove();
					$('h1, h2, h3, h4, h5, h6').remove();
				}
				$(infoboxList.join(', ')).remove();
				$('div, ' + removeClasses.join(', '), $('.mw-parser-output')).not(removeClassesExceptions.join(', ')).remove();
				var description = htmlToDiscord($.html(), embed.url, true).trim().replace( /\n{3,}/g, '\n\n' );
				if ( description ) {
					if ( disambiguation !== undefined && !fragment && embed.length < 4250 ) {
						if ( description.length > 1500 ) description = limitLength(description, 1500, 250);
					}
					else if ( fragment && description.length > 500 ) description = limitLength(description, 500, 250);
					else if ( description.length > 1000 ) description = limitLength(description, 1000, 500);
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
		} ).then( () => {
			let embeds = [embed];
			if ( extraImages.length ) {
				if ( !embed.image ) embed.setImage( extraImages.shift() );
				extraImages.slice(0, 10).forEach( extraImage => {
					let imageEmbed = new MessageEmbed().setURL( embed.url ).setImage( extraImage );
					if ( embeds.length < 5 && embeds.reduce( (acc, val) => acc + val.length, imageEmbed.length ) <= 5500 ) embeds.push(imageEmbed);
				} );
			}
			return message.edit( {content, embeds} ).catch(log_error);
		} );
	} );
}
import { load as cheerioLoad } from 'cheerio';
import { EmbedBuilder } from 'discord.js';
import { toSection } from '../util/wiki.js';
import { got, parse_infobox, isMessage, canShowEmbed, getEmbedLength, htmlToPlain, htmlToDiscord, escapeFormatting, limitLength } from '../util/functions.js';

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
	css: 'css',
	json: 'json',
	interactivemap: 'json'
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
	'.tpl-infobox',
	'.va-infobox',
	'.side-infobox',
	'table[class*="infobox"]'
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
	'.c-item-hoverbox__display',
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
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String} content - The content for the message.
 * @param {EmbedBuilder} embed - The embed for the message.
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
 * @returns {Promise<import('discord.js').Message|{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>} The edited message.
 */
export default function parse_page(lang, msg, content, embed, wiki, reaction, {ns, title, contentmodel, pagelanguage, missing, known, pageprops: {infoboxes, disambiguation} = {}, uselang = lang.lang, noRedirect = false}, thumbnail = '', fragment = '', pagelink = '') {
	if ( reaction ) reaction.removeEmoji();
	if ( !msg || !canShowEmbed(msg) || ( missing !== undefined && ( ns !== 8 || known === undefined ) ) || !embed || embed.data.description ) {
		if ( missing !== undefined && embed ) {
			if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
				embed.setDescription( embed.backupDescription );
			}
		}
		if ( isMessage(msg) ) return msg.sendChannel( {content, embeds: [embed]} );
		else return Promise.resolve( {message: {content, embeds: [embed]}} );
	}
	return ( isMessage(msg) ? msg.sendChannel( {
		content,
		embeds: [EmbedBuilder.from(embed).setDescription( WB_EMOJI.loading + ' **' + lang.get('search.loading') + '**' )]
	} ) : Promise.resolve(true) ).then( message => {
		if ( !message ) return;
		if ( ns === 8 ) {
			title = title.split(':').slice(1).join(':');
			if ( title.endsWith( '/' + pagelanguage ) ) title = title.substring(0, title.length - ( pagelanguage.length + 1 ));
			return got.get( wiki + 'api.php?action=query&meta=allmessages&amprop=default&amincludelocal=true&amlang=' + encodeURIComponent( pagelanguage ) + '&ammessages=' + encodeURIComponent( title ) + '&format=json', {
				timeout: {
					request: 10_000
				},
				context: {
					guildId: msg.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query?.allmessages?.[0] ) {
					console.log( '- ' + response.statusCode + ': Error while getting the system message: ' + body?.error?.info );
					if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
						embed.spliceFields( 0, 0, embed.backupField );
					}
					if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
						embed.setDescription( embed.backupDescription );
					}
					return;
				}
				if ( !embed.data.description && getEmbedLength(embed) < ( 5_990 - ( fragment ? 4_000 : 750 ) ) ) {
					var description = body.query.allmessages[0]['*'];
					var regex = /^L(\d+)(?:-L?(\d+))?$/.exec(fragment);
					if ( regex ) {
						let descArray = description.split('\n').slice(regex[1] - 1, ( regex[2] || regex[1] ));
						if ( descArray.length ) {
							description = descArray.join('\n').replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description ) {
								if ( description.length > 4_000 ) description = description.substring(0, 4_000) + '\u2026';
								description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
								embed.setDescription( description );
							}
						}
					}
					else {
						let defaultDescription = body.query.allmessages[0].default;
						if ( description.trim() ) {
							description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description.length > Math.min(500, SECTION_DESC_LENGTH) ) description = description.substring(0, Math.min(500, SECTION_DESC_LENGTH)) + '\u2026';
							description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
							embed.setDescription( description );
						}
						else if ( embed.backupDescription ) {
							embed.setDescription( embed.backupDescription );
						}
						if ( defaultDescription?.trim() ) {
							defaultDescription = defaultDescription.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( defaultDescription.length > Math.min(250, SECTION_DESC_LENGTH) ) defaultDescription = defaultDescription.substring(0, Math.min(250, SECTION_DESC_LENGTH)) + '\u2026';
							defaultDescription = '```' + ( contentModels[contentmodel] || '' ) + '\n' + defaultDescription + '\n```';
							embed.addFields( {name: lang.get('search.messagedefault'), value: defaultDescription} );
						}
						else if ( body.query.allmessages[0].defaultmissing !== undefined ) {
							embed.addFields( {name: lang.get('search.messagedefault'), value: lang.get('search.messagedefaultnone')} );
						}
					}
				}
			}, error => {
				console.log( '- Error while getting the system message: ' + error );
				if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
					embed.spliceFields( 0, 0, embed.backupField );
				}
				if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
					embed.setDescription( embed.backupDescription );
				}
			} ).then( () => {
				if ( isMessage(msg) ) return message.edit( {content, embeds: [embed]} ).catch(log_error);
				else return {message: {content, embeds: [embed]}};
			} );
		}
		if ( !parsedContentModels.includes( contentmodel ) ) return got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=content&rvslots=main&converttitles=true&titles=%1F' + encodeURIComponent( title.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
			timeout: {
				request: 10_000
			},
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warning(body.warnings);
			var revision = Object.values(( body?.query?.pages || {} ))?.[0]?.revisions?.[0];
			revision = ( revision?.slots?.main || revision );
			if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !revision?.['*'] ) {
				console.log( '- ' + response.statusCode + ': Error while getting the page content: ' + ( body && body.error && body.error.info ) );
				if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
					embed.spliceFields( 0, 0, embed.backupField );
				}
				if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
					embed.setDescription( embed.backupDescription );
				}
				return;
			}
			if ( !embed.data.description && getEmbedLength(embed) < ( 5_990 - ( fragment ? 4_000 : SECTION_DESC_LENGTH ) ) ) {
				var description = revision['*'];
				var regex = /^L-?(\d+)(?:-(?:L-?)?(\d+))?$/.exec(fragment);
				if ( regex ) {
					let descArray = description.split('\n').slice(regex[1] - 1, ( regex[2] || +regex[1] + 10 ));
					if ( descArray.length ) {
						description = descArray.join('\n').replace( /^\n+/, '' ).replace( /\n+$/, '' );
						if ( description ) {
							if ( description.length > 4_000 ) description = description.substring(0, 4_000) + '\u2026';
							description = '```' + ( contentModels[revision.contentmodel] || contentFormats[revision.contentformat] || '' ) + '\n' + description + '\n```';
							embed.setDescription( description );
						}
					}
				}
				else if ( description.trim() ) {
					description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
					if ( description.length > SECTION_DESC_LENGTH ) description = description.substring(0, SECTION_DESC_LENGTH) + '\u2026';
					description = '```' + ( contentModels[revision.contentmodel] || contentFormats[revision.contentformat] || '' ) + '\n' + description + '\n```';
					embed.setDescription( description );
				}
				else if ( embed.backupDescription ) {
					embed.setDescription( embed.backupDescription );
				}
			}
		}, error => {
			console.log( '- Error while getting the page content: ' + error );
			if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
				embed.setDescription( embed.backupDescription );
			}
		} ).then( () => {
			if ( isMessage(msg) ) return message.edit( {content, embeds: [embed]} ).catch(log_error);
			else return {message: {content, embeds: [embed]}};
		} );
		if ( !fragment && !embed.data.fields?.length && infoboxes ) {
			try {
				var infobox = JSON.parse(infoboxes)?.[0];
				parse_infobox(infobox, embed, thumbnail, embed.data.url);
			}
			catch ( error ) {
				console.log( '- Failed to parse the infobox: ' + error );
			}
		}
		let extraImages = [];
		return got.get( wiki + 'api.php?uselang=' + uselang + '&action=parse' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=text|images|displaytitle&disablelimitreport=true&disableeditsection=true&disabletoc=true&page=' + encodeURIComponent( title ) + '&format=json', {
			timeout: {
				request: 10_000
			},
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			if ( response.statusCode !== 200 || !response?.body?.parse?.text ) {
				console.log( '- ' + response.statusCode + ': Error while parsing the page: ' + response?.body?.error?.info );
				if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
					embed.spliceFields( 0, 0, embed.backupField );
				}
				if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
					embed.setDescription( embed.backupDescription );
				}
				return;
			}
			if ( !embed.forceTitle ) {
				var displaytitle = htmlToDiscord( response.body.parse.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				if ( displaytitle.trim() ) embed.setTitle( displaytitle );
			}
			var $ = cheerioLoad(response.body.parse.text['*'].replace( /\n?<br(?: ?\/)?>\n?/g, '<br>' ), {baseURI: wiki.toLink(response.body.parse.title)});
			if ( embed.brokenInfobox && $('aside.portable-infobox').length ) {
				let infobox = $('aside.portable-infobox');
				embed.data.fields?.forEach( field => {
					if ( getEmbedLength(embed) > ( 5_870 - FIELD_LENGTH ) ) return;
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
							value = htmlToDiscord(value, embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
							if ( value.length > FIELD_LENGTH ) value = limitLength(value, FIELD_LENGTH, 20);
							if ( value ) field.value = value;
						}
					}
				} );
			}
			if ( !fragment && !embed.data.fields?.length && $(infoboxList.join(', ')).length ) {
				let infobox = $(infoboxList.join(', ')).first();
				infobox.find('[class*="va-infobox-spacing"]').remove();
				if ( embed.data.thumbnail?.url === thumbnail ) {
					try {
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
					catch {}
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
					'div.infobox-rows:not(.subinfobox) > div.infobox-row',
					'.va-infobox-cont tr',
					'.va-infobox-cont th.va-infobox-header'
				].join(', '));
				let tdLabel = true;
				for ( let i = 0; i < rows.length; i++ ) {
					if ( ( embed.data.fields?.length ?? 0 ) >= FIELD_COUNT || getEmbedLength(embed) > ( 5_870 - FIELD_LENGTH ) ) break;
					let row = rows.eq(i);
					if ( row.is('th.mainheader, th.infobox-header, th.va-infobox-header, div.title, h2.pi-header') ) {
						row.find(removeClasses.join(', ')).remove();
						let label = htmlToDiscord(row, embed.data.url).trim();
						if ( label.length > 100 ) label = limitLength(label, 100, 20);
						if ( label ) {
							if ( !label.includes( '**' ) ) label = '**' + label + '**';
							if ( embed.data.fields?.length && embed.data.fields[embed.data.fields.length - 1].name === '\u200b' ) {
								embed.spliceFields( -1, 1, {
									name: '\u200b',
									value: label
								} );
							}
							else embed.addFields( {name: '\u200b', value: label} );
						}
					}
					else if ( row.is('tr, div.pi-data, div.infobox-row') ) {
						let label = row.children(( tdLabel ? 'td, ' : '' ) + 'th, h3.pi-data-label, div.infobox-cell-header').eq(0);
						label.find(removeClasses.join(', ')).remove();
						let value = row.children('td, div.pi-data-value, div.infobox-cell-data').eq(( label.is('td') ? 1 : 0 ));
						value.find(removeClasses.join(', ')).remove();
						if ( !label.is('td') && label.html()?.trim() && value.html()?.trim() ) tdLabel = false;
						label = htmlToPlain(label).trim().split('\n')[0];
						value = htmlToDiscord(value, embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
						if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
						if ( value.length > FIELD_LENGTH ) value = limitLength(value, FIELD_LENGTH, 20);
						if ( label && value ) embed.addFields( {name: label, value, inline: true} );
					}
				}
				if ( embed.data.fields?.length && embed.data.fields[embed.data.fields.length - 1].name === '\u200b' ) {
					embed.spliceFields( -1, 1 );
				}
			}
			if ( embed.data.thumbnail?.url === thumbnail ) {
				let image = response.body.parse.images.find( pageimage => ( /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) && pageimage.toLowerCase().includes( title.toLowerCase().replaceAll( ' ', wiki.spaceReplacement ?? '_' ) ) ) );
				if ( !image ) {
					let first = $(infoboxList.join(', ')).find('img').filter( (i, img) => {
						img = $(img).prop('src')?.toLowerCase();
						return ( /^(?:https?:)?\/\//.test(img) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/.test(img) );
					} ).first();
					thumbnail = ( first.length ? first.prop('src') : null );
					if ( !thumbnail ) {
						first = $('img').filter( (i, img) => {
							img = $(img).prop('src')?.toLowerCase();
							return ( /^(?:https?:)?\/\//.test(img) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/.test(img) );
						} ).first();
						thumbnail = ( first.length ? first.prop('src') : null );
					}
					if ( !thumbnail ) image = response.body.parse.images.find( pageimage => {
						return /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase());
					} );
				}
				if ( image ) thumbnail = wiki.toLink('Special:FilePath/' + image);
				if ( thumbnail ) embed.setThumbnail( thumbnail.replace( /^(?:https?:)?\/\//, 'https://' ) );
			}
			if ( fragment && getEmbedLength(embed) < ( 5_720 - SECTION_LENGTH ) && ( embed.data.fields?.length ?? 0 ) < 25 &&
			toSection(embed.data.fields?.[0]?.name.replace( /^\**_*(.*?)_*\**$/g, '$1' ), wiki.spaceReplacement) !== toSection(fragment, wiki.spaceReplacement) ) {
				let newFragment = '';
				let exactMatch = true;
				let allSections = $('h1, h2, h3, h4, h5, h6').children('span');
				var section = allSections.filter( (i, span) => {
					return ( '#' + span.attribs.id === toSection(fragment, wiki.spaceReplacement) );
				} ).parent();
				if ( !section.length ) {
					section = $('[id="' + toSection(fragment, wiki.spaceReplacement, false).replace( '#', '' ) + '"]');
					newFragment = section.attr('id');
					if ( section.is(':empty') ) {
						section = section.parent();
						if ( ['h1','h2','h3','h4','h5','h6'].includes( section.prev()[0]?.tagName ) ) {
							section = section.prev();
							if ( section.children('span.mw-headline').first().attr('id') ) {
								newFragment = section.children('span.mw-headline').first().attr('id');
							}
							else if ( section.children('span').first().attr('id') ) {
								newFragment = section.children('span').first().attr('id');
							}
						}
						else if ( ['h1','h2','h3','h4','h5','h6'].includes( section.next()[0]?.tagName ) ) {
							section = section.next();
							if ( section.children('span.mw-headline').first().attr('id') ) {
								newFragment = section.children('span.mw-headline').first().attr('id');
							}
							else if ( section.children('span').first().attr('id') ) {
								newFragment = section.children('span').first().attr('id');
							}
						}
					}
				}
				if ( !section.length ) exactMatch = false;
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( '#' + span.attribs.id?.toLowerCase() === toSection(fragment, wiki.spaceReplacement).toLowerCase() );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( $(span).parent().prop('innerText').trim() === fragment );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return ( $(span).parent().prop('innerText').trim().toLowerCase() === fragment.toLowerCase() );
				} );
				if ( !section.length ) section = allSections.filter( (i, span) => {
					return $(span).parent().prop('innerText').toLowerCase().includes( fragment.toLowerCase() );
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
						try {
							let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
							imgURL = imgURL.replace( /\/thumb(\/[\da-f]\/[\da-f]{2}\/([^\/]+))\/\d+px-\2/, '$1' ).replace( /\/scale-to-width-down\/\d+/, '' );
							return new URL(imgURL.replace( /^(?:https?:)?\/\//, 'https://' ), wiki).href;
						}
						catch {
							return null;
						}
					} ).filter( img => img )));
					sectionContent.find(infoboxList.join(', ')).remove();
					sectionContent.find('div, ' + removeClasses.join(', ')).not(removeClassesExceptions.join(', ')).remove();
					var name = htmlToPlain(section).trim();
					if ( !name.length ) name = escapeFormatting(fragment);
					if ( name.length > 250 ) name = name.substring(0, 250) + '\u2026';
					var value = htmlToDiscord(sectionContent, embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
					if ( value.length > SECTION_LENGTH ) value = limitLength(value, SECTION_LENGTH, 20);
					if ( name.length && value.length ) {
						embed.spliceFields( 0, 0, {name, value} );
						if ( newFragment ) {
							embed.setURL( pagelink.replaceSafe( toSection(fragment, wiki.spaceReplacement), toSection(newFragment, wiki.spaceReplacement) ) );
							content = content.replaceSafe( '<' + pagelink + '>', '<' + embed.data.url + '>' );
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
			if ( !embed.data.description && getEmbedLength(embed) < ( 5_950 - Math.max(( fragment ? SECTION_DESC_LENGTH : DESC_LENGTH ), ( embed.backupDescription ? embed.backupDescription?.length ?? 4_000 : 0 )) ) ) {
				$(infoboxList.join(', ')).remove();
				$('div, ' + removeClasses.join(', '), $('.mw-parser-output')).not(removeClassesExceptions.join(', ')).remove();
				let backupDescription = null;
				if ( contentmodel !== 'wikitext' || disambiguation === undefined || fragment ) {
					if ( !fragment && ns % 2 === 0 ) {
						backupDescription = $('h1, h2, h3, h4, h5, h6').eq(0);
						if ( backupDescription.length ) {
							let backupDescriptionLevel = ['h1','h2','h3','h4','h5','h6'].slice(0, backupDescription[0].tagName.replace('h', '')).join(', ');
							backupDescription = $('<div>').append(backupDescription, backupDescription.nextUntil(backupDescriptionLevel));
						}
						else backupDescription = null;
					}
					$('h1, h2, h3, h4, h5, h6').nextAll().remove();
					$('h1, h2, h3, h4, h5, h6').remove();
				}
				var description = htmlToDiscord($.html(), embed.data.url, true).trim().replace( /\n{3,}/g, '\n\n' );
				if ( !description && backupDescription ) description = htmlToDiscord(backupDescription.html(), embed.data.url, true).trim().replace( /\n{3,}/g, '\n\n' );
				if ( description ) {
					if ( disambiguation !== undefined && !fragment && DESC_LENGTH < 1_500 && getEmbedLength(embed) < 4_450 ) {
						if ( description.length > 1_500 ) description = limitLength(description, 1_500, 50);
					}
					else if ( fragment && description.length > SECTION_DESC_LENGTH ) description = limitLength(description, SECTION_DESC_LENGTH, 50);
					else if ( description.length > DESC_LENGTH ) description = limitLength(description, DESC_LENGTH, 50);
					embed.setDescription( description );
				}
				else if ( embed.backupDescription ) {
					embed.setDescription( embed.backupDescription );
				}
			}
		}, error => {
			console.log( '- Error while parsing the page: ' + error );
			if ( embed.backupField && getEmbedLength(embed) < ( 6_000 - ( embed.backupField?.name ?? 250 ) - ( embed.backupField?.value ?? 1_000 ) ) && ( embed.data.fields?.length ?? 0 ) < 25 ) {
				embed.spliceFields( 0, 0, embed.backupField );
			}
			if ( embed.backupDescription && getEmbedLength(embed) < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
				embed.setDescription( embed.backupDescription );
			}
		} ).then( () => {
			let embeds = [embed];
			if ( extraImages.length ) {
				if ( !embed.data.image ) embed.setImage( extraImages.shift() );
				extraImages.slice(0, 10).forEach( extraImage => {
					let imageEmbed = new EmbedBuilder().setURL( embed.data.url ).setImage( extraImage );
					if ( embeds.length < 5 && embeds.reduce( (acc, val) => acc + getEmbedLength(val), getEmbedLength(imageEmbed) ) <= 5500 ) embeds.push(imageEmbed);
				} );
			}
			if ( isMessage(msg) ) return message.edit( {content, embeds} ).catch(log_error);
			else return {message: {content, embeds}};
		} );
	} );
}
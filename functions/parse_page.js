import { load as cheerioLoad } from 'cheerio';
import { EmbedBuilder } from 'discord.js';
import { toSection } from '../util/wiki.js';
import { got, parse_infobox, isMessage, canShowEmbed, htmlToPlain, htmlToDiscord, escapeFormatting, limitLength } from '../util/functions.js';

const parsedContentModels = [
	'wikitext',
	'datamap',
	'interactivemap',
	'wikibase-item',
	'wikibase-lexeme',
	'wikibase-property'
];

// Max length of 10 characters
const contentModels = {
	Scribunto: 'lua',
	javascript: 'js',
	css: 'css',
	json: 'json'
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
	'.info-framework',
	'.iteminfobox',
	'.infobox-root',
	'.druid-infobox',
	'.druid-container',
	'.settingsummary',
	'table[class*="infobox"]'
];

const removeClasses = [
	'table',
	'figure',
	'audio',
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
	'.ext-discussiontools-init-replylink-buttons',
	'span.sprite-file img',
	'.c-item-hoverbox__display',
	'wb\\:sectionedit'
];

const removeClassesExceptions = [
	'div.mw-parser-output',
	'div.mw-body-content',
	'div.mw-content-ltr',
	'div.mw-content-rtl',
	'div.main-page-tag-lcs',
	'div.lcs-container',
	'div.mw-highlight',
	'div.mw-heading',
	'div.poem',
	'div.hlist',
	'div.treeview',
	'div.redirectMsg',
	'div.doc',
	'div.documentation',
	'div.interactive-maps-description',
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
 * @param {String} [querypage.uselang] - The language of the page description.
 * @param {Boolean} [querypage.noRedirect] - If the page is allowed to be redirected.
 * @param {String} [thumbnail] - The default thumbnail for the wiki.
 * @param {String} [fragment] - The section title to embed.
 * @param {String} [pagelink] - The link to the page.
 * @returns {Promise<import('discord.js').Message|{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>} The edited message.
 */
export default function parse_page(lang, msg, content, embed, wiki, reaction, {ns, title, contentmodel, pagelanguage, missing, known, pageprops: {infoboxes, disambiguation} = {}, uselang = lang.lang, noRedirect = false}, thumbnail = '', fragment = '', pagelink = '') {
	if ( reaction ) reaction.removeEmoji();
	var {descLength, fieldCount, fieldLength, sectionLength, sectionDescLength} = msg.embedLimits;
	if ( !msg || !canShowEmbed(msg) || ( missing !== undefined && ( known === undefined || ( ns !== 8 && !( ns === 2 && wiki === wiki.globaluserpage ) ) ) ) || !embed || embed.data.description || ( !descLength && !fieldCount && !( fragment ? sectionLength : 0 ) ) ) {
		if ( missing !== undefined && embed?.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
			embed.setDescription( embed.backupDescription );
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
			else if ( pagelanguage === 'en' ) pagelanguage = '';
			return got.get( wiki + 'api.php?action=query&meta=allmessages&amprop=default&amincludelocal=true' + ( pagelanguage ? '&amlang=' + encodeURIComponent( pagelanguage ) : '' ) + '&ammessages=' + encodeURIComponent( title ) + '&format=json', {
				timeout: {
					request: 10_000
				},
				context: {
					guildId: msg.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( body?.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query?.allmessages?.[0] ) {
					console.log( '- ' + response.statusCode + ': Error while getting the system message: ' + body?.error?.info );
					if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
						embed.setDescription( embed.backupDescription );
					}
					return;
				}
				if ( !embed.data.description && embed.length < ( 5_990 - ( fragment ? 4_000 : ( sectionDescLength || descLength ) + fieldLength ) ) ) {
					var description = body.query.allmessages[0]['*'];
					var regex = /^L-?(\d+)(?:-?-(?:L-?)?(\d+))?$/.exec(fragment);
					if ( regex && sectionLength ) {
						let descArray = description.split('\n').slice(regex[1] - 1, ( regex[2] || +regex[1] + 10 ));
						if ( descArray.length ) {
							description = descArray.join('\n').replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description ) {
								if ( description.length > 4_000 ) description = description.substring(0, 4_000) + '\u2026';
								description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
								embed.setDescription( description );
							}
						}
					}
					else if ( descLength ) {
						let defaultDescription = body.query.allmessages[0].default;
						if ( description.trim() ) {
							description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( description.length > ( sectionDescLength || descLength ) ) description = description.substring(0, ( sectionDescLength || descLength )) + '\u2026';
							description = '```' + ( contentModels[contentmodel] || '' ) + '\n' + description + '\n```';
							embed.setDescription( description );
						}
						else if ( embed.backupDescription ) {
							embed.setDescription( embed.backupDescription );
						}
						if ( defaultDescription?.trim() && fieldLength ) {
							defaultDescription = defaultDescription.replace( /^\n+/, '' ).replace( /\n+$/, '' );
							if ( defaultDescription.length > fieldLength ) defaultDescription = defaultDescription.substring(0, fieldLength) + '\u2026';
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
				if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
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
			if ( body?.warnings ) log_warning(body.warnings);
			var revision = Object.values(( body?.query?.pages || {} ))?.[0]?.revisions?.[0];
			revision = ( revision?.slots?.main || revision );
			if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !revision?.['*'] ) {
				console.log( '- ' + response.statusCode + ': Error while getting the page content: ' + body?.error?.info );
				if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
					embed.setDescription( embed.backupDescription );
				}
				return;
			}
			if ( !embed.data.description && embed.length < ( 5_990 - ( fragment ? 4_000 : ( sectionDescLength || descLength ) ) ) ) {
				var description = revision['*'];
				var regex = /^L-?(\d+)(?:-(?:L-?)?(\d+))?$/.exec(fragment);
				if ( regex && sectionLength ) {
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
				else if ( descLength ) {
					if ( description.trim() ) {
						description = description.replace( /^\n+/, '' ).replace( /\n+$/, '' );
						if ( description.length > ( sectionDescLength || descLength ) ) description = description.substring(0, ( sectionDescLength || descLength )) + '\u2026';
						description = '```' + ( contentModels[revision.contentmodel] || contentFormats[revision.contentformat] || '' ) + '\n' + description + '\n```';
						embed.setDescription( description );
					}
					else if ( embed.backupDescription ) {
						embed.setDescription( embed.backupDescription );
					}
				}
			}
		}, error => {
			console.log( '- Error while getting the page content: ' + error );
			if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
				embed.setDescription( embed.backupDescription );
			}
		} ).then( () => {
			if ( isMessage(msg) ) return message.edit( {content, embeds: [embed]} ).catch(log_error);
			else return {message: {content, embeds: [embed]}};
		} );
		if ( !fragment && !embed.data.fields?.length && infoboxes ) {
			try {
				let infobox = JSON.parse(infoboxes)?.[0];
				parse_infobox(infobox, embed, {fieldCount, fieldLength}, thumbnail, embed.data.url);
			}
			catch ( error ) {
				console.log( '- Failed to parse the infobox: ' + error );
			}
		}
		let extraImages = [];
		if ( thumbnail && embed.data.thumbnail?.url && !/\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(embed.data.thumbnail?.url) ) embed.setThumbnail( thumbnail );
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
				if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
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
					if ( embed.length > ( 5_870 - fieldLength ) ) return;
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
							if ( value.length > fieldLength ) value = limitLength(value, fieldLength, 20);
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
							'div.infobox-image img',
							'div.infobox-imagearea img',
							'td.druid-main-image img',
							'td.druid-main-images img',
							'div.druid-main-image img',
							'div.druid-main-images img',
							'div.info-column.info-X1-100 a.image > img'
						].join(', ')).toArray().find( img => {
							let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
							if ( !imgURL ) return false;
							if ( img.attribs['data-image-name']?.toLowerCase().endsWith( '.gif' ) ) return true;
							return ( /^(?:(?:https?:)?\/)?\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
						} );
						if ( image ) {
							let imgURL = ( image.attribs.src?.startsWith?.( 'data:' ) ? image.attribs['data-src'] : image.attribs.src );
							if ( image.attribs['data-image-name']?.toLowerCase().endsWith( '.gif' ) ) {
								imgURL = wiki.toLink('Special:FilePath/' + image.attribs['data-image-name']);
							}
							imgURL = imgURL.replace( /\/thumb(\/[\da-f]\/[\da-f]{2}\/([^\/]+))\/\d+px-\2/, '$1' ).replace( /\/scale-to-width-down\/\d+/, '' );
							embed.setThumbnail( new URL(imgURL.replace( /^(?:https?:)?\/\//, 'https://' ), wiki).href );
						}
					}
					catch {}
				}
				if ( infobox.has('.descriptionbox') ) {
					let backupDescription = htmlToDiscord(infobox.find('.descriptionbox').html(), embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
					let freeEmbedLength = 5_950 - embed.length;
					if ( backupDescription.length > Math.min(descLength, freeEmbedLength) ) {
						backupDescription = limitLength(backupDescription, Math.min(descLength, freeEmbedLength), 50);
					}
					if ( backupDescription ) embed.backupDescription = backupDescription;
				}
				let rows = infobox.find([
					'> tbody > tr',
					'> tbody > tr > th.mainheader',
					'> tbody > tr > th.infobox-header',
					'> tbody > tr > th.druid-section',
					'> table > tbody > tr',
					'> table > tbody > tr > th.infobox-header',
					'div.section > div.title',
					'div.section > table > tbody > tr',
					'h2.pi-header',
					'div.pi-data',
					'table.infobox-rows > tbody > tr',
					'table.infobox-rows > tbody > tr > th.infobox-header',
					'div.infobox-rows:not(.subinfobox) > div.infobox-row',
					'.va-infobox-cont tr',
					'.va-infobox-cont th.va-infobox-header',
					'div.infobox-header',
					'div.infobox-row-container',
					'div.druid-row',
					'div.druid-section',
					'div.info-unit > div.info-unit-caption',
					'div.info-unit-row',
					'> tbody > tr > td > table > tbody > tr',
					'table.attributeinfo span.icon-tooltip',
					'td.druid-grid-section > div.druid-grid > div.druid-grid-item'
				].join(', '));
				let tdLabel = true;
				for ( let i = 0; i < rows.length; i++ ) {
					if ( ( embed.data.fields?.length ?? 0 ) >= fieldCount || embed.length > ( 5_870 - fieldLength ) ) break;
					let row = rows.eq(i);
					if ( row.is([
						'th.mainheader',
						'th.infobox-header',
						'th.druid-section',
						'th.va-infobox-header',
						'div.title',
						'h2.pi-header',
						'div.infobox-header',
						'div.druid-section',
						'div.info-unit-caption'
					].join(', ')) ) {
						row.find(removeClasses.join(', ')).remove();
						row.find('a:empty, code:empty, b:empty, strong:empty, i:empty, em:empty, s:empty, del:empty, u:empty, ins:empty').remove();
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
					else if ( row.is([
						'tr',
						'div.pi-data',
						'div.druid-grid-item',
						'div.druid-row',
						'div.infobox-row',
						'div.info-unit-row',
						'div.infobox-row-container',
						'span.icon-tooltip'
					].join(', ')) ) {
						let label = row.children([
							( tdLabel ? 'td, ' : '' ) + 'th',
							'h3.pi-data-label',
							'div.druid-label',
							'div.infobox-cell-header',
							'div.infobox-row-label',
							'div.info-arkitex-left.info-X2-40'
						].join(', ')).eq(0);
						label.find(removeClasses.join(', ')).remove();
						let value = row.children([
							'td',
							'div.pi-data-value',
							'div.druid-data',
							'div.infobox-cell-data',
							'div.infobox-row-value',
							'div.info-arkitex-right.info-X2-60'
						].join(', ')).eq(( label.is('td') ? 1 : 0 ));
						value.find(removeClasses.join(', ')).remove();
						if ( value.is('td') && !value.html()?.trim() ) {
							value = row.children('td').eq(( label.is('td') ? 1 : 0 ) + 1);
							value.find(removeClasses.join(', ')).remove();
						}
						if ( row.is('span.icon-tooltip') && !label.length && !value.length ) {
							label = row.children('a').eq(0);
							label.find(removeClasses.join(', ')).remove();
							value = row.children('a').eq(1);
							value.find(removeClasses.join(', ')).remove();
						}
						if ( !label.is('td') && label.html()?.trim() && value.html()?.trim() ) tdLabel = false;
						label = htmlToPlain(label).trim().split('\n')[0];
						value.find('a:empty, code:empty, b:empty, strong:empty, i:empty, em:empty, s:empty, del:empty, u:empty, ins:empty').remove();
						value = htmlToDiscord(value, embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
						if ( label.length > 100 ) label = label.substring(0, 100) + '\u2026';
						if ( value.length > fieldLength ) value = limitLength(value, fieldLength, 20);
						if ( label && value ) embed.addFields( {name: label, value, inline: true} );
					}
				}
				if ( embed.data.fields?.length && embed.data.fields[embed.data.fields.length - 1].name === '\u200b' ) {
					embed.spliceFields( -1, 1 );
				}
			}
			if ( contentmodel === 'datamap' && response.body.parse.images.length ) {
				embed.setThumbnail( wiki.toLink('Special:FilePath/' + response.body.parse.images[0]) );
			}
			else if ( contentmodel === 'interactivemap' && response.body.parse.images.length ) {
				embed.setThumbnail( wiki.toLink('Special:FilePath/' + response.body.parse.images[response.body.parse.images.length - 1]) );
			}
			else if ( embed.data.thumbnail?.url === thumbnail ) {
				try {
					response.body.parse.images = response.body.parse.images.map( pageimage => pageimage.toString() ).filter( pageimage => /\.(?:png|jpg|jpeg|gif)$/.test(pageimage.toLowerCase()) );
					let image = response.body.parse.images.find( pageimage => pageimage.toLowerCase().replace( /\.(?:png|jpg|jpeg|gif)$/, '' ) === title.toLowerCase().replaceAll( ' ', wiki.spaceReplacement ?? '_' ) );
					if ( !image ) image = response.body.parse.images.find( pageimage => pageimage.toLowerCase().includes( title.toLowerCase().replaceAll( ' ', wiki.spaceReplacement ?? '_' ) ) );
					if ( !image ) {
						let first = $(infoboxList.join(', ')).find('img').filter( (i, img) => {
							let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
							if ( img.attribs['data-image-name']?.toLowerCase().endsWith( '.gif' ) ) return true;
							return ( /^(?:(?:https?:)?\/)?\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
						} ).first();
						if ( !first.length ) first = $('img').filter( (i, img) => {
							let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
							if ( img.attribs['data-image-name']?.toLowerCase().endsWith( '.gif' ) ) return true;
							return ( /^(?:(?:https?:)?\/)?\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
						} ).first();
						if ( first.length ) {
							if ( first.attr('data-image-name')?.toLowerCase().endsWith( '.gif' ) ) image = first.attr('data-image-name');
							else thumbnail = ( first.attr('src')?.startsWith?.( 'data:' ) ? first.attr('data-src') : first.prop('src') );
						}
						else image = response.body.parse.images[0];
					}
					if ( image ) thumbnail = wiki.toLink('Special:FilePath/' + image);
					if ( thumbnail ) {
						thumbnail = thumbnail.replace( /\/thumb(\/[\da-f]\/[\da-f]{2}\/([^\/]+))\/\d+px-\2/, '$1' ).replace( /\/scale-to-width-down\/\d+/, '' );
						embed.setThumbnail( new URL(thumbnail.replace( /^(?:https?:)?\/\//, 'https://' ), pagelink).href );
					}
				}
				catch {}
			}
			if ( !embed.data.description ) {
				var sectionDescription = '';
				if ( fragment && sectionLength && embed.length < ( 5_990 - sectionLength ) ) {
					let newFragment = '';
					let exactMatch = true;
					let allSections = $('h1, h2, h3, h4, h5, h6').children('span').not('.mw-editsection, .mw-editsection-like');
					var section = allSections.filter( (i, span) => {
						return ( '#' + span.attribs.id === toSection(fragment, wiki.spaceReplacement) );
					} ).parent();
					var sectionContent;
					if ( !section.length ) {
						section = $('[id="' + toSection(fragment, wiki.spaceReplacement, false).replace( '#', '' ) + '"]').first();
						newFragment = section.attr('id');
						if ( section.is('[data-mw-comment-start]') ) {
							let start = section.parent();
							let end = $('[data-mw-comment-end="'+newFragment+'"]');
							end.nextAll().remove();
							let allSections = $('h1, h2, h3, h4, h5, h6, .mw-heading');
							section = allSections.nextUntil(allSections).has(end).last().prevUntil(allSections).last().prev();
							if ( !section.length ) section = $('<h1>').html(response.body.parse.displaytitle);
							if ( start.is(end.parent()) ) sectionContent = $('<div>').append(start);
							else {
								let begin = start.parentsUntil(end.parents()).last();
								let last = end.parents().filter(begin.siblings());
								let mid = begin.nextUntil(last);
								start.parentsUntil(begin).prevAll().remove();
								end.parentsUntil(last).nextAll().remove();
								sectionContent = $('<div>').append(begin, mid, last);
							}
						}
						else if ( section.is(':empty') ) {
							section = section.parent();
							if ( section.prev().is('h1, h2, h3, h4, h5, h6, .mw-heading') ) {
								section = section.prev();
								if ( section.children('span.mw-headline').first().attr('id') ) {
									newFragment = section.children('span.mw-headline').first().attr('id');
								}
								else if ( section.children('span').first().attr('id') ) {
									newFragment = section.children('span').first().attr('id');
								}
							}
							else if ( section.next().is('h1, h2, h3, h4, h5, h6, .mw-heading') ) {
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
						let headerList = [
							'h1, div.mw-heading1',
							'h2, div.mw-heading2',
							'h3, div.mw-heading3',
							'h4, div.mw-heading4',
							'h5, div.mw-heading5',
							'h6, div.mw-heading6'
						];
						if ( section.parent('div.mw-heading').length ) {
							section = section.parent();
						}
						sectionContent ??= $('<div>').append(
							section.nextUntil(headerList.slice(0, sectionLevel).join(', '))
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
							return ( /^(?:(?:https?:)?\/)?\//.test(imgURL) && /\.(?:png|jpg|jpeg|gif)(?:\/|\?|$)/i.test(imgURL) );
						} ).map( img => {
							if ( img.attribs['data-image-name']?.toLowerCase().endsWith( '.gif' ) ) return wiki.toLink('Special:FilePath/' + img.attribs['data-image-name']);
							try {
								let imgURL = ( img.attribs.src?.startsWith?.( 'data:' ) ? img.attribs['data-src'] : img.attribs.src );
								imgURL = imgURL.replace( /\/thumb((?:\/[\da-f]\/[\da-f]{2})?\/([^\/]+))\/\d+px-\2/, '$1' ).replace( /\/scale-to-width-down\/\d+/, '' );
								return new URL(imgURL.replace( /^(?:https?:)?\/\//, 'https://' ), wiki).href;
							}
							catch {
								return null;
							}
						} ).filter( img => img )));
						sectionContent.find(infoboxList.join(', ')).remove();
						sectionContent.find('div, ' + removeClasses.join(', ')).not(removeClassesExceptions.join(', ')).remove();
						section.find('a:empty, code:empty, b:empty, strong:empty, i:empty, em:empty, s:empty, del:empty, u:empty, ins:empty').remove();
						sectionContent.find('a:empty, code:empty, b:empty, strong:empty, i:empty, em:empty, s:empty, del:empty, u:empty, ins:empty').remove();
						var name = htmlToDiscord(section, embed.data.url).trim().replace( /\n+/g, ' ' );
						if ( !name.length ) name = '### ' + escapeFormatting(fragment);
						var value = htmlToDiscord(sectionContent, embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
						if ( value.length > sectionLength ) value = limitLength(value, sectionLength, 50);
						if ( name.length && value.length ) {
							sectionDescription = name + '\n' + value;
							if ( sectionDescription.length > 4_000 ) sectionDescription = limitLength(sectionDescription, 4_000, 50);
							embed.setDescription( sectionDescription );
							if ( newFragment ) {
								embed.setURL( pagelink.replaceSafe( toSection(fragment, wiki.spaceReplacement), toSection(newFragment, wiki.spaceReplacement) ) );
								content = content.replaceSafe( '<' + pagelink + '>', '<' + embed.data.url + '>' );
							}
						}
					}
				}
				if ( descLength && ( !fragment || sectionDescLength ) ) {
					$(infoboxList.join(', ')).remove();
					$('div, ' + removeClasses.join(', '), $('.mw-parser-output')).not(removeClassesExceptions.join(', ')).remove();
					let backupDescription = null;
					if ( contentmodel !== 'wikitext' || disambiguation === undefined || fragment ) {
						if ( !fragment && ns % 2 === 0 ) {
							backupDescription = $('h1, h2, h3, h4, h5, h6, div.mw-heading').eq(0);
							if ( backupDescription.length ) {
								let backupDescriptionHeader = backupDescription.find('h1, h2, h3, h4, h5, h6').addBack('h1, h2, h3, h4, h5, h6')[0];
								let backupDescriptionLevel = ['h1','h2','h3','h4','h5','h6'].slice(0, backupDescriptionHeader?.tagName.replace('h', '')).join(', ');
								backupDescription = $('<div>').append(backupDescription, backupDescription.nextUntil(backupDescriptionLevel));
							}
							else backupDescription = null;
						}
						$('h1, h2, h3, h4, h5, h6, div.mw-heading').nextAll().remove();
						$('h1, h2, h3, h4, h5, h6, div.mw-heading').remove();
					}
					$('a:empty, code:empty, b:empty, strong:empty, i:empty, em:empty, s:empty, del:empty, u:empty, ins:empty').remove();
					var description = htmlToDiscord($.html(), embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
					if ( !description && backupDescription ) description = htmlToDiscord(backupDescription.html(), embed.data.url).trim().replace( /\n{3,}/g, '\n\n' );
					if ( description ) {
						let freeEmbedLength = Math.min(5_950 - embed.length, 4_000 - sectionDescription.length);
						if ( freeEmbedLength > 100 ) {
							if ( disambiguation !== undefined && !fragment && descLength < 1_500 ) {
								if ( description.length > Math.min(1_500, freeEmbedLength) ) {
									description = limitLength(description, Math.min(1_500, freeEmbedLength), 50);
								}
							}
							else if ( fragment ) {
								if ( !sectionDescLength ) description = '';
								else if ( description.length > Math.min(sectionDescLength, freeEmbedLength) ) {
									description = limitLength(description, Math.min(sectionDescLength, freeEmbedLength), 50);
								}
							}
							else if ( description.length > Math.min(descLength, freeEmbedLength) ) {
								description = limitLength(description, Math.min(descLength, freeEmbedLength), 50);
							}
							if ( description ) embed.setDescription( description + '\n' + sectionDescription );
						}
					}
					else if ( !sectionDescription && embed.backupDescription && embed.length < ( 6_000 - embed.backupDescription.length ) ) {
						embed.setDescription( embed.backupDescription );
					}
				}
			}
		}, error => {
			console.log( '- Error while parsing the page: ' + error );
			if ( embed.backupDescription && embed.length < ( 6_000 - ( embed.backupDescription?.length ?? 4_000 ) ) ) {
				embed.setDescription( embed.backupDescription );
			}
		} ).then( () => {
			let embeds = [embed];
			if ( extraImages.length ) {
				if ( !embed.data.image ) embed.setImage( extraImages.shift() );
				extraImages.slice(0, 10).forEach( extraImage => {
					let imageEmbed = new EmbedBuilder().setURL( embed.data.url ).setImage( extraImage );
					if ( embeds.length < 5 && embeds.reduce( (acc, val) => acc + val.length, imageEmbed.length ) <= 5500 ) embeds.push(imageEmbed);
				} );
			}
			if ( isMessage(msg) ) return message.edit( {content, embeds} ).catch(log_error);
			else return {message: {content, embeds}};
		} );
	} );
}
import { MessageEmbed, Util } from 'discord.js';
import { got, escapeFormatting } from '../../util/functions.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {limit: {search: searchLimit}} = require('../../util/default.json');

/**
 * Searches a Gamepedia wiki.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} searchterm - The searchterm.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the search.
 * @param {Object} query - The siteinfo from the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 */
export default function gamepedia_search(lang, msg, searchterm, wiki, query, reaction, spoiler, noEmbed) {
	if ( searchterm.length > 250 ) {
		searchterm = searchterm.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	if ( !searchterm.trim() ) return this.special_page(lang, msg, {title: 'Special:Search'}, 'search', query, wiki, new URLSearchParams(), '', reaction, spoiler, noEmbed);
	var pagelink = wiki.toLink('Special:Search', {search:searchterm,fulltext:1});
	var resultText = '<' + pagelink + '>';
	var embed = null;
	if ( msg.showEmbed() && !noEmbed ) embed = new MessageEmbed().setAuthor( query.general.sitename ).setTitle( '`' + searchterm + '`' ).setURL( pagelink );
	else resultText += '\n\n**`' + searchterm + '`**';
	var querypage = ( Object.values(( query.pages || {} ))?.[0] || {title:'',ns:0,invalid:''} );
	var limit = searchLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
	got.get( wiki + 'api.php?action=query&titles=Special:Search&list=search&srinfo=totalhits&srprop=redirecttitle|sectiontitle&srnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + Object.values(query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&srlimit=' + limit + '&srsearch=' + encodeURIComponent( searchterm ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body?.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body?.query?.search || body.batchcomplete === undefined ) {
			return console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + body?.error?.info );
		}
		if ( body.query.search.length < limit ) {
			return got.get( wiki + 'api.php?action=query&list=search&srwhat=text&srinfo=totalhits&srprop=redirecttitle|sectiontitle&srnamespace=4|12|14|' + ( querypage.ns >= 0 ? querypage.ns + '|' : '' ) + Object.values(query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&srlimit=' + limit + '&srsearch=' + encodeURIComponent( searchterm ) + '&format=json' ).then( tresponse => {
				var tbody = tresponse.body;
				if ( tbody?.warnings ) log_warning(tbody.warnings);
				if ( tresponse.statusCode !== 200 || !tbody?.query?.search || tbody.batchcomplete === undefined ) {
					return console.log( '- ' + tresponse.statusCode + ': Error while getting the text search results: ' + tbody?.error?.info );
				}
				body.query.search.push(...tbody.query.search.filter( tresult => {
					return !body.query.search.some( result => result.pageid === tresult.pageid );
				} ).slice(0, limit - body.query.search.length));
				if ( body.query.searchinfo && tbody.query.searchinfo ) body.query.searchinfo.totalhits += tbody.query.searchinfo.totalhits;
			}, error => {
				console.log( '- Error while getting the text search results: ' + error );
			} ).then( () => {
				return body;
			} );
		}
		return body;
	} ).then( body => {
		if ( !body?.query?.search ) return;
		if ( body.query.pages?.['-1']?.title ) {
			pagelink = wiki.toLink(body.query.pages['-1'].title, {search:searchterm,fulltext:1});
			resultText = '<' + pagelink + '>';
			if ( msg.showEmbed() && !noEmbed ) embed.setURL( pagelink );
			else resultText += '\n\n**`' + searchterm + '`**';
		}
		var hasExactMatch = false;
		var description = [];
		body.query.search.forEach( result => {
			let text = '• ';
			let bold = '';
			if ( result.title.replace( /[_-]/g, ' ' ).toLowerCase() === querypage.title.replace( /-/g, ' ' ).toLowerCase() ) {
				bold = '**';
				hasExactMatch = true;
				if ( query.redirects?.[0] ) {
					if ( query.redirects[0].tofragment && !result.sectiontitle ) {
						result.sectiontitle = query.redirects[0].tofragment;
					}
					if ( !result.redirecttitle ) result.redirecttitle = query.redirects[0].from;
				}
			}
			text += bold;
			if ( msg.showEmbed() && !noEmbed ) {
				text += '[' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, '', '', true) + ')';
				if ( result.sectiontitle ) {
					text += ' § [' + escapeFormatting(result.sectiontitle) + '](' + wiki.toLink(result.title, '', result.sectiontitle, true) + ')';
				}
				if ( result.redirecttitle ) {
					text += ' (⤷ [' + escapeFormatting(result.redirecttitle) + '](' + wiki.toLink(result.redirecttitle, 'redirect=no', '', true) + '))';
				}
			}
			else {
				text += '<' + wiki.toLink(result.title) + '>';
				if ( result.sectiontitle ) text += ' § ' + escapeFormatting(result.sectiontitle);
				if ( result.redirecttitle ) text += ' (⤷ ' + escapeFormatting(result.redirecttitle) + ')';
			}
			text += bold;
			description.push( text );
		} );
		if ( !hasExactMatch ) {
			if ( query.interwiki?.[0] ) {
				let text = '• **⤷ ';
				if ( msg.showEmbed() && !noEmbed ) {
					text += '__[' + escapeFormatting(query.interwiki[0].title) + '](' + query.interwiki[0].url.replace( /[()]/g, '\\$&' ) + ')__';
					if ( query.redirects?.[0] ) {
						text += ' (⤷ [' + escapeFormatting(query.redirects[0].from) + '](' + wiki.toLink(query.redirects[0].from, 'redirect=no', '', true) + '))';
					}
				}
				else {
					text += '__<' + query.interwiki[0].url.replace( /[()]/g, '\\$&' ) + '>__';
					if ( query.redirects?.[0] ) text += ' (⤷ ' + escapeFormatting(query.redirects[0].from) + ')';
				}
				text += '**';
				description.unshift( text );
			}
			else if ( querypage.invalid === undefined && ( querypage.missing === undefined || querypage.known !== undefined ) ) {
				let text = '• **';
				if ( msg.showEmbed() && !noEmbed ) {
					text += '[' + escapeFormatting(querypage.title) + '](' + wiki.toLink(querypage.title, '', '', true) + ')';
					if ( query.redirects?.[0] ) {
						if ( query.redirects[0].tofragment ) {
							text += ' § [' + escapeFormatting(query.redirects[0].tofragment) + '](' + wiki.toLink(querypage.title, '', query.redirects[0].tofragment, true) + ')';
						}
						text += ' (⤷ [' + escapeFormatting(query.redirects[0].from) + '](' + wiki.toLink(query.redirects[0].from, 'redirect=no', '', true) + '))';
					}
				}
				else {
					text += '<' + wiki.toLink(querypage.title) + '>';
					if ( query.redirects?.[0] ) {
						if ( query.redirects[0].tofragment ) text += ' § ' + escapeFormatting(query.redirects[0].tofragment);
						text += ' (⤷ ' + escapeFormatting(query.redirects[0].from) + ')';
					}
				}
				text += '**';
				description.unshift( text );
			}
		}
		var footer = '';
		if ( body.query.searchinfo ) {
			footer = lang.get('search.results', body.query.searchinfo.totalhits.toLocaleString(lang.get('dateformat')), body.query.searchinfo.totalhits);
		}
		if ( msg.showEmbed() && !noEmbed ) {
			if ( description.length ) embed.setDescription( Util.splitMessage( description.join('\n') )[0] );
			if ( footer ) embed.setFooter( footer );
		}
		else {
			if ( description.length ) resultText += '\n' + Util.splitMessage( description.join('\n'), {maxLength: 1995 - resultText.length - footer.length} )[0];
			if ( footer ) resultText += '\n' + footer;
		}
	}, error => {
		console.log( '- Error while getting the search results.' + error );
	} ).then( () => {
		msg.sendChannel( {content: '🔍 ' + spoiler + resultText + spoiler, embeds: [embed]} );
		
		if ( reaction ) reaction.removeEmoji();
	} );
}
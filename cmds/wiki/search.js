const {MessageEmbed, Util} = require('discord.js');
const {limit: {search: searchLimit}} = require('../../util/default.json');

/**
 * Searches a Gamepedia wiki.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} searchterm - The searchterm.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the search.
 * @param {Object} query - The siteinfo from the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function gamepedia_search(lang, msg, searchterm, wiki, query, reaction, spoiler) {
	if ( searchterm.length > 250 ) {
		searchterm = searchterm.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	var pagelink = wiki.toLink('Special:Search', {search:searchterm,fulltext:1});
	var embed = new MessageEmbed().setAuthor( query.general.sitename ).setTitle( '`' + searchterm + '`' ).setURL( pagelink );
	if ( !searchterm.trim() ) {
		pagelink = wiki.toLink('Special:Search');
		embed.setTitle( 'Special:Search' ).setURL( pagelink );
	}
	var querypage = ( Object.values(( query.pages || {} ))?.[0] || {title:'',ns:0,invalid:''} );
	var description = [];
	var limit = searchLimit[( msg?.guild?.id in patreons ? 'patreon' : 'default' )];
	got.get( wiki + 'api.php?action=query&titles=Special:Search&list=search&srinfo=totalhits&srprop=redirecttitle|sectiontitle&srnamespace=4|12|14|' + querypage.ns + '|' + Object.values(query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&srlimit=' + limit + '&srsearch=' + encodeURIComponent( ( searchterm || ' ' ) ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || !body.query || !body.query.search || body.batchcomplete === undefined ) {
			return console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
		}
		if ( body.query.pages && body.query.pages['-1'] && body.query.pages['-1'].title ) {
			if ( searchterm.trim() ) {
				pagelink = wiki.toLink(body.query.pages['-1'].title, {search:searchterm,fulltext:1});
				embed.setURL( pagelink );
			}
			else {
				pagelink = wiki.toLink(body.query.pages['-1'].title);
				embed.setTitle( body.query.pages['-1'].title ).setURL( pagelink );
			}
		}
		if ( searchterm.trim() ) {
			var hasExactMatch = false;
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
				text += '[' + result.title + '](' + wiki.toLink(result.title, '', '', true) + ')';
				if ( result.sectiontitle ) {
					text += ' § [' + result.sectiontitle + '](' + wiki.toLink(result.title, '', result.sectiontitle, true) + ')';
				}
				if ( result.redirecttitle ) {
					text += ' (⤷ [' + result.redirecttitle + '](' + wiki.toLink(result.redirecttitle, 'redirect=no', '', true) + '))';
				}
				text += bold;
				description.push( text );
			} );
			if ( !hasExactMatch ) {
				if ( query.interwiki?.[0] ) {
					let text = '• **⤷ ';
					text += '__[' + query.interwiki[0].title + '](' + query.interwiki[0].url.replace( /[()]/g, '\\$&' ) + ')__';
					if ( query.redirects?.[0] ) {
						text += ' (⤷ [' + query.redirects[0].from + '](' + wiki.toLink(query.redirects[0].from, 'redirect=no', '', true) + '))';
					}
					text += '**';
					description.unshift( text );
				}
				else if ( querypage.invalid === undefined && ( querypage.missing === undefined || querypage.known !== undefined ) ) {
					let text = '• **';
					text += '[' + querypage.title + '](' + wiki.toLink(querypage.title, '', '', true) + ')';
					if ( query.redirects?.[0] ) {
						if ( query.redirects[0].tofragment ) {
							text += ' § [' + query.redirects[0].tofragment + '](' + wiki.toLink(querypage.title, '', query.redirects[0].tofragment, true) + ')';
						}
						text += ' (⤷ [' + query.redirects[0].from + '](' + wiki.toLink(query.redirects[0].from, 'redirect=no', '', true) + '))';
					}
					text += '**';
					description.unshift( text );
				}
			}
			if ( body.query.searchinfo ) {
				embed.setFooter( lang.get('search.results', body.query.searchinfo.totalhits.toLocaleString(lang.get('dateformat')), body.query.searchinfo.totalhits) );
			}
		}
	}, error => {
		console.log( '- Error while getting the search results.' + error );
	} ).finally( () => {
		embed.setDescription( Util.splitMessage( description.join('\n') )[0] );
		msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'search',
	run: gamepedia_search
};
const {MessageEmbed, Util} = require('discord.js');

/**
 * Searches a Fandom wiki.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} searchterm - The searchterm.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the search.
 * @param {Object} query - The siteinfo from the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function fandom_search(lang, msg, searchterm, wiki, query, reaction, spoiler) {
	if ( searchterm.length > 250 ) {
		searchterm = searchterm.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	var pagelink = wiki.toLink('Special:Search', {search:searchterm});
	var embed = new MessageEmbed().setAuthor( query.general.sitename ).setTitle( '`' + searchterm + '`' ).setURL( pagelink );
	if ( !searchterm.trim() ) {
		pagelink = wiki.toLink('Special:Search');
		embed.setTitle( 'Special:Search' ).setURL( pagelink );
		msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	var description = [];
	got.get( wiki + 'api/v1/Search/List?minArticleQuality=0&namespaces=4,12,14,' + Object.values(query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join(',') + '&limit=10&query=' + encodeURIComponent( searchterm ) + '&format=json&cache=' + Date.now() ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body || body.exception || !body.items ) {
			if ( !( body && body.exception && body.exception.code === 404 ) ) {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.exception && body.exception.details ) );
			}
			return;
		}
		body.items.forEach( result => {
			description.push( '• [' + result.title + '](' + wiki.toLink(result.title, '', '', true) + ')' );
		} );
		embed.setFooter( lang.get('search.results', body.total.toLocaleString(lang.get('dateformat')), body.total) );
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
	run: fandom_search
};
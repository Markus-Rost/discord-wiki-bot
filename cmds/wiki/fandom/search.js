const {MessageEmbed, Util} = require('discord.js');

function fandom_search(lang, msg, searchterm, wiki, query, reaction, spoiler) {
	if ( searchterm.length > 250 ) {
		searchterm = searchterm.substring(0, 250);
		msg.reactEmoji('⚠️');
	}
	var pagelink = wiki.toLink('Special:Search', 'search=' + searchterm.toSearch(), '', query.general);
	var embed = new MessageEmbed().setAuthor( query.general.sitename ).setTitle( '`' + searchterm + '`' ).setURL( pagelink );
	if ( !searchterm.trim() ) {
		pagelink = wiki.toLink('Special:Search', '', '', query.general);
		embed.setTitle( 'Special:Search' ).setURL( pagelink );
		msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	var description = [];
	got.get( wiki + 'api/v1/Search/List?minArticleQuality=0&namespaces=4,12,14,' + Object.values(query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join(',') + '&limit=10&query=' + encodeURIComponent( searchterm ) + '&format=json', {
		responseType: 'json'
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body || body.exception || !body.items ) {
			if ( !( body && body.exception && body.exception.code === 404 ) ) {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.exception && body.exception.details ) );
			}
			return;
		}
		body.items.forEach( result => {
			description.push( '• [' + result.title + '](' + wiki.toLink(result.title, '', '', query.general, true) + ')' );
		} );
		let count = lang.get('search.results');
		embed.setFooter( ( count[body.total] || count['*' + body.total % 100] || count['*' + body.total % 10]  || lang.get('search.results.default') ).replaceSave( '%s', body.total ) );
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
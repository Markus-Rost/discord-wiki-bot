var allSites = getAllSites();

function getAllSites() {
	return got.get( 'https://help.gamepedia.com/api.php?action=allsites&formatversion=2&do=getSiteStats&filter=wikis|md5_key,wiki_domain,wiki_display_name,wiki_image,wiki_description,wiki_managers,official_wiki,wiki_crossover,created&format=json', {
		responseType: 'json'
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body || body.status !== 'okay' || !body.data || !body.data.wikis ) {
			console.log( '- ' + shardId + ': ' + response.statusCode + ': Error while gettings all sites: ' + ( body && body.error && body.error.info ) );
			return [];
		}
		else {
			console.log( '- ' + shardId + ': Sites successfully loaded.' );
			var sites = JSON.parse(JSON.stringify(body.data.wikis.filter( site => /^[a-z\d-]{1,50}\.gamepedia\.com$/.test(site.wiki_domain) )));
			sites.filter( site => site.wiki_crossover ).forEach( site => site.wiki_crossover = site.wiki_crossover.replace( /^(?:https?:)?\/\/(([a-z\d-]{1,50})\.(?:fandom\.com|wikia\.org)(?:(?!\/wiki\/)\/([a-z-]{1,8}))?).*/, '$1' ) );
			return sites;
		}
	}, error => {
		console.log( '- ' + shardId + ': Error while gettings all sites: ' + error );
		return [];
	} );
}

function updateAllSites() {
	return new Promise( function(resolve, reject) {
		getAllSites.then( newSites => {
			if ( newSites.length ) allSites.then( sites => {
				sites.splice(0, sites.length);
				sites.push(...newSites);
				resolve(sites);
			} );
			else resolve(newSites);
		} );
	} );
}

module.exports = {
	update: updateAllSites,
	then: (callback) => allSites.then(callback)
};
const wiki = document.getElementById('wb-settings-wiki');
if ( wiki ) wiki.addEventListener( 'input', function (event) {
	if ( wiki.validity.valid ) {
		wiki.setCustomValidity('I am expecting an e-mail address!');
	}
	else {
		wiki.setCustomValidity();
	}
} );

const prefix = document.getElementById('wb-settings-prefix');
if ( prefix ) prefix.addEventListener( 'input', function (event) {
	if ( prefix.validity.patternMismatch ) {
		prefix.setCustomValidity('The prefix may not include spaces or code markdown!');
	}
	else {
		prefix.setCustomValidity();
	}
} );

const form = document.getElementById('wb-settings');
if ( form ) form.addEventListener( 'submit', function (event) {
	if ( prefix && prefix.validity.patternMismatch ) {
		prefix.setCustomValidity('The prefix may not include spaces or code markdown!');
		event.preventDefault();
	}
	else if ( wiki && wiki.validity.valid ) {
		wiki.value
		fetch()/*
		got.get( wikinew + 'api.php?&action=query&meta=siteinfo&siprop=general&format=json' ).then( response => {
			if ( !isForced && response.statusCode === 404 && typeof response.body === 'string' ) {
				let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
				if ( api ) {
					wikinew = new Wiki(api.split('api.php?')[0], wikinew);
					return got.get( wikinew + 'api.php?action=query&meta=siteinfo&siprop=generals&format=json' );
				}
			}
			return response;
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body?.query?.allmessages || !body?.query?.general || !body?.query?.extensions ) {
				console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
				if ( reaction ) reaction.removeEmoji();
				msg.reactEmoji('nowiki', true);
				return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
			}
			if ( !isForced ) wikinew.updateWiki(body.query.general);
			if ( wikinew.isGamepedia() && !isForced ) {
				let site = allSites.find( site => site.wiki_domain === wikinew.hostname );
				if ( site ) wikinew = new Wiki('https://' + ( site.wiki_crossover || site.wiki_domain ) + '/');
			}
			else if ( wikinew.isFandom() && !isForced ) {
				let crossover = '';
				if ( body.query.allmessages[0]['*'] ) {
					crossover = 'https://' + body.query.allmessages[0]['*'] + '.gamepedia.com/';
				}
				else if ( body.query.allmessages[1]['*'] ) {
					let merge = body.query.allmessages[1]['*'].split('/');
					crossover = 'https://' + merge[0] + '.fandom.com/' + ( merge[1] ? merge[1] + '/' : '' );
				}
				if ( crossover ) wikinew = new Wiki(crossover);
			}
		}, ferror => {
			console.log( '- Error while testing the wiki: ' + ferror );
			if ( reaction ) reaction.removeEmoji();
			msg.reactEmoji('nowiki', true);
			return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
		} );*/
	}
	else form.dispatchEvent(new Event('submit'));
} );

var collapsible = document.getElementsByClassName('collapsible');
for ( var i = 0; i < collapsible.length; i++ ) {
	collapsible[i].onclick = function() {
		this.classList.toggle('active');
		if ( this.id === 'wb-settings-wiki-search' ) {
			wiki.toggleAttribute('readonly');
		}
		var content = this.nextElementSibling;
		if ( content.style.display === 'block' ) {
			content.style.display = 'none';
		}
		else {
			content.style.display = 'block';
		}
	}
}
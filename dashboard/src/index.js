/*const wiki = document.getElementById('wb-settings-wiki');
if ( wiki ) wiki.addEventListener( 'input', function (event) {
	if ( wiki.validity.valid ) {
		wiki.setCustomValidity('I am expecting an e-mail address!');
	}
	else {
		wiki.setCustomValidity();
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
		fetch()
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
		} );
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
*/

var baseSelect = document.getElementsByTagName('select');
for ( var b = 0; b < baseSelect.length; b++ ) {
	if ( baseSelect[b].parentNode.querySelector('button.addmore') ) {
		baseSelect[b].addEventListener( 'input', toggleOption );
		toggleOption.call(baseSelect[b]);
	}
}

var addmore = document.getElementsByClassName('addmore');
for ( var j = 0; j < addmore.length; j++ ) {
	addmore[j].onclick = function() {
		var clone = this.previousElementSibling.cloneNode(true);
		clone.classList.add('wb-settings-additional-select');
		clone.removeAttribute('id');
		clone.removeAttribute('required');
		clone.childNodes.forEach( function(child) {
			child.removeAttribute('hidden');
			child.removeAttribute('selected');
		} );
		clone.querySelector('option.defaultSelect').setAttribute('selected', '');
		clone.addEventListener( 'input', toggleOption );
		this.before(clone);
		toggleOption.call(clone);
	}
}

/**
 * @this HTMLSelectElement
 */
function toggleOption() {
	var options = [];
	var selected = [];
	var allSelect = this.parentNode.querySelectorAll('select');
	allSelect.forEach( function(select) {
		options.push(...select.options);
		selected.push(...select.selectedOptions);
	} );
	var button = this.parentNode.querySelector('button.addmore');
	if ( selected.some( function(option) {
		if ( option && option.value ) return false;
		else return true;
	} ) || allSelect.length >= 10 || allSelect.length >= this.options.length-1 ) {
		button.setAttribute('hidden', '');
	}
	else button.removeAttribute('hidden');
	selected = selected.filter( function(option) {
		if ( option && option.value ) return true;
		else return false;
	} ).map( function(option) {
		return option.value;
	} );
	options.forEach( function(option) {
		if ( selected.includes( option.value ) && !option.selected ) {
			option.setAttribute('disabled', '');
		}
		else if ( option.disabled ) option.removeAttribute('disabled');
	} );
}

const wiki = document.getElementById('wb-settings-wiki');
if ( wiki ) {
	const feeds = document.getElementById('wb-settings-feeds');
	if ( feeds ) {
		const hidefeeds = document.getElementById('wb-settings-feeds-hide');
		const feedsonly = document.getElementById('wb-settings-feeds-only');
		const hidefeedsonly = document.getElementById('wb-settings-feeds-only-hide');
		feeds.addEventListener( 'change', function() {
			if ( this.checked ) {
				hidefeedsonly.removeAttribute('style');
				if ( !hidefeeds.hasAttribute('style') ) feedsonly.removeAttribute('disabled');
			}
			else {
				hidefeedsonly.setAttribute('style', 'visibility: hidden;');
				feedsonly.setAttribute('disabled', '');
			}
		} );
		wiki.addEventListener( 'input', function() {
			if ( this.validity.valid && /\.(?:fandom\.com|wikia\.org)$/.test(new URL(this.value).hostname) ) {
				hidefeeds.removeAttribute('style');
				feeds.removeAttribute('disabled');
				if ( !hidefeedsonly.hasAttribute('style') ) feedsonly.removeAttribute('disabled');
			}
			else {
				hidefeeds.setAttribute('style', 'visibility: hidden;');
				feeds.setAttribute('disabled', '');
				feedsonly.setAttribute('disabled', '');
			}
		} );
	}
}

const usergroup = document.getElementById('wb-settings-usergroup');
const multigroup = document.getElementById('wb-settings-usergroup-multiple');
if ( usergroup && multigroup ) usergroup.addEventListener( 'input', function () {
	if ( usergroup.value.includes( ',' ) || usergroup.value.includes( '|' ) ) {
		multigroup.removeAttribute('style');
		multigroup.removeAttribute('disabled');
	}
	else if ( !multigroup.hasAttribute('style') ) {
		multigroup.setAttribute('style', 'visibility: hidden;');
		multigroup.setAttribute('disabled', '');
	}
} );

const prefix = document.getElementById('wb-settings-prefix');
if ( prefix ) prefix.addEventListener( 'input', function () {
	if ( prefix.validity.patternMismatch ) {
		if ( prefix.value.trim().includes( ' ' ) ) {
			prefix.setCustomValidity('The prefix may not include spaces!');
		}
		else if ( prefix.value.includes( '`' ) ) {
			prefix.setCustomValidity('The prefix may not include code markdown!');
		}
		else if ( prefix.value.includes( '\\' ) ) {
			prefix.setCustomValidity('The prefix may not include backslashes!');
		}
		else prefix.setCustomValidity('');
	}
	else prefix.setCustomValidity('');
} );
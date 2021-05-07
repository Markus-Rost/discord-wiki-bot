function lang(message = '') {
	var keys = ( message.length ? message.split('.') : [] );
	var text = i18n[0];
	var fallback = 1;
	for ( var n = 0; n < keys.length; n++ ) {
		if ( text ) {
			text = text[keys[n]];
			if ( typeof text === 'string' ) text = text.trim();
		}
		if ( !text ) {
			if ( fallback < i18n.length ) {
				text = i18n[fallback];
				fallback++;
				n = -1;
			}
			else {
				n = keys.length;
			}
		}
	}
	return ( text || '⧼' + message + '⧽' );
}

var baseSelect = document.getElementsByTagName('select');
for ( var b = 0; b < baseSelect.length; b++ ) {
	if ( baseSelect[b].id === 'wb-settings-lang' ) {
		const langWidget = document.getElementById('wb-settings-lang-widget');
		if ( langWidget ) {
			var widgetPath = 'widgets';
			if ( document.location.pathname.split('/')[3] === 'rcscript' ) {
				widgetPath = 'widgets/RcGcDb';
			}
			langWidget.setAttribute('src', `/src/${widgetPath}/${baseSelect[b].value}.png`);
			baseSelect[b].addEventListener( 'input', function() {
				langWidget.setAttribute('src', `/src/${widgetPath}/${this.value}.png`);
			} );
		}
	}
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
	};
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
	wiki.addEventListener( 'input', function() {
		if ( !/^(?:https?:)?\/\//.test(this.value) ) {
			if ( this.validity.valid ) {
				var divTemp = document.createElement('div');
				divTemp.innerHTML = '<input type="url" value="invalid">';
				this.setCustomValidity(divTemp.firstChild.validationMessage);
			}
		}
		else this.setCustomValidity('');
	} );
	const wikicheck = document.getElementById('wb-settings-wiki-check');
	const wikichecknotice = document.getElementById('wb-settings-wiki-check-notice');
	if ( wikicheck && wikichecknotice ) {
		wikicheck.onclick = function() {
			var wikinew = wiki.value.replace( /^(?:https?:)?\/\//, '' );
			var regex = wikinew.match( /^([a-z\d-]{1,50}\.(?:gamepedia\.com|(?:fandom\.com|wikia\.org)(?:(?!\/(?:wiki|api)\/)\/[a-z-]{2,12})?))(?:\/|$)/ );
			if ( regex ) wikinew = regex[1];
			else if ( !wiki.validity.valid ) return wiki.reportValidity();
			else {
				wikinew = wikinew.replace( /\/(?:api|load|index)\.php(?:|\?.*)$/, '' ).replace( /\/$/, '' );
			}
			var readonly = wiki.hasAttribute('readonly');
			wiki.setAttribute('readonly', '');
			wikicheck.setAttribute('disabled', '');
			fetch( '/api?wiki=' + encodeURIComponent( wikinew ), {
				method: 'GET',
				cache: 'no-cache',
				mode: 'same-origin',
				headers: {
					Accept: 'application/json'
				}
			} ).then( function(response) {
				if ( response.ok && response.status === 200 ) return response.json();
				else return Promise.reject('Error: The server did not respond correctly.');
			} ).then( function(response) {
				if ( !response.api ) {
					console.log('Error: The server did not respond correctly.');
					return;
				}
				wikichecknotice.className = 'notice';
				wikichecknotice.innerHTML = '';
				if ( response.error ) {
					wiki.setCustomValidity(lang('invalid.title'));
					wikichecknotice.classList.add('notice-error');
					var noticeTitle = document.createElement('b');
					noticeTitle.textContent = lang('invalid.title');
					var noticeText = document.createElement('div');
					noticeText.textContent = lang('invalid.text');
					var noticeNote = '';
					if ( response.error_code ) {
						noticeNote = document.createElement('div');
						noticeNote.textContent = lang('invalid.note_' + response.error_code);
					}
					wikichecknotice.append(noticeTitle, noticeText, noticeNote);
					return;
				}
				if ( !readonly ) wiki.value = response.wiki;
				if ( document.location.pathname.split('/')[3] === 'rcscript' ) {
					if ( !response.MediaWiki ) {
						wiki.setCustomValidity(lang('outdated.title'));
						wikichecknotice.classList.add('notice-error');
						var noticeTitle = document.createElement('b');
						noticeTitle.textContent = lang('outdated.title');
						var noticeText = document.createElement('div');
						noticeText.textContent = lang('outdated.text');
						var noticeLink = document.createElement('a');
						noticeLink.setAttribute('target', '_blank');
						noticeLink.setAttribute('href', 'https://www.mediawiki.org/wiki/MediaWiki_1.30');
						noticeLink.textContent = 'https://www.mediawiki.org/wiki/MediaWiki_1.30';
						wikichecknotice.append(noticeTitle, noticeText, noticeLink);
						return;
					}
					if ( response.RcGcDw !== document.location.pathname.split('/')[2] ) {
						wikichecknotice.classList.add('notice-info');
						var noticeTitle = document.createElement('b');
						noticeTitle.textContent = lang('sysmessage.title');
						var sysmessageLink = document.createElement('a');
						sysmessageLink.setAttribute('target', '_blank');
						sysmessageLink.setAttribute('href', response.customRcGcDw);
						var sysmessageCode = document.createElement('code');
						sysmessageCode.textContent = 'MediaWiki:Custom-RcGcDw';
						sysmessageLink.append(sysmessageCode);
						var guildCode = document.createElement('code');
						guildCode.className = 'user-select';
						guildCode.textContent = document.location.pathname.split('/')[2];
						var noticeText = document.createElement('div');
						var textSnippets = lang('sysmessage.text').split(/\$\d/);
						noticeText.append(
							document.createTextNode(textSnippets[0]),
							sysmessageLink,
							document.createTextNode(textSnippets[1]),
							guildCode,
							document.createTextNode(textSnippets[2])
						);
						var noticeLink = sysmessageLink.cloneNode();
						noticeLink.textContent = response.customRcGcDw;
						wikichecknotice.append(noticeTitle, noticeText, noticeLink);
						return;
					}
					wikichecknotice.classList.add('notice-success');
					var noticeTitle = document.createElement('b');
					noticeTitle.textContent = lang('valid.title');
					wikichecknotice.append(noticeTitle);
					return;
				}
				wikichecknotice.classList.add('notice-success');
				var noticeTitle = document.createElement('b');
				noticeTitle.textContent = lang('valid.title');
				wikichecknotice.append(noticeTitle);
				if ( !/\.(?:gamepedia\.com|fandom\.com|wikia\.org)$/.test(wiki.value.split('/')[2]) ) {
					if ( !response.MediaWiki ) {
						var noticeLink = document.createElement('a');
						noticeLink.setAttribute('target', '_blank');
						noticeLink.setAttribute('href', 'https://www.mediawiki.org/wiki/MediaWiki_1.30');
						noticeLink.textContent = 'MediaWiki 1.30';
						var noticeText = document.createElement('div');
						var textSnippets = lang('valid.MediaWiki').split(/\$\d/);
						noticeText.append(
							document.createTextNode(textSnippets[0]),
							noticeLink,
							document.createTextNode(textSnippets[1])
						);
						wikichecknotice.append(noticeText);
					}
				}
			}, function(error) {
				console.log(error)
			} ).finally( function() {
				if ( !readonly ) wiki.removeAttribute('readonly');
				wikicheck.removeAttribute('disabled');
			} );
		}
	}
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
			if ( this.validity.valid && /\.(?:fandom\.com|wikia\.org)$/.test(this.value.split('/')[2]) ) {
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
if ( usergroup ) {
	const multigroup = document.getElementById('wb-settings-usergroup-multiple');
	const usergrouplist = document.getElementById('wb-settings-usergroup-list');
	usergroup.addEventListener( 'input', function() {
		if ( /\s*[,|]\s*$/.test(usergroup.value) ) {
			var usedGroups = usergroup.value.trim().split(/\s*[,|]\s*/);
			var lastChar = usergroup.value.substring(usergroup.value.length - 1);
			usergrouplist.childNodes.forEach( function(listedGroup) {
				if ( !listedGroup.value ) return;
				var lastIndex = listedGroup.value.lastIndexOf(lastChar);
				var originalGroup = listedGroup.value.substring(lastIndex + 1).trim();
				if ( usedGroups.includes( originalGroup ) ) return;
				listedGroup.value = `${usergroup.value.trim()} ${originalGroup}`;
			} );
		}
		var newWidth = usergroup.value.trim().length * 7;
		if ( newWidth < usergroup.parentElement.clientWidth * 0.75 ) {
			usergroup.setAttribute('style', `min-width: ${newWidth}px;`);
		}
		if ( usergroup.value.includes( ',' ) || usergroup.value.includes( '|' ) ) {
			multigroup.removeAttribute('style');
			multigroup.removeAttribute('disabled');
		}
		else if ( !multigroup.hasAttribute('style') ) {
			multigroup.setAttribute('style', 'visibility: hidden;');
			multigroup.setAttribute('disabled', '');
		}
	} );
}

const postcount = document.querySelectorAll('.wb-settings-postcount input');
if ( postcount.length ) {
	const postcountinput = document.getElementById('wb-settings-postcount-input');
	postcount.forEach( function(radio) {
		radio.addEventListener( 'change', function() {
			if ( radio.id === 'wb-settings-postcount-both' ) {
				postcountinput.setAttribute('style', 'display: none;');
			}
			else {
				postcountinput.removeAttribute('style');
			}
		} );
	} );
}

const prefix = document.getElementById('wb-settings-prefix');
if ( prefix ) prefix.addEventListener( 'input', function() {
	if ( prefix.validity.patternMismatch ) {
		if ( prefix.value.trim().includes( ' ' ) ) {
			prefix.setCustomValidity(lang('prefix.space'));
		}
		else if ( prefix.value.includes( '`' ) ) {
			prefix.setCustomValidity(lang('prefix.code'));
		}
		else if ( prefix.value.includes( '\\' ) ) {
			prefix.setCustomValidity(lang('prefix.backslash'));
		}
		else prefix.setCustomValidity('');
	}
	else prefix.setCustomValidity('');
} );

/** @type {HTMLSelectElement} */
const addRole = document.getElementById('wb-settings-addrole');
const addRoleButton = document.getElementById('wb-settings-addrole-add');
if ( addRole && addRoleButton ) addRoleButton.onclick = function() {
	if ( addRole.value ) {
		var selectedRole = addRole.children.item(addRole.selectedIndex);
		var newPermission = document.createElement('div');
		var selectedRoleInfo = selectedRole.textContent.split(' – ');
		var newPermissionSpan = document.createElement('span');
		newPermissionSpan.textContent = ( selectedRoleInfo[1] || selectedRoleInfo[0] );
		newPermissionSpan.setAttribute('title', selectedRoleInfo[0]);
		var newPermissionDiv0 = document.createElement('div');
		newPermissionDiv0.classList.add('wb-settings-permission');
		var newPermissionInput = document.createElement('input');
		newPermissionInput.setAttribute('type', 'radio');
		newPermissionInput.setAttribute('name', 'permission-' +  addRole.value);
		newPermissionInput.setAttribute('required', '');
		newPermissionDiv0.append(newPermissionInput, document.createElement('label'));
		/** @type {HTMLDivElement} */
		var newPermissionDiv1 = newPermissionDiv0.cloneNode(true);
		/** @type {HTMLDivElement} */
		var newPermissionDiv2 = newPermissionDiv0.cloneNode(true);
		newPermissionDiv0.firstElementChild.id = 'wb-settings-permission-' + addRole.value + '-0';
		newPermissionDiv1.firstElementChild.id = 'wb-settings-permission-' + addRole.value + '-1';
		newPermissionDiv2.firstElementChild.id = 'wb-settings-permission-' + addRole.value + '-default';
		newPermissionDiv0.firstElementChild.setAttribute('value', '0');
		newPermissionDiv1.firstElementChild.setAttribute('value', '1');
		newPermissionDiv2.firstElementChild.setAttribute('value', '');
		newPermissionDiv0.lastElementChild.setAttribute('for', 'wb-settings-permission-' + addRole.value + '-0');
		newPermissionDiv1.lastElementChild.setAttribute('for', 'wb-settings-permission-' + addRole.value + '-1');
		newPermissionDiv2.lastElementChild.setAttribute('for', 'wb-settings-permission-' + addRole.value + '-default');
		newPermissionDiv0.lastElementChild.textContent = i18nSlashPermission.deny;
		newPermissionDiv1.lastElementChild.textContent = i18nSlashPermission.allow;
		newPermissionDiv2.lastElementChild.textContent = i18nSlashPermission.default;
		newPermissionDiv2.firstElementChild.setAttribute('checked', '');
		newPermission.append(newPermissionSpan, newPermissionDiv0, newPermissionDiv1, newPermissionDiv2);
		addRole.parentElement.after(newPermission);
		selectedRole.remove();
		addRole.firstElementChild.setAttribute('selected', '');
	}
};

/*
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
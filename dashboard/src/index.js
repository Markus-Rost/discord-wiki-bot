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
		/** @type {HTMLImageElement} */
		const langWidget = document.getElementById('wb-settings-lang-widget');
		if ( langWidget ) {
			var widgetPath = 'widgets';
			if ( document.location.pathname.split('/')[3] === 'rcscript' ) {
				widgetPath = 'widgets/RcGcDb';
			}
			langWidget.src = `/src/${widgetPath}/${baseSelect[b].value}.png`;
			langWidget.alt = baseSelect[b].selectedOptions.item(0).textContent;
			baseSelect[b].addEventListener( 'input', function() {
				langWidget.src = `/src/${widgetPath}/${this.value}.png`;
				langWidget.alt = this.selectedOptions.item(0).textContent;
			} );
		}
	}
	if ( baseSelect[b].classList.contains( 'wb-settings-project-subprefix' ) ) {
		baseSelect[b].addEventListener( 'input', function() {
			let idTemplate = 'wb-settings-wiki-subprefix-' + this.name.replace( 'subprefix_', '' );
			if ( this.value ) {
				this.parentElement.children[idTemplate].disabled = true;
				this.parentElement.children[idTemplate].style.display = 'none';
				this.parentElement.children[idTemplate + '-check'].disabled = true;
				this.parentElement.children[idTemplate + '-check'].style.display = 'none';
				this.parentElement.children[idTemplate + '-check-notice'].innerHTML = '';
				this.parentElement.children[idTemplate + '-check-notice'].className = 'wb-settings-wiki-check-notice';
			}
			else {
				this.parentElement.children[idTemplate].disabled = false;
				this.parentElement.children[idTemplate].style.display = null;
				this.parentElement.children[idTemplate + '-check'].disabled = false;
				this.parentElement.children[idTemplate + '-check'].style.display = null;
			}
		} );
	}
	if ( baseSelect[b].parentElement.parentElement.querySelector('button.addmore') ) {
		baseSelect[b].addEventListener( 'input', toggleOption );
		toggleOption.call(baseSelect[b]);
	}
}

/** @type {HTMLCollectionOf<HTMLButtonElement>} */
var addmore = document.getElementsByClassName('addmore');
for ( var j = 0; j < addmore.length; j++ ) {
	/** @this HTMLButtonElement */
	addmore[j].onclick = function() {
		/** @type {HTMLDivElement} */
		var clone = this.previousElementSibling.cloneNode(true);
		clone.classList.add('wb-settings-additional-select');
		if ( clone.firstElementChild.tagName === 'LABEL' ) clone.removeChild(clone.firstElementChild);
		/** @type {HTMLSelectElement} */
		var cloneSelect = clone.firstElementChild;
		var newName = cloneSelect.name.replace( /^([a-z]+-)(\d)$/, function(fullname, base, id) {
			return base + (+id + 1);
		} );
		cloneSelect.name = newName;
		cloneSelect.removeAttribute('id');
		cloneSelect.required = false;
		cloneSelect.childNodes.forEach( function(child) {
			child.hidden = false;
			child.selected = false;
			child.defaultSelected = false;
		} );
		cloneSelect.querySelector('option.defaultSelect').defaultSelected = true;
		cloneSelect.querySelector('option.defaultSelect').selected = true;
		cloneSelect.addEventListener( 'input', toggleOption );
		cloneSelect.name
		cloneSelect.htmlFor
		cloneSelect.id
		if ( clone.children.length === 5 ) {
			clone.children.item(1).name = newName + '-change';
			clone.children.item(1).id = 'wb-settings-' + newName + '-add';
			clone.children.item(1).checked = false;
			clone.children.item(2).htmlFor = 'wb-settings-' + newName + '-add';
			clone.children.item(3).name = newName + '-change';
			clone.children.item(3).id = 'wb-settings-' + newName + '-remove';
			clone.children.item(3).checked = false;
			clone.children.item(4).htmlFor = 'wb-settings-' + newName + '-remove';
			clone.children.item(1).defaultChecked = true;
			clone.children.item(1).checked = true;
		}
		this.before(clone);
		toggleOption.call(cloneSelect);
	};
}

/** @this HTMLSelectElement */
function toggleOption() {
	/** @type {HTMLOptionElement[]} */
	var options = [];
	/** @type {HTMLOptionElement[]} */
	var selected = [];
	var allSelect = this.parentElement.parentElement.querySelectorAll('select');
	allSelect.forEach( function(select) {
		options.push(...select.options);
		selected.push(...select.selectedOptions);
	} );
	/** @type {HTMLButtonElement} */
	var button = this.parentElement.parentElement.querySelector('button.addmore');
	if ( selected.some( function(option) {
		if ( option && option.value ) return false;
		else return true;
	} ) || allSelect.length >= 10 || allSelect.length >= this.options.length-1 ) {
		button.hidden = true;
	}
	else button.hidden = false;
	var selectedValues = selected.filter( function(option) {
		if ( option && option.value ) return true;
		else return false;
	} ).map( function(option) {
		return option.value;
	} );
	options.forEach( function(option) {
		if ( selectedValues.includes( option.value ) && !option.selected ) {
			option.disabled = true;
		}
		else if ( option.disabled ) option.disabled = false;
	} );
}

var divTemp = document.createElement('div');
divTemp.innerHTML = '<input type="url" value="invalid">';
const validationMessageInvalidURL = divTemp.firstChild.validationMessage;

/** @type {HTMLCollectionOf<HTMLInputElement>} */
const wikis = document.getElementsByClassName('wb-settings-wiki');
for ( var w = 0; w < wikis.length; w++ ) (function(wiki) {
	wiki.addEventListener( 'input', function() {
		if ( !/^(?:https?:)?\/\//.test(this.value) ) {
			if ( this.validity.valid ) {
				this.setCustomValidity(validationMessageInvalidURL);
			}
		}
		else this.setCustomValidity('');
	} );
	/** @type {HTMLButtonElement} */
	const wikicheck = wiki.parentElement.children[wiki.id + '-check'];
	/** @type {HTMLDivElement} */
	const wikichecknotice = wiki.parentElement.children[wiki.id + '-check-notice'];
	if ( wikicheck && wikichecknotice ) {
		wikicheck.onclick = function() {
			var wikinew = wiki.value.replace( /^(?:https?:)?\/\//, '' );
			var regex = wikinew.match( /^([a-z\d-]{1,50}\.(?:gamepedia\.com|(?:fandom\.com|wikia\.org)(?:(?!\/(?:wiki|api)\/)\/[a-z-]{2,12})?))(?:\/|$)/ );
			if ( regex ) wikinew = regex[1];
			else if ( !wiki.validity.valid ) return wiki.reportValidity();
			else {
				wikinew = wikinew.replace( /\/(?:index|api|load|rest)\.php(?:|[\?\/#].*)$/, '' ).replace( /\/$/, '' );
			}
			var readonly = wiki.readOnly;
			wiki.readOnly = true;
			wikicheck.disabled = true;
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
				wikichecknotice.className = ['wb-settings-wiki-check-notice', 'notice'].join(' ');
				wikichecknotice.innerHTML = '';
				var noticeExtraParts = [];
				if ( response.sitename ) {
					var wikiEmbed = document.createElement('a');
					wikiEmbed.target = '_blank';
					wikiEmbed.href = response.base;
					var wikiEmbedDiv = document.createElement('div');
					wikiEmbed.append(wikiEmbedDiv);
					var wikiEmbedStrong = document.createElement('strong');
					wikiEmbedStrong.textContent = response.sitename;
					var wikiEmbedImg = document.createElement('img');
					wikiEmbedImg.src = response.logo;
					wikiEmbedImg.alt = response.sitename;
					var wikiEmbedSmall = document.createElement('small');
					wikiEmbedSmall.textContent = response.base;
					wikiEmbedDiv.append(wikiEmbedStrong, wikiEmbedImg, wikiEmbedSmall);
					noticeExtraParts.push(document.createElement('hr'), wikiEmbed);
				}
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
					wikichecknotice.append(noticeTitle, noticeText, noticeNote, ...noticeExtraParts);
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
						noticeLink.target = '_blank';
						noticeLink.href = 'https://www.mediawiki.org/wiki/MediaWiki_1.30';
						noticeLink.textContent = 'https://www.mediawiki.org/wiki/MediaWiki_1.30';
						wikichecknotice.append(noticeTitle, noticeText, noticeLink, ...noticeExtraParts);
						return;
					}
					if ( response.RcGcDw?.trim() !== document.location.pathname.split('/')[2] && ( document.location.pathname.split('/')[4] === 'new' || wiki.value !== wiki.defaultValue ) ) {
						wikichecknotice.classList.add('notice-info');
						var noticeTitle = document.createElement('b');
						noticeTitle.textContent = lang('sysmessage.title');
						var sysmessageLink = document.createElement('a');
						sysmessageLink.target = '_blank';
						sysmessageLink.href = response.customRcGcDw;
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
						wikichecknotice.append(noticeTitle, noticeText, noticeLink, ...noticeExtraParts);
						return;
					}
					wikichecknotice.classList.add('notice-success');
					var noticeTitle = document.createElement('b');
					noticeTitle.textContent = lang('valid.title');
					wikichecknotice.append(noticeTitle, ...noticeExtraParts);
					return;
				}
				wikichecknotice.classList.add('notice-success');
				var noticeTitle = document.createElement('b');
				noticeTitle.textContent = lang('valid.title');
				wikichecknotice.append(noticeTitle);
				if ( !response.MediaWiki ) {
					var noticeLink = document.createElement('a');
					noticeLink.target = '_blank';
					noticeLink.href = 'https://www.mediawiki.org/wiki/MediaWiki_1.30';
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
				if ( noticeExtraParts.length ) wikichecknotice.append(...noticeExtraParts);
			}, function(error) {
				console.log(error)
			} ).finally( function() {
				wiki.readOnly = readonly;
				wikicheck.disabled = false;
			} );
		};
	}
	if ( wiki.id === 'wb-settings-wiki' ) {
		/** @type {HTMLInputElement} */
		const feeds = document.getElementById('wb-settings-feeds');
		if ( feeds ) {
			/** @type {HTMLDivElement} */
			const hidefeeds = document.getElementById('wb-settings-feeds-hide');
			/** @type {HTMLInputElement} */
			const feedsonly = document.getElementById('wb-settings-feeds-only');
			/** @type {HTMLDivElement} */
			const hidefeedsonly = document.getElementById('wb-settings-feeds-only-hide');
			feeds.addEventListener( 'change', function() {
				if ( this.checked ) {
					hidefeedsonly.style.visibility = '';
					if ( !hidefeeds.style.visibility ) feedsonly.disabled = false;
				}
				else {
					hidefeedsonly.style.visibility = 'hidden';
					feedsonly.disabled = true;
				}
			} );
			wiki.addEventListener( 'input', function() {
				if ( this.validity.valid && this.value.split('/')[2].endsWith( '.fandom.com' ) ) {
					hidefeeds.style.visibility = '';
					feeds.disabled = false;
					if ( !hidefeedsonly.style.visibility ) feedsonly.disabled = false;
				}
				else {
					hidefeeds.style.visibility = 'hidden';
					feeds.disabled = true;
					feedsonly.disabled = true;
				}
			} );
		}
	}
})(wikis[w]);

/** @type {HTMLInputElement} */
const avatar = document.getElementById('wb-settings-avatar');
if ( avatar ) {
	avatar.addEventListener( 'input', function() {
		if ( !/^(?:https?:)?\/\//.test(this.value) ) {
			if ( this.validity.valid ) {
				this.setCustomValidity(validationMessageInvalidURL);
			}
		}
		else this.setCustomValidity('');
	} );
	/** @type {HTMLButtonElement} */
	const avatarbutton = document.getElementById('wb-settings-avatar-preview');
	if ( avatarbutton ) {
		const avatarpreview = document.createElement('img');
		avatarpreview.id = 'wb-settings-avatar-preview-img';
		avatarpreview.classList.add('avatar');
		const validContentTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		avatarbutton.onclick = function() {
			if ( !avatar.value ) return avatarpreview.remove();
			if ( !avatar.validity.valid ) {
				avatarpreview.remove();
				return avatar.reportValidity();
			}
			if ( avatar.value === avatar.defaultValue ) {
				avatarpreview.src = avatar.value;
				avatarbutton.after(avatarpreview);
				return;
			}
			fetch( avatar.value, {
				method: 'HEAD',
				referrer: ''
			} ).catch( function(error) {
				if ( avatar.value.startsWith( 'https://cdn.discordapp.com/attachments/' ) && error.name === 'TypeError' ) {
					return fetch( avatar.value.replace( 'https://cdn.discordapp.com/attachments/', 'https://media.discordapp.net/attachments/' ), {
						method: 'HEAD',
						referrer: ''
					} );
				}
				throw error;
			} ).then( function(response) {
				avatar.value = response.url;
				if ( !validContentTypes.includes( response.headers.get('content-type') ) ) {
					avatarpreview.remove();
					var invalidContentType = lang('avatar.content_type').replace( /\$1/g, response.headers.get('content-type') );
					avatar.setCustomValidity(invalidContentType + '\n' + validContentTypes.join(', ') );
					avatar.reportValidity();
					return console.log( 'Invalid content type:', response.headers.get('content-type') );
				}
				avatarpreview.src = avatar.value;
				avatarbutton.after(avatarpreview);
			}, function(error) {
				console.log(error);
				avatarpreview.remove();
				avatar.setCustomValidity(lang('avatar.invalid_url'));
				avatar.reportValidity();
			} );
		};
		if ( avatar.value ) {
			avatarpreview.src = avatar.value;
			avatarbutton.after(avatarpreview);
		}
	}
}

/** @type {HTMLInputElement} */
const logall = document.getElementById('wb-settings-flag_logall');
if ( logall ) {
	/** @type {HTMLDivElement} */
	const hidelogall = document.getElementById('wb-settings-logall-hide');
	/** @type {HTMLSelectElement} */
	const logchannel = document.getElementById('wb-settings-channel');
	if ( logchannel ) logchannel.addEventListener( 'input', function() {
		if ( this.value ) {
			hidelogall.style.visibility = '';
			logall.disabled = false;
			if ( hidelogall.style.display ) hidelogall.style.display = '';
		}
		else {
			hidelogall.style.visibility = 'hidden';
			logall.disabled = true;
		}
	} );
}

/** @type {HTMLInputElement} */
const usergroup = document.getElementById('wb-settings-usergroup');
if ( usergroup ) {
	/** @type {HTMLDivElement} */
	const multigroup = document.getElementById('wb-settings-usergroup-multiple');
	/** @type {HTMLDataListElement} */
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
			usergroup.style.minWidth = newWidth + 'px';
		}
		if ( usergroup.value.includes( ',' ) || usergroup.value.includes( '|' ) ) {
			multigroup.style.display = '';
			multigroup.style.visibility = '';
			multigroup.disabled = false;
		}
		else if ( !multigroup.style.visibility ) {
			multigroup.style.visibility = 'hidden';
			multigroup.disabled = true;
		}
	} );

	function fillUsergroupList({query: {allmessages: wikiUsergroupList = [], usergroups: wikiUsergroupListPermissions = []} = {}} = {}) {
		if ( !wikiUsergroupList.length ) return;
		usergrouplist.replaceChildren(...[
			...wikiUsergroupList.filter( wikigroup => {
				if ( wikigroup.name === 'group-all' ) return false;
				if ( wikigroup.name === 'group-membership-link-with-expiry' ) return false;
				if ( wikigroup.name.endsWith( '.css' ) || wikigroup.name.endsWith( '.js' ) ) return false;
				if ( wikigroup.name.endsWith( '-member' ) && wikiUsergroupList.some( wikigroupmember => {
					return wikigroupmember.name === wikigroup.name.replace( /-member$/, '' );
				} ) ) return false;
				return true;
			} ).map( wikigroup => {
				return new Option(wikigroup['*'], wikigroup.name.replace( /^group-/, '' ));
			} ),
			...wikiUsergroupListPermissions.map( wikigroup => wikigroup.name ).filter( function(wikigroup) {
				if ( wikigroup === '*' ) return false;
				if ( wikiUsergroupList.some( wikigroupmember => {
					if ( 'group-' + wikigroup === wikigroupmember.name ) return true;
					if ( 'group-' + wikigroup + '-member' === wikigroupmember.name ) return true;
					return false;
				} ) ) return false;
				return true;
			} ).map( wikigroup => {
				return new Option(wikigroup, wikigroup);
			} )
		].sort( (a, b) => {
			if ( a.value < b.value ) return -1;
			if ( a.value > b.value ) return 1;
			return 0;
		} ));
	}
}

/** @type {NodeListOf<HTMLInputElement>} */
const postcount = document.querySelectorAll('.wb-settings-postcount input');
if ( postcount.length ) {
	/** @type {HTMLDivElement} */
	const postcountinput = document.getElementById('wb-settings-postcount-input');
	postcount.forEach( function(radio) {
		radio.addEventListener( 'change', function() {
			if ( radio.id === 'wb-settings-postcount-both' ) {
				postcountinput.style.display = 'none';
			}
			else {
				postcountinput.style.display = '';
			}
		} );
	} );
}

/** @type {HTMLInputElement} */
const prefix = document.getElementById('wb-settings-prefix');
if ( prefix ) prefix.addEventListener( 'input', function() {
	if ( prefix.validity.patternMismatch ) {
		if ( prefix.value.trim().includes( ' ' ) ) {
			prefix.title = lang('prefix.space');
		}
		else if ( prefix.value.includes( '`' ) ) {
			prefix.title = lang('prefix.code');
		}
		else if ( prefix.value.includes( '\\' ) ) {
			prefix.title = lang('prefix.backslash');
		}
		else prefix.title = '';
	}
	else prefix.title = '';
} );

var textAreas = document.getElementsByTagName('textarea');
if ( textAreas.length ) {
	/** @type {HTMLTextAreaElement} */
	var textArea = null;
	var codeButtons = document.getElementsByClassName('form-button');
	for ( var cb = 0; cb < codeButtons.length; cb++ ) {
		codeButtons[cb].onclick = addVariable;
	}

	for ( var ta = 0; ta < textAreas.length; ta++ ) {
		updateTextLength.call(textAreas[ta]);
		textAreas[ta].addEventListener('keyup', updateTextLength);
		textAreas[ta].addEventListener('keydown', allowTabs);
		textAreas[ta].onclick = function() {
			if ( !textArea ) {
				for ( var us = 0; us < codeButtons.length; us++ ) {
					codeButtons[us].classList.remove('user-select');
				}
			}
			textArea = this;
		};
	}

	/**
	 * @this HTMLElement
	 * @param {MouseEvent} e
	 */
	function addVariable(e) {
		if ( !textArea || e.shiftKey ) return;
		var start = textArea.selectionStart;
		var end = textArea.selectionEnd;
		var valueBefore = ( this.dataset?.before || this.innerText );
		var valueAfter = ( this.dataset?.after || '' );
		if ( (textArea.textLength - (end - start)) + (valueBefore.length + valueAfter.length) > textArea.maxLength ) return document.getSelection().selectAllChildren(this);
		if ( valueAfter ) {
			textArea.value = textArea.value.substring(0, start) + valueBefore + textArea.value.substring(start, end) + valueAfter + textArea.value.substring(end);
			textArea.selectionStart = start + valueBefore.length;
			textArea.selectionEnd = end + valueBefore.length;
		}
		else {
			textArea.value = textArea.value.substring(0, start) + valueBefore + textArea.value.substring(end);
			textArea.selectionStart = textArea.selectionEnd = start + valueBefore.length;
		}
		updateTextLength.call(textArea);
		textArea.focus();
	}

	/**
	 * @this HTMLTextAreaElement
	 * @param {KeyboardEvent} e
	 */
	function allowTabs(e) {
		if ( e.key !== 'Tab' ) return;
		if ( this.value.includes( '`ˋ`' ) ) this.value = this.value.replace( /`ˋ`/g, '```' );
		var start = this.selectionStart;
		var end = this.selectionEnd;
		if ( this.value.substring(0, start).includes( '```' ) && this.value.substring(end).includes( '```' ) ) {
			e.preventDefault();
			if ( this.textLength > this.maxLength ) return;
			this.value = this.value.substring(0, start) + '\t' + this.value.substring(end);
			this.selectionStart = this.selectionEnd = start + 1;
		}
	}

	/** @this HTMLTextAreaElement */
	function updateTextLength() {
		this.labels.item(0).children.item(0).textContent = this.textLength + ' / ' + this.maxLength;
	}
}

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
	};
}
*/

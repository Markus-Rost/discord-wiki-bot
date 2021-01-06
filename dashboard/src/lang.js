var currentLang = ( document.cookie.split('; ').find( cookie => {
	return cookie.split('=')[0] === 'language' && /^"[a-z\-]+"$/.test(( cookie.split('=')[1] || '' ));
} ) || 'en' ).replace( /^language="([a-z\-]+)"$/, '$1' );
var channellist = document.getElementById('channellist');
var langSelector = document.createElement('div');
langSelector.id = 'lang-selector';
langSelector.textContent = selectLanguage;
var langIcon = document.createElement('img');
langIcon.setAttribute('src', '/src/language.svg');
langSelector.prepend(langIcon);
var langDropdown = document.createElement('div');
langDropdown.id = 'lang-dropdown';
langDropdown.setAttribute('style', `max-height: ${window.innerHeight - 80}px;`);
var langOptions = Object.keys(allLangs).map( function(lang) {
	var langOption = document.createElement('div');
	langOption.textContent = allLangs[lang];
	if ( currentLang === lang ) langOption.className = 'current';
	langOption.onclick = function() {
		document.cookie = `language="${lang}"; Path=/; Max-Age=31536000`;
		location.reload();
	};
	return langOption;
} );
langDropdown.append(...langOptions);
langSelector.append(langDropdown);
channellist.after(langSelector);
channellist.setAttribute('style', 'bottom: 32px;');
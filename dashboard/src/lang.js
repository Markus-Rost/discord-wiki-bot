var currentTheme = ( document.cookie.split('; ').find( cookie => {
	return cookie.split('=')[0] === 'theme' && /^"(?:light|dark)"$/.test(( cookie.split('=')[1] || '' ));
} ) || 'dark' ).replace( /^theme="(light|dark)"$/, '$1' );
var lightTheme = document.getElementById('theme-light');
var darkTheme = document.getElementById('theme-dark');
lightTheme.onclick = function() {
	document.cookie = 'theme="light"; Path=/; Max-Age=31536000';
	document.documentElement.classList.add('theme-light');
	lightTheme.setAttribute('style', 'display: none;');
	darkTheme.removeAttribute('style');
};
darkTheme.onclick = function() {
	document.cookie = 'theme="dark"; Path=/; Max-Age=31536000';
	document.documentElement.classList.remove('theme-light');
	darkTheme.setAttribute('style', 'display: none;');
	lightTheme.removeAttribute('style');
};
document.getElementById('theme-separator').removeAttribute('style');
if ( currentTheme === 'light' ) {
	darkTheme.removeAttribute('style');
	document.documentElement.classList.add('theme-light');
}
else {
	lightTheme.removeAttribute('style');
	document.documentElement.classList.remove('theme-light');
}

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
	if ( document.documentElement.lang === lang ) langOption.className = 'current';
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
var selectedChannel = channellist.querySelector('.channel.selected');
if ( selectedChannel ) {
	var selectedChannelOffset = channellist.offsetHeight - selectedChannel.offsetTop;
	if ( selectedChannelOffset < 64 ) channellist.scrollBy(0, 64 - selectedChannelOffset);
}
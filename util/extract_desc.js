/**
 * Get the description for a page.
 * @param {String} [text] - The full page extract.
 * @param {String} [fragment] - The section title.
 * @returns {String[]}
 */
function extract_desc(text = '', fragment = '') {
	var sectionIndex = text.indexOf('\ufffd\ufffd');
	var extract = ( sectionIndex !== -1 ? text.substring(0, sectionIndex) : text ).trim().escapeFormatting();
	if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
	var section = null;
	var regex = /\ufffd{2}(\d)\ufffd{2}([^\n]+)/g;
	var sectionHeader = '';
	var sectionText = '';
	while ( fragment && ( section = regex.exec(text) ) !== null ) {
		if ( section[2].replace( / /g, '_' ) !== fragment.replace( / /g, '_' ) ) continue;
		sectionHeader = section[2].escapeFormatting();
		if ( sectionHeader.length > 240 ) sectionHeader = sectionHeader.substring(0, 240) + '\u2026';
		sectionHeader = section_formatting(sectionHeader, section[1]);
		sectionText = text.substring(regex.lastIndex);
		switch ( section[1] ) {
			case '6':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd6\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
			case '5':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd5\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
			case '4':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd4\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
			case '3':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd3\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
			case '2':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd2\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
			case '1':
				sectionIndex = sectionText.indexOf('\ufffd\ufffd1\ufffd\ufffd');
				if ( sectionIndex !== -1 ) sectionText = sectionText.substring(0, sectionIndex);
		}
		sectionText = sectionText.trim().escapeFormatting().replace( /\ufffd{2}(\d)\ufffd{2}([^\n]+)/g, (match, n, sectionTitle) => {
			return section_formatting(sectionTitle, n);
		} );
		if ( sectionText.length > 1000 ) sectionText = sectionText.substring(0, 1000) + '\u2026';
		break;
	}
	return [extract, sectionHeader, sectionText];
}

/**
 * Format section title.
 * @param {String} title - The section title.
 * @param {String} n - The header level.
 * @returns {String}
 */
function section_formatting(title, n) {
	switch ( n ) {
		case '1':
			title = '***__' + title + '__***';
			break;
		case '2':
			title = '**__' + title + '__**';
			break;
		case '3':
			title = '**' + title + '**';
			break;
		case '4':
			title = '__' + title + '__';
			break;
		case '5':
			title = '*' + title + '*';
			break;
	}
	return title;
}

module.exports = extract_desc;
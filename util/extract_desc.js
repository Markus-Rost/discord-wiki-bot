import { escapeFormatting } from './functions.js';

/**
 * Get the description for a page.
 * @param {String} [text] - The full page extract.
 * @param {Object} [embedLimits] - The embed limits.
 * @param {Number} [embedLimits.descLength] - The description length.
 * @param {Number} [embedLimits.sectionLength] - The section length.
 * @param {Number} [embedLimits.sectionDescLength] - The description length with section.
 * @param {String} [fragment] - The section title.
 * @returns {String}
 */
export default function extract_desc(text = '', {descLength = 1_000, sectionLength = 2_000, sectionDescLength = 500} = {}, fragment = '') {
	var sectionIndex = text.indexOf('\ufffd\ufffd');
	var extract = ( descLength ? escapeFormatting(( sectionIndex !== -1 ? text.substring(0, sectionIndex) : text ).trim()) : '' );
	if ( extract.length > descLength ) extract = extract.substring(0, descLength) + '\u2026';
	var section = null;
	var regex = /\ufffd{2}(\d)\ufffd{2}([^\n]+)/g;
	while ( fragment && sectionLength && ( section = regex.exec(text) ) !== null ) {
		if ( section[2].replaceAll( ' ', '_' ) !== fragment.replaceAll( ' ', '_' ) ) continue;
		let sectionHeader = section_formatting(escapeFormatting(section[2]), section[1]);
		let sectionText = text.substring(regex.lastIndex);
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
		sectionText = escapeFormatting(sectionText.trim()).replace( /\ufffd{2}(\d)\ufffd{2}([^\n]+)/g, (match, n, sectionTitle) => {
			return section_formatting(sectionTitle, n);
		} );
		if ( !sectionDescLength ) extract = '';
		else if ( extract.length > sectionDescLength ) extract = extract.substring(0, sectionDescLength) + '\u2026';
		if ( sectionText.length > sectionLength ) sectionText = sectionText.substring(0, sectionLength) + '\u2026';
		extract += '\n' + sectionHeader + '\n' + sectionText;
		if ( extract.length > 4_000 ) extract = extract.substring(0, 4_000) + '\u2026';
		break;
	}
	return extract;
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
			title = '# ' + title;
			break;
		case '2':
			title = '## ' + title;
			break;
		case '3':
			title = '### ' + title;
			break;
		case '4':
			title = '***__' + title + '__***';
			break;
		case '5':
			title = '**__' + title + '__**';
			break;
		case '6':
			title = '**' + title + '**';
			break;
	}
	return title;
}
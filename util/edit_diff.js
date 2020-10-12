const htmlparser = require('htmlparser2');
const {escapeFormatting} = require('./functions.js');

/**
 * Change edit diffs to markdown text.
 * @param {String} html - The edit diff in HTML.
 * @param {String} more - The localized string for more content.
 * @param {String} whitespace - The localized string for only whitespace.
 * @returns {String[]}
 */
function diffParser(html, more, whitespace) {
	var current_tag = '';
	var small_prev_ins = '';
	var small_prev_del = '';
	var ins_length = more.length;
	var del_length = more.length;
	var added = false;
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( tagname === 'ins' || tagname == 'del' ) current_tag = tagname;
			if ( tagname === 'td' && attribs.class === 'diff-addedline' ) current_tag = tagname+'a';
			if ( tagname === 'td' && attribs.class === 'diff-deletedline' ) current_tag = tagname+"d";
			if ( tagname === 'td' && attribs.class === 'diff-marker' ) added = true;
		},
		ontext: (htmltext) => {
			if ( current_tag === 'ins' && ins_length <= 1000 ) {
				ins_length += ( '**' + escapeFormatting(htmltext) + '**' ).length;
				if ( ins_length <= 1000 ) small_prev_ins += '**' + escapeFormatting(htmltext) + '**';
				else small_prev_ins += more;
			}
			if ( current_tag === 'del' && del_length <= 1000 ) {
				del_length += ( '~~' + escapeFormatting(htmltext) + '~~' ).length;
				if ( del_length <= 1000 ) small_prev_del += '~~' + escapeFormatting(htmltext) + '~~';
				else small_prev_del += more;
			}
			if ( ( current_tag === 'afterins' || current_tag === 'tda') && ins_length <= 1000 ) {
				ins_length += escapeFormatting(htmltext).length;
				if ( ins_length <= 1000 ) small_prev_ins += escapeFormatting(htmltext);
				else small_prev_ins += more;
			}
			if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && del_length <= 1000 ) {
				del_length += escapeFormatting(htmltext).length;
				if ( del_length <= 1000 ) small_prev_del += escapeFormatting(htmltext);
				else small_prev_del += more;
			}
			if ( added ) {
				if ( htmltext === '+' && ins_length <= 1000 ) {
					ins_length++;
					if ( ins_length <= 1000 ) small_prev_ins += '\n';
					else small_prev_ins += more;
				}
				if ( htmltext === '−' && del_length <= 1000 ) {
					del_length++;
					if ( del_length <= 1000 ) small_prev_del += '\n';
					else small_prev_del += more;
				}
				added = false;
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === 'ins' ) {
				current_tag = 'afterins';
			} else if ( tagname === 'del' ) {
				current_tag = 'afterdel';
			} else {
				current_tag = '';
			}
		}
	} );
	parser.write( html );
	parser.end();
	var compare = ['', ''];
	if ( small_prev_del.length ) {
		if ( small_prev_del.replace( /\~\~/g, '' ).trim().length ) {
			compare[0] = small_prev_del.replace( /\~\~\~\~/g, '' );
		} else compare[0] = whitespace;
	}
	if ( small_prev_ins.length ) {
		if ( small_prev_ins.replace( /\*\*/g, '' ).trim().length ) {
			compare[1] = small_prev_ins.replace( /\*\*\*\*/g, '' );
		} else compare[1] = whitespace;
	}
	return compare;
}

module.exports = diffParser;
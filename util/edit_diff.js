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
	var last_ins = null;
	var last_del = null;
	var empty = false;
	var small_prev_ins = '';
	var small_prev_del = '';
	var ins_length = more.length;
	var del_length = more.length;
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			if ( tagname === 'ins' || tagname == 'del' ) current_tag = tagname;
			if ( tagname === 'td' && attribs.class === 'diff-addedline' && ins_length <= 1000 ) {
				current_tag = 'tda';
				last_ins = '';
			}
			if ( tagname === 'td' && attribs.class === 'diff-deletedline' && del_length <= 1000 ) {
				current_tag = 'tdd';
				last_del = '';
			}
			if ( tagname === 'td' && attribs.class === 'diff-empty' ) empty = true;
		},
		ontext: (htmltext) => {
			if ( current_tag === 'ins' && ins_length <= 1000 ) {
				ins_length += ( '**' + escapeFormatting(htmltext) + '**' ).length;
				if ( ins_length <= 1000 ) last_ins += '**' + escapeFormatting(htmltext) + '**';
			}
			if ( current_tag === 'del' && del_length <= 1000 ) {
				del_length += ( '~~' + escapeFormatting(htmltext) + '~~' ).length;
				if ( del_length <= 1000 ) last_del += '~~' + escapeFormatting(htmltext) + '~~';
			}
			if ( current_tag === 'tda' && ins_length <= 1000 ) {
				ins_length += escapeFormatting(htmltext).length;
				if ( ins_length <= 1000 ) last_ins += escapeFormatting(htmltext);
			}
			if ( current_tag === 'tdd' && del_length <= 1000 ) {
				del_length += escapeFormatting(htmltext).length;
				if ( del_length <= 1000 ) last_del += escapeFormatting(htmltext);
			}
		},
		onclosetag: (tagname) => {
			current_tag = '';
			if ( tagname === 'ins' ) current_tag = 'tda';
			if ( tagname === 'del' ) current_tag = 'tdd';
			if ( tagname === 'tr' ) {
				if ( last_ins !== null ) {
					ins_length++;
					if ( empty && last_ins.trim().length && !last_ins.includes( '**' ) ) {
						ins_length += 4;
						last_ins = '**' + last_ins + '**';
					}
					small_prev_ins += '\n' + last_ins;
					if ( ins_length > 1000 ) small_prev_ins += more;
					last_ins = null;
				}
				if ( last_del !== null ) {
					del_length++;
					if ( empty && last_del.trim().length && !last_del.includes( '~~' ) ) {
						del_length += 4;
						last_del = '~~' + last_del + '~~';
					}
					small_prev_del += '\n' + last_del;
					if ( del_length > 1000 ) small_prev_del += more;
					last_del = null;
				}
				empty = false;
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
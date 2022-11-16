import { Parser as HTMLParser } from 'htmlparser2';
import { escapeFormatting } from './functions.js';

/**
 * Change edit diffs to markdown text.
 * @param {String} html - The edit diff in HTML.
 * @param {String} more - The localized string for more content.
 * @param {String} whitespace - The localized string for only whitespace.
 * @returns {[String, String]}
 */
export default function diffParser(html, more, whitespace) {
	var current_tag = '';
	var last_ins = null;
	var last_del = null;
	var empty = false;
	var small_prev_ins = '';
	var small_prev_del = '';
	var ins_length = more.length;
	var del_length = more.length;
	var parser = new HTMLParser( {
		onopentag: (tagname, attribs) => {
			if ( ins_length > SECTION_LENGTH && del_length > SECTION_LENGTH ) parser.pause(); // Prevent the parser from running too long
			if ( tagname === 'ins' || tagname == 'del' ) current_tag = tagname;
			if ( tagname === 'td' ) {
				let classes = ( attribs.class?.split(' ') || [] );
				if ( classes.includes( 'diff-addedline' ) && ins_length <= SECTION_LENGTH ) {
					current_tag = 'tda';
					last_ins = '';
				}
				if ( classes.includes( 'diff-deletedline' ) && del_length <= SECTION_LENGTH ) {
					current_tag = 'tdd';
					last_del = '';
				}
				if ( classes.includes( 'diff-empty' ) ) empty = true;
			}
		},
		ontext: (htmltext) => {
			if ( current_tag === 'ins' && ins_length <= SECTION_LENGTH ) {
				ins_length += ( '**' + escapeFormatting(htmltext) + '**' ).length;
				if ( ins_length <= SECTION_LENGTH ) last_ins += '**' + escapeFormatting(htmltext) + '**';
			}
			if ( current_tag === 'del' && del_length <= SECTION_LENGTH ) {
				del_length += ( '~~' + escapeFormatting(htmltext) + '~~' ).length;
				if ( del_length <= SECTION_LENGTH ) last_del += '~~' + escapeFormatting(htmltext) + '~~';
			}
			if ( current_tag === 'tda' && ins_length <= SECTION_LENGTH ) {
				ins_length += escapeFormatting(htmltext).length;
				if ( ins_length <= SECTION_LENGTH ) last_ins += escapeFormatting(htmltext);
			}
			if ( current_tag === 'tdd' && del_length <= SECTION_LENGTH ) {
				del_length += escapeFormatting(htmltext).length;
				if ( del_length <= SECTION_LENGTH ) last_del += escapeFormatting(htmltext);
			}
		},
		onclosetag: (tagname) => {
			if ( tagname === 'ins' ) current_tag = 'tda';
			if ( tagname === 'del' ) current_tag = 'tdd';
			if ( tagname === 'td' ) current_tag = '';
			if ( tagname === 'tr' ) {
				if ( last_ins !== null ) {
					ins_length++;
					if ( empty && last_ins.trim().length ) {
						if ( last_ins.includes( '**' ) ) last_ins = last_ins.replaceAll( '**', '__' );
						ins_length += 4;
						last_ins = '**' + last_ins + '**';
					}
					small_prev_ins += '\n' + last_ins;
					if ( ins_length > SECTION_LENGTH ) small_prev_ins += more;
					last_ins = null;
				}
				if ( last_del !== null ) {
					del_length++;
					if ( empty && last_del.trim().length ) {
						if ( last_del.includes( '~~' ) ) last_del = last_del.replaceAll( '~~', '__' );
						del_length += 4;
						last_del = '~~' + last_del + '~~';
					}
					small_prev_del += '\n' + last_del;
					if ( del_length > SECTION_LENGTH ) small_prev_del += more;
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
		if ( small_prev_del.replace( /\~\~|__/g, '' ).trim().length ) {
			compare[0] = small_prev_del.replace( /\~\~\~\~|____/g, '' );
		} else compare[0] = whitespace;
	}
	if ( small_prev_ins.length ) {
		if ( small_prev_ins.replace( /\*\*|__/g, '' ).trim().length ) {
			compare[1] = small_prev_ins.replace( /\*\*\*\*|____/g, '' );
		} else compare[1] = whitespace;
	}
	return compare;
}
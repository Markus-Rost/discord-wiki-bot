import help_setup from '../functions/helpsetup.js';
import phabricator from '../functions/phabricator.js';
import check_wiki_general from './wiki/general.js';
import check_wiki_test from './test.js';
const check_wiki = {
	general: check_wiki_general,
	test: check_wiki_test.run
};

/**
 * Processes the wiki linking command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the page.
 * @param {String} [cmd] - The command at this point.
 */
function cmd_link(lang, msg, title, wiki, cmd = '') {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	if ( /^\|\|(?:(?!\|\|).)+\|\|$/.test(title) ) {
		title = title.substring(2, title.length - 2);
		var spoiler = '||';
	}
	if ( /^<[^<>]+>$/.test(title) ) {
		title = title.substring(1, title.length - 1);
		var noEmbed = true;
	}
	msg.reactEmoji('⏳').then( reaction => {
		if ( /^phabricator\.(wikimedia|miraheze)\.org$/.test(wiki.hostname) ) {
			return phabricator(lang, msg, wiki, new URL('/' + title, wiki), reaction, spoiler, noEmbed);
		}
		else check_wiki.general(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed);
	} );
}

export default {
	name: 'LINK',
	everyone: true,
	pause: false,
	owner: true,
	run: cmd_link
};
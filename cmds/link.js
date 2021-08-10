const check_wiki = {
	general: require('./wiki/general.js'),
	test: require('./test.js').run
};
const help_setup = require('../functions/helpsetup.js');
const phabricator = require('../functions/phabricator.js');

/**
 * Processes the wiki linking command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {import('../util/wiki.js')} wiki - The wiki for the page.
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

module.exports = {
	name: 'LINK',
	everyone: true,
	pause: false,
	owner: true,
	run: cmd_link
};
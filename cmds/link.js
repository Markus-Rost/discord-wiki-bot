const check_wiki = {
	fandom: require('./wiki/fandom.js'),
	gamepedia: require('./wiki/gamepedia.js'),
	test: require('./test.js').run
};
const help_setup = require('../functions/helpsetup.js');

function cmd_link(lang, msg, title, wiki, cmd = '') {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	if ( /^\|\|(?:(?!\|\|).)+\|\|$/.test(title) ) {
		title = title.substring( 2, title.length - 2);
		var spoiler = '||';
	}
	msg.reactEmoji('⏳').then( reaction => {
		if ( wiki.isFandom() ) check_wiki.fandom(lang, msg, title, wiki, cmd, reaction, spoiler);
		else check_wiki.gamepedia(lang, msg, title, wiki, cmd, reaction, spoiler);
	} );
}

module.exports = {
	name: 'LINK',
	everyone: true,
	pause: false,
	owner: true,
	run: cmd_link
};
/*
import help_setup from '../functions/helpsetup.js';
import phabricator from '../functions/phabricator.js';
import check_wiki_general from '../cmds/wiki/general.js';
import check_wiki_test from '../cmds/test.js';
const check_wiki = {
	general: check_wiki_general,
	test: check_wiki_test.run
};
*/
/**
 * Post a message with wiki links.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
/*
function slash_wiki(interaction, lang, wiki) {
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);

	var title = interaction.options.getString('title');
	var spoiler = interaction.options.getBoolean('spoiler');
	var noEmbed = interaction.options.getBoolean('noembed');
	interaction.deferReply().then( () => {
		if ( /^phabricator\.(wikimedia|miraheze)\.org$/.test(wiki.hostname) ) {
			return phabricator(lang, interaction, wiki, new URL('/' + title, wiki), null, spoiler, noEmbed);
		}
		else check_wiki.general(lang, msg, title, wiki, '', null, spoiler, noEmbed);
	} );
}
*/
export default {
	name: 'wiki',
	slash: null,
	button: null
};
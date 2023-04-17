import help_setup from '../functions/helpsetup.js';
import phabricator, { phabricatorSites } from '../functions/phabricator.js';
import check_wiki from './wiki/general.js';
import { isMessage, canShowEmbed } from '../util/functions.js';

/**
 * Processes the wiki linking command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the page.
 * @param {String} [cmd] - The command at this point.
 */
export default function cmd_link(lang, msg, title, wiki, cmd = '') {
	if ( msg.wikiWhitelist.length && !msg.wikiWhitelist.includes( wiki.href ) ) return msg.sendChannel(lang.get('general.whitelist'));
	if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
	var spoiler = '';
	if ( /^\|\|(?:(?!\|\|).)+\|\|$/.test(title) ) {
		title = title.substring(2, title.length - 2);
		spoiler = '||';
	}
	var noEmbed = !canShowEmbed(msg);
	if ( /^<[^<>]+>$/.test(title) ) {
		title = title.substring(1, title.length - 1);
		noEmbed = true;
	}
	msg.reactEmoji(WB_EMOJI.waiting).then( reaction => {
		( phabricatorSites.has(wiki.hostname)
		? phabricator(lang, msg, wiki, new URL('/' + title, wiki), spoiler, noEmbed)
		: check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed)
		)?.then( result => {
			if ( !result || isMessage(result) ) return result;
			if ( result.message ) {
				if ( Array.isArray(result.message) ) result.message.forEach( content => msg.sendChannel(content) );
				else if ( result.reaction === WB_EMOJI.error ) msg.sendChannelError(result.message);
				else if ( result.reaction === 'reply' ) msg.replyMsg(result.message, true);
				else msg.sendChannel(result.message).then( message => {
					if ( result.reaction === WB_EMOJI.warning && message ) message.reactEmoji(WB_EMOJI.warning);
					return message;
				} );
			}
			else if ( result.reaction ) {
				msg.reactEmoji(result.reaction);
			}
			if ( reaction ) reaction.removeEmoji();
		} );
	} );
}

export const cmdData = {
	name: 'LINK',
	everyone: true,
	pause: false,
	owner: true,
	run: cmd_link
};
import { Message } from 'discord.js';
import help_setup from '../functions/helpsetup.js';
import phabricator from '../functions/phabricator.js';
import check_wiki from './wiki/general.js';
import { canShowEmbed } from '../util/functions.js';

/**
 * Processes the wiki linking command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} title - The page title.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the page.
 * @param {String} [cmd] - The command at this point.
 */
export default function cmd_link(lang, msg, title, wiki, cmd = '') {
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
	msg.reactEmoji('⏳').then( reaction => {
		( /^phabricator\.(wikimedia|miraheze)\.org$/.test(wiki.hostname)
		? phabricator(lang, msg, wiki, new URL('/' + title, wiki), spoiler, noEmbed)
		: check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler, noEmbed)
		).then( result => {
			if ( !result || result instanceof Message ) return result;
			if ( result.message ) {
				if ( Array.isArray(result.message) ) result.message.map( async content => await msg.sendChannel(content) );
				else if ( result.reaction === 'error' ) msg.sendChannelError(result.message);
				else if ( result.reaction === 'reply' ) msg.replyMsg(result.message, true);
				else msg.sendChannel(result.message).then( message => {
					if ( result.reaction === 'warning' && message ) message.reactEmoji('warning');
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
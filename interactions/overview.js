import { PermissionFlagsBits } from 'discord.js';
import { isMessage, canShowEmbed, sendMessage } from '../util/functions.js';
import interwiki_interaction from './interwiki.js';
import wiki_overview from '../cmds/wiki/overview.js';

/**
 * Post a message with wiki overview.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_overview(interaction, lang, wiki) {
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki')?.trim() || wiki).then( newWiki => {
		var ephemeral = ( interaction.options.getBoolean('private') ?? false ) || pausedGuilds.has(interaction.guildId);
		var noEmbed = interaction.options.getBoolean('noembed') || !canShowEmbed(interaction);
		var spoiler = interaction.options.getBoolean('spoiler') ? '||' : '';
		if ( ephemeral ) lang = lang.uselang(interaction.locale);
		return interaction.deferReply( {ephemeral} ).then( () => {
			return wiki_overview(lang, interaction, newWiki, spoiler, noEmbed).then( result => {
				if ( !result || isMessage(result) ) return result;
				let noEmoji = !interaction.appPermissions?.has(PermissionFlagsBits.UseExternalEmojis);
				if ( result.message ) {
					if ( Array.isArray(result.message) ) {
						let list = [];
						return result.message.slice(1).reduce( (prev, content) => {
							return prev.then( message => {
								list.push(message);
								return interaction.followUp( {content, ephemeral} ).catch(log_error);
							} );
						}, sendMessage(interaction, {
							content: result.message[0],
							ephemeral
						}) ).then( message => {
							list.push(message);
							return list;
						} );
					}
					if ( result.reaction === 'error' ) {
						if ( typeof result.message === 'string' ) result.message = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + result.message;
						else result.message.content = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + ( result.message.content ?? '' );
					}
					else if ( result.reaction === 'warning' ) {
						if ( typeof result.message === 'string' ) result.message = '⚠️ ' + result.message;
						else result.message.content = '⚠️ ' + ( result.message.content ?? '' );
					}
					return sendMessage(interaction, result.message);
				}
				else if ( result.reaction ) {
					let message = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + lang.get('interaction.error') + '\n' + process.env.invite;
					if ( result.reaction === 'nowiki' ) message = ( noEmoji ? '⚠️ ' : '<:unknown_wiki:505884572001763348> ' ) + lang.get('interaction.nowiki');
					if ( result.reaction === '🤷' ) message = '🤷 ' + lang.get('search.noresult');
					return sendMessage(interaction, {content: message});
				}
			} );
		}, log_error );
	}, () => {
		return interaction.reply( {
			content: lang.uselang(interaction.locale).get('interaction.interwiki'),
			ephemeral: true
		} ).catch(log_error);
	} );
}

export default {
	name: 'overview',
	slash: slash_overview,
	autocomplete: interwiki_interaction.autocomplete,
	allowDelete: true
};
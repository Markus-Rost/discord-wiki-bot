import { PermissionFlagsBits } from 'discord.js';
import { isMessage, canShowEmbed, sendMessage } from '../util/functions.js';
import interwiki_interaction from './interwiki.js';
import wiki_diff from '../cmds/wiki/diff.js';

/**
 * Post a message with a wiki edit diff.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_diff(interaction, lang, wiki) {
	var args = [];
	let subcommand = interaction.options.getSubcommand();
	if ( subcommand === 'page' ) {
		let title = interaction.options.getString('title')?.trim();
		if ( !title ) {
			return interaction.reply( {
				content: lang.uselang(interaction.locale).get('interaction.notitle'),
				ephemeral: true
			} ).catch(log_error);
		}
		args.push(title);
	}
	else {
		args.push(interaction.options.getInteger('diffid').toString());
		if ( subcommand === 'relative' ) args.push(interaction.options.getString('compare') ?? 'prev');
		else if ( subcommand === 'multiple' ) args.push(interaction.options.getInteger('oldid').toString());
	}
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki')?.trim() || wiki).then( newWiki => {
		var ephemeral = ( interaction.options.getBoolean('private') ?? false ) || pausedGuilds.has(interaction.guildId);
		if ( interaction.wikiWhitelist.length && !interaction.wikiWhitelist.includes( newWiki.href ) ) ephemeral = true;
		var noEmbed = interaction.options.getBoolean('noembed') || !canShowEmbed(interaction);
		var spoiler = interaction.options.getBoolean('spoiler') ? '||' : '';
		if ( ephemeral ) lang = lang.uselang(interaction.locale);
		return interaction.deferReply( {ephemeral} ).then( () => {
			return wiki_diff(lang, interaction, args, newWiki, spoiler, noEmbed).then( result => {
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
					if ( result.reaction === WB_EMOJI.error ) {
						if ( typeof result.message === 'string' ) result.message = ( noEmoji ? WB_EMOJI.warning : WB_EMOJI.error ) + ' ' + result.message;
						else result.message.content = ( noEmoji ? WB_EMOJI.warning : WB_EMOJI.error ) + ' ' + ( result.message.content ?? '' );
					}
					else if ( result.reaction === WB_EMOJI.warning ) {
						if ( typeof result.message === 'string' ) result.message = WB_EMOJI.warning + ' ' + result.message;
						else result.message.content = WB_EMOJI.warning + ' ' + ( result.message.content ?? '' );
					}
					return sendMessage(interaction, result.message);
				}
				else if ( result.reaction ) {
					let message = ( noEmoji ? WB_EMOJI.warning : WB_EMOJI.error ) + ' ' + lang.get('interaction.error') + '\n' + process.env.invite;
					if ( result.reaction === WB_EMOJI.nowiki ) message = ( noEmoji ? WB_EMOJI.warning : WB_EMOJI.nowiki ) + ' ' + lang.get('interaction.nowiki');
					if ( result.reaction === WB_EMOJI.shrug ) message = WB_EMOJI.shrug + ' ' + lang.get('search.noresult');
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
	name: 'diff',
	slash: slash_diff,
	autocomplete: interwiki_interaction.autocomplete,
	allowDelete: true
};
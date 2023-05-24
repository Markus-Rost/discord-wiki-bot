import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { got, isMessage, canShowEmbed, allowDelete, sendMessage } from '../util/functions.js';
import interwiki_interaction from './interwiki.js';
import wiki_random from '../cmds/wiki/random.js';

/**
 * Post a message with random link.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_random(interaction, lang, wiki) {
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki')?.trim() || wiki).then( newWiki => {
		var namespace = interaction.options.getString('namespace')?.trim().toLowerCase().replaceAll( wiki.spaceReplacement ?? '_', ' ' ).split(/\s*[,|]\s*/g) || [];
		var ephemeral = ( interaction.options.getBoolean('private') ?? false ) || pausedGuilds.has(interaction.guildId);
		if ( interaction.wikiWhitelist.length && !interaction.wikiWhitelist.includes( newWiki.href ) ) ephemeral = true;
		var noEmbed = interaction.options.getBoolean('noembed') || !canShowEmbed(interaction);
		var spoiler = interaction.options.getBoolean('spoiler') ? '||' : '';
		if ( ephemeral ) lang = lang.uselang(interaction.locale);
		var namespaces;
		if ( namespace.length ) {
			let nsMatch = newWiki.namespaces.all.filter( ns => {
				if ( ns.id < 0 ) return false;
				if ( namespace.includes( ns.id.toString() ) ) return true;
				if ( namespace.includes( ( ns.name || lang.uselang(interaction.locale).get('interaction.namespace') ).toLowerCase() ) ) return true;
				return ns.aliases.some( alias => namespace.includes( alias.toLowerCase() ) );
			} );
			if ( nsMatch.length ) namespaces = [
				nsMatch.map( ns => ns.id ).join('|') || '0',
				nsMatch.map( ns => ns.name || lang.get('interaction.namespace') ).join(', ') || lang.get('interaction.namespace')
			];
		}
		return interaction.deferReply( {ephemeral} ).then( () => {
			return wiki_random(lang, interaction, newWiki, undefined, spoiler, noEmbed, namespaces).then( result => {
				if ( !result || isMessage(result) ) return result;
				let noEmoji = !interaction.appPermissions?.has(PermissionFlagsBits.UseExternalEmojis);
				if ( result.message ) {
					if ( Array.isArray(result.message) ) {
						let list = [];
						return result.message.slice(1).reduce( (prev, content) => {
							return prev.then( message => {
								list.push(message);
								return interaction.followUp( {content, ephemeral} ).then( msg => {
									if ( !msg.flags.has(MessageFlags.Ephemeral) ) allowDelete(msg, interaction.user.id);
									return msg;
								}, log_error );
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

/**
 * Autocomplete a namespace.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_random(interaction, lang, wiki) {
	lang = lang.uselang(interaction.locale);
	const focused = interaction.options.getFocused(true);
	if ( focused.name !== 'namespace' ) return interwiki_interaction.autocomplete(interaction, lang, wiki);
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki') ?? wiki).then( newWiki => {
		var [input, ...prefix] = focused.value.toLowerCase().split(/\s*[,|]\s*/g).reverse();
		var prefixNames = '';
		if ( newWiki.namespaces.size ) {
			if ( !prefix.every( pre => newWiki.namespaces.all.some( ns => {
				if ( ns.id < 0 ) return false;
				if ( ns.id.toString() === pre ) return true;
				if ( ( ns.name || lang.get('interaction.namespace') ).toLowerCase() === pre ) return true;
				return ns.aliases.some( alias => alias.toLowerCase() === pre );
			} ) ) ) {
				input = focused.value.toLowerCase();
				prefix = [];
			}
			else {
				prefix = prefix.reverse().map( pre => newWiki.namespaces.all.find( ns => {
					if ( ns.id < 0 ) return false;
					if ( ns.id.toString() === pre ) return true;
					if ( ns.name.toLowerCase() === pre ) return true;
					return ns.aliases.some( alias => alias.toLowerCase() === pre );
				} )?.id.toString() || '0' );
				prefixNames = prefix.map( ns => {
					return newWiki.namespaces.get(+ns).name || lang.get('interaction.namespace');
				} ).join(', ');
				if ( prefixNames.length ) prefixNames += ', ';
			}
			let sortedNamespaces = newWiki.namespaces.all.filter( ns => ns.id >= 0 && !prefix.includes( ns.id.toString() ) ).sort( (a, b) => {
				if ( a.id % 2 === b.id % 2 ) return a.id - b.id;
				if ( a.id % 2 ) return +1;
				if ( b.id % 2 ) return -1;
				return 0;
			} );
			if ( !input ) return interaction.respond( [
				...( !prefix.length ? [{
					name: lang.get('interaction.random'),
					value: ( newWiki.namespaces.content.map( ns => ns.id ).join('|').length > 100
						? newWiki.spaceReplacement ?? '_'
						: newWiki.namespaces.content.map( ns => ns.id ).join('|')
					) || '0'
				}] : [] ),
				...sortedNamespaces.map( ns => {
					return {
						name: ( prefixNames + ( ns.name || lang.get('interaction.namespace') ) ).substring(0, 100),
						value: ( prefix.length ? prefix.join('|') + '|' : '' ) + ns.id.toString()
					};
				} )
			].slice(0, 25) ).catch(log_error);
			return interaction.respond( [...new Set([
				...sortedNamespaces.filter( ns => {
					if ( input === ns.id.toString() || input === ( ns.id % 2 ? ns.id - 1 : ns.id + 1 ).toString() ) return true;
					if ( ns.name.toLowerCase().startsWith( input ) ) return true;
					if ( ns.aliases.some( alias => alias.toLowerCase().startsWith( input ) ) ) return true;
					if ( !ns.name ) {
						if ( lang.get('interaction.namespace').toLowerCase().startsWith( input ) ) return true;
						if ( lang.get('interaction.namespace').slice(1, -1).toLowerCase().startsWith( input ) ) return true;
					}
					return false;
				} ),
				...sortedNamespaces.filter( ns => {
					if ( ns.name.toLowerCase().includes( input ) ) return true;
					if ( ns.aliases.some( alias => alias.toLowerCase().includes( input ) ) ) return true;
					return false;
				} )
			])].map( ns => {
				return {
					name: ( prefixNames + ( ns.name || lang.get('interaction.namespace') ) ).substring(0, 100),
					value: ( prefix.length ? prefix.join('|') + '|' : '' ) + ns.id.toString()
				};
			} ).slice(0, 25) ).catch(log_error);
		}
		return got.get( newWiki + 'api.php?action=query&meta=siteinfo&siprop=general|namespaces|namespacealiases&format=json', {
			timeout: {
				request: 2_000
			},
			retry: {
				limit: 0
			},
			context: {
				guildId: interaction.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( body?.warnings ) log_warning(body.warnings);
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.namespaces ) {
				if ( newWiki.noWiki(response.url, response.statusCode) ) {
					return interaction.respond( [{
						name: lang.get('interaction.nowiki'),
						value: ''
					}] ).catch(log_error);
				}
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
					return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
				} ).map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the namespaces: ' + body?.error?.info );
				return;
			}
			newWiki.updateWiki(body.query.general, Object.values(body.query.namespaces), body.query.namespacealiases);
			if ( !prefix.every( pre => newWiki.namespaces.all.some( ns => {
				if ( ns.id < 0 ) return false;
				if ( ns.id.toString() === pre ) return true;
				if ( ( ns.name || lang.get('interaction.namespace') ).toLowerCase() === pre ) return true;
				return ns.aliases.some( alias => alias.toLowerCase() === pre );
			} ) ) ) {
				input = focused.value.toLowerCase();
				prefix = [];
			}
			else {
				prefix = prefix.reverse().map( pre => newWiki.namespaces.all.find( ns => {
					if ( ns.id < 0 ) return false;
					if ( ns.id.toString() === pre ) return true;
					if ( ns.name.toLowerCase() === pre ) return true;
					return ns.aliases.some( alias => alias.toLowerCase() === pre );
				} )?.id.toString() || '0' );
				prefixNames = prefix.map( ns => {
					return newWiki.namespaces.get(+ns).name || lang.get('interaction.namespace');
				} ).join(', ');
				if ( prefixNames.length ) prefixNames += ', ';
			}
			let sortedNamespaces = newWiki.namespaces.all.filter( ns => ns.id >= 0 && !prefix.includes( ns.id.toString() ) ).sort( (a, b) => {
				if ( a.id % 2 === b.id % 2 ) return a.id - b.id;
				if ( a.id % 2 ) return +1;
				if ( b.id % 2 ) return -1;
				return 0;
			} );
			if ( !input ) return interaction.respond( [
				...( !prefix.length ? [{
					name: lang.get('interaction.random'),
					value: ( newWiki.namespaces.content.map( ns => ns.id ).join('|').length > 100
						? newWiki.spaceReplacement ?? '_'
						: newWiki.namespaces.content.map( ns => ns.id ).join('|')
					) || '0'
				}] : [] ),
				...sortedNamespaces.map( ns => {
					return {
						name: ( prefixNames + ( ns.name || lang.get('interaction.namespace') ) ).substring(0, 100),
						value: ( prefix.length ? prefix.join('|') + '|' : '' ) + ns.id.toString()
					};
				} )
			].slice(0, 25) ).catch(log_error);
			return interaction.respond( [...new Set([
				...sortedNamespaces.filter( ns => {
					if ( input === ns.id.toString() || input === ( ns.id % 2 ? ns.id - 1 : ns.id + 1 ).toString() ) return true;
					if ( ns.name.toLowerCase().startsWith( input ) ) return true;
					if ( ns.aliases.some( alias => alias.toLowerCase().startsWith( input ) ) ) return true;
					if ( !ns.name ) {
						if ( lang.get('interaction.namespace').toLowerCase().startsWith( input ) ) return true;
						if ( lang.get('interaction.namespace').slice(1, -1).toLowerCase().startsWith( input ) ) return true;
					}
					return false;
				} ),
				...sortedNamespaces.filter( ns => {
					if ( ns.name.toLowerCase().includes( input ) ) return true;
					if ( ns.aliases.some( alias => alias.toLowerCase().includes( input ) ) ) return true;
					return false;
				} )
			])].map( ns => {
				return {
					name: ( prefixNames + ( ns.name || lang.get('interaction.namespace') ) ).substring(0, 100),
					value: ( prefix.length ? prefix.join('|') + '|' : '' ) + ns.id.toString()
				};
			} ).slice(0, 25) ).catch(log_error);
		}, error => {
			if ( error.name === 'TimeoutError' ) return;
			if ( newWiki.noWiki(error.message) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
				return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
			} ).map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- Error while getting the namespaces: ' + error );
		} );
	}, () => {
		return interaction.respond( [{
			name: lang.get('interaction.interwiki'),
			value: ''
		}] ).catch(log_error);
	} );
}

export default {
	name: 'random',
	slash: slash_random,
	autocomplete: autocomplete_random,
	allowDelete: true
};
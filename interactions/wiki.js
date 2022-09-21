import { PermissionFlagsBits } from 'discord.js';
import { got, isMessage, canShowEmbed, htmlToPlain, partialURIdecode, sendMessage } from '../util/functions.js';
import phabricator from '../functions/phabricator.js';
import check_wiki from '../cmds/wiki/general.js';

/** @type {Map<String, {toclevel: Number, line: String, anchor: String}[]>} */
const sectionCache = new Map();

/**
 * Post a message with wiki links.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_wiki(interaction, lang, wiki) {
	var title = interaction.options.getString('title') ?? '';
	var query = new URLSearchParams(interaction.options.getString('query') ?? '');
	var fragment = ( interaction.options.getString('section') ?? '' ).replace( /^\s*#+\s*/, '' );
	var title = interaction.options.getString('title') ?? '';
	var ephemeral = ( interaction.options.getBoolean('private') ?? false ) || pausedGuilds.has(interaction.guildId);
	var noEmbed = interaction.options.getBoolean('noembed') || !canShowEmbed(interaction);
	var spoiler = interaction.options.getBoolean('spoiler') ? '||' : '';
	sectionCache.delete(wiki.toLink(title));
	let cmd = `</${interaction.commandName}:${interaction.commandId}> ` + ( interaction.commandName === 'interwiki' ? `wiki:${wiki.host}${wiki.pathname.slice(0, -1)} ` : '' ) + 'title:';
	if ( ephemeral ) lang = lang.uselang(interaction.locale);
	return interaction.deferReply( {ephemeral} ).then( () => {
		return ( /^phabricator\.(wikimedia|miraheze)\.org$/.test(wiki.hostname)
		? phabricator(lang, interaction, wiki, new URL('/' + title, wiki), spoiler, noEmbed)
		: check_wiki(lang, interaction, title, wiki, cmd, undefined, spoiler, noEmbed, query, fragment)
		)?.then( result => {
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
}

/**
 * Autocomplete a search title.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_wiki(interaction, lang, wiki) {
	lang = lang.uselang(interaction.locale);
	const focused = interaction.options.getFocused(true);
	if ( focused.name === 'section' ) return autocomplete_section(interaction, lang, wiki);
	if ( focused.name !== 'title' ) return;
	const title = focused.value;
	if ( !title.trim() ) {
		if ( wiki.wikifarm === 'fandom' && !Array.isArray(wiki.commonSearches) ) {
			got.get( wiki + 'wikia.php?controller=SearchSeeding&method=getLocalSearchInfo&format=json', {
				context: {
					guildId: interaction.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( response.statusCode !== 200 || !Array.isArray(body?.search_phrases) ) {
					if ( wiki.noWiki(response.url, response.statusCode) ) return;
					console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
						if ( option.options !== undefined ) return option.name;
						return option.name + ':' + option.value;
					} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the common searches: ' + ( body?.details || body?.error ) );
					return;
				}
				wiki.commonSearches = body.search_phrases.filter( phrase => phrase.term ).map( phrase => {
					let term = phrase.term[0].toUpperCase() + phrase.term.slice(1);
					return {
						name: term,
						value: term
					};
				} );
			}, error => {
				if ( error.name === 'TimeoutError' ) return;
				if ( wiki.noWiki(error.message) ) return;
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- Error while getting the common searches: ' + error );
				return;
			} );
		}
		if ( wiki.mainpage ) return interaction.respond( [
			{
				name: wiki.mainpage,
				value: wiki.mainpage
			},
			...( wiki.commonSearches?.slice(0, 24) || [] )
		] ).catch(log_error);
		return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&format=json', {
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
			if ( body && body.warnings ) log_warning(body.warnings);
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.general?.mainpage ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					return interaction.respond( [{
						name: lang.get('interaction.nowiki'),
						value: ''
					}] ).catch(log_error);
				}
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the main page name: ' + body?.error?.info );
				return interaction.respond( [
					{
						name: wiki.mainpage || 'Main Page',
						value: wiki.mainpage ?? ''
					},
					...( wiki.commonSearches?.slice(0, 24) || [] )
				] ).catch(log_error);
			}
			wiki.updateWiki(body.query.general);
			return interaction.respond( [
				{
					name: body.query.general.mainpage || 'Main Page',
					value: body.query.general.mainpage ?? ''
				},
				...( wiki.commonSearches?.slice(0, 24) || [] )
			] ).catch(log_error);
		}, error => {
			if ( error.name === 'TimeoutError' ) return;
			if ( wiki.noWiki(error.message) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- Error while getting the main page name: ' + error );
			return interaction.respond( [
				{
					name: wiki.mainpage || 'Main Page',
					value: wiki.mainpage ?? ''
				},
				...( wiki.commonSearches?.slice(0, 24) || [] )
			] ).catch(log_error);
		} );
	}
	if ( wiki.wikifarm === 'fandom' ) return got.get( wiki + 'api.php?action=linksuggest&get=suggestions&query=' + encodeURIComponent( title ) + '&format=json', {
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
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body?.linksuggest?.result?.suggestions ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the suggestions: ' + ( body?.error?.info || body?.message || body?.error ) );
			return;
		}
		if ( !body.linksuggest.result.suggestions.length ) return interaction.respond( [] ).catch(log_error);
		var redirects = Object.keys(body.linksuggest.result.redirects);
		return interaction.respond( body.linksuggest.result.suggestions.map( suggestion => {
			let redirect = redirects.find( redirect => body.linksuggest.result.redirects[redirect] === suggestion );
			let text = suggestion;
			if ( redirect ) text = lang.get('search.redirect', suggestion, redirect);
			return {
				name: ( text.length > 100 ? suggestion.substring(0, 100) : text ),
				value: suggestion.substring(0, 100)
			};
		} ).slice(0, 25) ).catch(log_error);
	}, error => {
		if ( error.name === 'TimeoutError' ) return;
		if ( wiki.noWiki(error.message) ) {
			return interaction.respond( [{
				name: lang.get('interaction.nowiki'),
				value: ''
			}] ).catch(log_error);
		}
		console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
			if ( option.options !== undefined ) return option.name;
			return option.name + ':' + option.value;
		} ).join(' ') + '\n- Error while getting the suggestions: ' + error );
	} );

	return got.get( wiki + 'api.php?action=opensearch&redirects=resolve&limit=10&search=' + encodeURIComponent( title ) + '&format=json', {
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
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || typeof body?.[1] !== 'object' ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the suggestions: ' + ( body && body.error && body.error.info ) );
			return;
		}
		if ( !body[1].length ) return interaction.respond( [] ).catch(log_error);
		return interaction.respond( body[1].map( suggestion => {
			return {
				name: suggestion.substring(0, 100),
				value: suggestion.substring(0, 100)
			};
		} ).slice(0, 25) ).catch(log_error);
	}, error => {
		if ( error.name === 'TimeoutError' ) return;
		if ( wiki.noWiki(error.message) ) {
			return interaction.respond( [{
				name: lang.get('interaction.nowiki'),
				value: ''
			}] ).catch(log_error);
		}
		console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
			if ( option.options !== undefined ) return option.name;
			return option.name + ':' + option.value;
		} ).join(' ') + '\n- Error while getting the suggestions: ' + error );
	} );
}

/**
 * Autocomplete a page section.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_section(interaction, lang, wiki) {
	lang = lang.uselang(interaction.locale);
	const section = interaction.options.getFocused().replace( /^#+ /, '' );
	const title = interaction.options.getString('title') ?? '';
	if ( !title.trim() ) {
		return interaction.respond( [{
			name: lang.get('interaction.notitle'),
			value: ''
		}] ).catch(log_error);
	}
	if ( sectionCache.has(wiki.toLink(title)) ) {
		let fragments = sectionCache.get(wiki.toLink(title)) ?? [];
		return interaction.respond( [...new Set([
			...fragments.filter( fragment => {
				return fragment.line.toLowerCase().startsWith(section.toLowerCase());
			} ),
			...fragments.filter( fragment => {
				return fragment.line.toLowerCase().includes(section.toLowerCase());
			} ),
			...fragments.filter( fragment => {
				return fragment.line.toLowerCase().includes(section.replace( /(?:[\.%][\dA-F]{2})+/g, partialURIdecode ).toLowerCase());
			} )
		])].map( fragment => {
			return {
				name: ( '#'.repeat(fragment.toclevel) + ' ' + fragment.line ).substring(0, 100),
				value: fragment.anchor.substring(0, 100)
			};
		} ).slice(0, 25) ).catch(log_error);
	}
	return got.get( wiki + 'api.php?action=parse&prop=sections&page=' + encodeURIComponent( title ) + '&format=json', {
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
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body?.parse?.sections ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			if ( body?.error?.code === 'missingtitle' ) {
				return interaction.respond( [{
					name: lang.get('interaction.notitle'),
					value: ''
				}] ).catch(log_error);
			}
			if ( body?.error?.code === 'pagecannotexist' ) {
				sectionCache.set(wiki.toLink(title), []);
				return interaction.respond( [] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the page sections: ' + body?.error?.info );
			return;
		}
		body.parse.sections.forEach( (fragment, i) => {
			fragment.line = htmlToPlain(fragment.line);
			if ( /_\d+$/.test(fragment.anchor) && body.parse.sections.some( (testFragment, n) => {
				if ( n >= i ) return false;
				return testFragment.line === fragment.line;
			} ) ) {
				fragment.line += ' ' + fragment.anchor.split('_').pop();
			}
			fragment.anchor = fragment.anchor.replaceAll( wiki.spaceReplacement ?? '_', ' ' );
		} );
		sectionCache.set(wiki.toLink(title), body.parse.sections);
		return interaction.respond( [...new Set([
			...body.parse.sections.filter( fragment => {
				return fragment.line.toLowerCase().startsWith(section.toLowerCase());
			} ),
			...body.parse.sections.filter( fragment => {
				return fragment.line.toLowerCase().includes(section.toLowerCase());
			} ),
			...body.parse.sections.filter( fragment => {
				return fragment.line.toLowerCase().includes(section.replace( /(?:[\.%][\dA-F]{2})+/g, partialURIdecode ).toLowerCase());
			} )
		])].map( fragment => {
			return {
				name: ( '#'.repeat(fragment.toclevel) + ' ' + fragment.line ).substring(0, 100),
				value: fragment.anchor
			};
		} ).slice(0, 25) ).catch(log_error);
	}, error => {
		if ( error.name === 'TimeoutError' ) return;
		if ( wiki.noWiki(error.message) ) {
			return interaction.respond( [{
				name: lang.get('interaction.nowiki'),
				value: ''
			}] ).catch(log_error);
		}
		console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
			if ( option.options !== undefined ) return option.name;
			return option.name + ':' + option.value;
		} ).join(' ') + '\n- Error while getting the page sections: ' + error );
		return;
	} );
}

export default {
	name: 'wiki',
	slash: slash_wiki,
	autocomplete: autocomplete_wiki,
	allowDelete: true
};
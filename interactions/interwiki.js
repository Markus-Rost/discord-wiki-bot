import { wikiProjects, inputToWikiProject, idStringToUrl, inputToFrontendProxy } from 'mediawiki-projects-list';
import db from '../util/database.js';
import Wiki from '../util/wiki.js';
import { got } from '../util/functions.js';
import wiki_interaction from './wiki.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultSettings} = require('../util/default.json');

const allWikiProjects = [...wikiProjects.values()];
/** @type {Set<String>} */
const knownWikis = new Set();
/** @type {Map<String, Map<String, String>>} */
const knownInterwiki = new Map();
/** @type {Map<String, {guild: String, wiki: String}[]>} */
const rowCache = new Map();

/**
 * Get a known wiki.
 * @param {String?} input - The input wiki url.
 * @param {Wiki} base - The base wiki.
 * @returns {Promise<Wiki>}
 */
function getWiki(input, base) {
	if ( !input ) return Promise.resolve(base);
	input = input.trim();
	var newWiki;
	if ( input.includes( ':' ) && !input.includes( '/' ) && knownInterwiki.has(base.href) ) {
		newWiki = knownInterwiki.get(base.href).get(input);
	}
	if ( !newWiki ) newWiki = inputToWikiProject(input)?.fullScriptPath;
	if ( !newWiki ) newWiki = inputToFrontendProxy(input)?.fullScriptPath;
	if ( newWiki ) return Promise.resolve(new Wiki(newWiki));
	var wiki = Wiki.fromInput(input);
	if ( !wiki ) return Promise.reject();
	if ( knownWikis.has(wiki.name) ) return Promise.resolve(wiki);
	return db.query( '(SELECT wiki FROM discord WHERE wiki = $1 LIMIT 1) UNION (SELECT prefixwiki FROM subprefix WHERE prefixwiki = $1 LIMIT 1)', [wiki.name] ).then( ({rows}) => {
		if ( rows.length ) {
			knownWikis.add(wiki.name);
			return wiki;
		}
		return Promise.reject();
	}, dberror => {
		console.log( '- Error while checking the wiki list: ' + dberror );
		return Promise.reject();
	} );
}

/**
 * Post a message with wiki links.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_interwiki(interaction, lang, wiki) {
	return getWiki(interaction.options.getString('wiki'), wiki).then( newWiki => {
		return wiki_interaction.slash(interaction, lang, newWiki);
	}, () => {
		return interaction.reply( {
			content: lang.uselang(interaction.locale).get('interaction.interwiki'),
			ephemeral: true
		} ).catch(log_error);
	} );
}

/**
 * Autocomplete a wiki.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_interwiki(interaction, lang, wiki) {
	let baseWikis = [lang.lang, interaction.guildLocale, interaction.locale].filter( locale => locale ).map( locale => `https://${locale.split('-')[0]}.wikipedia.org/w/` );
	lang = lang.uselang(interaction.locale);
	const focused = interaction.options.getFocused(true);
	if ( focused.name !== 'wiki' ) {
		return getWiki(interaction.options.getString('wiki'), wiki).then( newWiki => {
			return wiki_interaction.autocomplete(interaction, lang, newWiki);
		}, () => {
			return interaction.respond( [{
				name: lang.get('interaction.interwiki'),
				value: ''
			}] ).catch( acerror => {
				if ( isDebug ) log_error(acerror);
			} );
		} );
	}
	const input = focused.value.trim().replace( /^(?:(?:https?:)?\/(?:$|\/)|https?:?$|ht{0,2}$)/, '' );
	if ( input.includes( ':' ) && !input.includes( '/' ) ) return got.get( wiki + 'api.php?action=query&iwurl=1&titles=%1F' + encodeURIComponent( input.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
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
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch( acerror => {
					if ( isDebug ) log_error(acerror);
				} );
			}
			console.log( interaction.author + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
				return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
			} ).map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- ' + response.statusCode + ': Error while getting the interwiki: ' + body?.error?.info );
			return;
		}
		if ( !body.query.interwiki?.length ) return interaction.respond( [] ).catch( acerror => {
			if ( isDebug ) log_error(acerror);
		} );
		let project = inputToWikiProject(body.query.interwiki[0].url);
		if ( !project ) return interaction.respond( [] ).catch( acerror => {
			if ( isDebug ) log_error(acerror);
		} );
		let interwikiMap = knownInterwiki.get(wiki.href) ?? new Map();
		if ( !knownInterwiki.has(wiki.href) ) knownInterwiki.set(wiki.href, interwikiMap);
		interwikiMap.set(input, project.fullScriptPath);
		return interaction.respond( [{
			name: project.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length) ).substring(0, 100),
			value: project.fullScriptPath.substring(0, 100)
		}] ).catch( acerror => {
			if ( isDebug ) log_error(acerror);
		} );
	}, error => {
		if ( error.name === 'TimeoutError' ) return;
		if ( wiki.noWiki(error.message) ) {
			return interaction.respond( [{
				name: lang.get('interaction.nowiki'),
				value: ''
			}] ).catch( acerror => {
				if ( isDebug ) log_error(acerror);
			} );
		}
		console.log( interaction.author + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
			return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
		} ).map( option => {
			if ( option.options !== undefined ) return option.name;
			return option.name + ':' + option.value;
		} ).join(' ') + '\n- Error while getting the interwiki: ' + error );
	} );
	/** @type {[String[], String[]]} */
	var wikiList = [new Set([wiki.name]), new Set()];
	var sqlargs = [interaction.guildId, '@' + interaction.user.id, '@'];
	return ( rowCache.has(sqlargs.join(' ')) ? Promise.resolve(rowCache.get(sqlargs.join(' '))) : db.query( '(SELECT guild, wiki FROM discord WHERE guild = $1 OR guild = $2) UNION (SELECT $3, prefixwiki FROM subprefix WHERE guild = $1) ORDER BY guild DESC', sqlargs ).then( ({rows}) => {
		rowCache.set(sqlargs.join(' '), rows);
		setTimeout(() => rowCache.delete(sqlargs.join(' ')), 300_000).unref();
		return rows;
	}, dberror => {
		console.log( interaction.author + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
			return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
		} ).map( option => {
			if ( option.options !== undefined ) return option.name;
			return option.name + ':' + option.value;
		} ).join(' ') + '\n- Error while getting the wiki list: ' + dberror );
	} ) ).then( (rows = []) => {
		if ( !interaction.inCachedGuild() ) interaction.wikiWhitelist.forEach( whiteWiki => wikiList[0].add( whiteWiki ) );
		rows.forEach( row => {
			if ( row.wiki.startsWith( 'https://' ) ) wikiList[0].add( row.wiki );
			else wikiList[1].add( row.wiki );
		} );
		if ( !rows.length || !wikiList[1].size ) defaultSettings.subprefixes.forEach( subprefix => {
			if ( subprefix[1].startsWith( 'https://' ) ) {
				if ( !rows.length ) wikiList[0].add( subprefix[1] );
			}
			else {
				if ( !wikiList[1].size ) wikiList[1].add( subprefix[1] );
			}
		} );
		if ( interaction.inCachedGuild() ) interaction.wikiWhitelist.forEach( whiteWiki => wikiList[0].add( whiteWiki ) );
		baseWikis.forEach( baseWiki => wikiList[0].add( baseWiki ) );
		wikiList = [[...wikiList[0]].filter( suggestion => !suggestion.includes( '@' ) ), [...wikiList[1]]];
		if ( !input ) return interaction.respond( wikiList[0].map( suggestion => {
			let suggestionName = suggestion;
			let project = inputToWikiProject(suggestion);
			if ( project ) suggestionName = project.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length ));
			else {
				let proxy = inputToFrontendProxy(suggestion);
				if ( proxy ) suggestionName = proxy.fullNamePath.slice(8, ( proxy.fullNamePath.endsWith('/') ? -1 : undefined ));
			}
			return {
				name: suggestionName.substring(0, 100),
				value: suggestion.substring(0, 100)
			};
		} ).slice(0, 25) ).catch( acerror => {
			if ( isDebug ) log_error(acerror);
		} );
		var suggestions = [
			...wikiList[0].filter( suggestion => {
				if ( suggestion.replace( 'https://', '' ).startsWith( input ) ) return true;
				return suggestion.replace( 'https://www.', '' ).startsWith( input );
			} ),
			...wikiList[1].map( suggestion => {
				return idStringToUrl(input, suggestion)?.href;
			} ),
			inputToWikiProject(input)?.fullScriptPath,
			inputToFrontendProxy(input)?.fullNamePath,
			...allWikiProjects.filter( project => {
				if ( !project.fullScriptPath ) return false;
				if ( project.name.startsWith( input ) ) return true;
				if ( project.fullScriptPath.replace( 'https://', '' ).startsWith( input ) ) return true;
				return project.fullScriptPath.replace( 'https://www.', '' ).startsWith( input );
			} ).map( project => project.fullScriptPath ),
			...allWikiProjects.filter( project => project.idString ).flatMap( project => {
				let result = [];
				let newInput = input;
				let newWiki = idStringToUrl(newInput, project.name);
				if ( newWiki ) result.push( newWiki.href );
				while ( newInput.includes( '.' ) ) {
					newInput = newInput.split('.').slice(0, -1).join('.');
					newWiki = idStringToUrl(newInput, project.name);
					if ( newWiki?.href.replace( 'https://', '' ).startsWith( input ) ) result.push( newWiki.href );
				}
				return result;
			} )
		].filter( suggestion => suggestion ).map( suggestion => {
			if ( Wiki._cache.has(suggestion) ) return Wiki._cache.get(suggestion).name;
			return suggestion;
		} );
		return interaction.respond( [...new Set(suggestions)].map( suggestion => {
			let suggestionName = suggestion;
			let project = inputToWikiProject(suggestion);
			if ( project ) suggestionName = project.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length ));
			else {
				let proxy = inputToFrontendProxy(suggestion);
				if ( proxy ) suggestionName = proxy.fullNamePath.slice(8, ( proxy.fullNamePath.endsWith('/') ? -1 : undefined ));
			}
			return {
				name: suggestionName.substring(0, 100),
				value: suggestion.substring(0, 100)
			};
		} ).slice(0, 25) ).catch( acerror => {
			if ( isDebug ) log_error(acerror);
		} );
	} );
}

export default {
	name: 'interwiki',
	slash: slash_interwiki,
	autocomplete: autocomplete_interwiki,
	allowDelete: true,
	FUNCTIONS: {getWiki}
};
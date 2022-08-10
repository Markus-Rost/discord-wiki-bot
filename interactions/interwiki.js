import { wikiProjects, inputToWikiProject, idStringToUrl } from 'mediawiki-projects-list';
import { got } from '../util/functions.js';
import wiki_interaction from './wiki.js';
import db from '../util/database.js';
import { createRequire } from 'node:module';
import Wiki from '../util/wiki.js';
const require = createRequire(import.meta.url);
const {defaultSettings} = require('../util/default.json');

const knownWikis = new Set();

/**
 * Get a known wiki.
 * @param {String|Wiki} wiki - The wiki.
 * @returns {Promise<Wiki>}
 */
function getWiki(wiki) {
	if ( wiki instanceof Wiki ) return Promise.resolve(wiki);
	var newWiki = inputToWikiProject(wiki)?.fullScriptPath;
	if ( newWiki ) return Promise.resolve(new Wiki(newWiki));
	wiki = Wiki.fromInput(wiki);
	if ( !wiki ) return Promise.reject();
	if ( knownWikis.has(wiki.href) ) return Promise.resolve(wiki);
	return db.query( '(SELECT wiki FROM discord WHERE wiki = $1 LIMIT 1) UNION (SELECT prefixwiki FROM subprefix WHERE prefixwiki = $1 LIMIT 1)', [wiki.href] ).then( ({rows}) => {
		if ( rows.length ) {
			knownWikis.add(wiki.href);
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
	return getWiki(interaction.options.getString('wiki') ?? wiki).then( newWiki => {
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
	lang = lang.uselang(interaction.locale);
	const focused = interaction.options.getFocused(true);
	if ( focused.name !== 'wiki' ) {
		return getWiki(interaction.options.getString('wiki') ?? wiki).then( newWiki => {
			return wiki_interaction.autocomplete(interaction, lang, newWiki);
		}, () => {
			return interaction.respond( [{
				name: lang.get('interaction.interwiki'),
				value: ''
			}] ).catch(log_error);
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
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.interwiki?.length ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			else console.log( '- Autocomplete: ' + response.statusCode + ': Error while getting the interwiki: ' + body?.error?.info );
			return;
		}
		if ( !body.query.interwiki.length ) return interaction.respond( [] ).catch(log_error);
		let project = inputToWikiProject(body.query.interwiki[0].url);
		if ( !project ) return interaction.respond( [] ).catch(log_error);
		return interaction.respond( [{
			name: project.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length) ),
			value: project.fullScriptPath
		}] ).catch(log_error);
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			return interaction.respond( [{
				name: lang.get('interaction.nowiki'),
				value: ''
			}] ).catch(log_error);
		}
		else console.log( '- Autocomplete: Error while getting the interwiki: ' + error );
	} );
	/** @type {[String[], String[]]} */
	var wikiList = [new Set([wiki.href]), new Set()];
	return ( interaction.inGuild() ? db.query( '(SELECT wiki FROM discord WHERE guild = $1) UNION (SELECT prefixwiki FROM subprefix WHERE guild = $1)', [interaction.guildId] ).then( ({rows}) => {
		rows.forEach( row => {
			if ( row.wiki.startsWith( 'https://' ) ) wikiList[0].add( row.wiki );
			else wikiList[1].add( row.wiki );
		} );
		return [true, wikiList[1].size];
	}, dberror => {
		console.log( '- Autocomplete: Error while getting the wiki list: ' + dberror );
	} ) : Promise.resolve() ).then( ([hasRow, hasPrefix] = []) => {
		if ( !hasRow ) wikiList[0].add( defaultSettings.wiki );
		defaultSettings.subprefixes.forEach( subprefix => {
			if ( subprefix[1].startsWith( 'https://' ) ) {
				if ( !hasRow ) wikiList[0].add( subprefix[1] );
			}
			else {
				if ( !hasPrefix ) wikiList[1].add( subprefix[1] );
			}
		} );
		wikiList = [[...wikiList[0]], [...wikiList[1]]];
		if ( !input ) return interaction.respond( wikiList[0].map( suggestion => {
			let project = inputToWikiProject(suggestion);
			return {
				name: project?.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length) ) || suggestion,
				value: suggestion
			};
		} ).slice(0, 25) ).catch(log_error);
		var suggestions = new Set([
			...wikiList[0].filter( suggestion => {
				return suggestion.replace( 'https://', '' ).startsWith( input );
			} ),
			...wikiList[1].map( suggestion => {
				return idStringToUrl(input, suggestion)?.href;
			} ),
			...wikiProjects.filter( project => {
				if ( !project.fullScriptPath ) return false;
				if ( project.name.startsWith( input ) ) return true;
				if ( project.fullScriptPath.replace( 'https://', '' ).startsWith( input ) ) return true;
				return project.fullScriptPath.replace( 'https://www.', '' ).startsWith( input );
			} ).map( project => project.fullScriptPath ),
			...wikiProjects.filter( project => project.idString ).map( project => {
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
			} ).flat(),
			inputToWikiProject(input)?.fullScriptPath
		].filter( suggestion => suggestion ));
		return interaction.respond( [...new Set(suggestions)].map( suggestion => {
			let project = inputToWikiProject(suggestion);
			return {
				name: project?.fullScriptPath.slice(8, ( project.wikiProject.regexPaths ? -1 : -project.wikiProject.scriptPath.length) ) || suggestion,
				value: suggestion
			};
		} ).slice(0, 25) ).catch(log_error);
	} );
}

export default {
	name: 'interwiki',
	slash: slash_interwiki,
	autocomplete: autocomplete_interwiki,
	FUNCTIONS: {getWiki}
};
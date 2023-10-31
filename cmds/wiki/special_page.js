import { EmbedBuilder, PermissionFlagsBits, time as timeMarkdown, TimestampStyles } from 'discord.js';
import logging from '../../util/logging.js';
import { got, toMarkdown, escapeFormatting, splitMessage } from '../../util/functions.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {timeoptions} = require('../../util/default.json');

const overwrites = {
	/** @param {import('../../util/wiki.js').default} wiki */
	randompage: (fn, lang, msg, wiki, querystring, fragment, reaction, spoiler, noEmbed, args, embed) => {
		let namespaceData = [wiki.namespaces.content.map( ns => ns.id ).join('|') || '0', wiki.namespaces.content.map( ns => ns.name || '*' ).join(', ') || '*'];
		if ( args[0] ) {
			args[0] = args[0].replaceAll( wiki.spaceReplacement ?? '_', ' ' ).toLowerCase().trim();
			let namespace = wiki.namespaces.all.find( ns => {
				if ( ns.id < 0 ) return false;
				return ns.name.toLowerCase() === args[0] || ns.aliases.some( alias => alias.toLowerCase() === args[0] );
			} );
			if ( namespace ) namespaceData = [namespace.id.toString(), namespace.name || '*'];
			else if ( args[0] === '*' ) namespaceData = ['*', '*'];
		}
		return fn.random(lang, msg, wiki, reaction, spoiler, noEmbed, namespaceData, querystring, fragment, embed);
	},
	statistics: (fn, lang, msg, wiki, querystring, fragment, reaction, spoiler, noEmbed) => {
		return fn.overview(lang, msg, wiki, spoiler, noEmbed, querystring, fragment, 'Statistics');
	},
	version: (fn, lang, msg, wiki, querystring, fragment, reaction, spoiler, noEmbed) => {
		return fn.overview(lang, msg, wiki, spoiler, noEmbed, querystring, fragment, 'Version');
	},
	diff: (fn, lang, msg, wiki, querystring, fragment, reaction, spoiler, noEmbed, args, embed) => {
		return fn.diff(lang, msg, args, wiki, spoiler, noEmbed, embed);
	}
}

const queryfunctions = {
	title: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, '', '', true) + '>)';
	} ).join('\n'),
	times: (query, wiki, lang) => query.querypage.results.map( result => {
		return parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + '× [' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, '', '', true) + '>)';
	} ).join('\n'),
	size: (query, wiki, lang) => query.querypage.results.map( result => {
		return lang.get('diff.info.bytes', parseInt(result.value, 10).toLocaleString(lang.get('dateformat')), result.value) + ': [' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, '', '', true) + '>)';
	} ).join('\n'),
	redirect: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, 'redirect=no', '', true) + '>)' + ( result.databaseResult?.rd_title ? ' → ' + escapeFormatting(result.databaseResult.rd_title) : '' );
	} ).join('\n'),
	doubleredirect: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, 'redirect=no', '', true) + '>)' + ( result.databaseResult?.b_title && result.databaseResult?.c_title ? ' → ' + escapeFormatting(result.databaseResult.b_title) + ' → ' + escapeFormatting(result.databaseResult.c_title) : '' );
	} ).join('\n'),
	timestamp: (query, wiki, lang) => query.querypage.results.map( result => {
		try {
			var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
				timeZone: query.general.timezone
			}, timeoptions));
		}
		catch ( error ) {
			var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
				timeZone: 'UTC'
			}, timeoptions));
		}
		let lastEditDate = new Date(result.timestamp);
		return dateformat.format(lastEditDate) + ' ' + timeMarkdown(lastEditDate, TimestampStyles.RelativeTime) + ': [' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, '', '', true) + '>)';
	} ).join('\n'),
	media: (query, wiki, lang) => query.querypage.results.map( result => {
		var ms = result.title.split(';');
		return '**' + ms[1] + '**: ' + lang.get('search.category.files', parseInt(ms[2], 10).toLocaleString(lang.get('dateformat')), parseInt(ms[2], 10)) + ' (' + lang.get('diff.info.bytes', parseInt(ms[3], 10).toLocaleString(lang.get('dateformat')), parseInt(ms[3], 10)) + ')';
	} ).join('\n'),
	category: (query, wiki, lang) => query.querypage.results.map( result => {
		return parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + '× [' + escapeFormatting(result.title) + '](<' + wiki.toLink('Category:' + result.title, '', '', true) + '>)';
	} ).join('\n'),
	gadget: (query, wiki, lang) => query.querypage.results.map( result => {
		result.title = result.title.replace( /^(?:.*:)?gadget-/, '' );
		return '**' + escapeFormatting(result.title) + '**: ' + parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + ' users (' + result.ns.toLocaleString(lang.get('dateformat')) + ' active)';
	} ).join('\n'),
	recentchanges: (query, wiki) => query.recentchanges.map( result => {
		return '[' + escapeFormatting(result.title) + '](<' + wiki.toLink(result.title, ( result.type === 'edit' ? {diff:result.revid,oldid:result.old_revid} : '' ), '', true) + '>)';
	} ).join('\n')
}

const querypages = {
	ancientpages: ['&list=querypage&qplimit=10&qppage=Ancientpages', queryfunctions.timestamp],
	brokenredirects: ['&list=querypage&qplimit=10&qppage=BrokenRedirects', queryfunctions.redirect],
	deadendpages: ['&list=querypage&qplimit=10&qppage=Deadendpages', queryfunctions.title],
	doubleredirects: ['&list=querypage&qplimit=10&qppage=DoubleRedirects', queryfunctions.doubleredirect],
	fewestrevisions: ['&list=querypage&qplimit=10&qppage=Fewestrevisions', queryfunctions.times],
	listduplicatedfiles: ['&list=querypage&qplimit=10&qppage=ListDuplicatedFiles', queryfunctions.times],
	listredirects: ['&list=querypage&qplimit=10&qppage=Listredirects', queryfunctions.redirect],
	lonelypages: ['&list=querypage&qplimit=10&qppage=Lonelypages', queryfunctions.title],
	longpages: ['&list=querypage&qplimit=10&qppage=Longpages', queryfunctions.size],
	mediastatistics: ['&list=querypage&qplimit=10&qppage=MediaStatistics', queryfunctions.media],
	mostcategories: ['&list=querypage&qplimit=10&qppage=Mostcategories', queryfunctions.times],
	mostimages: ['&list=querypage&qplimit=10&qppage=Mostimages', queryfunctions.times],
	mostinterwikis: ['&list=querypage&qplimit=10&qppage=Mostinterwikis', queryfunctions.times],
	mostlinked: ['&list=querypage&qplimit=10&qppage=Mostlinked', queryfunctions.times],
	mostlinkedcategories: ['&list=querypage&qplimit=10&qppage=Mostlinkedcategories', queryfunctions.times],
	mostlinkedtemplates: ['&list=querypage&qplimit=10&qppage=Mostlinkedtemplates', queryfunctions.times],
	mostrevisions: ['&list=querypage&qplimit=10&qppage=Mostrevisions', queryfunctions.times],
	shortpages: ['&list=querypage&qplimit=10&qppage=Shortpages', queryfunctions.size],
	uncategorizedcategories: ['&list=querypage&qplimit=10&qppage=Uncategorizedcategories', queryfunctions.title],
	uncategorizedpages: ['&list=querypage&qplimit=10&qppage=Uncategorizedpages', queryfunctions.title],
	uncategorizedimages: ['&list=querypage&qplimit=10&qppage=Uncategorizedimages', queryfunctions.title],
	uncategorizedtemplates: ['&list=querypage&qplimit=10&qppage=Uncategorizedtemplates', queryfunctions.title],
	unusedcategories: ['&list=querypage&qplimit=10&qppage=Unusedcategories', queryfunctions.title],
	unusedimages: ['&list=querypage&qplimit=10&qppage=Unusedimages', queryfunctions.title],
	unusedtemplates: ['&list=querypage&qplimit=10&qppage=Unusedtemplates', queryfunctions.title],
	unwatchedpages: ['&list=querypage&qplimit=10&qppage=Unwatchedpages', queryfunctions.title],
	wantedcategories: ['&list=querypage&qplimit=10&qppage=Wantedcategories', queryfunctions.times],
	wantedfiles: ['&list=querypage&qplimit=10&qppage=Wantedfiles', queryfunctions.times],
	wantedpages: ['&list=querypage&qplimit=10&qppage=Wantedpages', queryfunctions.times],
	wantedtemplates: ['&list=querypage&qplimit=10&qppage=Wantedtemplates', queryfunctions.times],
	withoutinterwiki: ['&list=querypage&qplimit=10&qppage=Withoutinterwiki', queryfunctions.title],
	gadgetusage: ['&list=querypage&qplimit=10&qppage=GadgetUsage', queryfunctions.gadget],
	recentchanges: ['&list=recentchanges&rctype=edit|new|log&rclimit=10', queryfunctions.recentchanges],
	disambiguations: ['&list=querypage&qplimit=10&qppage=Disambiguations', queryfunctions.title],
	mostpopularcategories: ['&list=querypage&qplimit=10&qppage=Mostpopularcategories', queryfunctions.category],
	mostlinkedfilesincontent: ['&list=querypage&qplimit=10&qppage=MostLinkedFilesInContent', queryfunctions.times],
	unusedvideos: ['&list=querypage&qplimit=10&qppage=UnusedVideos', queryfunctions.title],
	withoutimages: ['&list=querypage&qplimit=10&qppage=Withoutimages', queryfunctions.title],
	nonportableinfoboxes: ['&list=querypage&qplimit=10&qppage=Nonportableinfoboxes', queryfunctions.title],
	popularpages: ['&list=querypage&qplimit=10&qppage=Popularpages', queryfunctions.title],
	pageswithoutinfobox: ['&list=querypage&qplimit=10&qppage=Pageswithoutinfobox', queryfunctions.title],
	templateswithouttype: ['&list=querypage&qplimit=10&qppage=Templateswithouttype', queryfunctions.title],
	allinfoboxes: ['&list=querypage&qplimit=10&qppage=AllInfoboxes', queryfunctions.title]
}

const descriptions = {
	abusefilter: 'abusefilter-intro',
	abuselog: 'abusefilter-log-summary',
	allmaps: 'all-maps-dashboard-description',
	allmessages: 'allmessagestext',
	analytics: 'analytics_confidential',
	apisandbox: 'apisandbox-intro',
	block: 'blockiptext&amargs=16|19',
	categorytree: 'categorytree-header',
	checkuser: 'checkuser-summary&amargs=16|19',
	drafts: 'drafts-view-summary&amargs=30',
	expandtemplates: 'expand_templates_intro',
	gadgets: 'gadgets-pagetext',
	gotointerwiki: 'gotointerwiki-external|gotointerwiki-invalid&amargs=%1F' + encodeURIComponent( '{{fullurl:{{#titleparts:{{PAGENAME}}||2}}_}}' ) + '%1F' + encodeURIComponent( '{{#titleparts:{{PAGENAME}}||2}}' ),
	interwiki: 'interwiki_intro',
	jspages: 'content-review-special-js-description',
	mostlinkedfilesincontent: 'mostimagesincontent-summary',
	popularpages: 'insights-list-description-popularpages',
	resettokens: 'resettokens-text'
}

/**
 * Processes special pages.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {Object} querypage - The details of the special page.
 * @param {String} querypage.title - The title of the special page.
 * @param {String} querypage.uselang - The language of the special page.
 * @param {String} specialpage - The canonical name of the special page.
 * @param {Object} query - The query from the wiki.
 * @param {Object} query.general - The siteinfo from the wiki.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the page.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>}
 */
export default function mw_special_page(lang, msg, {title, uselang = lang.lang}, specialpage, {general}, wiki, querystring, fragment, reaction, spoiler, noEmbed) {
	var pagelink = wiki.toLink(title, querystring, fragment);
	var embed = new EmbedBuilder().setAuthor( {name: general.sitename} ).setTitle( escapeFormatting(title) ).setURL( pagelink );
	try {
		embed.setThumbnail( new URL(general.logo, wiki).href );
	}
	catch {}
	if ( overwrites.hasOwnProperty(specialpage) ) {
		var args = title.split('/').slice(1,3);
		return overwrites[specialpage](this, lang, msg, wiki, querystring, fragment, reaction, spoiler, noEmbed, args, embed);
	}
	logging(wiki, msg.guildId, 'general', 'special');
	if ( noEmbed ) {
		return Promise.resolve( {message: spoiler + '<' + pagelink + '>' + spoiler} );
	}
	if ( specialpage === 'recentchanges' && ( msg.isAdmin?.() || msg.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ) ) {
		embed.addFields( {name: lang.get('rcscript.title'), value: lang.get('rcscript.ad', ( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix ), '[RcGcDw](<https://gitlab.com/piotrex43/RcGcDw>)')} );
	}
	return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=allmessages|siteinfo&siprop=general&amenableparser=true&amtitle=' + encodeURIComponent( title ) + '&ammessages=' + encodeURIComponent( specialpage ) + '|' + ( descriptions.hasOwnProperty(specialpage) ? descriptions[specialpage] : encodeURIComponent( specialpage ) + '-summary' ) + ( querypages.hasOwnProperty(specialpage) ? querypages[specialpage][0] : '' ) + '&converttitles=true&titles=%1F' + encodeURIComponent( title ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body?.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined ) {
			console.log( '- ' + response.statusCode + ': Error while getting the special page: ' + body?.error?.info );
			return;
		}
		if ( body.query.pages?.['-1']?.title ) {
			title = body.query.pages['-1'].title;
			pagelink = wiki.toLink(title, querystring, fragment);
			embed.setTitle( escapeFormatting(title) );
		}
		if ( body.query.allmessages?.[0]?.['*']?.trim?.() ) {
			let displaytitle = escapeFormatting(body.query.allmessages[0]['*'].trim());
			if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
			if ( displaytitle.trim() ) embed.setTitle( displaytitle );
		}
		if ( body.query.allmessages?.[1]?.['*']?.trim?.() && msg.embedLimits.descLength ) {
			var description = toMarkdown(body.query.allmessages[1]['*'], wiki, title, true);
			if ( specialpage === 'gotointerwiki' ) {
				if ( description.includes( '\\{\\{#titleparts\\:' ) ) description = ' ';
				if ( !title.includes( '/' ) || description.includes( '[[]]' ) ) {
					description = toMarkdown(body.query.allmessages[2]['*'], wiki, title, true);
				}
			}
			if ( description.length > msg.embedLimits.descLength ) description = description.substring(0, msg.embedLimits.descLength) + '\u2026';
			embed.setDescription( description );
		}
		if ( msg.inGuild() && querypages.hasOwnProperty(specialpage) && msg.embedLimits.fieldLength ) {
			var text = splitMessage( querypages[specialpage][1](body.query, wiki, lang), {maxLength: msg.embedLimits.fieldLength} )[0];
			embed.addFields( {name: lang.get('search.special'), value: ( text || lang.get('search.empty') )} );
			if ( body.query.querypage?.cached !== undefined ) {
				embed.setFooter( {text: lang.get('search.cached')} ).setTimestamp(new Date(body.query.querypage.cachedtimestamp ?? 0));
			}
		}
	}, error => {
		console.log( '- Error while getting the special page: ' + error );
	} ).then( () => {
		return {message: {
			content: spoiler + '<' + pagelink + '>' + spoiler,
			embeds: [embed]
		}};
	} );
}
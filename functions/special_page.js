const {Util} = require('discord.js');
const logging = require('../util/logging.js');
const {timeoptions} = require('../util/default.json');
const {toMarkdown, escapeFormatting} = require('../util/functions.js');

const overwrites = {
	randompage: (fn, lang, msg, wiki, reaction, spoiler) => {
		fn.random(lang, msg, wiki, reaction, spoiler);
	},
	statistics: (fn, lang, msg, wiki, reaction, spoiler) => {
		fn.overview(lang, msg, wiki, reaction, spoiler);
	},
	diff: (fn, lang, msg, wiki, reaction, spoiler, args, embed) => {
		fn.diff(lang, msg, args, wiki, reaction, spoiler, embed);
	}
}

const queryfunctions = {
	title: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, '', '', true) + ')';
	} ).join('\n'),
	times: (query, wiki, lang) => query.querypage.results.map( result => {
		return parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + '× [' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, '', '', true) + ')';
	} ).join('\n'),
	size: (query, wiki, lang) => query.querypage.results.map( result => {
		return lang.get('diff.info.bytes', parseInt(result.value, 10).toLocaleString(lang.get('dateformat')), result.value) + ': [' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, '', '', true) + ')';
	} ).join('\n'),
	redirect: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, 'redirect=no', '', true) + ')' + ( result.databaseResult && result.databaseResult.rd_title ? ' → ' + escapeFormatting(result.databaseResult.rd_title) : '' );
	} ).join('\n'),
	doubleredirect: (query, wiki) => query.querypage.results.map( result => {
		return '[' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, 'redirect=no', '', true) + ')' + ( result.databaseResult && result.databaseResult.b_title && result.databaseResult.c_title ? ' → ' + escapeFormatting(result.databaseResult.b_title) + ' → ' + escapeFormatting(result.databaseResult.c_title) : '' );
	} ).join('\n'),
	timestamp: (query, wiki, lang) => query.querypage.results.map( result => {
		try {
			var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
				timeZone: body.query.general.timezone
			}, timeoptions));
		}
		catch ( error ) {
			var dateformat = new Intl.DateTimeFormat(lang.get('dateformat'), Object.assign({
				timeZone: 'UTC'
			}, timeoptions));
		}
		let lastEditDate = new Date(result.timestamp);
		return dateformat.format(lastEditDate) + ' <t:' + Math.trunc(lastEditDate.getTime() / 1000) + ':R>: [' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, '', '', true) + ')';
	} ).join('\n'),
	media: (query, wiki, lang) => query.querypage.results.map( result => {
		var ms = result.title.split(';');
		return '**' + ms[1] + '**: ' + lang.get('search.category.files', parseInt(ms[2], 10).toLocaleString(lang.get('dateformat')), parseInt(ms[2], 10)) + ' (' + lang.get('diff.info.bytes', parseInt(ms[3], 10).toLocaleString(lang.get('dateformat')), parseInt(ms[3], 10)) + ')';
	} ).join('\n'),
	category: (query, wiki, lang) => query.querypage.results.map( result => {
		return parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + '× [' + escapeFormatting(result.title) + '](' + wiki.toLink('Category:' + result.title, '', '', true) + ')';
	} ).join('\n'),
	gadget: (query, wiki, lang) => query.querypage.results.map( result => {
		result.title = result.title.replace( /^(?:.*:)?gadget-/, '' );
		return '**' + escapeFormatting(result.title) + '**: ' + parseInt(result.value, 10).toLocaleString(lang.get('dateformat')) + ' users (' + result.ns.toLocaleString(lang.get('dateformat')) + ' active)';
	} ).join('\n'),
	recentchanges: (query, wiki) => query.recentchanges.map( result => {
		return '[' + escapeFormatting(result.title) + '](' + wiki.toLink(result.title, ( result.type === 'edit' ? {diff:result.revid,oldid:result.old_revid} : '' ), '', true) + ')';
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
	block: 'blockiptext&amargs=16|19',
	checkuser: 'checkuser-summary&amargs=16|19',
	resettokens: 'resettokens-text',
	allmessages: 'allmessagestext',
	expandtemplates: 'expand_templates_intro',
	apisandbox: 'apisandbox-intro',
	abusefilter: 'abusefilter-intro',
	gadgets: 'gadgets-pagetext',
	categorytree: 'categorytree-header',
	drafts: 'drafts-view-summary&amargs=30',
	analytics: 'analytics_confidential',
	mostlinkedfilesincontent: 'mostimagesincontent-summary',
	popularpages: 'insights-list-description-popularpages'
}

/**
 * Processes special pages.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {Object} querypage - The details of the special page.
 * @param {String} querypage.title - The title of the special page.
 * @param {String} querypage.uselang - The language of the special page.
 * @param {String} specialpage - The canonical name of the special page.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the page.
 * @param {import('../util/wiki.js')} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function special_page(lang, msg, {title, uselang = lang.lang}, specialpage, embed, wiki, reaction, spoiler) {
	if ( overwrites.hasOwnProperty(specialpage) ) {
		var args = title.split('/').slice(1,3);
		overwrites[specialpage](this, lang, msg, wiki, reaction, spoiler, args, embed);
		return;
	}
	logging(wiki, msg.guild?.id, 'general', 'special');
	if ( specialpage === 'recentchanges' && msg.isAdmin() ) {
		embed.addField( lang.get('rcscript.title'), lang.get('rcscript.ad', ( patreons[msg?.guild?.id] || process.env.prefix ), '[RcGcDw](https://gitlab.com/piotrex43/RcGcDw)') );
	}
	got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=allmessages|siteinfo&siprop=general&amenableparser=true&amtitle=' + encodeURIComponent( title ) + '&ammessages=' + encodeURIComponent( specialpage ) + '|' + ( descriptions.hasOwnProperty(specialpage) ? descriptions[specialpage] : encodeURIComponent( specialpage ) + '-summary' ) + ( querypages.hasOwnProperty(specialpage) ? querypages[specialpage][0] : '' ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined ) {
			console.log( '- ' + response.statusCode + ': Error while getting the special page: ' + ( body && body.error && body.error.info ) );
			return;
		}
		if ( body.query.allmessages?.[0]?.['*']?.trim?.() ) {
			let displaytitle = escapeFormatting(body.query.allmessages[0]['*'].trim());
			if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
			embed.setTitle( displaytitle );
		}
		if ( body.query.allmessages?.[1]?.['*']?.trim?.() ) {
			var description = toMarkdown(body.query.allmessages[1]['*'], wiki, title, true);
			if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
			embed.setDescription( description );
		}
		if ( msg.channel.isGuild() && patreons[msg.guild?.id] && querypages.hasOwnProperty(specialpage) ) {
			var text = Util.splitMessage( querypages[specialpage][1](body.query, wiki, lang), {maxLength:1000} )[0];
			embed.addField( lang.get('search.special'), ( text || lang.get('search.empty') ) );
			if ( body.query.querypage.cached !== undefined ) {
				embed.setFooter( lang.get('search.cached') ).setTimestamp(new Date(body.query.querypage.cachedtimestamp));
			}
		}
	}, error => {
		console.log( '- Error while getting the special page: ' + error );
	} ).finally( () => {
		msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = special_page;
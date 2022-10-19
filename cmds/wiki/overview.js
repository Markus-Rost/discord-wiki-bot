import { EmbedBuilder } from 'discord.js';
import logging from '../../util/logging.js';
import { got, canUseMaskedLinks, toFormatting, toPlaintext, escapeFormatting } from '../../util/functions.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {timeoptions} = require('../../util/default.json');

/**
 * Sends a Gamepedia wiki overview.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the overview.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @param {URLSearchParams} [querystring] - The querystring for the link.
 * @param {String} [fragment] - The section for the link.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
export default function gamepedia_overview(lang, msg, wiki, spoiler, noEmbed, querystring = new URLSearchParams(), fragment = '') {
	var uselang = lang.lang;
	if ( querystring.has('variant') || querystring.has('uselang') ) {
		uselang = ( querystring.getAll('variant').pop() || querystring.getAll('uselang').pop() || uselang );
		lang = lang.uselang(querystring.getAll('variant').pop(), querystring.getAll('uselang').pop());
	}
	return got.get( wiki + 'api.php?uselang=' + uselang + '&action=query&meta=allmessages|siteinfo&amenableparser=true&amtitle=Special:Statistics&ammessages=statistics' + ( wiki.wikifarm === 'fandom' ? '|custom-GamepediaNotice|custom-FandomMergeNotice' : '' ) + '&siprop=general|statistics|languages|rightsinfo' + ( wiki.wikifarm === 'fandom' ? '|variables' : '' ) + '&siinlanguagecode=' + uselang + '&list=logevents&ledir=newer&lelimit=1&leprop=timestamp&titles=Special:Statistics&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				return {reaction: 'nowiki'};
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the statistics: ' + ( body && body.error && body.error.info ) );
				return {
					reaction: 'error',
					message: spoiler + '<' + wiki.toLink('Special:Statistics', querystring, fragment) + '>' + spoiler
				};
			}
		}
		wiki.updateWiki(body.query.general);
		logging(wiki, msg.guildId, 'overview');
		var version = [lang.get('overview.version'), body.query.general.generator];
		var creation_date = null;
		var created = [lang.get('overview.created'), lang.get('overview.unknown'), ''];
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
		if ( body.query.logevents?.[0]?.timestamp ) {
			creation_date = new Date(body.query.logevents[0].timestamp);
			created[1] = dateformat.format(creation_date);
			created[2] = '<t:' + Math.trunc(creation_date.getTime() / 1000) + ':R>';
		}
		var language = [lang.get('overview.lang'), body.query.languages.find( language => {
			return language.code === body.query.general.lang;
		} )['*']];
		var rtl = [lang.get('overview.rtl'), ( body.query.general.rtl !== undefined ? lang.get('overview.yes') : undefined )];
		var articles = [lang.get('overview.articles'), body.query.statistics.articles.toLocaleString(lang.get('dateformat'))];
		var pages = [lang.get('overview.pages'), body.query.statistics.pages.toLocaleString(lang.get('dateformat'))];
		var edits = [lang.get('overview.edits'), body.query.statistics.edits.toLocaleString(lang.get('dateformat'))];
		var users = [lang.get('overview.users'), body.query.statistics.activeusers.toLocaleString(lang.get('dateformat'))];
		var admins = [lang.get('overview.admins'), body.query.statistics.admins.toLocaleString(lang.get('dateformat'))];
		var license = [lang.get('overview.license'), lang.get('overview.unknown')];
		if ( body.query.rightsinfo.url ) {
			let licenseurl = body.query.rightsinfo.url
			try {
				if ( /^(?:https?:\/)?\//.test(licenseurl) ) licenseurl = new URL(licenseurl, wiki).href;
				else licenseurl = wiki.toLink(licenseurl, '', '', true);
			}
			catch {}
			
			if ( body.query.rightsinfo.text ) {
				let licensetext = body.query.rightsinfo.text;
				if ( canUseMaskedLinks(msg, noEmbed) ) {
					license[1] = '[' + toPlaintext(licensetext, true) + '](<' + licenseurl + '>)';
				}
				else license[1] = toPlaintext(licensetext, true) + ' (<' + licenseurl + '>)';
			}
			else license[1] = '<' + licenseurl + '>';
		}
		else if ( body.query.rightsinfo.text ) {
			license[1] = toFormatting(body.query.rightsinfo.text, canUseMaskedLinks(msg, noEmbed), wiki, '', true);
		}
		var misermode = [lang.get('overview.misermode'), lang.get('overview.' + ( body.query.general.misermode !== undefined ? 'yes' : 'no' ))];
		var readonly = [lang.get('overview.readonly')];
		if ( body.query.general.readonly !== undefined ) {
			if ( body.query.general.readonlyreason ) {
				let readonlyreason = body.query.general.readonlyreason;
				readonly.push(toFormatting(readonlyreason, canUseMaskedLinks(msg, noEmbed), wiki, '', true));
			}
			else readonly = ['\u200b', '**' + lang.get('overview.readonly') + '**'];
		}
		
		var title = body.query.pages['-1'].title;
		var pagelink = wiki.toLink(title, querystring, fragment);
		var text = '<' + pagelink + '>';
		/** @type {EmbedBuilder?} */
		var embed = null;
		if ( !noEmbed ) {
			embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(title) ).setURL( pagelink );
			try {
				embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			catch {}
			if ( body.query.allmessages?.[0]?.['*']?.trim?.() ) {
				let displaytitle = escapeFormatting(body.query.allmessages[0]['*'].trim());
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				if ( displaytitle.trim() ) embed.setTitle( displaytitle );
			}
		}
		else {
			text += '\n';
		}
		
		var wikiid = body.query.variables?.find?.( variable => variable?.id === 'wgCityId' )?.['*'];
		if ( wiki.wikifarm === 'fandom' && wikiid ) {
			var vertical = [lang.get('overview.vertical')];
			var topic = [lang.get('overview.topic')];
			var official = [lang.get('overview.official')];
			var posts = [lang.get('overview.posts')];
			var walls = [lang.get('overview.walls')];
			var comments = [lang.get('overview.comments')];
			var manager = [lang.get('overview.manager'), ''];
			var founder = [lang.get('overview.founder')];
			var crossover = [lang.get('overview.crossover')];
			if ( body.query.allmessages?.[1]?.['*']?.trim?.() ) {
				crossover[1] = '<https://' + body.query.allmessages[1]['*'].trim() + '.gamepedia.com/>';
			}
			if ( body.query.allmessages?.[2]?.['*']?.trim?.() ) {
				let mergeNotice = body.query.allmessages[2]['*'].trim();
				if ( !mergeNotice.includes( '|' ) ) {
					mergeNotice = mergeNotice.split('/');
					crossover[1] = '<https://' + mergeNotice[0] + '.fandom.com/' + ( mergeNotice[1] ? '/' + mergeNotice[1] : '' ) + '>';
				}
			}
			var description = [lang.get('overview.description')];
			var image = [lang.get('overview.image')];
			return got.get( 'https://community.fandom.com/wikia.php?controller=WikisApiController&method=getDetails&ids=' + wikiid + '&format=json&cache=' + Date.now(), {
				context: {
					guildId: msg.guildId
				}
			} ).then( ovresponse => {
				var ovbody = ovresponse.body;
				if ( ovresponse.statusCode !== 200 || !ovbody || ovbody.exception || !ovbody.items || !ovbody.items[wikiid] ) {
					console.log( '- ' + ovresponse.statusCode + ': Error while getting the wiki details: ' + ( ovbody && ovbody.exception && ovbody.exception.details ) );
					return;
				}
				var site = ovbody.items[wikiid];
				
				vertical[1] = site.hub;
				topic[1] = site.topic;
				founder[1] = site.founding_user_id;
				if ( site.creation_date && creation_date > new Date(site.creation_date) ) {
					creation_date = new Date(site.creation_date);
					created[1] = dateformat.format(creation_date);
					created[2] = '<t:' + Math.trunc(creation_date.getTime() / 1000) + ':R>';
				}
				if ( site.desc ) {
					description[1] = escapeFormatting(site.desc);
					if ( description[1].length > 1000 ) {
						description[1] = description[1].substring(0, 1000) + '\u2026';
					}
				}
				if ( site.image ) {
					try {
						image[1] = new URL(site.image, wiki).href;
					}
					catch {}
				}
				
				return Promise.all([
					( founder[1] > 0 ? got.get( wiki + 'api.php?action=query&list=users&usprop=&ususerids=' + founder[1] + '&format=json', {
						context: {
							guildId: msg.guildId
						}
					} ).then( usresponse => {
						var usbody = usresponse.body;
						if ( usbody && usbody.warnings ) log_warning(usbody.warnings);
						if ( usresponse.statusCode !== 200 || !usbody || !usbody.query || !usbody.query.users || !usbody.query.users[0] ) {
							console.log( '- ' + usresponse.statusCode + ': Error while getting the wiki founder: ' + ( usbody && usbody.error && usbody.error.info ) );
							founder[1] = 'ID: ' + founder[1];
						}
						else {
							var user = usbody.query.users[0].name;
							if ( canUseMaskedLinks(msg, noEmbed) ) founder[1] = '[' + user + '](<' + wiki.toLink('User:' + user, '', '', true) + '>)';
							else founder[1] = user;
						}
					}, error => {
						console.log( '- Error while getting the wiki founder: ' + error );
						founder[1] = 'ID: ' + founder[1];
					} ) : founder[1] = ( founder[1] === undefined || wiki.isGamepedia() ? null : lang.get('overview.none') ) ),
					got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&limit=1&format=json&cache=' + Date.now(), {
						headers: {
							Accept: 'application/hal+json'
						},
						context: {
							guildId: msg.guildId
						}
					} ).then( dsresponse => {
						var dsbody = dsresponse.body;
						if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.status === 404 ) {
							if ( dsbody?.status !== 404 ) console.log( '- ' + dsresponse.statusCode + ': Error while getting discussions stats: ' + dsbody?.title );
							return;
						}
						let counts = dsbody?._embedded?.count?.[0];
						if ( counts?.FORUM || counts?.WALL || counts?.ARTICLE_COMMENT ) {
							if ( counts?.FORUM ) posts.push(counts.FORUM.toLocaleString(lang.get('dateformat')));
							if ( counts?.WALL ) walls.push(counts.WALL.toLocaleString(lang.get('dateformat')));
							if ( counts?.ARTICLE_COMMENT ) comments.push(counts.ARTICLE_COMMENT.toLocaleString(lang.get('dateformat')));
						}
						else if ( counts?.total ) posts.push(counts.total.toLocaleString(lang.get('dateformat')));
					}, error => {
						console.log( '- Error while getting discussions stats: ' + error );
					} )
				]);
			}, error => {
				console.log( '- Error while getting the wiki details: ' + error );
				return;
			} ).then( () => {
				if ( !noEmbed ) {
					if ( vertical[1] ) embed.addFields( {name: vertical[0], value: vertical[1], inline: true} );
					if ( topic[1] ) embed.addFields( {name: topic[0], value: topic[1], inline: true} );
					if ( official[1] ) embed.addFields( {name: official[0], value: official[1], inline: true} );
					embed.addFields(...[
						{name: version[0], value: version[1], inline: true},
						{name: language[0], value: language[1], inline: true}
					]);
					if ( rtl[1] ) embed.addFields( {name: rtl[0], value: rtl[1], inline: true} );
					embed.addFields(...[
						{name: created[0], value: created[1] + '\n' + created[2], inline: true},
						{name: articles[0], value: articles[1], inline: true},
						{name: pages[0], value: pages[1], inline: true},
						{name: edits[0], value: edits[1], inline: true}
					]);
					if ( posts[1] ) embed.addFields( {name: posts[0], value: posts[1], inline: true} );
					if ( walls[1] ) embed.addFields( {name: walls[0], value: walls[1], inline: true} );
					if ( comments[1] ) embed.addFields( {name: comments[0], value: comments[1], inline: true} );
					embed.addFields(...[
						{name: users[0], value: users[1], inline: true},
						{name: admins[0], value: admins[1], inline: true}
					]);
					if ( manager[1] ) embed.addFields( {name: manager[0], value: manager[1], inline: true} );
					if ( founder[1] ) embed.addFields( {name: founder[0], value: founder[1], inline: true} );
					if ( crossover[1] ) embed.addFields( {name: crossover[0], value: crossover[1], inline: true} );
					embed.addFields(...[
						{name: license[0], value: license[1], inline: true},
						{name: misermode[0], value: misermode[1], inline: true}
					]).setFooter( {
						text: lang.get('overview.inaccurate') + ( wikiid ? ' • ' + lang.get('overview.wikiid') + ' ' + wikiid : '' )
					} );
					if ( description[1] ) embed.addFields( {name: description[0], value: description[1]} );
					if ( image[1] ) embed.addFields( {name: image[0], value: image[1]} ).setImage( image[1] );
					if ( readonly[1] ) embed.addFields( {name: readonly[0], value: readonly[1]} );
				}
				else {
					if ( vertical[1] ) text += '\n' + vertical.join(' ');
					if ( topic[1] ) text += '\n' + topic.join(' ');
					if ( official[1] ) text += '\n' + official.join(' ');
					text += '\n' + version.join(' ') + '\n' + language.join(' ');
					if ( rtl[1] ) text += '\n' + rtl.join(' ');
					text += '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ');
					if ( posts[1] ) text += '\n' + posts.join(' ');
					if ( walls[1] ) text += '\n' + walls.join(' ');
					if ( comments[1] ) text += '\n' + comments.join(' ');
					text += '\n' + users.join(' ') + '\n' + admins.join(' ');
					if ( manager[1] ) text += '\n' + manager.join(' ');
					if ( founder[1] ) text += '\n' + founder.join(' ');
					if ( crossover[1] ) text += '\n' + crossover.join(' ');
					text += '\n' + license.join(' ') + '\n' + misermode.join(' ');
					if ( description[1] ) text += '\n' + description.join(' ');
					if ( image[1] ) text += '\n' + image.join(' ');
					if ( readonly[1] ) text += '\n\n' + ( readonly[0] === '\u200b' ? readonly[1] : readonly.join('\n') );
					text += '\n\n*' + lang.get('overview.inaccurate') + '*';
				}
				
				return {message: {
					content: spoiler + text + spoiler,
					embeds: [embed]
				}};
			} );
		}
		if ( !noEmbed ) {
			embed.addFields(...[
				{name: version[0], value: version[1], inline: true},
				{name: language[0], value: language[1], inline: true}
			]);
			if ( rtl[1] ) embed.addFields( {name: rtl[0], value: rtl[1], inline: true} );
			embed.addFields(...[
				{name: created[0], value: created[1] + '\n' + created[2], inline: true},
				{name: articles[0], value: articles[1], inline: true},
				{name: pages[0], value: pages[1], inline: true},
				{name: edits[0], value: edits[1], inline: true},
				{name: users[0], value: users[1], inline: true},
				{name: admins[0], value: admins[1], inline: true},
				{name: license[0], value: license[1], inline: true},
				{name: misermode[0], value: misermode[1], inline: true}
			]).setFooter( {text: lang.get('overview.inaccurate')} );
			if ( readonly[1] ) embed.addFields( {name: readonly[0], value: readonly[1]} );
		}
		else {
			text += '\n' + version.join(' ') + '\n' + language.join(' ');
			if ( rtl[1] ) text += '\n' + rtl.join(' ');
			text += '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ') + '\n' + admins.join(' ') + '\n' + license.join(' ') + '\n' + misermode.join(' ');
			if ( readonly[1] ) text += '\n\n' + ( readonly[0] === '\u200b' ? readonly[1] : readonly.join('\n') );
			text += '\n\n*' + lang.get('overview.inaccurate') + '*';
		}
		
		return {message: {
			content: spoiler + text + spoiler,
			embeds: [embed]
		}};
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			return {reaction: 'nowiki'};
		}
		else {
			console.log( '- Error while getting the statistics: ' + error );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink('Special:Statistics', querystring, fragment) + '>' + spoiler
			};
		}
	} );
}
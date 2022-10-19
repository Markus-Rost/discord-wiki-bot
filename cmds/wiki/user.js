import { EmbedBuilder } from 'discord.js';
import datetimeDifference from 'datetime-difference';
import global_block from '../../functions/global_block.js';
import parse_page from '../../functions/parse_page.js';
import logging from '../../util/logging.js';
import extract_desc from '../../util/extract_desc.js';
import { got, isMessage, canUseMaskedLinks, toMarkdown, toPlaintext, htmlToDiscord, escapeFormatting } from '../../util/functions.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {timeoptions, usergroups} = require('../../util/default.json');

/**
 * Processes a Gamepedia user.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String} namespace - The user namespace on the wiki.
 * @param {String} username - The name of the user.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the page.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {Object} querypage - The user page on the wiki.
 * @param {String} contribs - The contributions page on the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: String, message?: String|import('discord.js').MessageOptions}>}
 */
export default function gamepedia_user(lang, msg, namespace, username, wiki, querystring, fragment, querypage, contribs, reaction, spoiler, noEmbed) {
	if ( /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		logging(wiki, msg.guildId, 'user', 'ip');
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.blocks || fragment ) {
			if ( body && body.error && ( body.error.code === 'param_ip' || body.error.code === 'cidrtoobroad' ) || fragment ) {
				if ( querypage.missing !== undefined || querypage.ns === -1 ) return {reaction: 'error'};
				var pagelink = wiki.toLink(querypage.title, querystring, fragment);
				var embed = new EmbedBuilder().setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
				if ( body?.query?.general ) {
					wiki.updateWiki(body.query.general);
					embed.setAuthor( {name: body.query.general.sitename} );
					try {
						embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
					}
					catch {}
				}
				if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
					var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
					if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
					if ( displaytitle.trim() ) embed.setTitle( displaytitle );
				}
				if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract, fragment);
					embed.backupDescription = extract[0];
					if ( extract[1].length && extract[2].length ) {
						embed.backupField = {name: extract[1], value: extract[2]};
					}
				}
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToDiscord( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.backupDescription = description;
				}
				if ( querypage.pageimage && querypage.original ) {
					embed.setThumbnail( querypage.original.source );
				}
				else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
					embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
				}
				
				try {
					return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, new URL(body.query.general.logo, wiki).href, fragment, pagelink);
				}
				catch {
					return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', fragment, pagelink);
				}
			}
			console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring, fragment) + '>' + spoiler
			};
		}
		if ( !querypage.noRedirect || ( querypage.missing === undefined && querypage.ns !== -1 ) ) namespace = contribs;
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
		var blocks = body.query.blocks.map( block => {
			var isIndef = false;
			var isBlocked = false;
			var blockedtimestamp = new Date(block.timestamp);
			var blockduration = '';
			var blockexpiry = '';
			if ( ['infinite', 'indefinite', 'infinity', 'never'].includes(block.expiry) ) {
				isIndef = true;
				isBlocked = true;
			} else if ( block.expiry ) {
				if ( Date.parse(block.expiry) > Date.now() ) isBlocked = true;
				let expiry = new Date(block.expiry);
				let datediff = datetimeDifference(blockedtimestamp, expiry);
				let separator = lang.get('user.block.duration.separator_last').replaceAll( '_', ' ' );
				let last_separator = true;
				if ( datediff.minutes ) blockduration = lang.get('user.block.duration.minutes', datediff.minutes.toLocaleString(lang.get('dateformat')), datediff.minutes);
				if ( datediff.hours ) {
					blockduration = lang.get('user.block.duration.hours', datediff.hours.toLocaleString(lang.get('dateformat')), datediff.hours) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				if ( datediff.days ) {
					if ( datediff.days % 7 ) {
						blockduration = lang.get('user.block.duration.days', ( datediff.days % 7 ).toLocaleString(lang.get('dateformat')), datediff.days % 7) + ( blockduration.length ? separator + blockduration : '' );
						if ( last_separator ) {
							separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
							last_separator = false;
						}
					}
					if ( ( datediff.days / 7 ) >> 0 ) {
						blockduration = lang.get('user.block.duration.weeks', ( ( datediff.days / 7 ) >> 0 ).toLocaleString(lang.get('dateformat')), ( datediff.days / 7 ) >> 0 ) + ( blockduration.length ? separator + blockduration : '' );
						if ( last_separator ) {
							separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
							last_separator = false;
						}
					}
				}
				if ( datediff.months ) {
					blockduration = lang.get('user.block.duration.months', datediff.months.toLocaleString(lang.get('dateformat')), datediff.months) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				if ( datediff.years ) {
					blockduration = lang.get('user.block.duration.years', datediff.years.toLocaleString(lang.get('dateformat')), datediff.years) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				blockexpiry = dateformat.format(expiry);
			}
			if ( isBlocked ) {
				var text = 'user.block.' + ( isIndef ? 'indef_' : '' ) + ( block.reason ? 'text' : 'noreason' );
				if ( canUseMaskedLinks(msg, noEmbed) ) {
					text = lang.get(text, dateformat.format(blockedtimestamp), blockduration, blockexpiry, '[' + escapeFormatting(block.by) + '](<' + wiki.toLink('User:' + block.by, '', '', true) + '>)', toMarkdown(block.reason, wiki));
				}
				else {
					text = lang.get(text, dateformat.format(blockedtimestamp), blockduration, blockexpiry, escapeFormatting(block.by), toPlaintext(block.reason));
				}
				return {
					header: lang.get('user.block.header', escapeFormatting(block.user), 'unknown'), text
				};
			}
		} ).filter( block => block !== undefined );
		if ( username.includes( '/' ) ) {
			var rangeprefix = username;
			if ( username.includes( ':' ) ) {
				var range = parseInt(username.replace( /^.+\/(\d{2,3})$/, '$1' ), 10);
				if ( range === 128 ) username = username.replace( /^(.+)\/\d{2,3}$/, '$1' );
				else if ( range >= 112 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){7}).+$/, '$1' );
				else if ( range >= 96 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){6}).+$/, '$1' );
				else if ( range >= 80 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){5}).+$/, '$1' );
				else if ( range >= 64 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){4}).+$/, '$1' );
				else if ( range >= 48 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){3}).+$/, '$1' );
				else if ( range >= 32 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){2}).+$/, '$1' );
				else if ( range >= 19 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){1}).+$/, '$1' );
			}
			else {
				var range = parseInt(username.substring(username.length - 2), 10);
				if ( range === 32 ) username = username.replace( /^(.+)\/\d{2}$/, '$1' );
				else if ( range >= 24 ) rangeprefix = username.replace( /^((?:\d{1,3}\.){3}).+$/, '$1' );
				else if ( range >= 16 ) rangeprefix = username.replace( /^((?:\d{1,3}\.){2}).+$/, '$1' );
			}
		}
		return got.get( wiki.updateWiki(body.query.general) + 'api.php?action=query&list=usercontribs&ucprop=&uclimit=100' + ( username.includes( '/' ) ? '&ucuserprefix=' + encodeURIComponent( rangeprefix ) : '&ucuser=%1F' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) ) + '&format=json', {
			context: {
				guildId: msg.guildId
			}
		} ).then( ucresponse => {
			var ucbody = ucresponse.body;
			if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
			if ( ucbody && ucbody.warnings ) log_warning(ucbody.warnings);
			if ( ucresponse.statusCode !== 200 || !ucbody || ucbody.batchcomplete === undefined || !ucbody.query || !ucbody.query.usercontribs ) {
				if ( ucbody && ucbody.error && ucbody.error.code === 'baduser_ucuser' ) return {reaction: 'error'};
				console.log( '- ' + ucresponse.statusCode + ': Error while getting the search results: ' + ( ucbody && ucbody.error && ucbody.error.info ) );
				return {
					reaction: 'error',
					message: spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler
				};
			}
			var editcount = [lang.get('user.info.editcount'), ( username.includes( '/' ) && ( ( username.includes( ':' ) && range % 16 ) || range % 8 ) ? '~' : '' ) + ucbody.query.usercontribs.length.toLocaleString(lang.get('dateformat')) + ( ucbody.continue ? '+' : '' )];
			if ( canUseMaskedLinks(msg, noEmbed) ) editcount[1] = '[' + editcount[1] + '](<' + wiki.toLink(contribs + username, '', '', true) + '>)';
			
			var pagelink = wiki.toLink(namespace + username, querystring, fragment);
			var text = '<' + pagelink + '>';
			var embed = null;
			if ( !noEmbed ) {
				embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( username ).setURL( pagelink ).addFields( {name: editcount[0], value: editcount[1], inline: true} );
				embed.forceTitle = true;
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToDiscord( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.backupDescription = description;
				}
				else if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract);
					embed.backupDescription = extract[0];
				}
				if ( blocks.length ) blocks.forEach( block => {
					embed.addFields( {name: block.header, value: block.text} );
				} );
			}
			else {
				text += '\n\n' + editcount.join(' ');
				if ( blocks.length ) blocks.forEach( block => {
					text += '\n\n**' + block.header + '**\n' + block.text;
				} );
			}
			
			if ( msg.inGuild() && patreonGuildsPrefix.has(msg.guildId) && wiki.wikifarm === 'fandom' ) {
				if ( isMessage(msg) ) {
					if ( !noEmbed ) embed.addFields( {name: '\u200b', value: '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**'} );
					else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';
				}

				return parse_page(lang, msg, spoiler + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage).then( message => {
					if ( !message ) return;
					return global_block(lang, ( isMessage(msg) ? message : msg ), username, text, ( noEmbed ? null : embed ), wiki, spoiler);
				} );
			}
			else return parse_page(lang, msg, spoiler + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage);
		}, error => {
			if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
			console.log( '- Error while getting the search results: ' + error );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler
			};
		} );
	}, error => {
		logging(wiki, msg.guildId, 'user', 'ip');
		console.log( '- Error while getting the search results: ' + error );
		return {
			reaction: 'error',
			message: spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring, fragment) + '>' + spoiler
		};
	} );

	logging(wiki, msg.guildId, 'user');
	return got.get( wiki + 'api.php?action=query&meta=siteinfo' + ( wiki.hasCentralAuth() ? '|globaluserinfo&guiprop=groups|editcount|merged&guiuser=' + encodeURIComponent( username ) + '&' : '' ) + '&siprop=general&prop=revisions&rvprop=content|user&rvslots=main&titles=%1FUser:' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '/Discord&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=%1F' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.users || !body.query.users[0] ) {
			console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
			return {
				reaction: 'error',
				message: spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler
			}
		}
		wiki.updateWiki(body.query.general);
		var queryuser = body.query.users[0];
		if ( queryuser.missing !== undefined || queryuser.invalid !== undefined || fragment ) {
			if ( querypage.missing !== undefined || querypage.ns === -1 ) return {reaction: '🤷'};
			var pagelink = wiki.toLink(querypage.title, querystring, fragment);
			var embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(querypage.title) ).setURL( pagelink );
			if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				if ( displaytitle.trim() ) embed.setTitle( displaytitle );
			}
			if ( querypage.extract ) {
				var extract = extract_desc(querypage.extract, fragment);
				embed.backupDescription = extract[0];
				if ( extract[1].length && extract[2].length ) {
					embed.backupField = {name: extract[1], value: extract[2]};
				}
			}
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = htmlToDiscord( querypage.pageprops.description );
				if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
				embed.backupDescription = description;
			}
			try {
				if ( querypage.pageimage && querypage.original ) {
					embed.setThumbnail( querypage.original.source );
				}
				else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
					embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
				}
				else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				
				return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, new URL(body.query.general.logo, wiki).href, fragment, pagelink);
			}
			catch {
				return parse_page(lang, msg, spoiler + '<' + pagelink + '>' + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage, '', fragment, pagelink);
			}
		}
		username = queryuser.name;
		var gender = [lang.get('user.info.gender')];
		switch (queryuser.gender) {
			case 'male':
				gender.push(lang.get('user.gender.male'));
				break;
			case 'female':
				gender.push(lang.get('user.gender.female'));
				break;
			case 'unknown':
			default: 
				gender.push(lang.get('user.gender.unknown'));
		}
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
		let registrationDate = new Date(queryuser.registration);
		var registration = [lang.get('user.info.registration'), dateformat.format(registrationDate), '<t:' + Math.trunc(registrationDate.getTime() / 1000) + ':R>'];
		var editcount = [
			lang.get('user.info.editcount'),
			( canUseMaskedLinks(msg, noEmbed)
				? '[' + queryuser.editcount.toLocaleString(lang.get('dateformat')) + '](<' + wiki.toLink(contribs + username, '', '', true) + '>)'
				: queryuser.editcount.toLocaleString(lang.get('dateformat'))
			)
		];
		if ( wiki.hasCentralAuth() ) {
			var globaleditcount = [
				lang.get('user.info.globaleditcount'),
				( canUseMaskedLinks(msg, noEmbed)
					? '[' + body.query.globaluserinfo.editcount.toLocaleString(lang.get('dateformat')) + '](<' + wiki.toLink('Special:CentralAuth/' + username, '', '', true) + '>)'
					: body.query.globaluserinfo.editcount.toLocaleString(lang.get('dateformat'))
				)
			];
			var wikisedited = [lang.get('user.info.wikisedited'), body.query.globaluserinfo.merged.filter( mergedWiki => mergedWiki.editcount ).length.toLocaleString(lang.get('dateformat'))];
			if ( canUseMaskedLinks(msg, noEmbed) ) wikisedited[1] = '[' + wikisedited[1] + '](<' + wiki.toLink('Special:CentralAuth/' + username, '', '', true) + '>)';
		}
		var groups = queryuser.groups.filter( group => !usergroups.ignored.includes( group ) );
		var globalgroups = [];
		if ( wiki.wikifarm === 'fandom' ) {
			globalgroups = groups.filter( group => usergroups.global.includes( group ) );
			groups = groups.filter( group => !usergroups.global.includes( group ) );
		}
		else if ( wiki.hasCentralAuth() ) {
			globalgroups = body.query.globaluserinfo.groups.filter( group => !usergroups.ignored.includes( group ) );
		}
		var groupnames = [];
		groupnames.push(...groups);
		groupnames.push(...globalgroups);
		return got.get( wiki + 'api.php?action=query&meta=allmessages&amenableparser=true&amincludelocal=true&amargs=' + encodeURIComponent( username ) + '&amlang=' + querypage.uselang + '&ammessages=' + groupnames.map( group => `group-${group}|group-${group}-member` ).join('|') + '&format=json', {
			context: {
				guildId: msg.guildId
			}
		} ).then( gresponse => {
			var gbody = gresponse.body;
			if ( gbody && gbody.warnings ) log_warning(gbody.warnings);
			if ( gresponse.statusCode !== 200 || !gbody || gbody.batchcomplete === undefined || !gbody?.query?.allmessages?.length ) {
				console.log( '- ' + gresponse.statusCode + ': Error while getting the group names: ' + gbody?.error?.info );
				return;
			}
			groupnames = groupnames.map( group => {
				return ( gbody.query.allmessages.find( message => message.normalizedname === `group-${group}-member` )['*'] || gbody.query.allmessages.find( message => message.normalizedname === `group-${group}` )['*'] || group );
			} );
		}, error => {
			console.log( '- Error while getting the group names: ' + error );
		} ).then( () => {
			var group = [lang.get('user.info.group', ( groups.filter( usergroup => {
				return !['autoconfirmed', 'emailconfirmed', 'user'].includes( usergroup )
			} ).length || 1 ))];
			for ( var i = 0; i < usergroups.sorted.length; i++ ) {
				let usergroup = usergroups.sorted[i];
				if ( usergroup === '__CUSTOM__' ) {
					group.push(...groups.filter( customgroup => {
						return !usergroups.sorted.includes( customgroup );
					} ).map( customgroup => {
						return groupnames[groups.indexOf(customgroup)];
					} ));
				}
				else if ( groups.includes( usergroup ) && ( group.length === 1 || !['autoconfirmed', 'emailconfirmed', 'user'].includes( usergroup ) ) ) {
					group.push(groupnames[groups.indexOf(usergroup)]);
				}
			}
			var globalgroup = [lang.get('user.info.globalgroup', globalgroups.length)];
			if ( globalgroup.length ) {
				for ( var i = 0; i < usergroups.global.length; i++ ) {
					let usergroup = usergroups.global[i];
					if ( usergroup === '__CUSTOM__' ) {
						globalgroup.push(...globalgroups.filter( customgroup => {
							return !usergroups.global.includes( customgroup );
						} ).map( customgroup => {
							return groupnames[globalgroups.indexOf(customgroup) + groups.length];
						} ));
					}
					else if ( globalgroups.includes( usergroup ) ) {
						globalgroup.push(groupnames[globalgroups.indexOf(usergroup) + groups.length]);
					}
				}
			}
			var isIndef = false;
			var isBlocked = false;
			var blockedtimestamp = ( queryuser.blockedtimestamp ? new Date(queryuser.blockedtimestamp) : '' );
			var blockduration = '';
			var blockexpiry = '';
			if ( ['infinite', 'indefinite', 'infinity', 'never'].includes(queryuser.blockexpiry) ) {
				isIndef = true;
				isBlocked = true;
			} else if ( queryuser.blockexpiry && queryuser.blockedtimestamp ) {
				let expiry = new Date(queryuser.blockexpiry.replace( /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z' ));
				if ( expiry > Date.now() ) isBlocked = true;
				let datediff = datetimeDifference(blockedtimestamp, expiry);
				let separator = lang.get('user.block.duration.separator_last').replaceAll( '_', ' ' );
				let last_separator = true;
				if ( datediff.minutes ) blockduration = lang.get('user.block.duration.minutes', datediff.minutes.toLocaleString(lang.get('dateformat')), datediff.minutes);
				if ( datediff.hours ) {
					blockduration = lang.get('user.block.duration.hours', datediff.hours.toLocaleString(lang.get('dateformat')), datediff.hours) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				if ( datediff.days ) {
					if ( datediff.days % 7 ) {
						blockduration = lang.get('user.block.duration.days', ( datediff.days % 7 ).toLocaleString(lang.get('dateformat')), datediff.days % 7) + ( blockduration.length ? separator + blockduration : '' );
						if ( last_separator ) {
							separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
							last_separator = false;
						}
					}
					if ( ( datediff.days / 7 ) >> 0 ) {
						blockduration = lang.get('user.block.duration.weeks', ( ( datediff.days / 7 ) >> 0 ).toLocaleString(lang.get('dateformat')), ( datediff.days / 7 ) >> 0 ) + ( blockduration.length ? separator + blockduration : '' );
						if ( last_separator ) {
							separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
							last_separator = false;
						}
					}
				}
				if ( datediff.months ) {
					blockduration = lang.get('user.block.duration.months', datediff.months.toLocaleString(lang.get('dateformat')), datediff.months) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				if ( datediff.years ) {
					blockduration = lang.get('user.block.duration.years', datediff.years.toLocaleString(lang.get('dateformat')), datediff.years) + ( blockduration.length ? separator + blockduration : '' );
					if ( last_separator ) {
						separator = lang.get('user.block.duration.separator').replaceAll( '_', ' ' );
						last_separator = false;
					}
				}
				blockexpiry = dateformat.format(expiry);
			}
			if ( isBlocked ) {
				var blockedtext = 'user.block.' + ( isIndef ? 'indef_' : '' ) + ( queryuser.blockreason ? 'text' : 'noreason' );
				if ( canUseMaskedLinks(msg, noEmbed) ) {
					blockedtext = lang.get(blockedtext, ( blockedtimestamp ? dateformat.format(blockedtimestamp) : 'Invalid Date' ), blockduration, blockexpiry, '[' + escapeFormatting(queryuser.blockedby) + '](<' + wiki.toLink('User:' + queryuser.blockedby, '', '', true) + '>)', toMarkdown(queryuser.blockreason, wiki));
				}
				else {
					blockedtext = lang.get(blockedtext, ( blockedtimestamp ? dateformat.format(blockedtimestamp) : 'Invalid Date' ), blockduration, blockexpiry, escapeFormatting(queryuser.blockedby), toPlaintext(queryuser.blockreason));
				}
				var block = {
					header: lang.get('user.block.header', escapeFormatting(username), queryuser.gender), text: blockedtext
				};
			}
			
			var pagelink = wiki.toLink(namespace + username, querystring, fragment);
			var text = '<' + pagelink + '>';
			var embed = null;
			if ( !noEmbed ) {
				embed = new EmbedBuilder().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(username) ).setURL( pagelink ).addFields( {name: editcount[0], value: editcount[1], inline: true} );
				embed.forceTitle = true;
				if ( wiki.hasCentralAuth() ) embed.addFields(...[
					{name: globaleditcount[0], value: globaleditcount[1], inline: true},
					{name: wikisedited[0], value: wikisedited[1], inline: true}
				]);
				embed.addFields( {name: group[0], value: group.slice(1).join(',\n'), inline: true} );
				if ( globalgroup.length > 1 ) embed.addFields( {name: globalgroup[0], value: globalgroup.slice(1).join(',\n'), inline: true} );
				embed.addFields(...[
					{name: gender[0], value: gender[1], inline: true},
					{name: registration[0], value: registration[1] + '\n' + registration[2], inline: true}
				]);
				
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToDiscord( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.backupDescription = description;
				}
				else if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract);
					embed.backupDescription = extract[0];
				}
			}
			else {
				text += '\n\n' + gender.join(' ') + '\n' + registration.join(' ') + '\n' + editcount.join(' ');
				if ( wiki.hasCentralAuth() ) text += '\n' + globaleditcount.join(' ') + '\n' + wikisedited.join(' ');
				text += '\n' + group[0] + ' ' + group.slice(1).join(', ');
				if ( globalgroup.length > 1 ) {
					text += '\n' + globalgroup[0] + ' ' + globalgroup.slice(1).join(', ');
				}
			}
			if ( wiki.wikifarm === 'fandom' ) return got.get( wiki + 'wikia.php?controller=UserProfile&method=getUserData&userId=' + queryuser.userid + '&format=json&cache=' + Date.now(), {
				context: {
					guildId: msg.guildId
				}
			} ).then( presponse => {
				var pbody = presponse.body;
				if ( presponse.statusCode !== 200 || !pbody || !pbody.userData || !pbody.userData.id ) {
					console.log( '- ' + presponse.statusCode + ': Error while getting the user profile.' );
					return;
				}
				editcount[1] = ( canUseMaskedLinks(msg, noEmbed) ? '[' + pbody.userData.localEdits.toLocaleString(lang.get('dateformat')) + '](<' + wiki.toLink(contribs + username, '', '', true) + '>)' : pbody.userData.localEdits.toLocaleString(lang.get('dateformat')) );
				if ( pbody.userData.posts ) var postcount = [lang.get('user.info.postcount'), ( canUseMaskedLinks(msg, noEmbed) ? '[' + pbody.userData.posts.toLocaleString(lang.get('dateformat')) + '](<' + wiki + 'f/u/' + queryuser.userid + '>)' : pbody.userData.posts.toLocaleString(lang.get('dateformat')) )];
				if ( !noEmbed ) {
					embed.spliceFields(0, 1, {
						name: editcount[0],
						value: editcount[1],
						inline: true
					});
					if ( pbody.userData.posts ) embed.spliceFields(1, 0, {
						name: postcount[0],
						value: postcount[1],
						inline: true
					});
					if ( pbody.userData.avatar?.trim() && pbody.userData.avatar !== 'https://static.wikia.nocookie.net/663e53f7-1e79-4906-95a7-2c1df4ebbada/thumbnail/width/400/height/400' ) {
						embed.setThumbnail( pbody.userData.avatar.replace( '/thumbnail/width/400/height/400', '' ) );
					}
					if ( pbody.userData.bio?.trim() && !embed.description ) {
						let bio = escapeFormatting(pbody.userData.bio);
						if ( bio.length > 1000 ) bio = bio.substring(0, 1000) + '\u2026';
						embed.backupDescription = bio;
					}
					if ( pbody.userData.name?.trim() ) {
						let aka = escapeFormatting(pbody.userData.name);
						if ( aka.length > 100 ) aka = aka.substring(0, 100) + '\u2026';
						embed.addFields( {name: lang.get('user.info.aka'), value: aka, inline: true} );
					}
				}
				else {
					let splittext = text.split('\n');
					splittext.splice(4, 1, editcount.join(' '));
					if ( pbody.userData.posts ) splittext.splice(5, 0, postcount.join(' '));
					if ( pbody.userData.name?.trim() ) {
						let aka = escapeFormatting(pbody.userData.name);
						if ( aka.length > 100 ) aka = aka.substring(0, 100) + '\u2026';
						splittext.push(lang.get('user.info.aka') + ' ' + aka);
					}
					text = splittext.join('\n');
				}
				var discord = '';
				if ( pbody.userData.discordHandle?.trim() ) {
					discord = escapeFormatting(pbody.userData.discordHandle).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
					if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
				}
				if ( wiki.isGamepedia() ) return got.get( wiki + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now(), {
					context: {
						guildId: msg.guildId
					}
				} ).then( cpresponse => {
					var cpbody = cpresponse.body;
					if ( cpresponse.statusCode !== 200 || !cpbody || cpbody.error || cpbody.errormsg || !cpbody.profile ) {
						console.log( '- ' + cpresponse.statusCode + ': Error while getting the user profile: ' + ( cpbody && ( cpbody.error && cpbody.error.info || cpbody.errormsg ) ) );
						return;
					}
					if ( cpbody.profile['link-discord']?.trim() ) {
						discord = escapeFormatting(cpbody.profile['link-discord']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
						if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
					}
					if ( discord ) {
						if ( msg.inGuild() ) {
							var discordmember = msg.guild?.members.cache.find( member => {
								return escapeFormatting(member.user.tag) === discord;
							} );
						}
						var discordname = [lang.get('user.info.discord'), discord];
						if ( discordmember ) discordname[1] = discordmember.toString();
						
						if ( !noEmbed ) embed.addFields( {name: discordname[0], value: discordname[1], inline: true} );
						else text += '\n' + discordname.join(' ');
					}
					if ( cpbody.profile['favwiki'] ) {
						return got.get( wiki + 'api.php?action=profile&do=getWiki&hash=' + encodeURIComponent( cpbody.profile['favwiki'] ) + '&format=json', {
							context: {
								guildId: msg.guildId
							}
						} ).then( favresponse => {
							var favbody = favresponse.body;
							if ( favresponse.statusCode !== 200 || !favbody?.result === 'success' || !favbody.data ) {
								console.log( '- ' + favresponse.statusCode + ': Error while getting the favorite wiki: ' + ( favbody && ( favbody.error && favbody.error.info || favbody.errormsg ) ) );
								return;
							}
							var favwiki = [lang.get('user.info.favwiki'), ( canUseMaskedLinks(msg, noEmbed) ? '[' + favbody.data.wiki_name_display + '](<' + favbody.data.wiki_url + '>)' : '<' + favbody.data.wiki_url + '>' )];
							if ( !noEmbed ) embed.addFields( {name: favwiki[0], value: favwiki[1], inline: true} );
							else text += '\n' + favwiki.join(' ');
						}, error => {
							console.log( '- Error while getting the favorite wiki: ' + error );
						} );
					}
				}, error => {
					console.log( '- Error while getting the curse profile: ' + error );
				} );
				if ( discord ) {
					if ( msg.inGuild() ) {
						var discordmember = msg.guild?.members.cache.find( member => {
							return escapeFormatting(member.user.tag) === discord;
						} );
					}
					let discordname = [lang.get('user.info.discord'), discord];
					if ( discordmember ) discordname[1] = discordmember.toString();
					
					if ( !noEmbed ) embed.addFields( {name: discordname[0], value: discordname[1], inline: true} );
					else text += '\n' + discordname.join(' ');
				}
			}, error => {
				console.log( '- Error while getting the user profile: ' + error );
			} ).then( () => {
				if ( isBlocked ) {
					if ( !noEmbed ) embed.addFields( {name: block.header, value: block.text} );
					else text += '\n\n**' + block.header + '**\n' + block.text;
				}
				
				if ( msg.inGuild() && patreonGuildsPrefix.has(msg.guildId) ) {
					if ( isMessage(msg) ) {
						if ( !noEmbed ) embed.addFields( {name: '\u200b', value: '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**'} );
						else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';
					}
					
					return parse_page(lang, msg, spoiler + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage).then( message => {
						if ( !message ) return;
						return global_block(lang, ( isMessage(msg) ? message : msg ), username, text, ( noEmbed ? null : embed ), wiki, spoiler, queryuser.gender);
					} );
				}
				else return parse_page(lang, msg, spoiler + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage);
			} );
			if ( body.query.pages ) {
				let revision = Object.values(body.query.pages)[0]?.revisions?.[0];
				if ( revision?.user === username ) {
					let discord = '';
					if ( ( revision?.slots?.main || revision )?.['*']?.trim() ) {
						discord = escapeFormatting(( revision?.slots?.main || revision )['*']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
						if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
					}
					if ( discord ) {
						if ( msg.inGuild() ) {
							var discordmember = msg.guild?.members.cache.find( member => {
								return escapeFormatting(member.user.tag) === discord;
							} );
						}
						let discordname = [lang.get('user.info.discord'), discord];
						if ( discordmember ) discordname[1] = discordmember.toString();
						
						if ( !noEmbed ) embed.addFields( {name: discordname[0], value: discordname[1], inline: true} );
						else text += '\n' + discordname.join(' ');
					}
				}
			}
			if ( isBlocked ) {
				if ( !noEmbed ) embed.addFields( {name: block.header, value: block.text} );
				else text += '\n\n**' + block.header + '**\n' + block.text;
			}
			if ( wiki.hasCentralAuth() && body.query.globaluserinfo.locked !== undefined ) {
				if ( !noEmbed ) embed.addFields( {name: '\u200b', value: '**' + lang.get('user.gblock.header', escapeFormatting(username), gender) + '**'} );
				else text += '\n\n**' + lang.get('user.gblock.header', escapeFormatting(username), gender) + '**';
			}
			
			return parse_page(lang, msg, spoiler + text + spoiler, ( noEmbed ? null : embed ), wiki, reaction, querypage);
		} );
	}, error => {
		console.log( '- Error while getting the search results: ' + error );
		return {
			reaction: 'error',
			message: spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler
		};
	} );
}
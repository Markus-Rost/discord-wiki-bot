const {MessageEmbed} = require('discord.js');
const global_block = require('../../functions/global_block.js');
const parse_page = require('../../functions/parse_page.js');
const extract_desc = require('../../util/extract_desc.js');
const {timeoptions, usergroups} = require('../../util/default.json');
const {toMarkdown, toPlaintext, htmlToPlain, htmlToDiscord} = require('../../util/functions.js');

var allSites = [];
const getAllSites = require('../../util/allSites.js');
getAllSites.then( sites => allSites = sites );

/**
 * Processes a Gamepedia user.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} namespace - The user namespace on the wiki.
 * @param {String} username - The name of the user.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the page.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {Object} querypage - The user page on the wiki.
 * @param {String} contribs - The contributions page on the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function gamepedia_user(lang, msg, namespace, username, wiki, querystring, fragment, querypage, contribs, reaction, spoiler) {
	if ( !allSites.length ) getAllSites.update();
	if ( /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.blocks || fragment ) {
			if ( body && body.error && ( body.error.code === 'param_ip' || body.error.code === 'cidrtoobroad' ) || fragment ) {
				if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('error');
				else {
					var pagelink = wiki.toLink(querypage.title, querystring, fragment);
					var embed = new MessageEmbed().setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
					if ( body?.query?.general ) {
						wiki.updateWiki(body.query.general);
						embed.setAuthor( body.query.general.sitename );
						embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
					}
					if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
						var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
						if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
						embed.setTitle( displaytitle );
					}
					if ( querypage.extract ) {
						var extract = extract_desc(querypage.extract, fragment);
						embed.setDescription( extract[0] );
						if ( extract[2].length ) embed.addField( extract[1], extract[2] );
					}
					if ( querypage.pageprops && querypage.pageprops.description ) {
						var description = htmlToPlain( querypage.pageprops.description );
						if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
						embed.setDescription( description );
					}
					if ( querypage.pageimage && querypage.original ) {
						embed.setThumbnail( querypage.original.source );
					}
					else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
						embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
					}
					
					msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} ).then( message => parse_page(message, querypage.title, embed, wiki, '', fragment) );
				}
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring, fragment) + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		if ( !querypage.noRedirect || ( querypage.missing === undefined && querypage.ns !== -1 ) ) namespace = contribs;
		var blocks = body.query.blocks.map( block => {
			var isBlocked = false;
			var blockedtimestamp = new Date(block.timestamp).toLocaleString(lang.get('dateformat'), timeoptions);
			var blockexpiry = block.expiry;
			if ( ['infinite', 'indefinite', 'infinity', 'never'].includes(blockexpiry) ) {
				blockexpiry = lang.get('user.block.until_infinity');
				isBlocked = true;
			} else if ( blockexpiry ) {
				if ( Date.parse(blockexpiry) > Date.now() ) isBlocked = true;
				blockexpiry = new Date(blockexpiry).toLocaleString(lang.get('dateformat'), timeoptions);
			}
			if ( isBlocked ) return {
				header: lang.get('user.block.header', block.user, 'unknown').escapeFormatting(),
				text: lang.get('user.block.' + ( block.reason ? 'text' : 'noreason' ), blockedtimestamp, blockexpiry),
				by: block.by,
				reason: block.reason
			};
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
		got.get( wiki.updateWiki(body.query.general) + 'api.php?action=query&list=usercontribs&ucprop=&uclimit=50' + ( username.includes( '/' ) ? '&ucuserprefix=' + encodeURIComponent( rangeprefix ) : '&ucuser=' + encodeURIComponent( username ) ) + '&format=json' ).then( ucresponse => {
			var ucbody = ucresponse.body;
			if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
			if ( ucbody && ucbody.warnings ) log_warn(ucbody.warnings);
			if ( ucresponse.statusCode !== 200 || !ucbody || ucbody.batchcomplete === undefined || !ucbody.query || !ucbody.query.usercontribs ) {
				if ( ucbody && ucbody.error && ucbody.error.code === 'baduser_ucuser' ) {
					msg.reactEmoji('error');
				}
				else {
					console.log( '- ' + ucresponse.statusCode + ': Error while getting the search results: ' + ( ucbody && ucbody.error && ucbody.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler );
				}
				return;
			}
			var editcount = [lang.get('user.info.editcount'), ( username.includes( '/' ) && ( ( username.includes( ':' ) && range % 16 ) || range % 8 ) ? '~' : '' ) + ucbody.query.usercontribs.length + ( ucbody.continue ? '+' : '' )];
			
			var pagelink = wiki.toLink(namespace + username, querystring, fragment);
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( username ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink(contribs + username, '', '', true) + ')' );
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToPlain( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.setDescription( description );
				}
				else if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract);
					embed.setDescription( extract[0] );
				}
				if ( blocks.length ) blocks.forEach( block => {
					block.text = block.text.replaceSave( /\$3/g, '[' + block.by.escapeFormatting() + '](' + wiki.toLink('User:' + block.by, '', '', true) + ')' );
					if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toMarkdown(block.reason, wiki) );
					embed.addField( block.header, block.text );
				} );
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n\n' + editcount.join(' ');
				if ( blocks.length ) blocks.forEach( block => {
					block.text = block.text.replaceSave( /\$3/g, block.by.escapeFormatting() );
					if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toPlaintext(block.reason) );
					text += '\n\n**' + block.header + '**\n' + block.text;
				} );
			}
			
			if ( msg.channel.isGuild() && msg.guild.id in patreons && wiki.isFandom() ) {
				if ( msg.showEmbed() ) embed.addField( '\u200b', '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**' );
				else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';

				msg.sendChannel( spoiler + text + spoiler, {embed} ).then( message => global_block(lang, message, username, text, embed, wiki, spoiler) );
			}
			else msg.sendChannel( spoiler + text + spoiler, {embed} );
		}, error => {
			if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler );
		} ).finally( () => {
			if ( reaction ) reaction.removeEmoji();
		} );
	}, error => {
		console.log( '- Error while getting the search results: ' + error );
		msg.sendChannelError( spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring, fragment) + '>' + spoiler );
		
		if ( reaction ) reaction.removeEmoji();
	} );

	got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo' + ( wiki.hasCentralAuth() ? '|globaluserinfo&guiprop=groups|editcount|merged&guiuser=' + encodeURIComponent( username ) + '&' : '' ) + '&ammessages=custom-Wiki_Manager&amenableparser=true&siprop=general&prop=revisions&rvprop=content|user&rvslots=main&titles=User:' + encodeURIComponent( username ) + '/Discord&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.users || !body.query.users[0] ) {
			console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
			msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		}
		wiki.updateWiki(body.query.general);
		var queryuser = body.query.users[0];
		if ( queryuser.missing !== undefined || queryuser.invalid !== undefined || fragment ) {
			if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('🤷');
			else {
				var pagelink = wiki.toLink(querypage.title, querystring, fragment);
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
				if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
					var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
					if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
					embed.setTitle( displaytitle );
				}
				if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract, fragment);
					embed.setDescription( extract[0] );
					if ( extract[2].length ) embed.addField( extract[1], extract[2] );
				}
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToPlain( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.setDescription( description );
				}
				if ( querypage.pageimage && querypage.original ) {
					embed.setThumbnail( querypage.original.source );
				}
				else if ( querypage.pageprops && querypage.pageprops.page_image_free ) {
					embed.setThumbnail( wiki.toLink('Special:FilePath/' + querypage.pageprops.page_image_free, {version:Date.now()}) );
				}
				else embed.setThumbnail( new URL(body.query.general.logo, wiki).href );
				
				msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} ).then( message => parse_page(message, querypage.title, embed, wiki, new URL(body.query.general.logo, wiki).href, fragment) );
			}
			
			if ( reaction ) reaction.removeEmoji();
			return;
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
		var registration = [lang.get('user.info.registration'), new Date(queryuser.registration).toLocaleString(lang.get('dateformat'), timeoptions)];
		var editcount = [lang.get('user.info.editcount'), queryuser.editcount];
		var groups = queryuser.groups.filter( group => !usergroups.ignored.includes( group ) );
		var globalgroups = [];
		if ( wiki.isFandom() ) {
			globalgroups = groups.filter( group => usergroups.global.includes( group ) );
			groups = groups.filter( group => !usergroups.global.includes( group ) );
		}
		else if ( wiki.hasCentralAuth() ) {
			globalgroups = body.query.globaluserinfo.groups.filter( group => !usergroups.ignored.includes( group ) );
		}
		var groupnames = [];
		groupnames.push(...groups);
		groupnames.push(...globalgroups);
		got.get( wiki + 'api.php?action=query&meta=allmessages&amenableparser=true&amincludelocal=true&amargs=' + encodeURIComponent( username ) + '&amlang=' + lang.lang + '&ammessages=' + groupnames.map( group => `group-${group}|group-${group}-member` ).join('|') + '&format=json' ).then( gresponse => {
			var gbody = gresponse.body;
			if ( gbody && gbody.warnings ) log_warn(gbody.warnings);
			if ( gresponse.statusCode !== 200 || !gbody || gbody.batchcomplete === undefined || !gbody?.query?.allmessages?.length ) {
				console.log( '- ' + gresponse.statusCode + ': Error while getting the group names: ' + gbody?.error?.info );
				return;
			}
			groupnames = groupnames.map( group => {
				return ( gbody.query.allmessages.find( message => message.normalizedname === `group-${group}-member` )['*'] || gbody.query.allmessages.find( message => message.normalizedname === `group-${group}` )['*'] || group );
			} );
		}, error => {
			console.log( '- Error while getting the group names: ' + error );
		} ).finally( () => {
			var group = [lang.get('user.info.group', ( groups.filter( usergroup => {
				return !['autoconfirmed', 'user'].includes( usergroup )
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
				else if ( groups.includes( usergroup ) && ( group.length === 1 || !['autoconfirmed', 'user'].includes( usergroup ) ) ) {
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
						let thisSite = allSites.find( site => site.wiki_domain === wiki.hostname );
						if ( usergroup === 'wiki_manager' && thisSite && thisSite.wiki_managers.includes( username ) ) {
							globalgroup.push('**' + groupnames[globalgroups.indexOf(usergroup) + groups.length] + '**');
						}
						else if ( usergroup === 'wiki-manager' && ( body.query.allmessages[0]['*'] === username || thisSite && thisSite.wiki_managers.includes( username ) ) ) {
							globalgroup.push('**' + groupnames[globalgroups.indexOf(usergroup) + groups.length] + '**');
						}
						else {
							globalgroup.push(groupnames[globalgroups.indexOf(usergroup) + groups.length]);
						}
					}
				}
			}
			var isBlocked = false;
			var blockedtimestamp = new Date(queryuser.blockedtimestamp).toLocaleString(lang.get('dateformat'), timeoptions);
			var blockexpiry = queryuser.blockexpiry;
			if ( ['infinite', 'indefinite', 'infinity', 'never'].includes(blockexpiry) ) {
				blockexpiry = lang.get('user.block.until_infinity');
				isBlocked = true;
			} else if ( blockexpiry ) {
				var blockexpirydate = blockexpiry.replace( /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z' );
				blockexpiry = new Date(blockexpirydate).toLocaleString(lang.get('dateformat'), timeoptions);
				if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
			}
			var blockedby = queryuser.blockedby;
			var blockreason = queryuser.blockreason;
			var block = {
				header: lang.get('user.block.header', username, queryuser.gender).escapeFormatting(),
				text: lang.get('user.block.' + ( blockreason ? 'text' : 'noreason' ), blockedtimestamp, blockexpiry),
				by: blockedby,
				reason: blockreason
			};
			
			var pagelink = wiki.toLink(namespace + username, querystring, fragment);
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( username.escapeFormatting() ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink(contribs + username, '', '', true) + ')', true );
				if ( wiki.hasCentralAuth() ) {
					embed.addField( lang.get('user.info.globaleditcount'), '[' + body.query.globaluserinfo.editcount + '](' + wiki.toLink('Special:CentralAuth/' + username, '', '', true) + ')', true ).addField( lang.get('user.info.wikisedited'), '[' + body.query.globaluserinfo.merged.filter( mergedWiki => mergedWiki.editcount ).length + '](' + wiki.toLink('Special:CentralAuth/' + username, '', '', true) + ')', true );
				}
				embed.addField( group[0], group.slice(1).join(',\n'), true );
				if ( globalgroup.length > 1 ) {
					embed.addField( globalgroup[0], globalgroup.slice(1).join(',\n'), true );
				}
				embed.addField( gender[0], gender[1], true ).addField( registration[0], registration[1], true );
				
				if ( querypage.pageprops && querypage.pageprops.description ) {
					var description = htmlToPlain( querypage.pageprops.description );
					if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
					embed.setDescription( description );
				}
				else if ( querypage.extract ) {
					var extract = extract_desc(querypage.extract);
					embed.setDescription( extract[0] );
				}
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n\n' + gender.join(' ') + '\n' + registration.join(' ') + '\n' + editcount.join(' ');
				if ( wiki.hasCentralAuth() ) {
					text += '\n' + lang.get('user.info.globaleditcount') + ' ' + body.query.globaluserinfo.editcount + '\n' + lang.get('user.info.wikisedited') + ' ' + body.query.globaluserinfo.merged.filter( mergedWiki => mergedWiki.editcount ).length;
				}
				text += '\n' + group[0] + ' ' + group.slice(1).join(', ');
				if ( globalgroup.length > 1 ) {
					text += '\n' + globalgroup[0] + ' ' + globalgroup.slice(1).join(', ');
				}
			}
			if ( wiki.isFandom() ) return got.get( wiki + 'wikia.php?controller=UserProfile&method=getUserData&userId=' + queryuser.userid + '&format=json&cache=' + Date.now() ).then( presponse => {
				var pbody = presponse.body;
				if ( presponse.statusCode !== 200 || !pbody || !pbody.userData || !pbody.userData.id ) {
					console.log( '- ' + presponse.statusCode + ': Error while getting the user profile.' );
					return;
				}
				if ( msg.showEmbed() ) {
					embed.spliceFields(0, 1, {
						name: editcount[0],
						value: '[' + pbody.userData.localEdits + '](' + wiki.toLink(contribs + username, '', '', true) + ')',
						inline: true
					});
					if ( pbody.userData.posts ) embed.spliceFields(1, 0, {
						name: lang.get('user.info.postcount'),
						value: '[' + pbody.userData.posts + '](' + wiki + 'f/u/' + queryuser.userid + ')',
						inline: true
					});
					if ( pbody.userData.avatar && pbody.userData.avatar !== 'https://static.wikia.nocookie.net/663e53f7-1e79-4906-95a7-2c1df4ebbada/thumbnail/width/400/height/400' ) {
						embed.setThumbnail( pbody.userData.avatar.replace( '/thumbnail/width/400/height/400', '' ) );
					}
					if ( pbody.userData.bio && !embed.description ) {
						let bio = pbody.userData.bio.escapeFormatting();
						if ( bio.length > 1000 ) bio = bio.substring(0, 1000) + '\u2026';
						embed.setDescription( bio );
					}
				}
				else {
					let splittext = text.split('\n');
					splittext.splice(4, 1, editcount[0] + ' ' + pbody.userData.localEdits);
					if ( pbody.userData.posts ) splittext.splice(5, 0, lang.get('user.info.postcount') + ' ' + pbody.userData.posts);
					text = splittext.join('\n');
				}
				var discord = '';
				if ( pbody.userData.discordHandle ) {
					discord = pbody.userData.discordHandle.escapeFormatting().replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
					if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
				}
				if ( wiki.isGamepedia() ) return got.get( wiki + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now() ).then( cpresponse => {
					var cpbody = cpresponse.body;
					if ( cpresponse.statusCode !== 200 || !cpbody || cpbody.error || cpbody.errormsg || !cpbody.profile ) {
						console.log( '- ' + cpresponse.statusCode + ': Error while getting the user profile: ' + ( cpbody && ( cpbody.error && cpbody.error.info || cpbody.errormsg ) ) );
						return;
					}
					if ( cpbody.profile['link-discord'] ) {
						discord = cpbody.profile['link-discord'].escapeFormatting().replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
						if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
					}
					if ( discord ) {
						if ( msg.channel.isGuild() ) {
							var discordmember = msg.guild.members.cache.find( member => {
								return member.user.tag.escapeFormatting() === discord;
							} );
						}
						var discordname = [lang.get('user.info.discord'),discord];
						if ( discordmember ) discordname[1] = discordmember.toString();
						
						if ( msg.showEmbed() ) embed.addField( discordname[0], discordname[1], true );
						else text += '\n' + discordname.join(' ');
					}
					if ( cpbody.profile['favwiki'] ) {
						var favwiki = [lang.get('user.info.favwiki'),allSites.find( site => site.md5_key === cpbody.profile['favwiki'] )];
						if ( favwiki[1] ) {
							if ( msg.showEmbed() ) embed.addField( favwiki[0], '[' + favwiki[1].wiki_display_name + '](<https://' + favwiki[1].wiki_domain + '/>)', true );
							else text += '\n' + favwiki[0] + ' <https://' + favwiki[1].wiki_domain + '/>';
						}
					}
				}, error => {
					console.log( '- Error while getting the curse profile: ' + error );
				} );
				if ( discord ) {
					if ( msg.channel.isGuild() ) {
						var discordmember = msg.guild.members.cache.find( member => {
							return member.user.tag.escapeFormatting() === discord;
						} );
					}
					let discordname = [lang.get('user.info.discord'),discord];
					if ( discordmember ) discordname[1] = discordmember.toString();
					
					if ( msg.showEmbed() ) embed.addField( discordname[0], discordname[1], true );
					else text += '\n' + discordname.join(' ');
				}
			}, error => {
				console.log( '- Error while getting the user profile: ' + error );
			} ).finally( () => {
				if ( msg.showEmbed() ) {
					if ( isBlocked ) {
						block.text = block.text.replaceSave( /\$3/g, '[' + block.by.escapeFormatting() + '](' + wiki.toLink('User:' + block.by, '', '', true) + ')' );
						if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toMarkdown(block.reason, wiki) );
						embed.addField( block.header, block.text );
					}
				}
				else {
					if ( isBlocked ) {
						block.text = block.text.replaceSave( /\$3/g, block.by.escapeFormatting() );
						if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toPlaintext(block.reason) );
						text += '\n\n**' + block.header + '**\n' + block.text;
					}
				}
				
				if ( msg.channel.isGuild() && msg.guild.id in patreons ) {
					if ( msg.showEmbed() ) embed.addField( '\u200b', '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**' );
					else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';
					
					msg.sendChannel( spoiler + text + spoiler, {embed} ).then( message => global_block(lang, message, username, text, embed, wiki, spoiler, queryuser.gender) );
				}
				else msg.sendChannel( spoiler + text + spoiler, {embed} );
				
				if ( reaction ) reaction.removeEmoji();
			} );
			if ( body.query.pages ) {
				let revision = Object.values(body.query.pages)[0]?.revisions?.[0];
				if ( revision?.user === username ) {
					let discord = ( revision?.slots?.main || revision )['*'].replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
					if ( discord.length > 100 ) discord = discord.substring(0, 100) + '\u2026';
					if ( msg.channel.isGuild() ) var discordmember = msg.guild.members.cache.find( member => {
						return member.user.tag === discord;
					} );
					let discordname = [lang.get('user.info.discord'),discord.escapeFormatting()];
					if ( discordmember ) discordname[1] = discordmember.toString();
					
					if ( msg.showEmbed() ) embed.addField( discordname[0], discordname[1], true );
					else text += '\n' + discordname.join(' ');
				}
			}
			if ( isBlocked ) {
				if ( msg.showEmbed() ) {
					block.text = block.text.replaceSave( /\$3/g, '[' + block.by.escapeFormatting() + '](' + wiki.toLink('User:' + block.by, '', '', true) + ')' );
					if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toMarkdown(block.reason, wiki) );
					embed.addField( block.header, block.text );
				}
				else {
					block.text = block.text.replaceSave( /\$3/g, block.by.escapeFormatting() );
					if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, toPlaintext(block.reason) );
					text += '\n\n**' + block.header + '**\n' + block.text;
				}
			}
			if ( wiki.hasCentralAuth() && body.query.globaluserinfo.locked !== undefined ) {
				if ( msg.showEmbed() ) embed.addField( '\u200b', '**' + lang.get('user.gblock.header', username, gender).escapeFormatting() + '**' );
				else text += '\n\n**' + lang.get('user.gblock.header', username, gender).escapeFormatting() + '**';
			}
			
			msg.sendChannel( spoiler + text + spoiler, {embed} );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}, error => {
		console.log( '- Error while getting the search results: ' + error );
		msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring, fragment) + '>' + spoiler );
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'user',
	run: gamepedia_user
};
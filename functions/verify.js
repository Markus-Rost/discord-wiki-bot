import { load as cheerioLoad } from 'cheerio';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, PermissionFlagsBits, ButtonStyle } from 'discord.js';
import { inputToWikiProject } from 'mediawiki-projects-list';
import db from '../util/database.js';
import Lang from '../util/i18n.js';
import Wiki from '../util/wiki.js';
import logging from '../util/logging.js';
import { got, oauthVerify, allowDelete, escapeFormatting } from '../util/functions.js';

/**
 * Processes the "verify" command.
 * @param {Lang} lang - The user language.
 * @param {Lang} logLang - The logging language.
 * @param {import('discord.js').TextChannel} channel - The Discord channel.
 * @param {import('discord.js').GuildMember} member - The Discord guild member.
 * @param {String} username - The username.
 * @param {Wiki} wiki - The wiki for the message.
 * @param {Object[]} rows - The verification settings.
 * @param {String} [old_username] - The username before the search.
 * @returns {Promise<{content:String,embed:EmbedBuilder,add_button:Boolean,send_private:Boolean,reaction:WB_EMOJI,oauth:String[],logging:{channel:String,content:String,embed?:EmbedBuilder}}>}
 */
export default function verify(lang, logLang, channel, member, username, wiki, rows, old_username = '') {
	/** @type {{logchannel:import('discord.js').TextChannel,flags:Number,onsuccess:String,onmatch:String}} */
	var verifynotice = {
		logchannel: rows[0].logchannel,
		flags: rows[0].flags,
		onsuccess: rows[0].onsuccess,
		onmatch: rows[0].onmatch
	};
	verifynotice.logchannel = ( verifynotice.logchannel ? channel.guild.channels.cache.filter( logchannel => {
		return ( logchannel.isTextBased() && !logchannel.isThread() && logchannel.permissionsFor(channel.guild.members.me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) );
	} ).get(verifynotice.logchannel) : null );
	var useLogging = ( verifynotice.logchannel ? true : false );
	var embed = new EmbedBuilder().setFooter( {text: lang.get('verify.title')} ).setTimestamp();
	var logEmbed = new EmbedBuilder().setFooter( {text: logLang.get('verify.title')} ).setTimestamp();
	var result = {
		content: '', embed,
		add_button: channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks),
		send_private: ( (verifynotice.flags & 1 << 0) === 1 << 0 ),
		reaction: '', oauth: [],
		logging: {
			channel: '',
			content: null,
			embed: null
		}
	};
	return got.get( wiki + 'api.php?action=query&meta=siteinfo' + ( wiki.wikifarm === 'fandom' ? '|allmessages&siprop=general&ammessages=importJS&list=users|usercontribs&ucprop=&uclimit=10&ucuser=%1F' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) : '&siprop=general&list=users' ) + '&usprop=blockinfo|groups|editcount|registration|gender&ususers=%1F' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
		context: {
			guildId: channel.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warning(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.users ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				result.reaction = WB_EMOJI.nowiki;
			}
			else if ( body?.error?.code === 'us400' || body?.error?.code === 'baduser_ucuser' || body?.error?.code === 'baduser' ) {
				// special catch for Fandom
				if ( !old_username ) logging(wiki, channel.guildId, 'verification');
				embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) ).addFields( {name: lang.get('verify.notice'), value: lang.get('verify.help_missing')} );
				result.content = lang.get('verify.user_missing_reply', escapeFormatting( old_username || username ));
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the user: ' + ( body && body.error && body.error.info ) );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
			}
			result.add_button = false;
			return;
		}
		wiki.updateWiki(body.query.general);
		if ( wiki.hasOAuth2() && process.env.dashboard ) {
			let oauth = [wiki.hostname + wiki.pathname.slice(0, -1)];
			if ( wiki.wikifarm === 'wikimedia' ) oauth.push('wikimedia');
			else if ( wiki.wikifarm === 'miraheze' ) oauth.push('miraheze');
			else {
				let project = inputToWikiProject(wiki.href)
				if ( project ) oauth.push(project.wikiProject.name);
			}
			if ( process.env['oauth_' + ( oauth[1] || oauth[0] )] && process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret'] ) {
				result.oauth = oauth;
				return;
			}
		}
		if ( !old_username ) logging(wiki, channel.guildId, 'verification');
		var queryuser = body.query.users[0];
		embed.setAuthor( {name: body.query.general.sitename} );
		logEmbed.setAuthor( {name: body.query.general.sitename} );
		if ( body.query.users.length !== 1 || queryuser.missing !== undefined || queryuser.invalid !== undefined ) {
			username = ( body.query.users.length === 1 ? queryuser.name : username );
			embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) ).addFields( {name: lang.get('verify.notice'), value: lang.get('verify.help_missing')} );
			result.content = lang.get('verify.user_missing_reply', escapeFormatting( old_username || username ));
			result.add_button = false;
			if ( wiki.wikifarm === 'fandom' && !old_username ) return got.get( wiki + 'wikia.php?controller=UserApiController&method=getUsersByName&limit=1&query=' + encodeURIComponent( username ) + '&format=json', {
				context: {
					guildId: channel.guildId
				}
			} ).then( wsresponse => {
				var wsbody = wsresponse.body;
				if ( wsresponse.statusCode !== 200 || wsbody?.exception || wsbody?.error || wsbody?.users?.[0]?.name?.length !== username.length ) {
					if ( !wsbody?.users ) console.log( '- ' + wsresponse.statusCode + ': Error while searching the user: ' + ( wsbody?.exception?.details || wsbody?.details || wsbody?.error ) );
					return;
				}
				return wsbody.users[0].name;
			}, error => {
				console.log( '- Error while searching the user: ' + error );
			} );
			return;
		}
		username = queryuser.name;
		var pagelink = wiki.toLink(( wiki.namespaces.has(2) ? wiki.namespaces.get(2).name : 'User' ) + ':' + username, '', '', true);
		embed.setTitle( escapeFormatting(username) ).setURL( pagelink );
		logEmbed.setTitle( escapeFormatting(username) ).setURL( pagelink );
		if ( queryuser.blockexpiry ) {
			embed.setColor('#FF0000').setDescription( lang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
			logEmbed.setColor('#FF0000').setDescription( logLang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
			result.content = lang.get('verify.user_blocked_reply', escapeFormatting(username), queryuser.gender);
			if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
				result.logging.channel = verifynotice.logchannel.id;
				if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
					logEmbed.addFields( {name: logLang.get('verify.discord', 'unknown'), value: escapeFormatting(member.user.tag) + ` (${member.toString()})`, inline: true} );
					result.logging.embed = logEmbed;
				}
				else {
					let logText = '🔸 ' + logLang.get('verify.user_blocked', escapeFormatting(username), queryuser.gender) + ` (${member.toString()})`;
					logText += '\n<' + pagelink + '>';
					result.logging.content = logText;
				}
			}
			result.add_button = false;
			return;
		}
		
		var comment = [];
		if ( wiki.wikifarm === 'fandom' ) return got.get( 'https://community.fandom.com/wiki/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1&cache=' + Date.now(), {
			responseType: 'text',
			context: {
				guildId: channel.guildId
			}
		} ).then( gbresponse => {
			if ( gbresponse.statusCode !== 200 || !gbresponse.body ) {
				console.log( '- ' + gbresponse.statusCode + ': Error while getting the global block.' );
				comment.push(( useLogging ? logLang : lang ).get('verify.failed_gblock'));
			}
			else {
				let $ = cheerioLoad(gbresponse.body, {baseURI: gbresponse.url});
				if ( $('#mw-content-text .errorbox').length ) {
					return Promise.reject({
						desc: lang.get('verify.user_disabled', '[' + escapeFormatting(username) + '](<' + pagelink + '>)'),
						logDesc: logLang.get('verify.user_disabled', '[' + escapeFormatting(username) + '](<' + pagelink + '>)'),
						reply: lang.get('verify.user_disabled_reply', escapeFormatting(username))
					});
				}
				else if ( $('#mw-content-text .userprofile.mw-warning-with-logexcerpt').length ) {
					return Promise.reject({
						desc: lang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender),
						logDesc: logLang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender),
						reply: lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender)
					});
				}
			}
		}, error => {
			console.log( '- Error while getting the global block: ' + error );
			comment.push(( useLogging ? logLang : lang ).get('verify.failed_gblock'));
		} ).then( () => {
			var discordname = '';
			return got.get( wiki + 'wikia.php?controller=UserProfile&method=getUserData&userId=' + queryuser.userid + '&format=json&cache=' + Date.now(), {
				context: {
					guildId: channel.guildId
				}
			} ).then( ucresponse => {
				var ucbody = ucresponse.body;
				if ( ucresponse.statusCode !== 200 || !ucbody?.userData?.id ) {
					console.log( '- ' + ucresponse.statusCode + ': Error while getting the user profile.' );
					return Promise.reject();
				}
				queryuser.editcount = ucbody.userData.localEdits;
				queryuser.postcount = ucbody.userData.posts;
				if ( ucbody.userData.discordHandle?.trim() ) discordname = escapeFormatting(ucbody.userData.discordHandle).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
				
				if ( wiki.isGamepedia() || !discordname ) return got.get( ( wiki.isGamepedia() ? wiki : 'https://help.fandom.com/' ) + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now(), {
					context: {
						guildId: channel.guildId
					}
				} ).then( presponse => {
					var pbody = presponse.body;
					if ( presponse.statusCode !== 200 || !pbody || pbody.error || pbody.errormsg || !pbody.profile ) {
						if ( !wiki.isGamepedia() ) return;
						console.log( '- ' + presponse.statusCode + ': Error while getting the Discord tag: ' + ( pbody?.error?.info || pbody?.errormsg ) );
						return Promise.reject();
					}
					else if ( pbody.profile['link-discord']?.trim() ) {
						discordname = escapeFormatting(pbody.profile['link-discord']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
					}
				}, error => {
					console.log( '- Error while getting the Discord tag: ' + error );
					if ( wiki.isGamepedia() ) return Promise.reject();
				} );
			}, ucerror => {
				console.log( '- Error while getting the user profile: ' + ucerror );
				return Promise.reject();
			} ).then( () => {
				if ( discordname?.length > 100 ) discordname = discordname.substring(0, 100) + '\u2026';
				var authortag = escapeFormatting(member.user.tag);
				embed.addFields(...[
					{name: lang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), value: authortag, inline: true},
					{name: lang.get('verify.wiki', queryuser.gender), value: ( ( discordname ?? lang.get('verify.compromised') ) || lang.get('verify.empty') ), inline: true}
				]);
				logEmbed.addFields(...[
					{name: logLang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), value: authortag, inline: true},
					{name: logLang.get('verify.wiki', queryuser.gender), value: ( ( discordname ?? logLang.get('verify.compromised') ) || logLang.get('verify.empty') ), inline: true}
				]);
				if ( authortag !== discordname ) {
					embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					logEmbed.setColor('#FFFF00').setDescription( logLang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
						result.logging.channel = verifynotice.logchannel.id;
						if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							result.logging.embed = logEmbed;
						}
						else {
							let logText = '🔸 ' + logLang.get('verify.user_failed', member.toString(), escapeFormatting(username), queryuser.gender);
							logText += '\n<' + pagelink + '>';
							result.logging.content = logText;
						}
					}
					let query = new URLSearchParams([
						['c', 'wb'],
						['ch', channel.name],
						['user', member.user.username],
						['tag', member.user.discriminator],
						['useskin', 'fandomdesktop']
					]);
					var help_link = '';
					if ( wiki.isGamepedia() ) {
						query.set('user', username);
						query.set('discord', member.user.username);
						if ( channel.name === 'verification' ) query.delete('ch');
						help_link = lang.get('verify.help_gamepedia') + '?' + query.toString();
					}
					else if ( wiki.wikifarm === 'fandom' ) {
						if ( body.query.allmessages?.[0]?.['*']?.split('\n').includes( 'dev:VerifyUser.js' ) ) {
							help_link = wiki.toLink(( wiki.namespaces.has(-1) ? wiki.namespaces.get(-1).name : 'Special' ) + ':VerifyUser/' + username, query, '', true);
						}
						else {
							if ( channel.name === 'verification' ) query.delete('ch');
							help_link = lang.get('verify.help_fandom') + '/' + Wiki.toTitle(username, wiki.spaceReplacement) + '?' + query.toString();
						}
					}
					if ( help_link.length ) embed.addFields( {name: lang.get('verify.notice'), value: lang.get('verify.help_guide', help_link, queryuser.gender) + '\n' + help_link} );
					result.content = lang.get('verify.user_failed_reply', escapeFormatting(username), queryuser.gender);
					return;
				}
				
				if ( body.query.usercontribs?.length >= queryuser.editcount ) {
					queryuser.editcount = body.query.usercontribs.length;
					if ( body.continue?.uccontinue ) queryuser.editcount++;
				}
				/** @type {[Set<String>,Set<String>]} */
				var addRoles = [new Set(), new Set()];
				/** @type {[Set<String>,Set<String>]} */
				var removeRoles = [new Set(), new Set()];
				var verified = false;
				var rename = false;
				var accountage = ( Date.now() - new Date(queryuser.registration) ) / 86_400_000;
				rows.forEach( row => {
					let and_or = 'some';
					if ( row.usergroup.startsWith( 'AND|' ) ) {
						row.usergroup = row.usergroup.replace( 'AND|', '' );
						and_or = 'every';
					}
					let matchEditcount = false;
					if ( row.postcount === null ) matchEditcount = ( ( queryuser.editcount + queryuser.postcount ) >= row.editcount );
					else if ( row.postcount < 0 ) matchEditcount = ( queryuser.editcount >= row.editcount || queryuser.postcount >= Math.abs(row.postcount) );
					else matchEditcount = ( queryuser.editcount >= row.editcount && queryuser.postcount >= row.postcount );
					if ( matchEditcount && row.usergroup.split('|')[and_or]( usergroup => queryuser.groups.includes( usergroup ) ) && accountage >= row.accountage ) {
						verified = true;
						if ( row.rename ) rename = true;
						row.role.split('|').forEach( role => {
							var modifyRoles = addRoles;
							if ( role.startsWith( '-' ) ) {
								role = role.replace( '-', '' );
								modifyRoles = removeRoles;
							}
							if ( !modifyRoles[0].has(role) ) {
								if ( channel.guild.roles.cache.has(role) && channel.guild.members.me.roles.highest.comparePositionTo(role) > 0 ) modifyRoles[0].add(role);
								else if ( !modifyRoles[1].has(role) ) modifyRoles[1].add(role);
							}
						} );
					}
				} );
				if ( verified ) {
					embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + lang.get('verify.user_renamed', queryuser.gender) : '' ) );
					logEmbed.setColor('#00FF00').setDescription( logLang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + logLang.get('verify.user_renamed', queryuser.gender) : '' ) );
					var text = lang.get('verify.user_verified_reply', escapeFormatting(username), queryuser.gender);
					/** @type {Promise[]} */
					var verifyPromise = [];
					var editMember = {reason: logLang.get('verify.audit_reason', username)};
					if ( rename && member.displayName !== username.substring(0, 32) ) {
						if ( member.manageable ) editMember.nick = username.substring(0, 32);
						else comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
					}
					removeRoles[0].forEach( role => addRoles[0].delete(role) );
					removeRoles[1].forEach( role => addRoles[1].delete(role) );
					if ( !editMember.nick && addRoles[0].size + removeRoles[0].size <= 1 ) {
						if ( removeRoles[0].size === 1 ) verifyPromise.push(member.roles.remove( [...removeRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
						} ));
						else if ( addRoles[0].size === 1 ) verifyPromise.push(member.roles.add( [...addRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
						} ));
					}
					else {
						if ( addRoles[0].size + removeRoles[0].size ) editMember.roles = [...new Set([...member.roles.cache.filter( role => {
							return !removeRoles[0].has(role.id);
						} ).keys(), ...addRoles[0]])];
						verifyPromise.push(member.edit( editMember ).catch( error => {
							log_error(error);
							comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
							if ( editMember.nick ) comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
						} ));
					}
					return Promise.all(verifyPromise).then( () => {
						var addRolesMentions = [
							[...addRoles[0]].map( role => '<@&' + role + '>' ),
							[...addRoles[1]].map( role => '<@&' + role + '>' )
						];
						var removeRolesMentions = [
							[...removeRoles[0]].map( role => '<@&' + role + '>' ),
							[...removeRoles[1]].map( role => '<@&' + role + '>' )
						];
						if ( useLogging ) {
							result.logging.channel = verifynotice.logchannel.id;
							if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
								if ( addRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
								if ( addRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
								if ( removeRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
								if ( removeRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
								if ( comment.length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.notice'), value: comment.join('\n')} );
								result.logging.embed = logEmbed;
							}
							else {
								let logText = '🔸 ' + logLang.get('verify.user_verified', member.toString(), escapeFormatting(username), queryuser.gender);
								if ( rename ) logText += '\n' + logLang.get('verify.user_renamed', queryuser.gender);
								logText += '\n<' + pagelink + '>';
								if ( addRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
								if ( addRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
								if ( removeRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
								if ( removeRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
								if ( comment.length ) logText += '\n**' + logLang.get('verify.notice') + '** ' + comment.join('\n**' + logLang.get('verify.notice') + '** ');
								result.logging.content = logText;
							}
						}
						var onsuccess = ( verifynotice.onsuccess ? parseNotice(verifynotice.onsuccess, {
							editcount: queryuser.editcount,
							postcount: queryuser.postcount,
							accountage: Math.trunc(accountage),
							dateformat: lang.get('dateformat')
						}).trim() : '' );
						if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							if ( addRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
							if ( addRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
							if ( removeRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
							if ( removeRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
							if ( comment.length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.notice'), value: comment.join('\n')} );
							if ( onsuccess ) embed.addFields( {name: lang.get('verify.notice'), value: onsuccess} );
						}
						else {
							text += '\n';
							if ( addRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
							if ( addRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
							if ( removeRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
							if ( removeRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
							if ( comment.length && !useLogging ) text += '\n\n' + comment.join('\n');
							if ( onsuccess ) text += '\n\n**' + lang.get('verify.notice') + '** ' + onsuccess;
						}
						result.content = text;
						result.add_button = false;
					}, log_error );
				}
				
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				logEmbed.setColor('#FFFF00').setDescription( logLang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);

				if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
					result.logging.channel = verifynotice.logchannel.id;
					if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
						result.logging.embed = logEmbed;
					}
					else {
						let logText = '🔸 ' + logLang.get('verify.user_matches', member.toString(), escapeFormatting(username), queryuser.gender);
						logText += '\n<' + pagelink + '>';
						result.logging.content = logText;
					}
				}

				if ( !verifynotice.onmatch ) return;
				var onmatch = parseNotice(verifynotice.onmatch, {
					editcount: queryuser.editcount,
					postcount: queryuser.postcount,
					accountage: Math.trunc(accountage),
					dateformat: lang.get('dateformat')
				});
				if ( !onmatch.trim() ) return;
				if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) embed.addFields( {name: lang.get('verify.notice'), value: onmatch} );
				else result.content += '\n\n**' + lang.get('verify.notice') + '** ' + onmatch;
			}, error => {
				if ( error ) console.log( '- Error while getting the Discord tag: ' + error );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
				result.add_button = false;
			} );
		}, error => {
			embed.setColor('#FF0000').setDescription( error.desc );
			logEmbed.setColor('#FF0000').setDescription( error.logDesc );
			result.content = error.reply;
			if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
				result.logging.channel = verifynotice.logchannel.id;
				if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
					logEmbed.addFields( {name: logLang.get('verify.discord', 'unknown'), value: escapeFormatting(member.user.tag) + ` (${member.toString()})`, inline: true} );
					result.logging.embed = logEmbed;
				}
				else {
					let logText = '🔸 ' + error.logDesc + ` (${member.toString()})`;
					logText += '\n<' + pagelink + '>';
					result.logging.content = logText;
				}
			}
			result.add_button = false;
		} );
		
		return got.get( wiki + 'api.php?action=query' + ( wiki.hasCentralAuth() ? '&meta=globaluserinfo&guiprop=groups&guiuser=' + encodeURIComponent( username ) : '' ) + '&prop=revisions&rvprop=content|user&rvslots=main&titles=%1FUser:' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '/Discord%1FSpecial:MyPage/Discord&format=json', {
			context: {
				guildId: channel.guildId
			}
		} ).then( mwresponse => {
			var mwbody = mwresponse.body;
			if ( mwbody && mwbody.warnings ) log_warning(mwbody.warnings);
			if ( mwresponse.statusCode !== 200 || mwbody?.batchcomplete === undefined || !mwbody?.query?.pages ) {
				console.log( '- ' + mwresponse.statusCode + ': Error while getting the Discord tag: ' + ( mwbody && mwbody.error && mwbody.error.info ) );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
				return;
			}
			if ( wiki.hasCentralAuth() ) {
				if ( mwbody.query.globaluserinfo.locked !== undefined ) {
					embed.setColor('#FF0000').setDescription( lang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					result.content = lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender);
					logEmbed.setColor('#FF0000').setDescription( logLang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					result.content = lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender);
					if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
						result.logging.channel = verifynotice.logchannel.id;
						if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							logEmbed.addFields( {name: logLang.get('verify.discord', 'unknown'), value: escapeFormatting(member.user.tag) + ` (${member.toString()})`, inline: true} );
							result.logging.embed = logEmbed;
						}
						else {
							let logText = '🔸 ' + logLang.get('verify.user_gblocked', escapeFormatting(username), queryuser.gender) + ` (${member.toString()})`;
							logText += '\n<' + pagelink + '>';
							result.logging.content = logText;
						}
					}
					result.add_button = false;
					return;
				}
				queryuser.groups.push(...mwbody.query.globaluserinfo.groups);
			}
			var {
				'-1': {title: mypage} = {},
				'2': {revisions: [revision] = []} = {}
			} = Object.values(mwbody.query.pages).reduce( (prev, page) => {
				prev[page.ns] = page;
				return prev;
			}, {} );
			
			var discordname = '';
			if ( revision ) {
				if ( revision.user === username && ( revision?.slots?.main || revision )?.['*']?.trim() ) {
					discordname = escapeFormatting(( revision?.slots?.main || revision )['*']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
				}
				else if ( revision.user !== username ) {
					discordname = null;
				}
			}
			if ( discordname?.length > 100 ) discordname = discordname.substring(0, 100) + '\u2026';
			var authortag = escapeFormatting(member.user.tag);
			embed.addFields(...[
				{name: lang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), value: authortag, inline: true},
				{name: lang.get('verify.wiki', queryuser.gender), value: ( ( discordname ?? lang.get('verify.compromised') ) || lang.get('verify.empty') ), inline: true}
			]);
			logEmbed.addFields(...[
				{name: logLang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), value: authortag, inline: true},
				{name: logLang.get('verify.wiki', queryuser.gender), value: ( ( discordname ?? logLang.get('verify.compromised') ) || logLang.get('verify.empty') ), inline: true}
			]);
			if ( authortag !== discordname ) {
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				logEmbed.setColor('#FFFF00').setDescription( logLang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
					result.logging.channel = verifynotice.logchannel.id;
					if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
						result.logging.embed = logEmbed;
					}
					else {
						let logText = '🔸 ' + logLang.get('verify.user_failed', member.toString(), escapeFormatting(username), queryuser.gender);
						logText += '\n<' + pagelink + '>';
						result.logging.content = logText;
					}
				}
				embed.addFields( {name: lang.get('verify.notice'), value: lang.get('verify.help_subpage', '**`' + member.user.tag + '`**', queryuser.gender) + '\n' + wiki.toLink(mypage || 'Special:MyPage/Discord', 'action=edit')} );
				result.content = lang.get('verify.user_failed_reply', escapeFormatting(username), queryuser.gender);
				return;
			}
			
			/** @type {[Set<String>,Set<String>]} */
			var addRoles = [new Set(), new Set()];
			/** @type {[Set<String>,Set<String>]} */
			var removeRoles = [new Set(), new Set()];
			var verified = false;
			var rename = false;
			var accountage = ( Date.now() - new Date(queryuser.registration) ) / 86_400_000;
			rows.forEach( row => {
				var and_or = 'some';
				if ( row.usergroup.startsWith( 'AND|' ) ) {
					row.usergroup = row.usergroup.replace( 'AND|', '' );
					and_or = 'every';
				}
				if ( queryuser.editcount >= row.editcount && row.usergroup.split('|')[and_or]( usergroup => queryuser.groups.includes( usergroup ) ) && accountage >= row.accountage ) {
					verified = true;
					if ( row.rename ) rename = true;
					row.role.split('|').forEach( role => {
						var modifyRoles = addRoles;
						if ( role.startsWith( '-' ) ) {
							role = role.replace( '-', '' );
							modifyRoles = removeRoles;
						}
						if ( !modifyRoles[0].has(role) ) {
							if ( channel.guild.roles.cache.has(role) && channel.guild.members.me.roles.highest.comparePositionTo(role) > 0 ) modifyRoles[0].add(role);
							else if ( !modifyRoles[1].has(role) ) modifyRoles[1].add(role);
						}
					} );
				}
			} );
			if ( verified ) {
				embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + lang.get('verify.user_renamed', queryuser.gender) : '' ) );
				logEmbed.setColor('#00FF00').setDescription( logLang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + logLang.get('verify.user_renamed', queryuser.gender) : '' ) );
				var text = lang.get('verify.user_verified_reply', escapeFormatting(username), queryuser.gender);
				/** @type {Promise[]} */
				var verifyPromise = [];
				var editMember = {reason: logLang.get('verify.audit_reason', username)};
				if ( rename && member.displayName !== username.substring(0, 32) ) {
					if ( member.manageable ) editMember.nick = username.substring(0, 32);
					else comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
				}
				removeRoles[0].forEach( role => addRoles[0].delete(role) );
				removeRoles[1].forEach( role => addRoles[1].delete(role) );
				if ( !editMember.nick && addRoles[0].size + removeRoles[0].size <= 1 ) {
					if ( removeRoles[0].size === 1 ) verifyPromise.push(member.roles.remove( [...removeRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
					} ));
					else if ( addRoles[0].size === 1 ) verifyPromise.push(member.roles.add( [...addRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
					} ));
				}
				else {
					if ( addRoles[0].size + removeRoles[0].size ) editMember.roles = [...new Set([...member.roles.cache.filter( role => {
						return !removeRoles[0].has(role.id);
					} ).keys(), ...addRoles[0]])];
					verifyPromise.push(member.edit( editMember ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
						if ( editMember.nick ) comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
					} ));
				}
				return Promise.all(verifyPromise).then( () => {
					var addRolesMentions = [
						[...addRoles[0]].map( role => '<@&' + role + '>' ),
						[...addRoles[1]].map( role => '<@&' + role + '>' )
					];
					var removeRolesMentions = [
						[...removeRoles[0]].map( role => '<@&' + role + '>' ),
						[...removeRoles[1]].map( role => '<@&' + role + '>' )
					];
					if ( useLogging ) {
						result.logging.channel = verifynotice.logchannel.id;
						if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							if ( addRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
							if ( addRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
							if ( removeRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
							if ( removeRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
							if ( comment.length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.notice'), value: comment.join('\n')} );
							result.logging.embed = logEmbed;
						}
						else {
							let logText = '🔸 ' + logLang.get('verify.user_verified', member.toString(), escapeFormatting(username), queryuser.gender);
							if ( rename ) logText += '\n' + logLang.get('verify.user_renamed', queryuser.gender);
							logText += '\n<' + pagelink + '>';
							if ( addRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
							if ( addRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
							if ( removeRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
							if ( removeRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
							if ( comment.length ) logText += '\n**' + logLang.get('verify.notice') + '** ' + comment.join('\n**' + logLang.get('verify.notice') + '** ');
							result.logging.content = logText;
						}
					}
					var onsuccess = ( verifynotice.onsuccess ? parseNotice(verifynotice.onsuccess, {
						editcount: queryuser.editcount,
						accountage: Math.trunc(accountage),
						dateformat: lang.get('dateformat')
					}).trim() : '' );
					if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
						if ( addRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
						if ( addRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
						if ( removeRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
						if ( removeRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
						if ( comment.length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.notice'), value: comment.join('\n')} );
						if ( onsuccess ) embed.addFields( {name: lang.get('verify.notice'), value: onsuccess} );
					}
					else {
						text += '\n';
						if ( addRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
						if ( addRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
						if ( removeRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
						if ( removeRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
						if ( comment.length && !useLogging ) text += '\n\n' + comment.join('\n');
						if ( onsuccess ) text += '\n\n**' + lang.get('verify.notice') + '** ' + onsuccess;
					}
					result.content = text;
					result.add_button = false;
				}, log_error );
			}
			
			embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
			logEmbed.setColor('#FFFF00').setDescription( logLang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
			result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);

			if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
				result.logging.channel = verifynotice.logchannel.id;
				if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
					result.logging.embed = logEmbed;
				}
				else {
					let logText = '🔸 ' + logLang.get('verify.user_matches', member.toString(), escapeFormatting(username), queryuser.gender);
					logText += '\n<' + pagelink + '>';
					result.logging.content = logText;
				}
			}
			
			if ( !verifynotice.onmatch ) return;
			var onmatch = parseNotice(verifynotice.onmatch, {
				editcount: queryuser.editcount,
				accountage: Math.trunc(accountage),
				dateformat: lang.get('dateformat')
			});
			if ( !onmatch.trim() ) return;
			if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) embed.addFields( {name: lang.get('verify.notice'), value: onmatch} );
			else result.content += '\n\n**' + lang.get('verify.notice') + '** ' + onmatch;
		}, error => {
			console.log( '- Error while getting the Discord tag: ' + error );
			embed.setColor('#000000').setDescription( lang.get('verify.error') );
			result.content = lang.get('verify.error_reply');
			result.add_button = false;
		} );
	}, error => {
		console.log( '- Error while getting the user: ' + error );
		embed.setColor('#000000').setDescription( lang.get('verify.error') );
		result.content = lang.get('verify.error_reply');
		result.add_button = false;
	} ).then( new_username => {
		if ( !new_username ) return result;
		return verify(lang, logLang, channel, member, new_username, wiki, rows, username);
	} );
}

/**
 * Oauth wiki user verification.
 * @param {String} state - Unique state for the authorization.
 * @param {String} access_token - Access token.
 * @param {Object} [settings] - Settings to skip oauth.
 * @param {import('discord.js').TextChannel} settings.channel - The channel.
 * @param {String} settings.user - The user id.
 * @param {String} settings.wiki - The OAuth2 wiki.
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ButtonInteraction|import('discord.js').ModalSubmitInteraction} [settings.interaction] - The interaction.
 * @param {Function} [settings.fail] - The function to call when the verifiction errors.
 * @param {import('discord.js').Message} [settings.sourceMessage] - The source message with the command.
 * @global
 */
globalThis.verifyOauthUser = function(state, access_token, settings) {
	if ( state && access_token && oauthVerify.has(state) ) {
		settings = oauthVerify.get(state);
		oauthVerify.delete(state);
	}
	if ( !settings?.channel ) return settings?.fail?.();
	var channel = settings.channel;
	if ( !channel.permissionsFor(channel.guild.members.me).has([PermissionFlagsBits.ViewChannel, ( channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages )]) ) return settings.fail?.();
	Promise.all([
		db.query( 'SELECT logchannel, flags, onsuccess, onmatch, role, editcount, postcount, usergroup, accountage, rename FROM verification LEFT JOIN verifynotice ON verification.guild = verifynotice.guild WHERE verification.guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [channel.guildId, '%|' + ( channel.isThread() ? channel.parentId : channel.id ) + '|%'] ).then( ({rows}) => {
			if ( !rows.length ) return Promise.reject();
			let sqlargs = [channel.guildId];
			if ( channel.isThread() ) sqlargs.push(channel.parentId, '#' + channel.parent?.parentId);
			else sqlargs.push(channel.id, '#' + channel.parentId);
			return db.query( 'SELECT wiki, lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows: [row]}) => {
				return {
					rows, wiki: new Wiki(row?.wiki),
					lang: new Lang(( row?.lang || channel?.guild?.preferredLocale ))
				};
			} );
		} ),
		channel.guild.members.fetch(settings.user),
		got.get( settings.wiki + 'rest.php/oauth2/resource/profile', {
			headers: {
				Authorization: `Bearer ${access_token}`
			},
			context: {
				guildId: channel.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body?.username ) {
				console.log( '- ' + response.statusCode + ': Error while getting the mediawiki profile: ' + ( body?.message || body?.error ) );
				return;
			}
			console.log( channel.guildId + ': OAuth2: ' + body.username );
			return body.username;
		}, error => {
			console.log( '- Error while getting the mediawiki profile: ' + error );
		} )
	]).then( ([{rows, wiki, lang}, member, username]) => {
		if ( !username || settings.wiki !== wiki.href ) return settings.fail?.();
		/** @type {{logchannel:import('discord.js').TextChannel,flags:Number,onsuccess:String,onmatch:String}} */
		var verifynotice = ( rows[0] || {} );
		verifynotice.logchannel = ( verifynotice.logchannel ? channel.guild.channels.cache.filter( logchannel => {
			return ( logchannel.isTextBased() && logchannel.permissionsFor(channel.guild.members.me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) );
		} ).get(verifynotice.logchannel) : null );
		var useLogging = ( verifynotice.logchannel ? true : false );
		var logLang = lang;
		if ( !state && (verifynotice.flags & 1 << 0) === 1 << 0 ) lang = lang.uselang(settings?.interaction?.locale);
		got.get( wiki + 'api.php?action=query&meta=siteinfo|globaluserinfo&siprop=general&guiprop=groups&guiuser=' + encodeURIComponent( username ) + '&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=%1F' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
			context: {
				guildId: channel.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warning(body.warnings);
			if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.users?.[0] ) {
				if ( wiki.noWiki(response.url, response.statusCode) ) {
					console.log( '- This wiki doesn\'t exist!' );
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the user: ' + body?.error?.info );
				}
				return settings.fail?.();
			}
			wiki.updateWiki(body.query.general);
			logging(wiki, channel.guildId, 'verification');
			var queryuser = body.query.users[0];
			if ( body.query.users.length !== 1 || queryuser.missing !== undefined || queryuser.invalid !== undefined ) return settings.fail?.();
			var pagelink = wiki.toLink(( wiki.namespaces.has(2) ? wiki.namespaces.get(2).name : 'User' ) + ':' + username, '', '', true);
			var embed = new EmbedBuilder().setFooter( {text: lang.get('verify.title')} ).setTimestamp().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(username) ).setURL( pagelink ).addFields(...[
				{name: lang.get('verify.discord', queryuser.gender), value: escapeFormatting(member.user.tag), inline: true},
				{name: lang.get('verify.wiki', queryuser.gender), value: lang.get('verify.oauth_used'), inline: true}
			]);
			var logEmbed = new EmbedBuilder().setFooter( {text: logLang.get('verify.title')} ).setTimestamp().setAuthor( {name: body.query.general.sitename} ).setTitle( escapeFormatting(username) ).setURL( pagelink ).addFields(...[
				{name: logLang.get('verify.discord', queryuser.gender), value: escapeFormatting(member.user.tag), inline: true},
				{name: logLang.get('verify.wiki', queryuser.gender), value: logLang.get('verify.oauth_used'), inline: true}
			]);
			if ( queryuser.blockexpiry ) {
				embed.setColor('#FF0000').setDescription( lang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				logEmbed.setColor('#FF0000').setDescription( logLang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
				return sendMessage( {content: lang.get('verify.user_blocked_reply', escapeFormatting(username), queryuser.gender), embeds: [embed]} ).then( msg => {
					if ( !useLogging || (verifynotice.flags & 1 << 1) !== 1 << 1 ) return;
					let logMessage = {
						embeds: []
					};
					if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
						logEmbed.addFields( {name: logLang.get('verify.discord', 'unknown'), value: escapeFormatting(member.user.tag) + ` (${member.toString()})`, inline: true} );
						if ( msg ) logEmbed.addFields( {name: msg.url, value: '<#' + channel.id + '>'} );
						logMessage.embeds.push(logEmbed);
					}
					else {
						let logText = '🔸 ' + logLang.get('verify.user_blocked', escapeFormatting(username), queryuser.gender) + ` (${member.toString()})`;
						logText += '\n<' + pagelink + '>';
						if ( msg ) logText += '\n<#' + channel.id + '> – <' + msg.url + '>';
						logMessage.content = logText;
					}
					verifynotice.logchannel.send( logMessage ).catch(log_error);
				}, log_error );
			}
			if ( wiki.hasCentralAuth() ) {
				if ( body.query.globaluserinfo.locked !== undefined ) {
					embed.setColor('#FF0000').setDescription( lang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					logEmbed.setColor('#FF0000').setDescription( logLang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
					return sendMessage( {content: lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender), embeds: [embed]} ).then( msg => {
						if ( !useLogging || (verifynotice.flags & 1 << 1) !== 1 << 1 ) return;
						let logMessage = {
							embeds: []
						};
						if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							logEmbed.addFields( {name: logLang.get('verify.discord', 'unknown'), value: escapeFormatting(member.user.tag) + ` (${member.toString()})`, inline: true} );
							if ( msg ) logEmbed.addFields( {name: msg.url, value: '<#' + channel.id + '>'} );
							logMessage.embeds.push(logEmbed);
						}
						else {
							let logText = '🔸 ' + logLang.get('verify.user_gblocked', escapeFormatting(username), queryuser.gender) + ` (${member.toString()})`;
							logText += '\n<' + pagelink + '>';
							if ( msg ) logText += '\n<#' + channel.id + '> – <' + msg.url + '>';
							logMessage.content = logText;
						}
						verifynotice.logchannel.send( logMessage ).catch(log_error);
					}, log_error );
				}
				queryuser.groups.push(...body.query.globaluserinfo.groups);
			}

			/** @type {[Set<String>,Set<String>]} */
			var addRoles = [new Set(), new Set()];
			/** @type {[Set<String>,Set<String>]} */
			var removeRoles = [new Set(), new Set()];
			var verified = false;
			var rename = false;
			var accountage = ( Date.now() - new Date(queryuser.registration) ) / 86_400_000;
			rows.forEach( row => {
				var and_or = 'some';
				if ( row.usergroup.startsWith( 'AND|' ) ) {
					row.usergroup = row.usergroup.replace( 'AND|', '' );
					and_or = 'every';
				}
				if ( queryuser.editcount >= row.editcount && row.usergroup.split('|')[and_or]( usergroup => queryuser.groups.includes( usergroup ) ) && accountage >= row.accountage ) {
					verified = true;
					if ( row.rename ) rename = true;
					row.role.split('|').forEach( role => {
						var modifyRoles = addRoles;
						if ( role.startsWith( '-' ) ) {
							role = role.replace( '-', '' );
							modifyRoles = removeRoles;
						}
						if ( !modifyRoles[0].has(role) ) {
							if ( channel.guild.roles.cache.has(role) && channel.guild.members.me.roles.highest.comparePositionTo(role) > 0 ) modifyRoles[0].add(role);
							else if ( !modifyRoles[1].has(role) ) modifyRoles[1].add(role);
						}
					} );
				}
			} );
			if ( verified ) {
				embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + lang.get('verify.user_renamed', queryuser.gender) : '' ) );
				logEmbed.setColor('#00FF00').setDescription( logLang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) + ( rename ? '\n' + logLang.get('verify.user_renamed', queryuser.gender) : '' ) );
				var text = lang.get('verify.user_verified_reply', escapeFormatting(username), queryuser.gender);
				var comment = [];
				/** @type {Promise[]} */
				var verifyPromise = [];
				var editMember = {reason: logLang.get('verify.audit_reason', username)};
				if ( rename && member.displayName !== username.substring(0, 32) ) {
					if ( member.manageable ) editMember.nick = username.substring(0, 32);
					else comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
				}
				removeRoles[0].forEach( role => addRoles[0].delete(role) );
				removeRoles[1].forEach( role => addRoles[1].delete(role) );
				if ( !editMember.nick && addRoles[0].size + removeRoles[0].size <= 1 ) {
					if ( removeRoles[0].size === 1 ) verifyPromise.push(member.roles.remove( [...removeRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
					} ));
					else if ( addRoles[0].size === 1 ) verifyPromise.push(member.roles.add( [...addRoles[0]][0], logLang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
					} ));
				}
				else {
					if ( addRoles[0].size + removeRoles[0].size ) editMember.roles = [...new Set([...member.roles.cache.filter( role => {
						return !removeRoles[0].has(role.id);
					} ).keys(), ...addRoles[0]])];
					verifyPromise.push(member.edit( editMember ).catch( error => {
						log_error(error);
						comment.push(( useLogging ? logLang : lang ).get('verify.failed_roles'));
						if ( editMember.nick ) comment.push(( useLogging ? logLang : lang ).get('verify.failed_rename', queryuser.gender));
					} ));
				}
				return Promise.all(verifyPromise).then( () => {
					var addRolesMentions = [
						[...addRoles[0]].map( role => '<@&' + role + '>' ),
						[...addRoles[1]].map( role => '<@&' + role + '>' )
					];
					var removeRolesMentions = [
						[...removeRoles[0]].map( role => '<@&' + role + '>' ),
						[...removeRoles[1]].map( role => '<@&' + role + '>' )
					];
					var logMessage = {
						embeds: []
					};
					if ( useLogging ) {
						if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
							if ( addRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
							if ( addRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
							if ( removeRolesMentions[0].length ) logEmbed.addFields( {name: logLang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
							if ( removeRolesMentions[1].length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
							if ( comment.length ) logEmbed.setColor('#008800').addFields( {name: logLang.get('verify.notice'), value: comment.join('\n')} );
							logMessage.embeds.push(logEmbed);
						}
						else {
							let logText = '🔸 ' + logLang.get('verify.user_verified', member.toString(), escapeFormatting(username), queryuser.gender);
							if ( rename ) logText += '\n' + logLang.get('verify.user_renamed', queryuser.gender);
							logText += '\n<' + pagelink + '>';
							if ( addRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
							if ( addRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
							if ( removeRolesMentions[0].length ) logText += '\n**' + logLang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
							if ( removeRolesMentions[1].length ) logText += '\n**' + logLang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
							if ( comment.length ) logText += '\n**' + logLang.get('verify.notice') + '** ' + comment.join('\n**' + logLang.get('verify.notice') + '** ');
							logMessage.content = logText;
						}
					}
					var onsuccess = ( verifynotice.onsuccess ? parseNotice(verifynotice.onsuccess, {
						editcount: queryuser.editcount,
						postcount: queryuser.postcount,
						accountage: Math.trunc(accountage),
						dateformat: lang.get('dateformat')
					}).trim() : '' );
					if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
						if ( addRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_add'), value: addRolesMentions[0].join('\n')} );
						if ( addRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_add_error'), value: addRolesMentions[1].join('\n')} );
						if ( removeRolesMentions[0].length ) embed.addFields( {name: lang.get('verify.qualified_remove'), value: removeRolesMentions[0].join('\n')} );
						if ( removeRolesMentions[1].length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.qualified_remove_error'), value: removeRolesMentions[1].join('\n')} );
						if ( comment.length && !useLogging ) embed.setColor('#008800').addFields( {name: lang.get('verify.notice'), value: comment.join('\n')} );
						if ( onsuccess ) embed.addFields( {name: lang.get('verify.notice'), value: onsuccess} );
					}
					else {
						text += '\n';
						if ( addRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_add') + '** ' + addRolesMentions[0].join(', ');
						if ( addRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_add_error') + '** ' + addRolesMentions[1].join(', ');
						if ( removeRolesMentions[0].length ) text += '\n**' + lang.get('verify.qualified_remove') + '** ' + removeRolesMentions[0].join(', ');
						if ( removeRolesMentions[1].length && !useLogging ) text += '\n**' + lang.get('verify.qualified_remove_error') + '** ' + removeRolesMentions[1].join(', ');
						if ( comment.length && !useLogging ) text += '\n\n' + comment.join('\n');
						if ( onsuccess ) text += '\n\n**' + lang.get('verify.notice') + '** ' + onsuccess;
					}
					return sendMessage( {content: text, embeds: [embed]} ).then( msg => {
						if ( !useLogging ) return;
						if ( msg ) {
							if ( logMessage.content ) logMessage.content += '\n<#' + channel.id + '> – <' + msg.url + '>';
							else logEmbed.addFields( {name: msg.url, value: '<#' + channel.id + '>'} );
						}
						verifynotice.logchannel.send( logMessage ).catch(log_error);
					}, log_error );
				}, log_error );
			}
			
			embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );
			logEmbed.setColor('#FFFF00').setDescription( logLang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](<' + pagelink + '>)', queryuser.gender) );

			let logMessage = {
				embeds: []
			};
			if ( useLogging && (verifynotice.flags & 1 << 1) === 1 << 1 ) {
				if ( verifynotice.logchannel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) {
					logMessage.embeds.push(logEmbed);
				}
				else {
					let logText = '🔸 ' + logLang.get('verify.user_matches', member.toString(), escapeFormatting(username), queryuser.gender);
					logText += '\n<' + pagelink + '>';
					logMessage.content = logText;
				}
			}
			
			var noticeContent = '';
			if ( verifynotice.onmatch ) {
				let onmatch = parseNotice(verifynotice.onmatch, {
					editcount: queryuser.editcount,
					accountage: Math.trunc(accountage),
					dateformat: lang.get('dateformat')
				});
				if ( onmatch.trim() ) {
					if ( channel.permissionsFor(channel.guild.members.me).has(PermissionFlagsBits.EmbedLinks) ) embed.addFields( {name: lang.get('verify.notice'), value: onmatch} );
					else noticeContent = '\n\n**' + lang.get('verify.notice') + '** ' + onmatch;
				}
			}
			return sendMessage( {
				content: lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender) + noticeContent,
				embeds: [embed], components: [new ActionRowBuilder().addComponents(
					new ButtonBuilder().setLabel(lang.get('verify.button_again')).setEmoji(WB_EMOJI.again).setStyle(ButtonStyle.Primary).setCustomId('verify_again')
				)]
			} ).then( msg => {
				if ( !useLogging || (verifynotice.flags & 1 << 1) !== 1 << 1 ) return;
				if ( msg ) {
					if ( logMessage.content ) logMessage.content += '\n<#' + channel.id + '> – <' + msg.url + '>';
					else logEmbed.addFields( {name: msg.url, value: '<#' + channel.id + '>'} );
				}
				verifynotice.logchannel.send( logMessage ).catch(log_error);
			}, log_error );

			/**
			 * Send the message responding to the OAuth2 verification.
			 * @param {import('discord.js').MessageOptions} options - The message options.
			 */
			function sendMessage(options) {
				var message = {
					content: member.toString() + ', ' + options.content,
					embeds: ( options.embeds?.[0] ? options.embeds : [] ),
					components: ( options.components || [] ),
					allowedMentions: {
						users: [member.id],
						repliedUser: true
					},
					ephemeral: ( (verifynotice.flags & 1 << 0) === 1 << 0 )
				}
				if ( settings.interaction ) return settings.interaction.editReply( message ).then( msg => {
					if ( settings.interaction.isButton() && settings.interaction.customId === 'verify_again' ) settings.interaction.followUp( {
						content: message.content,
						embeds: message.embeds,
						components: [],
						ephemeral: true
					} ).catch(log_error);
					if ( message.ephemeral ) return;
					return msg;
				}, error => {
					log_error(error);
					if ( message.ephemeral ) {
						let dmEmbeds = [];
						if ( message.embeds[0] ) {
							dmEmbeds.push(EmbedBuilder.from(message.embeds[0]));
							dmEmbeds[0].data.fields?.forEach( field => {
								field.value = field.value.replace( /<@&(\d+)>/g, (mention, id) => {
									if ( !channel.guild.roles.cache.has(id) ) return mention;
									return escapeFormatting('@' + channel.guild.roles.cache.get(id)?.name);
								} );
							} );
						}
						return member.send( {content: channel.toString() + '; ' + options.content, embeds: dmEmbeds} ).then( msg => {
							allowDelete(msg, member.id);
							if ( settings.sourceMessage ) {
								settings.sourceMessage.reactEmoji(WB_EMOJI.message);
								setTimeout( () => settings.sourceMessage.delete().catch(log_error), 60_000 ).unref();
							}
						}, error => {
							if ( error?.code === 50007 ) { // CANNOT_MESSAGE_USER
								return channel.send( message ).catch(log_error);
							}
							log_error(error);
						} );
					}
					return channel.send( message ).catch(log_error);
				} );
				if ( message.ephemeral ) {
					let dmEmbeds = [];
					if ( message.embeds[0] ) {
						dmEmbeds.push(EmbedBuilder.from(message.embeds[0]));
						dmEmbeds[0].data.fields?.forEach( field => {
							field.value = field.value.replace( /<@&(\d+)>/g, (mention, id) => {
								if ( !channel.guild.roles.cache.has(id) ) return mention;
								return escapeFormatting('@' + channel.guild.roles.cache.get(id)?.name);
							} );
						} );
					}
					return member.send( {content: channel.toString() + '; ' + options.content, embeds: dmEmbeds} ).then( msg => {
						allowDelete(msg, member.id);
						if ( settings.sourceMessage ) {
							settings.sourceMessage.reactEmoji(WB_EMOJI.message);
							setTimeout( () => settings.sourceMessage.delete().catch(log_error), 60_000 ).unref();
						}
					}, error => {
						if ( error?.code === 50007 ) { // CANNOT_MESSAGE_USER
							return channel.send( message ).catch(log_error);
						}
						log_error(error);
					} );
				}
				return channel.send( message ).catch(log_error);
			}
		}, error => {
			console.log( '- Error while getting the user: ' + error );
			settings.fail?.();
		} );
	}, error => {
		if ( error ) console.log( '- Error while preparing oauth verification: ' + error );
		settings.fail?.();
	} );
}

/**
 * Parse variables in a verification notice.
 * @param {String} [text] The notice to parse.
 * @param {Object} [variables] The variables to replace.
 * @param {Number} [variables.editcount]
 * @param {Number} [variables.postcount]
 * @param {Number} [variables.accountage]
 * @param {String} [variables.dateformat]
 * @returns {String}
 */
function parseNotice(text = '', variables = {editcount: 0, postcount: 0, accountage: 0, dateformat: 'en-US'}) {
	if ( !text.includes( '$' ) ) return ( text.length > 1000 ? text.substring(0, 1000) + '\u2026' : text );
	text = text.replace( /\$(editcount|postcount|accountage)/g, (variable, key, offset, fulltext) => {
		var value = ( variables[key] ?? 0 );
		if ( typeof value === 'string' ) return value;
		if ( /#(?:if)?expr:[^{|}]*$/.test(fulltext.substring(0, offset)) ) return ( value > 1_000_000_000 ? 1_000_000_000 : value );
		return value.toLocaleString(variables.dateformat);
	} );
	if ( text.includes( '#expr:' ) ) text = text.replace( /{{\s*#expr:\s*(-?\d{1,10})\s*([+-])\s*(-?\d{1,10})(?:\s*([+-])\s*(-?\d{1,10}))?(?:\s*([+-])\s*(-?\d{1,10}))?(?:\s*([+-])\s*(-?\d{1,10}))?\s*}}/g, (expr, n0, o1, n1, o2, n2, o3, n3, o4, n4, offset, fulltext) => {
		var isLocale = !/#ifexpr:[^{|}]*$/.test(fulltext.substring(0, offset));
		var result = +n0;
		if ( o1 === '+' ) result += +n1;
		else result -= +n1;
		if ( !o2 ) return ( isLocale ? result.toLocaleString(variables.dateformat) : result );
		if ( o2 === '+' ) result += +n2;
		else result -= +n2;
		if ( !o3 ) return ( isLocale ? result.toLocaleString(variables.dateformat) : result );
		if ( o3 === '+' ) result += +n3;
		else result -= +n3;
		if ( !o4 ) return ( isLocale ? result.toLocaleString(variables.dateformat) : result );
		if ( o4 === '+' ) result += +n4;
		else result -= +n4;
		return ( isLocale ? result.toLocaleString(variables.dateformat) : result );
	} );
	if ( text.includes( '#ifexpr:' ) ) text = text.replace( /{{\s*#ifexpr:\s*(-?\d{1,10})\s*([=<>]|!=|<>|<=|>=)\s*(-?\d{1,10})(?:\s*(and|or)\s*(-?\d{1,10})\s*([=<>]|!=|<>|<=|>=)\s*(-?\d{1,10}))?(?:\s*(and|or)\s*(-?\d{1,10})\s*([=<>]|!=|<>|<=|>=)\s*(-?\d{1,10}))?\s*\|\s*([^{|}]*)\s*(?:\|\s*([^{|}]*)\s*)?}}/g, (expr, n0, o0, a0, l1, n1, o1, a1, l2, n2, o2, a2, iftrue, iffalse = '') => {
		var result = ifexpr([+n0, +a0], o0);
		if ( result && l1 !== 'and' ) return iftrue.trim();
		if ( l1 ) result = ifexpr([+n1, +a1], o1);
		else return iffalse.trim();
		if ( result && l2 !== 'and' ) return iftrue.trim();
		if ( l2 ) result = ifexpr([+n2, +a2], o2);
		else return iffalse.trim();
		if ( result ) return iftrue.trim();
		else return iffalse.trim();
	} );
	return ( text.length > 1000 ? text.substring(0, 1000) + '\u2026' : text );
}

/**
 * Compare to numbers based on an operator.
 * @param {Number[]} number The numbers to compare.
 * @param {String} operator The comparation operator.
 * @returns {Boolean}
 */
function ifexpr(number, operator) {
	var result = false;
	switch ( operator ) {
		case '<':
			result = ( number[0] < number[1] );
			break;
		case '>':
			result = ( number[0] > number[1] );
			break;
		case '=':
			result = ( number[0] === number[1] );
			break;
		case '<=':
			result = ( number[0] <= number[1] );
			break;
		case '>=':
			result = ( number[0] >= number[1] );
			break;
		case '!=':
		case '<>':
			result = ( number[0] !== number[1] );
			break;
	}
	return result;
}
const cheerio = require('cheerio');
const {MessageEmbed} = require('discord.js');
const logging = require('../util/logging.js');
const {escapeFormatting} = require('../util/functions.js');
const toTitle = require('../util/wiki.js').toTitle;

/**
 * Processes the "verify" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').TextChannel} channel - The Discord channel.
 * @param {import('discord.js').GuildMember} member - The Discord guild member.
 * @param {String} username - The username.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 * @param {Object[]} rows - The verification settings.
 * @param {String} [old_username] - The username before the search.
 * @returns {Promise<{content:String,embed:MessageEmbed,reaction:String}>}
 */
function verify(lang, channel, member, username, wiki, rows, old_username = '') {
	var embed = new MessageEmbed().setFooter( lang.get('verify.footer') ).setTimestamp();
	var result = {
		content: '', embed,
		reaction: ''
	};
	return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.users ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				result.reaction = 'nowiki';
			}
			else if ( body?.error?.code === 'us400' ) { // special catch for Fandom
				if ( !old_username ) logging(wiki, channel.guild.id, 'verification');
				embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) );
				result.content = lang.get('verify.user_missing_reply', escapeFormatting( old_username || username ));
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the user: ' + ( body && body.error && body.error.info ) );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
			}
			return;
		}
		wiki.updateWiki(body.query.general);
		if ( !old_username ) logging(wiki, channel.guild.id, 'verification');
		var queryuser = body.query.users[0];
		embed.setAuthor( body.query.general.sitename );
		if ( body.query.users.length !== 1 || queryuser.missing !== undefined || queryuser.invalid !== undefined ) {
			username = ( body.query.users.length === 1 ? queryuser.name : username );
			embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) );
			if ( wiki.isFandom() && !old_username ) return got.get( wiki + 'api/v1/User/UsersByName?limit=1&query=' + encodeURIComponent( username ) + '&format=json' ).then( wsresponse => {
				var wsbody = wsresponse.body;
				if ( wsresponse.statusCode !== 200 || wsbody?.exception || wsbody?.users?.[0]?.name?.length !== username.length ) {
					if ( !wsbody?.users ) console.log( '- ' + wsresponse.statusCode + ': Error while searching the user: ' + wsbody?.exception?.details );
					result.content = lang.get('verify.user_missing_reply', escapeFormatting(username));
					return;
				}
				return verify(lang, channel, member, wsbody.users[0].name, wiki, rows, username);
			}, error => {
				console.log( '- Error while searching the user: ' + error );
				result.content = lang.get('verify.user_missing_reply', escapeFormatting(username));
			} );
			result.content = lang.get('verify.user_missing_reply', escapeFormatting( old_username || username ));
			return;
		}
		username = queryuser.name;
		var pagelink = wiki.toLink('User:' + username, '', '', true);
		embed.setTitle( escapeFormatting(username) ).setURL( pagelink );
		if ( queryuser.blockexpiry ) {
			embed.setColor('#FF0000').setDescription( lang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
			result.content = lang.get('verify.user_blocked_reply', escapeFormatting(username), queryuser.gender);
			return;
		}
		
		var comment = [];
		if ( wiki.isFandom() ) return got.get( 'https://community.fandom.com/wiki/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1&cache=' + Date.now(), {
			responseType: 'text'
		} ).then( gbresponse => {
			if ( gbresponse.statusCode !== 200 || !gbresponse.body ) {
				console.log( '- ' + gbresponse.statusCode + ': Error while getting the global block.' );
				comment.push(lang.get('verify.failed_gblock'));
			}
			else {
				let $ = cheerio.load(gbresponse.body);
				if ( $('#mw-content-text .errorbox').length ) {
					return Promise.reject({
						desc: lang.get('verify.user_disabled', '[' + escapeFormatting(username) + '](' + pagelink + ')'),
						reply: lang.get('verify.user_disabled_reply', escapeFormatting(username))
					});
				}
				else if ( $('#mw-content-text .userprofile.mw-warning-with-logexcerpt').length ) {
					return Promise.reject({
						desc: lang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender),
						reply: lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender)
					});
				}
			}
		}, error => {
			console.log( '- Error while getting the global block: ' + error );
			comment.push(lang.get('verify.failed_gblock'));
		} ).then( () => {
			var discordname = '';
			return got.get( wiki + 'wikia.php?controller=UserProfile&method=getUserData&userId=' + queryuser.userid + '&format=json&cache=' + Date.now() ).then( ucresponse => {
				var ucbody = ucresponse.body;
				if ( ucresponse.statusCode !== 200 || !ucbody?.userData?.id ) {
					console.log( '- ' + ucresponse.statusCode + ': Error while getting the user profile.' );
					return Promise.reject();
				}
				queryuser.editcount = ucbody.userData.localEdits;
				queryuser.postcount = ucbody.userData.posts;
				if ( ucbody.userData.discordHandle ) discordname = escapeFormatting(ucbody.userData.discordHandle).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
				
				if ( wiki.isGamepedia() ) return got.get( wiki + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now() ).then( presponse => {
					var pbody = presponse.body;
					if ( presponse.statusCode !== 200 || !pbody || pbody.error || pbody.errormsg || !pbody.profile ) {
						console.log( '- ' + presponse.statusCode + ': Error while getting the Discord tag: ' + ( pbody?.error?.info || pbody?.errormsg ) );
						return Promise.reject();
					}
					if ( pbody.profile['link-discord'] ) discordname = escapeFormatting(pbody.profile['link-discord']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
				}, error => {
					console.log( '- Error while getting the Discord tag: ' + error );
					return Promise.reject();
				} );
			}, ucerror => {
				console.log( '- Error while getting the user profile: ' + ucerror );
				return Promise.reject();
			} ).then( () => {
				if ( discordname.length > 100 ) discordname = discordname.substring(0, 100) + '\u2026';
				var authortag = escapeFormatting(member.user.tag);
				embed.addField( lang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), authortag, true ).addField( lang.get('verify.wiki', queryuser.gender), ( discordname || lang.get('verify.empty') ), true );
				if ( authortag !== discordname ) {
					embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
					var help_link = '';
					if ( wiki.isGamepedia() ) help_link = lang.get('verify.help_gamepedia') + '?c=' + ( patreons[channel.guild.id] && patreons[channel.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[channel.guild.id] + ' verify' ) : 'wb' ) + ( channel.name !== 'verification' ? '&ch=' + encodeURIComponent( channel.name ) : '' ) + '&user=' + toTitle(username) + '&discord=' + encodeURIComponent( member.user.username ) + '&tag=' + member.user.discriminator;
					else if ( wiki.isFandom() ) help_link = lang.get('verify.help_fandom') + '/' + toTitle(username) + '?c=' + ( patreons[channel.guild.id] && patreons[channel.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[channel.guild.id] + ' verify' ) : 'wb' ) + ( channel.name !== 'verification' ? '&ch=' + encodeURIComponent( channel.name ) : '' ) + '&user=' + encodeURIComponent( member.user.username ) + '&tag=' + member.user.discriminator + '&useskin=oasis';
					if ( help_link.length ) embed.addField( lang.get('verify.notice'), lang.get('verify.help_guide', help_link, queryuser.gender) + '\n' + help_link );
					result.content = lang.get('verify.user_failed_reply', escapeFormatting(username), queryuser.gender);
					return;
				}
				
				var roles = [];
				var missing = [];
				var verified = false;
				var rename = false;
				var accountage = ( Date.now() - new Date(queryuser.registration) ) / 86400000;
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
					if ( matchEditcount && row.usergroup.split('|')[and_or]( usergroup => queryuser.groups.includes( usergroup ) ) && accountage >= row.accountage && row.role.split('|').some( role => !roles.includes( role ) ) ) {
						verified = true;
						if ( row.rename ) rename = true;
						row.role.split('|').forEach( role => {
							if ( !roles.includes( role ) ) {
								if ( channel.guild.roles.cache.has(role) && channel.guild.me.roles.highest.comparePositionTo(role) > 0 ) roles.push(role);
								else if ( !missing.includes( role ) ) missing.push(role);
							}
						} );
					}
				} );
				if ( verified ) {
					embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) + ( rename ? '\n' + lang.get('verify.user_renamed', queryuser.gender) : '' ) );
					var text = lang.get('verify.user_verified_reply', escapeFormatting(username), queryuser.gender);
					var verify_promise = [
						member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_roles'));
						} )
					];
					if ( rename ) {
						verify_promise.push(member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_rename', queryuser.gender));
						} ));
					}
					return Promise.all(verify_promise).finally( () => {
						if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
							if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
							if ( missing.length ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
							if ( comment.length ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
						}
						else {
							if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
							if ( missing.length ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
							if ( comment.length ) text += '\n\n' + comment.join('\n');
						}
						result.content = text;
					} );
				}
				
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
				result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);
			}, error => {
				if ( error ) console.log( '- Error while getting the Discord tag: ' + error );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
			} );
		}, error => {
			embed.setColor('#FF0000').setDescription( error.desc );
			result.content = error.reply;
		} );
		
		return got.get( wiki + 'api.php?action=query' + ( wiki.hasCentralAuth() ? '&meta=globaluserinfo&guiprop=groups&guiuser=' + encodeURIComponent( username ) : '' ) + '&prop=revisions&rvprop=content|user&rvslots=main&titles=User:' + encodeURIComponent( username ) + '/Discord&format=json' ).then( mwresponse => {
			var mwbody = mwresponse.body;
			if ( mwbody && mwbody.warnings ) log_warn(mwbody.warnings);
			if ( mwresponse.statusCode !== 200 || mwbody?.batchcomplete === undefined || !mwbody?.query?.pages ) {
				console.log( '- ' + mwresponse.statusCode + ': Error while getting the Discord tag: ' + ( mwbody && mwbody.error && mwbody.error.info ) );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
				return;
			}
			if ( wiki.hasCentralAuth() ) {
				if ( mwbody.query.globaluserinfo.locked !== undefined ) {
					embed.setColor('#FF0000').setDescription( lang.get('verify.user_gblocked', '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
					result.content = lang.get('verify.user_gblocked_reply', escapeFormatting(username), queryuser.gender);
					return;
				}
				queryuser.groups.push(...mwbody.query.globaluserinfo.groups);
			}
			var revision = Object.values(mwbody.query.pages)[0]?.revisions?.[0];
			
			var discordname = '';
			if ( revision && revision.user === username ) {
				discordname = escapeFormatting(( revision?.slots?.main || revision )['*']).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/u, '$1#$2' );
			}
			if ( discordname.length > 100 ) discordname = discordname.substring(0, 100) + '\u2026';
			var authortag = escapeFormatting(member.user.tag);
			embed.addField( lang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), authortag, true ).addField( lang.get('verify.wiki', queryuser.gender), ( discordname || lang.get('verify.empty') ), true );
			if ( authortag !== discordname ) {
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
				embed.addField( lang.get('verify.notice'), lang.get('verify.help_subpage', '**`' + member.user.tag + '`**', queryuser.gender) + '\n' + wiki.toLink('Special:MyPage/Discord', 'action=edit') );
				result.content = lang.get('verify.user_failed_reply', escapeFormatting(username), queryuser.gender);
				return;
			}
			
			var roles = [];
			var missing = [];
			var verified = false;
			var rename = false;
			var accountage = ( Date.now() - new Date(queryuser.registration) ) / 86400000;
			rows.forEach( row => {
				var and_or = 'some';
				if ( row.usergroup.startsWith( 'AND|' ) ) {
					row.usergroup = row.usergroup.replace( 'AND|', '' );
					and_or = 'every';
				}
				if ( queryuser.editcount >= row.editcount && row.usergroup.split('|')[and_or]( usergroup => queryuser.groups.includes( usergroup ) ) && accountage >= row.accountage && row.role.split('|').some( role => !roles.includes( role ) ) ) {
					verified = true;
					if ( row.rename ) rename = true;
					row.role.split('|').forEach( role => {
						if ( !roles.includes( role ) ) {
							if ( channel.guild.roles.cache.has(role) && channel.guild.me.roles.highest.comparePositionTo(role) > 0 ) roles.push(role);
							else if ( !missing.includes( role ) ) missing.push(role);
						}
					} );
				}
			} );
			if ( verified ) {
				embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) + ( rename ? '\n' + lang.get('verify.user_renamed', queryuser.gender) : '' ) );
				var text = lang.get('verify.user_verified_reply', escapeFormatting(username), queryuser.gender);
				var verify_promise = [
					member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						embed.setColor('#008800');
						comment.push(lang.get('verify.failed_roles'));
					} )
				];
				if ( rename ) {
					verify_promise.push(member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						embed.setColor('#008800');
						comment.push(lang.get('verify.failed_rename', queryuser.gender));
					} ));
				}
				return Promise.all(verify_promise).finally( () => {
					if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
						if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
						if ( missing.length ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
						if ( comment.length ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
					}
					else {
						if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
						if ( missing.length ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
						if ( comment.length ) text += '\n\n' + comment.join('\n');
					}
					result.content = text;
				} );
			}
			
			embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
			result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);
		}, error => {
			console.log( '- Error while getting the Discord tag: ' + error );
			embed.setColor('#000000').setDescription( lang.get('verify.error') );
			result.content = lang.get('verify.error_reply');
		} );
	}, error => {
		console.log( '- Error while getting the user: ' + error );
		embed.setColor('#000000').setDescription( lang.get('verify.error') );
		result.content = lang.get('verify.error_reply');
	} ).then( () => {
		return result;
	} );
}

module.exports = verify;

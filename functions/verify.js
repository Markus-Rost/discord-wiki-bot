const cheerio = require('cheerio');
const {MessageEmbed} = require('discord.js');
var db = require('../util/database.js');
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
 * @returns {Promise<{content:String,embed:MessageEmbed,reaction:String,logging:{channel:String,content:String,embed?:MessageEmbed}}>}
 */
function verify(lang, channel, member, username, wiki, rows, old_username = '') {
	var embed = new MessageEmbed().setFooter( lang.get('verify.footer') ).setTimestamp();
	var result = {
		content: '', embed,
		add_button: channel.permissionsFor(channel.guild.me).has('EMBED_LINKS'),
		reaction: '',
		logging: {
			channel: '',
			content: '',
			embed: null
		}
	};
	return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=users' + ( wiki.isFandom() ? '|usercontribs&ucprop=&uclimit=10&ucuser=' + encodeURIComponent( username ) : '' ) + '&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.users ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				result.reaction = 'nowiki';
			}
			else if ( body?.error?.code === 'us400' || body?.error?.code === 'baduser_ucuser' ) {
				// special catch for Fandom
				if ( !old_username ) logging(wiki, channel.guild.id, 'verification');
				embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) ).addField( lang.get('verify.notice'), lang.get('verify.help_missing') );
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
		if ( !old_username ) logging(wiki, channel.guild.id, 'verification');
		var queryuser = body.query.users[0];
		embed.setAuthor( body.query.general.sitename );
		if ( body.query.users.length !== 1 || queryuser.missing !== undefined || queryuser.invalid !== undefined ) {
			username = ( body.query.users.length === 1 ? queryuser.name : username );
			embed.setTitle( escapeFormatting( old_username || username ) ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', escapeFormatting( old_username || username )) ).addField( lang.get('verify.notice'), lang.get('verify.help_missing') );
			result.content = lang.get('verify.user_missing_reply', escapeFormatting( old_username || username ));
			result.add_button = false;
			if ( wiki.isFandom() && !old_username ) return got.get( wiki + 'api/v1/User/UsersByName?limit=1&query=' + encodeURIComponent( username ) + '&format=json' ).then( wsresponse => {
				var wsbody = wsresponse.body;
				if ( wsresponse.statusCode !== 200 || wsbody?.exception || wsbody?.users?.[0]?.name?.length !== username.length ) {
					if ( !wsbody?.users ) console.log( '- ' + wsresponse.statusCode + ': Error while searching the user: ' + wsbody?.exception?.details );
					return;
				}
				return wsbody.users[0].name;
			}, error => {
				console.log( '- Error while searching the user: ' + error );
			} );
			return;
		}
		username = queryuser.name;
		var pagelink = wiki.toLink('User:' + username, '', '', true);
		embed.setTitle( escapeFormatting(username) ).setURL( pagelink );
		if ( queryuser.blockexpiry ) {
			embed.setColor('#FF0000').setDescription( lang.get('verify.user_blocked', '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
			result.content = lang.get('verify.user_blocked_reply', escapeFormatting(username), queryuser.gender);
			result.add_button = false;
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
				
				if ( wiki.isGamepedia() || !discordname ) return got.get( ( wiki.isGamepedia() ? wiki : 'https://help.fandom.com/' ) + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now() ).then( presponse => {
					var pbody = presponse.body;
					if ( presponse.statusCode !== 200 || !pbody || pbody.error || pbody.errormsg || !pbody.profile ) {
						if ( !wiki.isGamepedia() ) return;
						console.log( '- ' + presponse.statusCode + ': Error while getting the Discord tag: ' + ( pbody?.error?.info || pbody?.errormsg ) );
						return Promise.reject();
					}
					else if ( pbody.profile['link-discord'] ) {
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
				if ( discordname.length > 100 ) discordname = discordname.substring(0, 100) + '\u2026';
				var authortag = escapeFormatting(member.user.tag);
				embed.addField( lang.get('verify.discord', ( authortag === discordname ? queryuser.gender : 'unknown' )), authortag, true ).addField( lang.get('verify.wiki', queryuser.gender), ( discordname || lang.get('verify.empty') ), true );
				if ( authortag !== discordname ) {
					embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
					var help_link = '';
					if ( wiki.isGamepedia() ) help_link = lang.get('verify.help_gamepedia') + '?c=' + ( patreons[channel.guild.id] && patreons[channel.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[channel.guild.id] + 'verify' ) : 'wb' ) + ( channel.name !== 'verification' ? '&ch=' + encodeURIComponent( channel.name ) : '' ) + '&user=' + toTitle(username) + '&discord=' + encodeURIComponent( member.user.username ) + '&tag=' + member.user.discriminator;
					else if ( wiki.isFandom() ) help_link = lang.get('verify.help_fandom') + '/' + toTitle(username) + '?c=' + ( patreons[channel.guild.id] && patreons[channel.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[channel.guild.id] + 'verify' ) : 'wb' ) + ( channel.name !== 'verification' ? '&ch=' + encodeURIComponent( channel.name ) : '' ) + '&user=' + encodeURIComponent( member.user.username ) + '&tag=' + member.user.discriminator + '&useskin=oasis';
					if ( help_link.length ) embed.addField( lang.get('verify.notice'), lang.get('verify.help_guide', help_link, queryuser.gender) + '\n' + help_link );
					result.content = lang.get('verify.user_failed_reply', escapeFormatting(username), queryuser.gender);
					return;
				}
				
				if ( body.query.usercontribs?.length >= queryuser.editcount ) {
					queryuser.editcount = body.query.usercontribs.length;
					if ( body.continue?.uccontinue ) queryuser.editcount++;
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
					var verifynotice = {
						logchannel: '',
						onsuccess: ''
					};
					var verify_promise = [
						member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_roles'));
						} ),
						db.query( 'SELECT logchannel, onsuccess FROM verifynotice WHERE guild = $1', [channel.guild.id] ).then( ({rows:[row]}) => {
							if ( !row ) return;
							verifynotice.logchannel = row.logchannel;
							if ( row.onsuccess ) verifynotice.onsuccess = parseNotice(row.onsuccess, {
								editcount: queryuser.editcount,
								postcount: queryuser.postcount,
								accountage: Math.trunc(accountage),
								dateformat: lang.get('dateformat')
							}).trim();
						}, dberror => {
							console.log( '- Error while getting the notices: ' + dberror );
						} )
					];
					if ( rename && member.displayName !== username ) {
						if ( channel.guild.me.roles.highest.comparePositionTo(member.roles.highest) > 0 ) {
							verify_promise.push(member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
								log_error(error);
								embed.setColor('#008800');
								comment.push(lang.get('verify.failed_rename', queryuser.gender));
							} ));
						}
						else {
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_rename', queryuser.gender));
						}
					}
					return Promise.all(verify_promise).then( () => {
						var logchannel = ( verifynotice.logchannel ? channel.guild.channels.cache.get(verifynotice.logchannel) : null );
						var useLogging = false;
						if ( logchannel && logchannel.isGuild() && logchannel.permissionsFor(channel.guild.me).has(['VIEW_CHANNEL', 'SEND_MESSAGES']) ) {
							useLogging = true;
							result.logging.channel = logchannel.id;
							if ( logchannel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
								var logembed = new MessageEmbed(embed);
								if ( roles.length ) logembed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
								if ( missing.length ) logembed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
								if ( comment.length ) logembed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
								result.logging.embed = logembed;
							}
							else {
								var logtext = '🔸 ' + lang.get('verify.user_verified', member.toString(), escapeFormatting(username), queryuser.gender);
								if ( rename ) logtext += '\n' + lang.get('verify.user_renamed', queryuser.gender);
								logtext += '\n<' + pagelink + '>';
								if ( roles.length ) logtext += '\n**' + lang.get('verify.qualified') + '** ' + roles.map( role => '<@&' + role + '>' ).join(', ');
								if ( missing.length ) logtext += '\n**' + lang.get('verify.qualified_error') + '** ' + missing.map( role => '<@&' + role + '>' ).join(', ');
								if ( comment.length ) logtext += '\n**' + lang.get('verify.notice') + '** ' + comment.join('\n**' + lang.get('verify.notice') + '** ');
								result.logging.content = logtext;
							}
						}
						if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
							if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
							if ( missing.length && !useLogging ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
							if ( comment.length && !useLogging ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
							if ( verifynotice.onsuccess ) embed.addField( lang.get('verify.notice'), verifynotice.onsuccess );
						}
						else {
							if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
							if ( missing.length && !useLogging ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
							if ( comment.length && !useLogging ) text += '\n\n' + comment.join('\n');
							if ( verifynotice.onsuccess ) text += '\n\n**' + lang.get('verify.notice') + '** ' + verifynotice.onsuccess;
						}
						result.content = text;
						result.add_button = false;
					}, log_error );
				}
				
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
				result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);
				
				return db.query( 'SELECT onmatch FROM verifynotice WHERE guild = $1', [channel.guild.id] ).then( ({rows:[row]}) => {
					if ( !row?.onmatch ) return;
					var onmatch = parseNotice(row.onmatch, {
						editcount: queryuser.editcount,
						postcount: queryuser.postcount,
						accountage: Math.trunc(accountage),
						dateformat: lang.get('dateformat')
					});
					if ( !onmatch.trim() ) return;
					if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) embed.addField( lang.get('verify.notice'), onmatch );
					else result.content += '\n\n**' + lang.get('verify.notice') + '** ' + onmatch;
				}, dberror => {
					console.log( '- Error while getting the notices: ' + dberror );
				} );
			}, error => {
				if ( error ) console.log( '- Error while getting the Discord tag: ' + error );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				result.content = lang.get('verify.error_reply');
				result.add_button = false;
			} );
		}, error => {
			embed.setColor('#FF0000').setDescription( error.desc );
			result.content = error.reply;
			result.add_button = false;
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
					result.add_button = false;
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
				var verifynotice = {
					logchannel: '',
					onsuccess: ''
				};
				var verify_promise = [
					member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
						log_error(error);
						embed.setColor('#008800');
						comment.push(lang.get('verify.failed_roles'));
					} ),
					db.query( 'SELECT logchannel, onsuccess FROM verifynotice WHERE guild = $1', [channel.guild.id] ).then( ({rows:[row]}) => {
						if ( !row ) return;
						verifynotice.logchannel = row.logchannel;
						if ( row.onsuccess ) verifynotice.onsuccess = parseNotice(row.onsuccess, {
							editcount: queryuser.editcount,
							accountage: Math.trunc(accountage),
							dateformat: lang.get('dateformat')
						}).trim();
					}, dberror => {
						console.log( '- Error while getting the notices: ' + dberror );
					} )
				];
				if ( rename && member.displayName !== username ) {
					if ( channel.guild.me.roles.highest.comparePositionTo(member.roles.highest) > 0 ) {
						verify_promise.push(member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_rename', queryuser.gender));
						} ));
					}
					else {
						embed.setColor('#008800');
						comment.push(lang.get('verify.failed_rename', queryuser.gender));
					}
				}
				return Promise.all(verify_promise).then( () => {
					var logchannel = ( verifynotice.logchannel ? channel.guild.channels.cache.get(verifynotice.logchannel) : null );
					var useLogging = false;
					if ( logchannel && logchannel.isGuild() && logchannel.permissionsFor(channel.guild.me).has(['VIEW_CHANNEL', 'SEND_MESSAGES']) ) {
						useLogging = true;
						result.logging.channel = logchannel.id;
						if ( logchannel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
							var logembed = new MessageEmbed(embed);
							if ( roles.length ) logembed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
							if ( missing.length ) logembed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
							if ( comment.length ) logembed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
							result.logging.embed = logembed;
						}
						else {
							var logtext = '🔸 ' + lang.get('verify.user_verified', member.toString(), escapeFormatting(username), queryuser.gender);
							if ( rename ) logtext += '\n' + lang.get('verify.user_renamed', queryuser.gender);
							logtext += '\n<' + pagelink + '>';
							if ( roles.length ) logtext += '\n**' + lang.get('verify.qualified') + '** ' + roles.map( role => '<@&' + role + '>' ).join(', ');
							if ( missing.length ) logtext += '\n**' + lang.get('verify.qualified_error') + '** ' + missing.map( role => '<@&' + role + '>' ).join(', ');
							if ( comment.length ) logtext += '\n**' + lang.get('verify.notice') + '** ' + comment.join('\n**' + lang.get('verify.notice') + '** ');
							result.logging.content = logtext;
						}
					}
					if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) {
						if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
						if ( missing.length && !useLogging ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
						if ( comment.length && !useLogging ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
						if ( verifynotice.onsuccess ) embed.addField( lang.get('verify.notice'), verifynotice.onsuccess );
					}
					else {
						if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
						if ( missing.length && !useLogging ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
						if ( comment.length && !useLogging ) text += '\n\n' + comment.join('\n');
						if ( verifynotice.onsuccess ) text += '\n\n**' + lang.get('verify.notice') + '** ' + verifynotice.onsuccess;
					}
					result.content = text;
					result.add_button = false;
				}, log_error );
			}
			
			embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', member.toString(), '[' + escapeFormatting(username) + '](' + pagelink + ')', queryuser.gender) );
			result.content = lang.get('verify.user_matches_reply', escapeFormatting(username), queryuser.gender);
				
			return db.query( 'SELECT onmatch FROM verifynotice WHERE guild = $1', [channel.guild.id] ).then( ({rows:[row]}) => {
				if ( !row?.onmatch ) return;
				var onmatch = parseNotice(row.onmatch, {
					editcount: queryuser.editcount,
					accountage: Math.trunc(accountage),
					dateformat: lang.get('dateformat')
				});
				if ( !onmatch.trim() ) return;
				if ( channel.permissionsFor(channel.guild.me).has('EMBED_LINKS') ) embed.addField( lang.get('verify.notice'), onmatch );
				else result.content += '\n\n**' + lang.get('verify.notice') + '** ' + onmatch;
			}, dberror => {
				console.log( '- Error while getting the notices: ' + dberror );
			} );
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
		return verify(lang, channel, member, new_username, wiki, rows, username);
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
		var value = variables[key];
		if ( typeof value === 'string' ) return value;
		if ( /#(?:if)?expr:[^{|}]*$/.test(fulltext.substring(0, offset)) ) return ( value > 1000000000 ? 1000000000 : value );
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

module.exports = verify;

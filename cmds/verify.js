const htmlparser = require('htmlparser2');
const cheerio = require('cheerio');
const {MessageEmbed} = require('discord.js');
const {timeoptions} = require('../util/default.json');
var db = require('../util/database.js');

/**
 * Processes the "verify" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {String} wiki - The wiki for the message.
 */
function cmd_verify(lang, msg, args, line, wiki) {
	if ( msg.channel.type !== 'text' ) return this.LINK(lang, msg, line, wiki);
	if ( !msg.guild.me.permissions.has('MANAGE_ROLES') ) {
		if ( msg.isAdmin() || msg.isOwner() ) {
			console.log( msg.guild.id + ': Missing permissions - MANAGE_ROLES' );
			msg.replyMsg( lang.get('missingperm') + ' `MANAGE_ROLES`' );
		} else this.LINK(lang, msg, line, wiki);
		return;
	}
	
	var username = args.join(' ').replace( /_/g, ' ' ).trim().replace( /^<\s*(.*)\s*>$/, '$1' ).replace( /^@/, '' ).split('#')[0].substring(0, 250).trim();
	if ( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?wiki\/)/.test(username) ) {
		username = decodeURIComponent( username.replace( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?wiki\/)/, '' ) );
	}
	if ( wiki.endsWith( '.gamepedia.com/' ) ) username = username.replace( /^userprofile\s*:/i, '' );
	
	db.all( 'SELECT role, editcount, usergroup, accountage, rename FROM verification WHERE guild = ? AND channel LIKE ? ORDER BY configid ASC', [msg.guild.id, '%|' + msg.channel.id + '|%'], (dberror, rows) => {
		if ( dberror || !rows ) {
			console.log( '- Error while getting the verifications: ' + dberror );
			embed.setTitle( username.escapeFormatting() ).setColor('#000000').setDescription( lang.get('verify.error') );
			msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
			return dberror;
		}
		if ( !rows.length ) return msg.replyMsg( lang.get('verify.missing') );
		
		if ( !username.trim() ) {
			args[0] = line.split(' ')[0];
			if ( args[0] === 'verification' ) args[0] = 'verify';
			return this.help(lang, msg, args, line);
		}
		var embed = new MessageEmbed().setFooter( lang.get('verify.footer') + ' • ' + new Date().toLocaleString(lang.get('dateformat'), timeoptions) ).setTimestamp();
		msg.reactEmoji('⏳').then( reaction => got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=users&usprop=blockinfo|groups|groupmemberships|editcount|registration&ususers=' + encodeURIComponent( username ) + '&format=json', {
			responseType: 'json'
		} ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( response.statusCode !== 200 || !body || !body.query || !body.query.users ) {
				if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the user: ' + ( body && body.error && body.error.info ) );
					embed.setTitle( username.escapeFormatting() ).setColor('#000000').setDescription( lang.get('verify.error') );
					msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
				}
				
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			var queryuser = body.query.users[0];
			embed.setAuthor( body.query.general.sitename );
			if ( body.query.users.length !== 1 || queryuser.missing !== undefined || queryuser.invalid !== undefined ) {
				username = ( body.query.users.length === 1 ? queryuser.name : username );
				embed.setTitle( username.escapeFormatting() ).setColor('#0000FF').setDescription( lang.get('verify.user_missing', username.escapeFormatting()) );
				msg.replyMsg( lang.get('verify.user_missing_reply', username.escapeFormatting()), {embed}, false, false );
				
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			username = queryuser.name;
			var pagelink = wiki.toLink('User:' + username, '', '', body.query.general, true);
			embed.setTitle( username.escapeFormatting() ).setURL( pagelink );
			if ( queryuser.blockexpiry ) {
				embed.setColor('#FF0000').setDescription( lang.get('verify.user_blocked', '[' + username.escapeFormatting() + '](' + pagelink + ')') );
				msg.replyMsg( lang.get('verify.user_blocked_reply', username.escapeFormatting()), {embed}, false, false );
				
				if ( reaction ) reaction.removeEmoji();
				return;
			}
			
			var comment = [];
			var url = '';
			if ( wiki.endsWith( '.gamepedia.com/' ) ) {
				url = 'https://help.gamepedia.com/Special:GlobalBlockList/' + encodeURIComponent( username ) + '?uselang=qqx';
			}
			else if ( wiki.isFandom() ) {
				url = 'https://community.fandom.com/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1';
			}
			if ( url ) return got.get( url ).then( gbresponse => {
				if ( gbresponse.statusCode !== 200 || !gbresponse.body ) {
					console.log( '- ' + gbresponse.statusCode + ': Error while getting the global block.' );
					comment.push(lang.get('verify.failed_gblock'));
				}
				else {
					let $ = cheerio.load(gbresponse.body);
					if ( wiki.endsWith( '.gamepedia.com/' ) ) {
						if ( $('.mw-blocklist').length ) {
							return Promise.reject({
								desc: lang.get('verify.user_gblocked', '[' + username.escapeFormatting() + '](' + pagelink + ')'),
								reply: lang.get('verify.user_gblocked_reply', username.escapeFormatting())
							});
						}
					}
					else if ( wiki.isFandom() ) {
						if ( $('#mw-content-text .errorbox').length ) {
							return Promise.reject({
								desc: lang.get('verify.user_disabled', '[' + username.escapeFormatting() + '](' + pagelink + ')'),
								reply: lang.get('verify.user_disabled_reply', username.escapeFormatting())
							});
						}
						else if ( $('.mw-warning-with-logexcerpt').length && !$(".mw-warning-with-logexcerpt .mw-logline-block").length ) {
							return Promise.reject({
								desc: lang.get('verify.user_gblocked', '[' + username.escapeFormatting() + '](' + pagelink + ')'),
								reply: lang.get('verify.user_gblocked_reply', username.escapeFormatting())
							});
						}
					}
				}
			}, error => {
				console.log( '- Error while getting the global block: ' + error );
				comment.push(lang.get('verify.failed_gblock'));
			} ).then( async () => {
				// async check for editcount on Gamepedia, workaround for https://gitlab.com/hydrawiki/hydra/-/issues/5054
				if ( wiki.endsWith( '.gamepedia.com/' ) ) {
					try {
						let ucresponse = await got.get( wiki + 'api.php?action=query&list=usercontribs&ucprop=&uclimit=500&ucuser=' + encodeURIComponent( username ) + '&format=json', {
							responseType: 'json'
						} );
						if ( !ucresponse.body.continue ) queryuser.editcount = ucresponse.body.query.usercontribs.length;
					} catch ( ucerror ) {
						console.log( '- Error while working around the edit count: ' + ucerror )
					}
				}
				
				var options = {responseType: 'json'};
				if ( wiki.endsWith( '.gamepedia.com/' ) ) {
					url = wiki + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json&cache=' + Date.now();
				}
				else if ( wiki.isFandom() ) {
					url = 'https://services.fandom.com/user-attribute/user/' + queryuser.userid + '/attr/discordHandle?format=json&cache=' + Date.now();
					options.headers = {Accept: 'application/hal+json'};
				}
				got.get( url, options ).then( presponse => {
					var pbody = presponse.body;
					if ( presponse.statusCode !== 200 || !pbody || pbody.error || pbody.errormsg || pbody.title || !( pbody.profile || pbody.value !== undefined ) ) {
						if ( !( pbody && pbody.status === 404 ) ) {
							console.log( '- ' + presponse.statusCode + ': Error while getting the Discord tag: ' + ( pbody && ( pbody.error && pbody.error.info || pbody.errormsg || pbody.title ) ) );
							embed.setColor('#000000').setDescription( lang.get('verify.error') );
							msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
							
							if ( reaction ) reaction.removeEmoji();
							return;
						}
					}
					
					var discordname = '';
					if ( pbody.profile ) discordname = pbody.profile['link-discord'].escapeFormatting().replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/, '$1#$2' );
					else if ( pbody.value ) discordname = htmlToPlain( pbody.value ).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/, '$1#$2' );
					if ( discordname.length > 50 ) discordname = discordname.substring(0, 50) + '\u2026';
					embed.addField( lang.get('verify.discord'), msg.author.tag.escapeFormatting(), true ).addField( lang.get('verify.wiki'), ( discordname || lang.get('verify.empty') ), true );
					if ( msg.author.tag.escapeFormatting() !== discordname ) {
						embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') );
						var help_link = '';
						if ( wiki.endsWith( '.gamepedia.com/' ) ) help_link = lang.get('verify.help_gamepedia') + '?c=' + ( msg.guild.id in patreons && patreons[msg.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[msg.guild.id] + ' verify' ) : 'wb' ) + ( msg.channel.name !== 'verification' ? '&ch=' + encodeURIComponent( msg.channel.name ) : '' ) + '&user=' + username.toTitle(true, true) + '&discord=' + encodeURIComponent( msg.author.username ) + '&tag=' + msg.author.discriminator;
						else if ( wiki.isFandom() ) help_link = lang.get('verify.help_fandom') + '/' + username.toTitle(true) + '?c=' + ( msg.guild.id in patreons && patreons[msg.guild.id] !== process.env.prefix ? encodeURIComponent( patreons[msg.guild.id] + ' verify' ) : 'wb' ) + ( msg.channel.name !== 'verification' ? '&ch=' + encodeURIComponent( msg.channel.name ) : '' ) + '&user=' + encodeURIComponent( msg.author.username ) + '&tag=' + msg.author.discriminator;
						if ( help_link.length ) embed.addField( lang.get('verify.notice'), lang.get('verify.help_guide', help_link) + '\n' + help_link );
						msg.replyMsg( lang.get('verify.user_failed_reply', username.escapeFormatting()), {embed}, false, false );
						
						if ( reaction ) reaction.removeEmoji();
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
						if ( queryuser.editcount >= row.editcount && row.usergroup.split('|')[and_or]( usergroup => {
							if ( !queryuser.groupmemberships ) return queryuser.groups.includes( usergroup );
							if ( !queryuser.groups.includes( 'global_' + usergroup ) || queryuser.groupmemberships.some( member => member.group === usergroup ) ) {
								return queryuser.groups.includes( usergroup );
							}
							return false;
						} ) && accountage >= row.accountage && row.role.split('|').some( role => !roles.includes( role ) ) ) {
							verified = true;
							if ( row.rename ) rename = true;
							row.role.split('|').forEach( role => {
								if ( !roles.includes( role ) ) {
									if ( msg.guild.roles.cache.has(role) && msg.guild.me.roles.highest.comparePositionTo(role) > 0 ) roles.push(role);
									else if ( !missing.includes( role ) ) missing.push(role);
								}
							} );
						}
					} );
					if ( verified ) {
						embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') + ( rename ? '\n' + lang.get('verify.user_renamed') : '' ) );
						var text = lang.get('verify.user_verified_reply', username.escapeFormatting());
						var verify_promise = [
							msg.member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
								log_error(error);
								embed.setColor('#008800');
								comment.push(lang.get('verify.failed_roles'));
							} )
						];
						if ( rename ) {
							verify_promise.push(msg.member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
								log_error(error);
								embed.setColor('#008800');
								comment.push(lang.get('verify.failed_rename'));
							} ));
						}
						return Promise.all(verify_promise).finally( () => {
							if ( msg.showEmbed() ) {
								if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
								if ( missing.length ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
								if ( comment.length ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
							}
							else {
								if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
								if ( missing.length ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
								if ( comment.length ) text += '\n\n' + comment.join('\n');
							}
							msg.replyMsg( text, {embed,split:true}, false, false );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					
					embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') );
					msg.replyMsg( lang.get('verify.user_matches_reply', username.escapeFormatting()), {embed}, false, false );
					
					if ( reaction ) reaction.removeEmoji();
				}, error => {
					console.log( '- Error while getting the Discord tag: ' + error );
					embed.setColor('#000000').setDescription( lang.get('verify.error') );
					msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
					
					if ( reaction ) reaction.removeEmoji();
				} );
			}, error => {
				embed.setColor('#FF0000').setDescription( error.desc );
				msg.replyMsg( error.reply, {embed}, false, false );
				
				if ( reaction ) reaction.removeEmoji();
			} );
			
			got.get( wiki + 'api.php?action=query&prop=revisions&rvprop=content|user&rvslots=main&titles=User:' + encodeURIComponent( username ) + '/Discord&format=json', {
				responseType: 'json'
			} ).then( mwresponse => {
				var mwbody = mwresponse.body;
				if ( mwbody && mwbody.warnings ) log_warn(mwbody.warnings);
				if ( mwresponse.statusCode !== 200 || !mwbody || mwbody.batchcomplete === undefined || !mwbody.query || !mwbody.query.pages ) {
					console.log( '- ' + mwresponse.statusCode + ': Error while getting the Discord tag: ' + ( mwbody && mwbody.error && mwbody.error.info ) );
					embed.setColor('#000000').setDescription( lang.get('verify.error') );
					msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
					
					if ( reaction ) reaction.removeEmoji();
					return;
				}
				var revision = Object.values(mwbody.query.pages)[0]?.revisions?.[0];
				
				var discordname = '';
				if ( revision && revision.user === username ) discordname = revision.slots.main['*'].escapeFormatting().replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/, '$1#$2' );
				if ( discordname.length > 50 ) discordname = discordname.substring(0, 50) + '\u2026';
				embed.addField( lang.get('verify.discord'), msg.author.tag.escapeFormatting(), true ).addField( lang.get('verify.wiki'), ( discordname || lang.get('verify.empty') ), true );
				if ( msg.author.tag.escapeFormatting() !== discordname ) {
					embed.setColor('#FFFF00').setDescription( lang.get('verify.user_failed', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') );
					embed.addField( lang.get('verify.notice'), lang.get('verify.help_subpage', '**`' + msg.author.tag + '`**') + '\n' + wiki.toLink('Special:MyPage/Discord', 'action=edit', '', body.query.general) );
					msg.replyMsg( lang.get('verify.user_failed_reply', username.escapeFormatting()), {embed}, false, false );
					
					if ( reaction ) reaction.removeEmoji();
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
					if ( queryuser.editcount >= row.editcount && row.usergroup.split('|')[and_or]( usergroup => {
						if ( !queryuser.groupmemberships ) return queryuser.groups.includes( usergroup );
						if ( !queryuser.groups.includes( 'global_' + usergroup ) || queryuser.groupmemberships.some( member => member.group === usergroup ) ) {
							return queryuser.groups.includes( usergroup );
						}
						return false;
					} ) && accountage >= row.accountage && row.role.split('|').some( role => !roles.includes( role ) ) ) {
						verified = true;
						if ( row.rename ) rename = true;
						row.role.split('|').forEach( role => {
							if ( !roles.includes( role ) ) {
								if ( msg.guild.roles.cache.has(role) && msg.guild.me.roles.highest.comparePositionTo(role) > 0 ) roles.push(role);
								else if ( !missing.includes( role ) ) missing.push(role);
							}
						} );
					}
				} );
				if ( verified ) {
					embed.setColor('#00FF00').setDescription( lang.get('verify.user_verified', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') + ( rename ? '\n' + lang.get('verify.user_renamed') : '' ) );
					var text = lang.get('verify.user_verified_reply', username.escapeFormatting());
					var verify_promise = [
						msg.member.roles.add( roles, lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_roles'));
						} )
					];
					if ( rename ) {
						verify_promise.push(msg.member.setNickname( username.substring(0, 32), lang.get('verify.audit_reason', username) ).catch( error => {
							log_error(error);
							embed.setColor('#008800');
							comment.push(lang.get('verify.failed_rename'));
						} ));
					}
					return Promise.all(verify_promise).finally( () => {
						if ( msg.showEmbed() ) {
							if ( roles.length ) embed.addField( lang.get('verify.qualified'), roles.map( role => '<@&' + role + '>' ).join('\n') );
							if ( missing.length ) embed.setColor('#008800').addField( lang.get('verify.qualified_error'), missing.map( role => '<@&' + role + '>' ).join('\n') );
							if ( comment.length ) embed.setColor('#008800').addField( lang.get('verify.notice'), comment.join('\n') );
						}
						else {
							if ( roles.length ) text += '\n\n' + lang.get('verify.qualified') + ' ' + roles.map( role => '<@&' + role + '>' ).join(', ');
							if ( missing.length ) text += '\n\n' + lang.get('verify.qualified_error') + ' ' + missing.map( role => '<@&' + role + '>' ).join(', ');
							if ( comment.length ) text += '\n\n' + comment.join('\n');
						}
						msg.replyMsg( text, {embed,split:true}, false, false );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
				
				embed.setColor('#FFFF00').setDescription( lang.get('verify.user_matches', msg.member.toString(), '[' + username.escapeFormatting() + '](' + pagelink + ')') );
				msg.replyMsg( lang.get('verify.user_matches_reply', username.escapeFormatting()), {embed}, false, false );
				
				if ( reaction ) reaction.removeEmoji();
			}, error => {
				console.log( '- Error while getting the Discord tag: ' + error );
				embed.setColor('#000000').setDescription( lang.get('verify.error') );
				msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
				
				if ( reaction ) reaction.removeEmoji();
			} );
		}, error => {
			console.log( '- Error while getting the user: ' + error );
			embed.setColor('#000000').setDescription( lang.get('verify.error') );
			msg.replyMsg( lang.get('verify.error_reply'), {embed}, false, false ).then( message => message.reactEmoji('error') );
			
			if ( reaction ) reaction.removeEmoji();
		} ) );
	} );
}

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		}
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

module.exports = {
	name: 'verify',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_verify
};
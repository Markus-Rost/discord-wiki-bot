import { randomBytes } from 'node:crypto';
import { MessageEmbed, MessageActionRow, MessageButton, Permissions } from 'discord.js';
import db from '../util/database.js';
import verify from '../functions/verify.js';
import { got, oauthVerify, allowDelete, escapeFormatting } from '../util/functions.js';

/**
 * Processes the "verify" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
function cmd_verify(lang, msg, args, line, wiki) {
	if ( !msg.inGuild() || msg.defaultSettings ) return this.LINK(lang, msg, line, wiki);
	if ( !msg.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES) ) {
		if ( msg.isAdmin() ) {
			console.log( msg.guildId + ': Missing permissions - MANAGE_ROLES' );
			msg.replyMsg( lang.get('general.missingperm') + ' `MANAGE_ROLES`' );
		}
		else if ( !msg.onlyVerifyCommand ) this.LINK(lang, msg, line, wiki);
		return;
	}
	
	db.query( 'SELECT logchannel, flags, onsuccess, onmatch, role, editcount, postcount, usergroup, accountage, rename FROM verification LEFT JOIN verifynotice ON verification.guild = verifynotice.guild WHERE verification.guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [msg.guildId, '%|' + ( msg.channel.isThread() ? msg.channel.parentId : msg.channelId ) + '|%'] ).then( ({rows}) => {
		if ( !rows.length ) {
			if ( msg.onlyVerifyCommand ) return;
			return msg.replyMsg( lang.get('verify.missing') + ( msg.isAdmin() ? '\n`' + ( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix ) + 'verification`' : '' ) );
		}
		
		if ( wiki.hasOAuth2() && process.env.dashboard ) {
			let oauth = [wiki.hostname + wiki.pathname.slice(0, -1)];
			if ( wiki.wikifarm === 'wikimedia' ) oauth.push('wikimedia');
			if ( wiki.wikifarm === 'miraheze' ) oauth.push('miraheze');
			if ( process.env['oauth_' + ( oauth[1] || oauth[0] )] && process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret'] ) {
				return db.query( 'SELECT token FROM oauthusers WHERE userid = $1 AND site = $2', [msg.author.id, ( oauth[1] || oauth[0] )] ).then( ({rows: [row]}) => {
					if ( row?.token ) return got.post( wiki + 'rest.php/oauth2/access_token', {
						form: {
							grant_type: 'refresh_token', refresh_token: row.token,
							redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env['oauth_' + ( oauth[1] || oauth[0] )],
							client_secret: process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret']
						},
						context: {
							guildId: msg.guildId
						}
					} ).then( response => {
						var body = response.body;
						if ( response.statusCode !== 200 || !body?.access_token ) {
							console.log( '- ' + response.statusCode + ': Error while refreshing the mediawiki token: ' + ( body?.message || body?.error ) );
							return Promise.reject(row);
						}
						if ( body?.refresh_token ) db.query( 'UPDATE oauthusers SET token = $1 WHERE userid = $2 AND site = $3', [body.refresh_token, msg.author.id, ( oauth[1] || oauth[0] )] ).then( () => {
							console.log( '- Dashboard: OAuth2 token for ' + msg.author.id + ' successfully updated.' );
						}, dberror => {
							console.log( '- Dashboard: Error while updating the OAuth2 token for ' + msg.author.id + ': ' + dberror );
						} );
						return verifyOauthUser('', body.access_token, {
							wiki: wiki.href, channel: msg.channel,
							user: msg.author.id, sourceMessage: msg,
							fail: () => msg.replyMsg( lang.get('verify.error_reply'), false, false ).then( message => {
								if ( message ) message.reactEmoji('error');
							} )
						});
					}, error => {
						console.log( '- Error while refreshing the mediawiki token: ' + error );
						return Promise.reject(row);
					} );
					return Promise.reject(row);
				}, dberror => {
					console.log( '- Error while getting the OAuth2 token: ' + dberror );
					return Promise.reject();
				} ).catch( row => {
					if ( row ) {
						if ( !row?.hasOwnProperty?.('token') ) console.log( '- Error while checking the OAuth2 refresh token: ' + row );
						else if ( row.token ) db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [msg.author.id, ( oauth[1] || oauth[0] )] ).then( () => {
							console.log( '- Dashboard: OAuth2 token for ' + msg.author.id + ' successfully deleted.' );
						}, dberror => {
							console.log( '- Dashboard: Error while deleting the OAuth2 token for ' + msg.author.id + ': ' + dberror );
						} );
					}
					let state = `${oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( oauth[1] ? ` ${oauth[1]}` : '' );
					while ( oauthVerify.has(state) ) {
						state = `${oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( oauth[1] ? ` ${oauth[1]}` : '' );
					}
					oauthVerify.set(state, {
						state, wiki: wiki.href,
						channel: msg.channel,
						user: msg.author.id
					});
					msg.client.shard.send({id: 'verifyUser', state, user: ( row?.token === null ? '' : msg.author.id )});
					let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
						response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
						client_id: process.env['oauth_' + ( oauth[1] || oauth[0] )], state
					}).toString();
					return msg.member.send( {
						content: lang.get('verify.oauth_message_dm', escapeFormatting(msg.guild.name)) + '\n<' + oauthURL + '>',
						components: [new MessageActionRow().addComponents(
							new MessageButton().setLabel(lang.get('verify.oauth_button')).setEmoji('🔗').setStyle('LINK').setURL(oauthURL)
						)]
					} ).then( message => {
						msg.reactEmoji('📩');
						allowDelete(message, msg.author.id);
						setTimeout( () => msg.delete().catch(log_error), 60_000 ).unref();
					}, error => {
						if ( error?.code === 50007 ) { // CANNOT_MESSAGE_USER
							return msg.replyMsg( lang.get('verify.oauth_private') );
						}
						log_error(error);
						msg.reactEmoji('error');
					} );
				} );
			}
		}
		
		var username = args.join(' ').replace( /_/g, ' ' ).trim().replace( /^<\s*(.*)\s*>$/, '$1' ).replace( /^@/, '' ).split('#')[0].substring(0, 250).trim();
		if ( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/.test(username) ) {
			username = decodeURIComponent( username.replace( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/, '' ) );
		}
		if ( wiki.isGamepedia() ) username = username.replace( /^userprofile\s*:\s*/i, '' );
		
		if ( !username.trim() ) {
			args[0] = line.split(' ')[0];
			if ( args[0] === 'verification' ) args[0] = ( lang.localNames.verify || 'verify' );
			return this.help(lang, msg, args, line, wiki);
		}
		msg.reactEmoji('⏳').then( reaction => {
			verify(lang, msg.channel, msg.member, username, wiki, rows).then( result => {
				if ( result.oauth.length ) {
					return db.query( 'SELECT token FROM oauthusers WHERE userid = $1 AND site = $2', [msg.author.id, ( result.oauth[1] || result.oauth[0] )] ).then( ({rows: [row]}) => {
						if ( row?.token ) return got.post( wiki + 'rest.php/oauth2/access_token', {
							form: {
								grant_type: 'refresh_token', refresh_token: row.token,
								redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
								client_id: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] )],
								client_secret: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] ) + '_secret']
							},
							context: {
								guildId: msg.guildId
							}
						} ).then( response => {
							var body = response.body;
							if ( response.statusCode !== 200 || !body?.access_token ) {
								console.log( '- ' + response.statusCode + ': Error while refreshing the mediawiki token: ' + ( body?.message || body?.error ) );
								return Promise.reject(row);
							}
							if ( body?.refresh_token ) db.query( 'UPDATE oauthusers SET token = $1 WHERE userid = $2 AND site = $3', [body.refresh_token, msg.author.id, ( result.oauth[1] || result.oauth[0] )] ).then( () => {
								console.log( '- Dashboard: OAuth2 token for ' + msg.author.id + ' successfully updated.' );
							}, dberror => {
								console.log( '- Dashboard: Error while updating the OAuth2 token for ' + msg.author.id + ': ' + dberror );
							} );
							return verifyOauthUser('', body.access_token, {
								wiki: wiki.href, channel: msg.channel,
								user: msg.author.id, sourceMessage: msg,
								fail: () => msg.replyMsg( lang.get('verify.error_reply'), false, false ).then( message => {
									if ( message ) message.reactEmoji('error');
								} )
							});
						}, error => {
							console.log( '- Error while refreshing the mediawiki token: ' + error );
							return Promise.reject(row);
						} );
						return Promise.reject(row);
					}, dberror => {
						console.log( '- Error while getting the OAuth2 token: ' + dberror );
						return Promise.reject();
					} ).catch( row => {
						if ( row ) {
							if ( !row?.hasOwnProperty?.('token') ) console.log( '- Error while checking the OAuth2 refresh token: ' + row );
							else if ( row.token ) db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [msg.author.id, ( result.oauth[1] || result.oauth[0] )] ).then( () => {
								console.log( '- Dashboard: OAuth2 token for ' + msg.author.id + ' successfully deleted.' );
							}, dberror => {
								console.log( '- Dashboard: Error while deleting the OAuth2 token for ' + msg.author.id + ': ' + dberror );
							} );
						}
						let state = `${result.oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( result.oauth[1] ? ` ${result.oauth[1]}` : '' );
						while ( oauthVerify.has(state) ) {
							state = `${result.oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( result.oauth[1] ? ` ${result.oauth[1]}` : '' );
						}
						oauthVerify.set(state, {
							state, wiki: wiki.href,
							channel: msg.channel,
							user: msg.author.id
						});
						msg.client.shard.send({id: 'verifyUser', state, user: ( row?.token === null ? '' : msg.author.id )});
						let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
							response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] )], state
						}).toString();
						msg.member.send( {
							content: lang.get('verify.oauth_message_dm', escapeFormatting(msg.guild.name)) + '\n<' + oauthURL + '>',
							components: [new MessageActionRow().addComponents(
								new MessageButton().setLabel(lang.get('verify.oauth_button')).setEmoji('🔗').setStyle('LINK').setURL(oauthURL)
							)]
						} ).then( message => {
							msg.reactEmoji('📩');
							allowDelete(message, msg.author.id);
							setTimeout( () => msg.delete().catch(log_error), 60_000 ).unref();
						}, error => {
							if ( error?.code === 50007 ) { // CANNOT_MESSAGE_USER
								return msg.replyMsg( lang.get('verify.oauth_private') );
							}
							log_error(error);
							msg.reactEmoji('error');
						} );
					} );
				}
				else if ( result.reaction ) msg.reactEmoji(result.reaction);
				else {
					var options = {
						content: msg.member.toString() + ', ' + result.content,
						embeds: [result.embed],
						components: [],
						allowedMentions: {
							users: [msg.author.id],
							repliedUser: true
						}
					};
					if ( result.add_button ) options.components.push(new MessageActionRow().addComponents(
						new MessageButton().setLabel(lang.get('verify.button_again')).setEmoji('🔂').setStyle('PRIMARY').setCustomId('verify_again')
					));
					if ( result.send_private ) {
						let dmEmbeds = [new MessageEmbed(result.embed)];
						if ( options.embeds[0] ) {
							dmEmbeds.push(new MessageEmbed(options.embeds[0]));
							dmEmbeds[0].fields.forEach( field => {
								field.value = field.value.replace( /<@&(\d+)>/g, (mention, id) => {
									if ( !msg.guild.roles.cache.has(id) ) return mention;
									return escapeFormatting('@' + msg.guild.roles.cache.get(id)?.name);
								} );
							} );
						}
						msg.member.send( {content: msg.channel.toString() + '; ' + result.content, embeds: dmEmbeds, components: []} ).then( message => {
							msg.reactEmoji('📩');
							allowDelete(message, msg.author.id);
							setTimeout( () => msg.delete().catch(log_error), 60_000 ).unref();
						}, error => {
							if ( error?.code === 50007 ) { // CANNOT_MESSAGE_USER
								return msg.replyMsg( options, false, false );
							}
							log_error(error);
							msg.reactEmoji('error');
						} ).then( message => {
							if ( !result.logging.channel || !msg.guild.channels.cache.has(result.logging.channel) ) return;
							if ( message ) {
								if ( result.logging.embed ) result.logging.embed.addField(message.url, '<#' + msg.channelId + '>');
								else result.logging.content += '\n<#' + msg.channelId + '> – <' + message.url + '>';
							}
							msg.guild.channels.cache.get(result.logging.channel).send( {
								content: result.logging.content,
								embeds: ( result.logging.embed ? [result.logging.embed] : [] )
							} ).catch(log_error);
						} );
					}
					else msg.replyMsg( options, false, false ).then( message => {
						if ( !result.logging.channel || !msg.guild.channels.cache.has(result.logging.channel) ) return;
						if ( message ) {
							if ( result.logging.embed ) result.logging.embed.addField(message.url, '<#' + msg.channelId + '>');
							else result.logging.content += '\n<#' + msg.channelId + '> – <' + message.url + '>';
						}
						msg.guild.channels.cache.get(result.logging.channel).send( {
							content: result.logging.content,
							embeds: ( result.logging.embed ? [result.logging.embed] : [] )
						} ).catch(log_error);
					} );
				}
				if ( reaction ) reaction.removeEmoji();
			}, error => {
				console.log( '- Error during the verifications: ' + error );
				msg.replyMsg( lang.get('verify.error_reply'), false, false ).then( message => {
					if ( message ) message.reactEmoji('error');
				} );
			} );
		} );
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		msg.replyMsg( lang.get('verify.error_reply'), false, false ).then( message => {
			if ( message ) message.reactEmoji('error');
		} );
	} );
}

export default {
	name: 'verify',
	everyone: true,
	pause: false,
	owner: false,
	run: cmd_verify
};

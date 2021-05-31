const {randomBytes} = require('crypto');
var db = require('../util/database.js');
var verify = require('../functions/verify.js');
const {oauthVerify, sendMessage} = require('../util/functions.js');

/**
 * Wiki user verification.
 * @param {Object} interaction - The interaction.
 * @param {import('discord.js').Client} interaction.client - The client of the interaction.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('../util/wiki.js')} wiki - The wiki for the interaction.
 * @param {import('discord.js').TextChannel} [channel] - The channel for the interaction.
 */
function slash_verify(interaction, lang, wiki, channel) {
	var reply = '<@' + ( interaction.member?.nick ? '!' : '' ) + interaction.user.id + '>, ';
	var allowed_mentions = {
		users: [interaction.user.id]
	};
	if ( !channel?.guild ) return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
		data: {
			type: 4,
			data: {
				content: reply + lang.get('verify.missing'),
				allowed_mentions,
				flags: 64
			}
		}
	} ).catch(log_error);
	if ( !channel.guild.me.permissions.has('MANAGE_ROLES') ) {
		console.log( channel.guild.id + ': Missing permissions - MANAGE_ROLES' );
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: reply + lang.get('general.missingperm') + ' `MANAGE_ROLES`',
					allowed_mentions,
					flags: 64
				}
			}
		} ).catch(log_error);
	}
	
	return db.query( 'SELECT role, editcount, postcount, usergroup, accountage, rename FROM verification WHERE guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [interaction.guild_id, '%|' + interaction.channel_id + '|%'] ).then( ({rows}) => {
		if ( !rows.length ) return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: reply + lang.get('verify.missing') + ( interaction.member.permissions.has('MANAGE_GUILD') && process.env.dashboard ? '\n' + new URL(`/guild/${interaction.guild_id}/verification`, process.env.dashboard).href : '' ),
					allowed_mentions,
					flags: 64
				}
			}
		} ).catch(log_error);

		if ( ( wiki.isWikimedia() || wiki.isMiraheze() ) && process.env.dashboard ) {
			let oauth = '';
			if ( wiki.isWikimedia() ) oauth = 'wikimedia';
			if ( wiki.isMiraheze() ) oauth = 'miraheze';
			if ( oauth && process.env[`oauth-${oauth}`] && process.env[`oauth-${oauth}-secret`] ) {
				let state = `${oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
				while ( oauthVerify.has(state) ) {
					state = `${oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
				}
				oauthVerify.set(state, {
					state, wiki: wiki.hostname, channel,
					user: interaction.user.id
				});
				interaction.client.shard.send({id: 'verifyUser', state});
				let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
					response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
					client_id: process.env[`oauth-${oauth}`], state
				}).toString();
				return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
					data: {
						type: 4,
						data: {
							content: reply + lang.get('verify.oauth_message', '<' + oauthURL + '>'),
							allowed_mentions,
							components: [
								{
									type: 1,
									components: [
										{
											type: 2,
											style: 5,
											label: lang.get('verify.oauth_button'),
											emoji: {id: null, name: '🔗'},
											url: oauthURL,
											disabled: false
										}
									]
								}
							],
							flags: 64
						}
					}
				} ).catch(log_error);
			}
		}
		
		var username = ( interaction.data.options?.[0]?.value || '' ).replace( /^\s*<@!?(\d+)>\s*$/, (mention, id) => {
			if ( id === interaction.user.id ) {
				return ( interaction.member?.nick || interaction.user.username );
			}
			let user = channel.guild.members.cache.get(id);
			if ( user ) return user.displayName;
			else {
				user = interaction.client.users.cache.get(user);
				if ( user ) return user.username;
			}
			return mention;
		} ).replace( /_/g, ' ' ).trim().replace( /^<\s*(.*)\s*>$/, '$1' ).split('#')[0].substring(0, 250).trim();
		if ( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/.test(username) ) {
			username = decodeURIComponent( username.replace( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/, '' ) );
		}
		if ( wiki.isGamepedia() ) username = username.replace( /^userprofile\s*:\s*/i, '' );
		
		if ( !username.trim() ) return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: lang.get('interaction.verify'),
					allowed_mentions,
					flags: 64
				}
			}
		} ).catch(log_error);

		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 5,
				data: {
					allowed_mentions,
					flags: 0
				}
			}
		} ).then( () => {
			return channel.guild.members.fetch(interaction.user.id).then( member => {
				return verify(lang, channel, member, username, wiki, rows).then( result => {
					if ( result.oauth ) {
						let state = `${result.oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
						while ( oauthVerify.has(state) ) {
							state = `${result.oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
						}
						oauthVerify.set(state, {
							state, wiki: wiki.hostname, channel,
							user: interaction.user.id
						});
						interaction.client.shard.send({id: 'verifyUser', state});
						let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
							response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env[`oauth-${result.oauth}`], state
						}).toString();
						return interaction.client.api.webhooks(interaction.application_id, interaction.token).messages('@original').delete().then( () => {
							return interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
								data: {
									content: reply + lang.get('verify.oauth_message', '<' + oauthURL + '>'),
									allowed_mentions,
									components: [
										{
											type: 1,
											components: [
												{
													type: 2,
													style: 5,
													label: lang.get('verify.oauth_button'),
													emoji: {id: null, name: '🔗'},
													url: oauthURL,
													disabled: false
												}
											]
										}
									],
									flags: 64
								}
							} ).catch(log_error);
						}, log_error );
					}
					var message = {
						content: reply + result.content,
						embeds: [result.embed],
						allowed_mentions,
						components: []
					};
					if ( result.add_button ) message.components.push({
						type: 1,
						components: [
							{
								type: 2,
								style: 1,
								label: lang.get('verify.button_again'),
								emoji: {id: null, name: '🔂'},
								custom_id: 'verify_again',
								disabled: false
							}
						]
					});
					if ( result.reaction ) {
						if ( result.reaction === 'nowiki' ) message.content = lang.get('interaction.nowiki');
						else message.content = reply + lang.get('verify.error_reply');
						message.embeds = [];
					}
					return sendMessage(interaction, message, channel, false).then( msg => {
						if ( !result.logging.channel || !channel.guild.channels.cache.has(result.logging.channel) ) return;
						if ( msg ) {
							if ( result.logging.embed ) result.logging.embed.addField(msg.url, '<#' + channel.id + '>');
							else result.logging.content += '\n<#' + channel.id + '> – <' + msg.url + '>';
						}
						channel.guild.channels.cache.get(result.logging.channel).send(result.logging.content, {
							embed: result.logging.embed,
							allowedMentions: {parse: []}
						}).catch(log_error);
					} );
				}, error => {
					console.log( '- Error during the verifications: ' + error );
					return sendMessage(interaction, {
						content: reply + lang.get('verify.error_reply'),
						allowed_mentions
					}, channel);
				} );
			}, error => {
				console.log( '- Error while getting the member: ' + error );
				return sendMessage(interaction, {
					content: reply + lang.get('verify.error_reply'),
					allowed_mentions
				}, channel);
			} );
		}, log_error );
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: reply + lang.get('verify.error_reply'),
					allowed_mentions,
					flags: 64
				}
			}
		} ).catch(log_error);
	} );
}

/**
 * Wiki user verification.
 * @param {Object} interaction - The interaction.
 * @param {import('discord.js').Client} interaction.client - The client of the interaction.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('../util/wiki.js')} wiki - The wiki for the interaction.
 * @param {import('discord.js').TextChannel} [channel] - The channel for the interaction.
 */
 function button_verify(interaction, lang, wiki, channel) {
	var username = interaction?.message?.embeds?.[0]?.title?.replace( /\\(\\)?/g, '$1' );
	if ( !username || !channel?.guild || !interaction.message?.mentions?.[0]?.id ) {
		interaction.message.allowed_mentions = {
			users: [interaction.user.id]
		};
		interaction.message.components = [];
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 7,
				data: interaction.message
			}
		} ).catch(log_error);
	}
	if ( interaction.user.id !== interaction.message.mentions[0].id ) {
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {type: 6}
		} ).then( () => {
			interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
				data: {
					content: lang.get('verify.button_wrong_user', `<@${interaction.message.mentions[0].id}>`),
					allowed_mentions: {
						parse: []
					},
					flags: 64
				}
			} ).catch(log_error);
		}, log_error);
	}
	return db.query( 'SELECT role, editcount, postcount, usergroup, accountage, rename FROM verification WHERE guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [interaction.guild_id, '%|' + interaction.channel_id + '|%'] ).then( ({rows}) => {
		if ( !rows.length || !channel.guild.me.permissions.has('MANAGE_ROLES') ) {
			return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
				data: {type: 6}
			} ).catch(log_error);
		}
		var reply = '<@' + ( interaction.member?.nick ? '!' : '' ) + interaction.user.id + '>, ';
		var allowed_mentions = {
			users: [interaction.user.id]
		};
		interaction.message.allowed_mentions = allowed_mentions;

		if ( interaction?.message?.embeds?.[0]?.fields?.[1]?.value === lang.get('verify.oauth_used') && interaction?.message?.embeds?.[0]?.url?.startsWith( wiki.origin ) ) {
			console.log( interaction.guild_id + ': Button: ' + interaction.data.custom_id + ': OAuth2: ' + username );
			interaction.message.components[0].components[0].disabled = true;
			return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
				data: {
					type: 7,
					data: interaction.message
				}
			} ).then( () => {
				return global.verifyOauthUser('', '', {
					channel, username, user: interaction.user.id,
					edit: function(content, options) {
						if ( !content && !options ) {
							interaction.message.components = [];
							return sendMessage(interaction, interaction.message, channel, false);
						}
						var message = {
							content, allowed_mentions,
							embeds: ( options.embed ? [options.embed] : [] ),
							components: ( options.components ? options.components : [] )
						};
						sendMessage(interaction, message, channel, false);
						return interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
							data: {
								content, allowed_mentions,
								embeds: ( options.embed ? [options.embed] : [] ),
								components: [],
								flags: 64
							}
						} ).catch(log_error);
					}
				});
			}, log_error );
		}
		if ( ( wiki.isWikimedia() || wiki.isMiraheze() ) && process.env.dashboard ) {
			let oauth = '';
			if ( wiki.isWikimedia() ) oauth = 'wikimedia';
			if ( wiki.isMiraheze() ) oauth = 'miraheze';
			if ( oauth && process.env[`oauth-${oauth}`] && process.env[`oauth-${oauth}-secret`] ) {
				console.log( interaction.guild_id + ': Button: ' + interaction.data.custom_id + ': OAuth2' );
				let state = `${oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
				while ( oauthVerify.has(state) ) {
					state = `${oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
				}
				oauthVerify.set(state, {
					state, wiki: wiki.hostname, channel,
					user: interaction.user.id
				});
				interaction.client.shard.send({id: 'verifyUser', state});
				let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
					response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
					client_id: process.env[`oauth-${oauth}`], state
				}).toString();
				interaction.message.components = [];
				interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
					data: {
						type: 7,
						data: interaction.message
					}
				} ).catch(log_error);
				return interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
					data: {
						content: reply + lang.get('verify.oauth_message', '<' + oauthURL + '>'),
						allowed_mentions,
						components: [
							{
								type: 1,
								components: [
									{
										type: 2,
										style: 5,
										label: lang.get('verify.oauth_button'),
										emoji: {id: null, name: '🔗'},
										url: oauthURL,
										disabled: false
									}
								]
							}
						],
						flags: 64
					}
				} ).catch(log_error);
			}
		}

		interaction.message.components[0].components[0].disabled = true;
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 7,
				data: interaction.message
			}
		} ).then( () => {
			return channel.guild.members.fetch(interaction.user.id).then( member => {
				console.log( interaction.guild_id + ': Button: ' + interaction.data.custom_id + ' ' + username );
				return verify(lang, channel, member, username, wiki, rows).then( result => {
					if ( result.oauth ) {
						let state = `${result.oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
						while ( oauthVerify.has(state) ) {
							state = `${result.oauth} ${wiki.hostname} ${global.shardId}` + Date.now().toString(16) + randomBytes(16).toString('hex');
						}
						oauthVerify.set(state, {
							state, wiki: wiki.hostname, channel,
							user: interaction.user.id
						});
						interaction.client.shard.send({id: 'verifyUser', state});
						let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
							response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env[`oauth-${result.oauth}`], state
						}).toString();
						interaction.message.components = [];
						interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
							data: {
								type: 7,
								data: interaction.message
							}
						} ).catch(log_error);
						return interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
							data: {
								content: reply + lang.get('verify.oauth_message', '<' + oauthURL + '>'),
								allowed_mentions,
								components: [
									{
										type: 1,
										components: [
											{
												type: 2,
												style: 5,
												label: lang.get('verify.oauth_button'),
												emoji: {id: null, name: '🔗'},
												url: oauthURL,
												disabled: false
											}
										]
									}
								],
								flags: 64
							}
						} ).catch(log_error);
					}
					var message = {
						content: reply + result.content,
						embeds: [result.embed],
						allowed_mentions,
						components: []
					};
					if ( result.reaction ) {
						if ( result.reaction === 'nowiki' ) message.content = lang.get('interaction.nowiki');
						else message.content = reply + lang.get('verify.error_reply');
						message.embeds = [];
					}
					else if ( result.add_button ) message.components.push({
						type: 1,
						components: [
							{
								type: 2,
								style: 1,
								label: lang.get('verify.button_again'),
								emoji: {id: null, name: '🔂'},
								custom_id: 'verify_again',
								disabled: false
							}
						]
					});
					sendMessage(interaction, message, channel, false);
					if ( result.logging.channel && channel.guild.channels.cache.has(result.logging.channel) ) {
						let msg_url = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${interaction.message.id}`;
						if ( result.logging.embed ) result.logging.embed.addField(msg_url, '<#' + channel.id + '>');
						else result.logging.content += '\n<#' + channel.id + '> – <' + msg_url + '>';
						channel.guild.channels.cache.get(result.logging.channel).send(result.logging.content, {
							embed: result.logging.embed,
							allowedMentions: {parse: []}
						}).catch(log_error);
					}
					interaction.client.api.webhooks(interaction.application_id, interaction.token).post( {
						data: {
							content: message.content,
							embeds: message.embeds,
							allowed_mentions,
							components: [],
							flags: 64
						}
					} ).catch(log_error);
				}, error => {
					console.log( '- Error during the verifications: ' + error );
					return sendMessage(interaction, {
						content: reply + lang.get('verify.error_reply'),
						allowed_mentions
					}, channel);
				} );
			}, error => {
				console.log( '- Error while getting the member: ' + error );
				return sendMessage(interaction, {
					content: reply + lang.get('verify.error_reply'),
					allowed_mentions
				}, channel);
			} );
		}, log_error);
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {type: 6}
		} ).catch(log_error);
	} );
}

module.exports = {
	name: 'verify',
	run: slash_verify,
	button: button_verify
};
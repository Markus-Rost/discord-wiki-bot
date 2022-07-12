import { randomBytes } from 'node:crypto';
import { MessageActionRow, MessageButton, Permissions } from 'discord.js';
import db from '../util/database.js';
import verify from '../functions/verify.js';
import { got, oauthVerify, sendMessage } from '../util/functions.js';

/**
 * Wiki user verification.
 * @param {import('discord.js').ButtonInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function button_verify(interaction, lang, wiki) {
	var username = interaction.message?.embeds?.[0]?.title?.replace( /\\(\\)?/g, '$1' );
	if ( !username || !interaction.guild || !interaction.message.mentions?.users?.size ) {
		return interaction.update( {components: []} ).catch(log_error);
	}
	var userLang = lang.uselang(interaction.locale);
	if ( !interaction.message.mentions.users.has(interaction.user.id) ) {
		return interaction.reply( {content: userLang.get('verify.button_wrong_user', interaction.message.mentions.users.first().toString()), ephemeral: true} ).catch(log_error);
	}
	return db.query( 'SELECT logchannel, flags, onsuccess, onmatch, role, editcount, postcount, usergroup, accountage, rename FROM verification LEFT JOIN verifynotice ON verification.guild = verifynotice.guild WHERE verification.guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [interaction.guildId, '%|' + ( interaction.channel?.isThread() ? interaction.channel.parentId : interaction.channelId ) + '|%'] ).then( ({rows}) => {
		if ( !rows.length || !interaction.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES) ) return interaction.update( {components: []} ).catch(log_error);

		if ( wiki.hasOAuth2() && process.env.dashboard ) {
			let oauth = [wiki.hostname + wiki.pathname.slice(0, -1)];
			if ( wiki.wikifarm === 'wikimedia' ) oauth.push('wikimedia');
			if ( wiki.wikifarm === 'miraheze' ) oauth.push('miraheze');
			if ( process.env['oauth_' + ( oauth[1] || oauth[0] )] && process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret'] ) {
				console.log( interaction.guildId + ': Button: ' + interaction.customId + ': OAuth2' );
				return interaction.update( {components: [new MessageActionRow().addComponents(
					new MessageButton(interaction.message.components[0].components[0]).setDisabled()
				)]} ).then( () => {
					return db.query( 'SELECT token FROM oauthusers WHERE userid = $1 AND site = $2', [interaction.user.id, ( oauth[1] || oauth[0] )] ).then( ({rows: [row]}) => {
						if ( row?.token ) return got.post( wiki + 'rest.php/oauth2/access_token', {
							form: {
								grant_type: 'refresh_token',
								refresh_token: row.token,
								redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
								client_id: process.env['oauth_' + ( oauth[1] || oauth[0] )],
								client_secret: process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret']
							},
							context: {
								guildId: interaction.guildId
							}
						} ).then( response => {
							var body = response.body;
							if ( response.statusCode !== 200 || !body?.access_token ) {
								console.log( '- ' + response.statusCode + ': Error while refreshing the mediawiki token: ' + ( body?.message || body?.error ) );
								return Promise.reject(row);
							}
							if ( body?.refresh_token ) db.query( 'UPDATE oauthusers SET token = $1 WHERE userid = $2 AND site = $3', [body.refresh_token, interaction.user.id, ( oauth[1] || oauth[0] )] ).then( () => {
								console.log( '- OAuth2 token for ' + interaction.user.id + ' successfully updated.' );
							}, dberror => {
								console.log( '- Error while updating the OAuth2 token for ' + interaction.user.id + ': ' + dberror );
							} );
							return verifyOauthUser('', body.access_token, {
								wiki: wiki.href, channel: interaction.channel,
								user: interaction.user.id, interaction,
								fail: () => sendMessage(interaction, {components: []}, false)
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
							else if ( row.token ) db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [interaction.user.id, ( oauth[1] || oauth[0] )] ).then( () => {
								console.log( '- OAuth2 token for ' + interaction.user.id + ' successfully deleted.' );
							}, dberror => {
								console.log( '- Error while deleting the OAuth2 token for ' + interaction.user.id + ': ' + dberror );
							} );
						}
						let state = `${oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( oauth[1] ? ` ${oauth[1]}` : '' );
						while ( oauthVerify.has(state) ) {
							state = `${oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( oauth[1] ? ` ${oauth[1]}` : '' );
						}
						oauthVerify.set(state, {
							state, wiki: wiki.href, channel: interaction.channel,
							user: interaction.user.id, interaction
						});
						interaction.client.shard.send({id: 'verifyUser', state, user: ( row?.token === null ? '' : interaction.user.id )});
						let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
							response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env['oauth_' + ( oauth[1] || oauth[0] )], state
						}).toString();
						sendMessage(interaction, {components: []}, false);
						return interaction.followUp( {
							content: userLang.get('verify.oauth_message', '<' + oauthURL + '>'),
							components: [new MessageActionRow().addComponents(
								new MessageButton().setLabel(userLang.get('verify.oauth_button')).setEmoji('🔗').setStyle('LINK').setURL(oauthURL)
							)],
							ephemeral: true
						} ).catch(log_error);
					} );
				}, log_error );
			}
		}

		return interaction.update( {components: [new MessageActionRow().addComponents(
			new MessageButton(interaction.message.components[0].components[0]).setDisabled()
		)]} ).then( () => {
			console.log( interaction.guildId + ': Button: ' + interaction.customId + ' ' + username );
			return verify(lang, lang, interaction.channel, interaction.member, username, wiki, rows).then( result => {
				if ( result.oauth.length ) {
					return db.query( 'SELECT token FROM oauthusers WHERE userid = $1 AND site = $2', [interaction.user.id, ( result.oauth[1] || result.oauth[0] )] ).then( ({rows: [row]}) => {
						if ( row?.token ) return got.post( wiki + 'rest.php/oauth2/access_token', {
							form: {
								grant_type: 'refresh_token',
								refresh_token: row.token,
								redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
								client_id: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] )],
								client_secret: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] ) + '_secret']
							},
							context: {
								guildId: interaction.guildId
							}
						} ).then( response => {
							var body = response.body;
							if ( response.statusCode !== 200 || !body?.access_token ) {
								console.log( '- ' + response.statusCode + ': Error while refreshing the mediawiki token: ' + ( body?.message || body?.error ) );
								return Promise.reject(row);
							}
							if ( body?.refresh_token ) db.query( 'UPDATE oauthusers SET token = $1 WHERE userid = $2 AND site = $3', [body.refresh_token, interaction.user.id, ( result.oauth[1] || result.oauth[0] )] ).then( () => {
								console.log( '- OAuth2 token for ' + interaction.user.id + ' successfully updated.' );
							}, dberror => {
								console.log( '- Error while updating the OAuth2 token for ' + interaction.user.id + ': ' + dberror );
							} );
							return verifyOauthUser('', body.access_token, {
								wiki: wiki.href, channel: interaction.channel,
								user: interaction.user.id, interaction,
								fail: () => sendMessage(interaction, {components: []}, false)
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
							else if ( row.token ) db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [interaction.user.id, ( result.oauth[1] || result.oauth[0] )] ).then( () => {
								console.log( '- OAuth2 token for ' + interaction.user.id + ' successfully deleted.' );
							}, dberror => {
								console.log( '- Error while deleting the OAuth2 token for ' + interaction.user.id + ': ' + dberror );
							} );
						}
						let state = `${result.oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( result.oauth[1] ? ` ${result.oauth[1]}` : '' );
						while ( oauthVerify.has(state) ) {
							state = `${result.oauth[0]} ${process.env.SHARDS}` + Date.now().toString(16) + randomBytes(16).toString('hex') + ( result.oauth[1] ? ` ${result.oauth[1]}` : '' );
						}
						oauthVerify.set(state, {
							state, wiki: wiki.href, channel: interaction.channel,
							user: interaction.user.id, interaction
						});
						interaction.client.shard.send({id: 'verifyUser', state, user: ( row?.token === null ? '' : interaction.user.id )});
						let oauthURL = wiki + 'rest.php/oauth2/authorize?' + new URLSearchParams({
							response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
							client_id: process.env['oauth_' + ( result.oauth[1] || result.oauth[0] )], state
						}).toString();
						sendMessage(interaction, {components: []}, false);
						return interaction.followUp( {
							content: userLang.get('verify.oauth_message', '<' + oauthURL + '>'),
							components: [new MessageActionRow().addComponents(
								new MessageButton().setLabel(userLang.get('verify.oauth_button')).setEmoji('🔗').setStyle('LINK').setURL(oauthURL)
							)],
							ephemeral: true
						} ).catch(log_error);
					} );
				}
				var message = {
					content: interaction.member.toString() + ', ' + result.content,
					embeds: [result.embed],
					components: [],
					allowedMentions: {
						users: [interaction.user.id],
						repliedUser: true
					}
				};
				if ( result.reaction ) {
					if ( result.reaction === 'nowiki' ) message.content = lang.get('interaction.nowiki');
					else message.content = lang.get('verify.error_reply');
					message.embeds = [];
				}
				else if ( result.add_button ) message.components.push(new MessageActionRow().addComponents(
					new MessageButton().setLabel(lang.get('verify.button_again')).setEmoji('🔂').setStyle('PRIMARY').setCustomId('verify_again')
				));
				sendMessage(interaction, message, false);
				if ( result.logging.channel && interaction.guild.channels.cache.has(result.logging.channel) ) {
					if ( result.logging.embed ) result.logging.embed.addField(interaction.message.url, '<#' + interaction.channelId + '>');
					else result.logging.content += '\n<#' + interaction.channelId + '> – <' + interaction.message.url + '>';
					interaction.guild.channels.cache.get(result.logging.channel).send( {
						content: result.logging.content,
						embeds: ( result.logging.embed ? [result.logging.embed] : [] )
					} ).catch(log_error);
				}
				interaction.followUp( {
					content: message.content,
					embeds: message.embeds,
					components: [],
					ephemeral: true
				} ).catch(log_error);
			}, error => {
				console.log( '- Error during the verifications: ' + error );
				return sendMessage(interaction, {components: []});
			} );
		}, log_error);
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		return interaction.reply( {content: userLang.get('verify.error_reply'), ephemeral: true} ).catch(log_error);
	} );
}

export default {
	name: 'verify_again',
	button: button_verify
};
import { randomBytes } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, PermissionFlagsBits, ButtonStyle, TextInputStyle } from 'discord.js';
import { inputToWikiProject } from 'mediawiki-projects-list';
import db from '../util/database.js';
import user_interaction from './user.js';
import verify from '../functions/verify.js';
import { got, oauthVerify, sendMessage } from '../util/functions.js';

/**
 * Wiki user verification.
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ButtonInteraction|import('discord.js').ModalSubmitInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function interaction_verify(interaction, lang, wiki) {
	var loggingLang = lang;
	var userLang = lang.uselang(interaction.locale);
	if ( !interaction.guild ) return interaction.reply( {content: userLang.get('verify.missing'), ephemeral: true} ).catch(log_error);
	if ( !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ) {
		console.log( interaction.guildId + ': Missing permissions - ManageRoles' );
		return interaction.reply( {content: userLang.get('general.missingperm') + ' `ManageRoles`', ephemeral: true} ).catch(log_error);
	}
	
	return db.query( 'SELECT logchannel, flags, onsuccess, onmatch, role, editcount, postcount, usergroup, accountage, rename FROM verification LEFT JOIN verifynotice ON verification.guild = verifynotice.guild WHERE verification.guild = $1 AND channel LIKE $2 ORDER BY configid ASC', [interaction.guildId, '%|' + ( interaction.channel?.isThread() ? interaction.channel.parentId : interaction.channelId ) + '|%'] ).then( ({rows}) => {
		if ( !rows.length ) return interaction.reply( {content: userLang.get('verify.missing') + ( interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) && process.env.dashboard ? '\n' + new URL(`/guild/${interaction.guildId}/verification`, process.env.dashboard).href : '' ), ephemeral: true} ).catch(log_error);

		let isEphemeral = ( (rows[0].flags & 1 << 0) === 1 << 0 );
		if ( isEphemeral ) lang = userLang;

		if ( wiki.hasOAuth2() && process.env.dashboard ) {
			let oauth = [wiki.hostname + wiki.pathname.slice(0, -1)];
			if ( wiki.wikifarm === 'wikimedia' ) oauth.push('wikimedia');
			else if ( wiki.wikifarm === 'miraheze' ) oauth.push('miraheze');
			else {
				let project = inputToWikiProject(wiki.href)
				if ( project ) oauth.push(project.wikiProject.name);
			}
			if ( process.env['oauth_' + ( oauth[1] || oauth[0] )] && process.env['oauth_' + ( oauth[1] || oauth[0] ) + '_secret'] ) {
				return interaction.deferReply( {ephemeral: isEphemeral} ).then( () => {
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
								fail: () => sendMessage(interaction, lang.get('verify.error_reply'), true)
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
						let message = {
							content: userLang.get('verify.oauth_message', '<' + oauthURL + '>'),
							components: [new ActionRowBuilder().addComponents(
								new ButtonBuilder().setLabel(userLang.get('verify.oauth_button')).setEmoji(WB_EMOJI.link).setStyle(ButtonStyle.Link).setURL(oauthURL)
							)],
							ephemeral: true
						};
						if ( (rows[0].flags & 1 << 0) === 1 << 0 ) return sendMessage(interaction, message);
						return interaction.deleteReply().then( () => {
							return interaction.followUp( message ).catch(log_error);
						}, log_error );
					} );
				}, log_error );
			}
		}
		
		var username = '';
		if ( interaction.isChatInputCommand() ) username = interaction.options.getString('username') ?? '';
		else if ( interaction.isModalSubmit() ) username = interaction.fields.getTextInputValue('username') ?? '';
		username = username.replace( /^\s*<@!?(\d+)>\s*$/, (mention, id) => {
			if ( id === interaction.user.id ) {
				return interaction.member.displayName;
			}
			let member = interaction.guild.members.cache.get(id);
			if ( member ) return member.displayName;
			else {
				let user = interaction.client.users.cache.get(id);
				if ( user ) return user.username;
			}
			return mention;
		} ).replaceAll( wiki.spaceReplacement ?? '_', ' ' ).trim().replace( /^<\s*(.*)\s*>$/, '$1' ).split('#')[0].substring(0, 250).trim();
		
		if ( /^(?:https?:)?\/\//.test(username) ) {
			try {
				let link = new URL(username, wiki);
				if ( wiki.articleURL.search.includes( '$1' ) ) wiki.articleURL.searchParams.forEach( (value, key) => {
					if ( value === '$1' && link.searchParams.has(key) ) username = link.searchParams.get(key);
				} );
				else username = decodeURIComponent( link.pathname.replace( wiki.articleURL.pathname.split('$1')[0], '' ) );
			}
			catch {}
		}
		if ( wiki.wikifarm === 'fandom' ) {
			username = username.replace( /^(?:\/verify username:\s*|userprofile\s*:\s*|special:verifyuser\/)/i, '' );
		}
		
		if ( !username.trim() ) {
			if ( interaction.isModalSubmit() ) return interaction.reply( {content: userLang.get('interaction.verify'), ephemeral: true} ).catch(log_error);
			return interaction.showModal( new ModalBuilder().setCustomId('verify').setTitle(userLang.get('verify.title')).addComponents(new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId('username').setLabel(userLang.get('verify.username')).setPlaceholder(userLang.get('verify.placeholder')).setStyle(TextInputStyle.Short).setRequired().setMinLength(1).setMaxLength(500)
			)) ).catch(log_error);
		}

		return interaction.deferReply( {ephemeral: isEphemeral} ).then( () => {
			return verify(lang, loggingLang, interaction.channel, interaction.member, username, wiki, rows).then( result => {
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
								fail: () => sendMessage(interaction, lang.get('verify.error_reply'), true)
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
						let message = {
							content: userLang.get('verify.oauth_message', '<' + oauthURL + '>'),
							components: [new ActionRowBuilder().addComponents(
								new ButtonBuilder().setLabel(userLang.get('verify.oauth_button')).setEmoji(WB_EMOJI.link).setStyle(ButtonStyle.Link).setURL(oauthURL)
							)],
							ephemeral: true
						}
						if ( result.send_private ) return sendMessage(interaction, message);
						return interaction.deleteReply().then( () => {
							return interaction.followUp( message ).catch(log_error);
						}, log_error );
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
					if ( result.reaction === WB_EMOJI.nowiki ) message.content = lang.get('interaction.nowiki');
					else message.content = lang.get('verify.error_reply');
					message.embeds = [];
				}
				else if ( result.add_button && !result.send_private ) message.components.push(new ActionRowBuilder().addComponents(
					new ButtonBuilder().setLabel(lang.get('verify.button_again')).setEmoji(WB_EMOJI.again).setStyle(ButtonStyle.Primary).setCustomId('verify_again')
				));
				return sendMessage(interaction, message).then( msg => {
					if ( !result.logging.channel || !interaction.guild.channels.cache.has(result.logging.channel) ) return;
					if ( msg && !result.send_private ) {
						if ( result.logging.embed ) result.logging.embed.addFields( {name: msg.url, value: '<#' + interaction.channelId + '>'} );
						else result.logging.content += '\n<#' + interaction.channelId + '> – <' + msg.url + '>';
					}
					interaction.guild.channels.cache.get(result.logging.channel).send( {
						content: result.logging.content,
						embeds: ( result.logging.embed ? [result.logging.embed] : [] )
					} ).catch(log_error);
				} );
			}, error => {
				console.log( '- Error during the verifications: ' + error );
				return sendMessage(interaction, lang.get('verify.error_reply'), true);
			} );
		}, log_error );
	}, dberror => {
		console.log( '- Error while getting the verifications: ' + dberror );
		return interaction.reply( {content: userLang.get('verify.error_reply'), ephemeral: true} ).catch(log_error);
	} );
}

export default {
	name: 'verify',
	slash: interaction_verify,
	modal: interaction_verify,
	button: interaction_verify,
	autocomplete: user_interaction.autocomplete,
	allowDelete: false
};
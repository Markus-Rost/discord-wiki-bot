var db = require('../util/database.js');
var verify = require('../functions/verify.js');
const {sendMessage} = require('../util/functions.js');

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
	console.log( interaction.guild_id + ': Slash: /' + interaction.data.name + ' ' + interaction.data.options?.[0]?.value );
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
					content: reply + lang.get('verify.missing') + ( interaction.member.permissions.has('MANAGE_GUILD') ? '\n' + new URL(`/guild/${interaction.guild_id}/verification`, process.env.dashboard).href : '' ),
					allowed_mentions,
					flags: 64
				}
			}
		} ).catch(log_error);
		
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
		interaction.message.components[0].components[0].disabled = true;
		return interaction.client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 7,
				data: interaction.message
			}
		} ).then( () => {
			return channel.guild.members.fetch(interaction.user.id).then( member => {
				var username = interaction.message.embeds[0].title;
				console.log( interaction.guild_id + ': Button: ' + interaction.data.custom_id + ' ' + username );
				return verify(lang, channel, member, username, wiki, rows).then( result => {
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
		} ).catch(log_error);
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
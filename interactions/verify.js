var db = require('../util/database.js');
var verify = require('../functions/verify.js');
const {sendMessage} = require('../util/functions.js');

/**
 * Post a message with inline wiki links.
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
				} ).replace( /_/g, ' ' ).trim().replace( /^<\s*(.*)\s*>$/, '$1' ).split('#')[0].substring(0, 250).trim();
				if ( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/.test(username) ) {
					username = decodeURIComponent( username.replace( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.(?:gamepedia\.com\/|(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?(?:wiki\/)?)/, '' ) );
				}
				if ( wiki.isGamepedia() ) username = username.replace( /^userprofile\s*:\s*/i, '' );
				
				if ( !username.trim() ) return sendMessage(interaction, {
					content: lang.get('interaction.verify'),
					allowed_mentions
				}, channel);

				return verify(lang, channel, member, username, wiki, rows).then( result => {
					var message = {
						content: reply + result.content,
						embeds: [result.embed],
						allowed_mentions
					};
					if ( result.reaction ) {
						if ( result.reaction === 'nowiki' ) message.content = lang.get('interaction.nowiki');
						else message.content = reply + lang.get('verify.error_reply');
						message.embeds = [];
					}
					return sendMessage(interaction, message);
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

module.exports = {
	name: 'verify',
	run: slash_verify
};
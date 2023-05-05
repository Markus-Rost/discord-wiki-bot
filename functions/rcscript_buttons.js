import { existsSync } from 'node:fs';
import gotDefault from 'got';
const got = gotDefault.extend( {
	throwHttpErrors: true,
	timeout: {
		request: 5_000
	},
	headers: {
		'user-agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ( process.env.invite ? '; ' + process.env.invite : '' ) + ')'
	},
	responseType: 'json'
} );

const buttonsExists = existsSync('./RcGcDw_buttons/main.js');

/**
 * @param {import('discord.js').ButtonInteraction<'cached'|'raw'>} interaction
*/
function rcscript_buttons(interaction) {
	got.post( 'http://localhost:8000/interactions', {
		json: {
			version: interaction.version,
			type: interaction.type,
			id: interaction.id,
			token: interaction.token,
			application_id: interaction.applicationId,
			guild_id: interaction.guildId,
			channel_id: interaction.channelId,
			app_permissions: interaction.appPermissions,
			locale: interaction.locale,
			guild_locale: interaction.guildLocale,
			data: {
				custom_id: interaction.customId.replace( 'rc_', '' ),
				component_type: interaction.componentType
			},
			message: ( interaction.message ? {
				id: interaction.message.id,
				content: interaction.message.content,
				embeds: interaction.message.embeds,
				components: interaction.message.components
			} : null ),
			member: {
				user: {
					id: interaction.user.id,
				},
			}
		},
		headers: {
			authorization: process.env.buttons_token
		}
	} ).then( response => {
		if ( response.body.result !== 'Success' ) console.log( '- RcGcDw buttons: ' + response.statusCode + ': Error while sending the interaction.' );
	}, error => {
		console.log( '- RcGcDw buttons: Error while sending the interaction: ' + error );
	} );
}

export default ( buttonsExists ? rcscript_buttons : () => {} );
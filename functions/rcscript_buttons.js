import { existsSync } from 'node:fs';
import gotDefault from 'got';
const got = gotDefault.extend( {
	throwHttpErrors: true,
	timeout: {
		request: 3_000
	},
	headers: {
		'user-agent': 'Wiki-Bot/internal'
	},
	responseType: 'json'
} );

const buttonsExists = ( process.env.buttons_token && process.env.buttons_url && existsSync('./RcGcDw_buttons/main.js') );

/**
 * @param {import('discord.js').ButtonInteraction<'cached'|'raw'>|import('discord.js').ModalSubmitInteraction<'cached'|'raw'>} interaction
*/
function rcscript_buttons(interaction) {
	got.post( process.env.buttons_url, {
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
				component_type: interaction.componentType,
				components: interaction.components?.map( row => {
					return {
						type: row.type,
						components: row.components.map( component => {
							return {
								type: component.type,
								value: component.value,
								custom_id: component.customId
							};
						} )
					};
				} )
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
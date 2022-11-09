import { PermissionFlagsBits } from 'discord.js';
import { got, isMessage, canShowEmbed, sendMessage } from '../util/functions.js';
import interwiki_interaction from './interwiki.js';
import wiki_user from '../cmds/wiki/user.js';

/**
 * Post a message with random link.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_user(interaction, lang, wiki) {
	var username = interaction.options.getString('username')?.trim();
	if ( !username ) {
		return interaction.reply( {
			content: lang.uselang(interaction.locale).get('interaction.user'),
			ephemeral: true
		} ).catch(log_error);
	}
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki')?.trim() || wiki).then( newWiki => {
		var ephemeral = ( interaction.options.getBoolean('private') ?? false ) || pausedGuilds.has(interaction.guildId);
		var noEmbed = interaction.options.getBoolean('noembed') || !canShowEmbed(interaction);
		var spoiler = interaction.options.getBoolean('spoiler') ? '||' : '';
		if ( ephemeral ) lang = lang.uselang(interaction.locale);
		return interaction.deferReply( {ephemeral} ).then( () => {
			var isIP = /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username);
			if ( username.includes( '/' ) && !isIP ) username = username.split('/')[0];
			return got.get( newWiki + 'api.php?uselang=' + lang.lang + '&action=query&meta=siteinfo&siprop=general|namespaces|namespacealiases|specialpagealiases&prop=info|pageprops|pageimages|extracts&piprop=original|name&ppprop=description|displaytitle|page_image_free&explaintext=true&exsectionformat=raw&exlimit=1&converttitles=true&titles=%1FUser:' + encodeURIComponent( username.replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
				context: {
					guildId: interaction.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query.pages ) {
					if ( newWiki.noWiki(response.url, response.statusCode) ) {
						console.log( '- This wiki doesn\'t exist!' );
						return {reaction: 'nowiki'};
					}
					console.log( '- ' + response.statusCode + ': Error while getting the user page: ' + body?.error?.info );
					return {
						reaction: 'error',
						message: spoiler + '<' + newWiki.toLink( ( newWiki.namespaces.get(2)?.name ?? 'User' ) + ':' + username ) + '>' + spoiler
					};
				}
				newWiki.updateWiki(body.query.general, Object.values(body.query.namespaces), body.query.namespacealiases);
				var querypage = Object.values(body.query.pages)[0];
				querypage.uselang = lang.lang;
				querypage.noRedirect = true;
				var contribs = newWiki.namespaces.get(-1).name + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
				var userparts = querypage.title.split(':');
				var namespace = userparts[0] + ':';
				username = userparts.slice(1).join(':');
				return wiki_user(lang, interaction, ( isIP ? contribs : namespace ), username, newWiki, new URLSearchParams(), '', querypage, contribs, undefined, spoiler, noEmbed);
			}, error => {
				if ( newWiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					return {reaction: 'nowiki'};
				}
				console.log( '- Error while getting the user page: ' + error );
				return {
					reaction: 'error',
					message: spoiler + '<' + newWiki.toLink( ( newWiki.namespaces.get(2)?.name ?? 'User' ) + ':' + username ) + '>' + spoiler
				};
			} ).then( result => {
				if ( !result || isMessage(result) ) return result;
				let noEmoji = !interaction.appPermissions?.has(PermissionFlagsBits.UseExternalEmojis);
				if ( result.message ) {
					if ( Array.isArray(result.message) ) {
						let list = [];
						return result.message.slice(1).reduce( (prev, content) => {
							return prev.then( message => {
								list.push(message);
								return interaction.followUp( {content, ephemeral} ).catch(log_error);
							} );
						}, sendMessage(interaction, {
							content: result.message[0],
							ephemeral
						}) ).then( message => {
							list.push(message);
							return list;
						} );
					}
					if ( result.reaction === 'error' ) {
						if ( typeof result.message === 'string' ) result.message = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + result.message;
						else result.message.content = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + ( result.message.content ?? '' );
					}
					else if ( result.reaction === 'warning' ) {
						if ( typeof result.message === 'string' ) result.message = '⚠️ ' + result.message;
						else result.message.content = '⚠️ ' + ( result.message.content ?? '' );
					}
					return sendMessage(interaction, result.message);
				}
				else if ( result.reaction ) {
					let message = ( noEmoji ? '⚠️ ' : '<:error:440871715938238494> ' ) + lang.get('interaction.error') + '\n' + process.env.invite;
					if ( result.reaction === 'nowiki' ) message = ( noEmoji ? '⚠️ ' : '<:unknown_wiki:505884572001763348> ' ) + lang.get('interaction.nowiki');
					if ( result.reaction === '🤷' ) message = '🤷 ' + lang.get('search.noresult');
					return sendMessage(interaction, {content: message});
				}
			} );
		}, log_error );
	}, () => {
		return interaction.reply( {
			content: lang.uselang(interaction.locale).get('interaction.interwiki'),
			ephemeral: true
		} ).catch(log_error);
	} );
}

/**
 * Autocomplete a username.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_user(interaction, lang, wiki) {
	lang = lang.uselang(interaction.locale);
	const focused = interaction.options.getFocused(true);
	if ( focused.name !== 'username' ) return interwiki_interaction.autocomplete(interaction, lang, wiki);
	return interwiki_interaction.FUNCTIONS.getWiki(interaction.options.getString('wiki') ?? wiki).then( newWiki => {
		const includeIPs = interaction.commandName !== 'verify';
		const username = focused.value.trim() + ( focused.value.endsWith( ' ' ) ? ' ' : '' );
		return Promise.all([
			( newWiki.wikifarm === 'fandom' && username.trim() ? got.get( newWiki + 'wikia.php?controller=UserApiController&method=getUsersByName&limit=25&query=' + encodeURIComponent( username ) + '&format=json', {
				timeout: {
					request: ( includeIPs ? 1_500 : 2_000 )
				},
				retry: {
					limit: 0
				},
				context: {
					guildId: interaction.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( response.statusCode !== 200 || body?.exception || body?.error || !body?.users ) {
					if ( newWiki.noWiki(response.url, response.statusCode) ) return Promise.reject('nowiki');
					console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
						return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
					} ).map( option => {
						if ( option.options !== undefined ) return option.name;
						return option.name + ':' + option.value;
					} ).join(' ') + '\n- ' + response.statusCode + ': Error while searching for users: ' + ( body?.exception?.details || body?.details || body?.error ) );
					return;
				}
				return body.users.map( user => user.name );
			}, error => {
				if ( error.name === 'TimeoutError' ) return;
				if ( newWiki.noWiki(error.message) ) return Promise.reject('nowiki');
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
					return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
				} ).map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- Error while searching for users: ' + error );
			} ) : ( !username.trim() ? got.get( newWiki + 'api.php?action=query&list=users&ususers=%1F' + encodeURIComponent( ( interaction.member?.displayName || interaction.user.username ).replaceAll( '\x1F', '\ufffd' ) ) + '&format=json', {
				timeout: {
					request: ( includeIPs ? 1_500 : 2_000 )
				},
				retry: {
					limit: 0
				},
				context: {
					guildId: interaction.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.users?.[0] ) {
					if ( newWiki.noWiki(response.url, response.statusCode) ) return Promise.reject('nowiki');
					console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
						return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
					} ).map( option => {
						if ( option.options !== undefined ) return option.name;
						return option.name + ':' + option.value;
					} ).join(' ') + '\n- ' + response.statusCode + ': Error while searching for the nickname: ' + body?.error?.info );
					return;
				}
				let queryuser = body.query.users[0];
				if ( queryuser.missing !== undefined || queryuser.invalid !== undefined ) {
					return ( includeIPs ? undefined : [] );
				}
				return [queryuser.name];
			}, error => {
				if ( error.name === 'TimeoutError' ) return;
				if ( newWiki.noWiki(error.message) ) return Promise.reject('nowiki');
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
					return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
				} ).map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- Error while searching for the nickname: ' + error );
			} ) : undefined ) ),
			( includeIPs || ( username.trim() && newWiki.wikifarm !== 'fandom' ) ? got.get( newWiki + 'api.php?action=query&list=' + ( username.trim() ? ( newWiki.wikifarm === 'fandom' ? 'usercontribs&ucprop=&uclimit=100&ucuserprefix=' : 'allusers' + ( includeIPs ? '|usercontribs&ucprop=&uclimit=100&ucuserprefix=' + encodeURIComponent( username ) : '' ) + '&auprop=editcount&aulimit=25&auprefix=' ) : 'allusers&auwitheditsonly=1&auactiveusers=1&auprop=editcount&aulimit=25&auprefix=' ) + encodeURIComponent( username ) + '&format=json', {
				timeout: {
					request: ( !username.trim() || newWiki.wikifarm === 'fandom' ? 1_500 : 2_000 )
				},
				retry: {
					limit: 0
				},
				context: {
					guildId: interaction.guildId
				}
			} ).then( response => {
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query ) {
					if ( newWiki.noWiki(response.url, response.statusCode) ) return Promise.reject('nowiki');
					console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
						return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
					} ).map( option => {
						if ( option.options !== undefined ) return option.name;
						return option.name + ':' + option.value;
					} ).join(' ') + '\n- ' + response.statusCode + ': Error while searching for users: ' + body?.error?.info );
					return;
				}
				return [
					...( body.query.allusers?.sort( (a, b) => {
						return b.recentactions - a.recentactions || b.editcount - a.editcount;
					} ).map( user => user.name ) ?? [] ),
					...( body.query.usercontribs?.map( contrib => contrib.user ) ?? [] )
				];
			}, error => {
				if ( error.name === 'TimeoutError' ) return;
				if ( newWiki.noWiki(error.message) ) return Promise.reject('nowiki');
				console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
					return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
				} ).map( option => {
					if ( option.options !== undefined ) return option.name;
					return option.name + ':' + option.value;
				} ).join(' ') + '\n- Error while searching for users: ' + error );
			} ) : undefined )
		]).then( ([users, ips]) => {
			if ( !users && !ips ) return;
			return interaction.respond( [...new Set([
				...( users ?? [] ),
				...( ips ?? [] )
			])].map( user => {
				return {
					name: user.substring(0, 100),
					value: user.substring(0, 100)
				};
			} ).slice(0, 25) ).catch(log_error);
		}, error => {
			if ( error === 'nowiki' ) {
				return interaction.respond( [{
					name: lang.get('interaction.nowiki'),
					value: ''
				}] ).catch(log_error);
			}
			console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Autocomplete: /' + interaction.commandName + ' ' + interaction.options.data.flatMap( option => {
				return [option, ...( option.options?.flatMap( option => [option, ...( option.options ?? [] )] ) ?? [] )];
			} ).map( option => {
				if ( option.options !== undefined ) return option.name;
				return option.name + ':' + option.value;
			} ).join(' ') + '\n- Error while searching for users: ' + error );
		} );
	}, () => {
		return interaction.respond( [{
			name: lang.get('interaction.interwiki'),
			value: ''
		}] ).catch(log_error);
	} );
}

export default {
	name: 'user',
	slash: slash_user,
	autocomplete: autocomplete_user,
	allowDelete: true
};
import { load as cheerioLoad } from 'cheerio';
import { got, isMessage, canShowEmbed, escapeFormatting } from '../util/functions.js';

/**
 * Add global blocks to user messages.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {String} username - The name of the user.
 * @param {String} text - The text of the response.
 * @param {import('discord.js').EmbedBuilder} embed - The embed for the page.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the page.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {String} [gender] - The gender of the user.
 * @param {String} [isGlobalBlocked] - If the user is globally blocked.
 * @returns {Promise<import('discord.js').Message|{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>} The edited message.
 */
export default function global_block(lang, msg, username, text, embed, wiki, spoiler, gender, isGlobalBlocked) {
	if ( !msg || !msg.inGuild() || !patreonGuildsPrefix.has(msg.guildId) || wiki.wikifarm !== 'fandom' ) return;
	if ( embed && !canShowEmbed(msg) ) embed = null;
	
	var isUser = true;
	if ( !gender ) {
		isUser = false;
		gender = 'unknown';
	}
	
	if ( isMessage(msg) ) {
		if ( embed ) {
			embed.spliceFields( -1, 1 );
			if ( isGlobalBlocked ) embed.spliceFields( -1, 1 );
		}
		else {
			let splittext = text.split('\n\n');
			splittext.pop();
			if ( isGlobalBlocked ) splittext.pop();
			text = splittext.join('\n\n');
		}
	}
	
	return Promise.all([
		got.get( 'https://community.fandom.com/wiki/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1', {
			responseType: 'text',
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body ) {
				console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
			}
			else {
				let $ = cheerioLoad(body, {baseURI: response.url});
				if ( $('#mw-content-text .userprofile.mw-warning-with-logexcerpt').length ) {
					if ( embed ) embed.addFields( {name: '\u200b', value: '**' + lang.get('user.gblock.header', FIRST_STRONG_ISOLATE + escapeFormatting(username) + POP_DIRECTIONAL_ISOLATE, gender) + '**'} );
					else text += '\n\n**' + lang.get('user.gblock.header', FIRST_STRONG_ISOLATE + escapeFormatting(username) + POP_DIRECTIONAL_ISOLATE, gender) + '**';
				}
				if ( $('#mw-content-text .errorbox').length ) {
					if ( embed ) embed.addFields( {name: '\u200b', value: '**' + lang.get('user.gblock.disabled') + '**'} );
					else text += '\n\n**' + lang.get('user.gblock.disabled') + '**';
				}
			}
		}, error => {
			console.log( '- Error while getting the global block: ' + error );
		} ),
		( isUser && wiki.isGamepedia() ? got.get( 'https://help.fandom.com/wiki/UserProfile:' + encodeURIComponent( username ) + '?cache=' + Date.now(), {
			responseType: 'text',
			context: {
				guildId: msg.guildId
			}
		} ).then( gresponse => {
			var gbody = gresponse.body;
			if ( gresponse.statusCode !== 200 || !gbody ) {
				console.log( '- ' + gresponse.statusCode + ': Error while getting the global edit count.' );
			}
			else {
				let $ = cheerioLoad(gbody, {baseURI: gresponse.url});
				var wikisedited = $('.curseprofile .rightcolumn .section.stats dd').eq(0).prop('innerText').replace( /[,\.]/g, '' );
				if ( wikisedited ) {
					wikisedited = parseInt(wikisedited, 10).toLocaleString(lang.get('dateformat'));
					if ( embed ) embed.spliceFields(1, 0, {
						name: lang.get('user.info.wikisedited'),
						value: wikisedited,
						inline: true
					});
					else {
						let splittext = text.split('\n');
						splittext.splice(5, 0, lang.get('user.info.wikisedited') + ' ' + wikisedited);
						text = splittext.join('\n');
					}
				}
				var globaledits = $('.curseprofile .rightcolumn .section.stats dd').eq(2).prop('innerText').replace( /[,\.]/g, '' );
				if ( globaledits ) {
					globaledits = parseInt(globaledits, 10).toLocaleString(lang.get('dateformat'));
					if ( embed ) embed.spliceFields(1, 0, {
						name: lang.get('user.info.globaleditcount'),
						value: globaledits,
						inline: true
					});
					else {
						let splittext = text.split('\n');
						splittext.splice(5, 0, lang.get('user.info.globaleditcount') + ' ' + globaledits);
						text = splittext.join('\n');
					}
				}
				if ( embed ) {
					let avatar = $('.curseprofile .mainavatar img').prop('src');
					if ( avatar ) {
						embed.setThumbnail( avatar.replace( /^(?:https?:)?\/\//, 'https://' ).replace( '?d=mm&s=96', '?d=' + encodeURIComponent( embed.data.thumbnail?.url || '404' ) ) );
					}
				}
			}
		}, error => {
			console.log( '- Error while getting the global edit count: ' + error );
		} ) : undefined )
	]).then( () => {
		var content = spoiler + text + spoiler;
		var embeds = [];
		if ( embed ) embeds.push(embed);
		if ( isMessage(msg) ) return msg.edit( {content, embeds} ).catch(log_error);
		else return {message: {content, embeds}};
	} );
}
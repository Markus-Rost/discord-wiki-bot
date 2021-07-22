const cheerio = require('cheerio');
const {escapeFormatting} = require('../util/functions.js');

/**
 * Add global blocks to user messages.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} username - The name of the user.
 * @param {String} text - The text of the response.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the page.
 * @param {import('../util/wiki.js')} wiki - The wiki for the page.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {String} [gender] - The gender of the user.
 */
function global_block(lang, msg, username, text, embed, wiki, spoiler, gender) {
	if ( !msg || !msg.channel.isGuild() || !patreons[msg.guild?.id] || !wiki.isFandom() ) return;
	
	var isUser = true;
	if ( !gender ) {
		isUser = false;
		gender = 'unknown';
	}
	
	if ( embed && msg.showEmbed() ) embed.fields.pop();
	else {
		let splittext = text.split('\n\n');
		splittext.pop();
		text = splittext.join('\n\n');
	}
	
	Promise.all([
		got.get( 'https://community.fandom.com/wiki/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1', {
			responseType: 'text'
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body ) {
				console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
			}
			else {
				let $ = cheerio.load(body);
				if ( $('#mw-content-text .errorbox').length ) {
					if ( embed && msg.showEmbed() ) embed.addField( '\u200b', '**' + lang.get('user.gblock.disabled') + '**' );
					else text += '\n\n**' + lang.get('user.gblock.disabled') + '**';
				}
				else if ( $('#mw-content-text .userprofile.mw-warning-with-logexcerpt').length ) {
					if ( embed && msg.showEmbed() ) embed.addField( '\u200b', '**' + lang.get('user.gblock.header', escapeFormatting(username), gender) + '**' );
					else text += '\n\n**' + lang.get('user.gblock.header', escapeFormatting(username), gender) + '**';
				}
			}
		}, error => {
			console.log( '- Error while getting the global block: ' + error );
		} ),
		( isUser && wiki.isGamepedia() ? got.get( 'https://help.fandom.com/wiki/UserProfile:' + encodeURIComponent( username ) + '?cache=' + Date.now(), {
			responseType: 'text'
		} ).then( gresponse => {
			var gbody = gresponse.body;
			if ( gresponse.statusCode !== 200 || !gbody ) {
				console.log( '- ' + gresponse.statusCode + ': Error while getting the global edit count.' );
			}
			else {
				let $ = cheerio.load(gbody);
				var wikisedited = $('.curseprofile .rightcolumn .section.stats dd').eq(0).text().replace( /[,\.]/g, '' );
				if ( wikisedited ) {
					wikisedited = parseInt(wikisedited, 10).toLocaleString(lang.get('dateformat'));
					if ( embed && msg.showEmbed() ) embed.spliceFields(1, 0, {
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
				var globaledits = $('.curseprofile .rightcolumn .section.stats dd').eq(2).text().replace( /[,\.]/g, '' );
				if ( globaledits ) {
					globaledits = parseInt(globaledits, 10).toLocaleString(lang.get('dateformat'));
					if ( embed && msg.showEmbed() ) embed.spliceFields(1, 0, {
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
				if ( embed && msg.showEmbed() ) {
					let avatar = $('.curseprofile .mainavatar img').prop('src');
					if ( avatar ) {
						embed.setThumbnail( avatar.replace( /^(?:https?:)?\/\//, 'https://' ).replace( '?d=mm&s=96', '?d=' + encodeURIComponent( embed?.thumbnail?.url || '404' ) ) );
					}
				}
			}
		}, error => {
			console.log( '- Error while getting the global edit count: ' + error );
		} ) : undefined )
	]).finally( () => {
		msg.edit( spoiler + text + spoiler, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
	} );
}

module.exports = global_block;
const cheerio = require('cheerio');
const {timeoptions} = require('../util/default.json');

/**
 * Add global blocks to user messages.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} username - The name of the user.
 * @param {String} text - The text of the response.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the page.
 * @param {String} wiki - The wiki for the page.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {String} [gender] - The gender of the user.
 */
function global_block(lang, msg, username, text, embed, wiki, spoiler, gender = 'unknown') {
	if ( !msg || msg.channel.type !== 'text' || !( msg.guild.id in patreons ) ) return;
	
	if ( msg.showEmbed() ) embed.fields.pop();
	else {
		let splittext = text.split('\n\n');
		splittext.pop();
		text = splittext.join('\n\n');
	}
	
	if ( wiki.isFandom() ) got.get( 'https://community.fandom.com/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1', {
		responseType: 'text'
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body ) {
			console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
		}
		else {
			let $ = cheerio.load(body);
			if ( $('#mw-content-text .errorbox').length ) {
				if ( msg.showEmbed() ) embed.addField( lang.get('user.gblock.disabled'), '\u200b' );
				else text += '\n\n**' + lang.get('user.gblock.disabled') + '**';
			}
			else if ( $('.mw-warning-with-logexcerpt').length && !$(".mw-warning-with-logexcerpt .mw-logline-block").length ) {
				if ( msg.showEmbed() ) embed.addField( lang.get('user.gblock.header', username, gender).escapeFormatting(), '\u200b' );
				else text += '\n\n**' + lang.get('user.gblock.header', username, gender).escapeFormatting() + '**';
			}
		}
	}, error => {
		console.log( '- Error while getting the global block: ' + error );
	} ).finally( () => {
		if ( !/^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
			got.get( 'https://community.fandom.com/wiki/Special:Editcount/' + encodeURIComponent( username ), {
				responseType: 'text'
			} ).then( gresponse => {
				var gbody = gresponse.body;
				if ( gresponse.statusCode !== 200 || !gbody ) {
					console.log( '- ' + gresponse.statusCode + ': Error while getting the global edit count.' );
				}
				else {
					let $ = cheerio.load(gbody);
					var globaledits = $('#editcount .TablePager th').eq(7).text().replace( /[,\.]/g, '' );
					if ( globaledits ) {
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {
							name: lang.get('user.info.globaleditcount'),
							value: '[' + globaledits + '](https://community.fandom.com/wiki/Special:Editcount/' + username.toTitle(true) + ')',
							inline: true
						});
						else {
							let splittext = text.split('\n');
							splittext.splice(5, 0, lang.get('user.info.globaleditcount') + ' ' + globaledits);
							text = splittext.join('\n');
						}
					}
				}
			}, error => {
				console.log( '- Error while getting the global edit count: ' + error );
			} ).finally( () => {
				msg.edit( spoiler + text + spoiler, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
			} );
		}
		else msg.edit( spoiler + text + spoiler, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
	} );
	else if ( wiki.endsWith( '.gamepedia.com/' ) ) got.get( 'https://help.gamepedia.com/Special:GlobalBlockList/' + encodeURIComponent( username ) + '?uselang=qqx', {
		responseType: 'text'
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body ) {
			console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
		}
		else {
			let $ = cheerio.load(body);
			var gblocklist = $('.mw-blocklist');
			let splittext = text.split('\n\n');
			if ( gblocklist.length ) gblocklist.find('tbody tr').each( (i, gblock) => {
				gblock = $(gblock);
				var reason = gblock.find('.TablePager_col_reason').text().replace( /\)$/, '' ).split(', ');
				var timestamp = new Date(gblock.find('.TablePager_col_timestamp').text().replace( /(\d{2}:\d{2}), (\d{1,2}) \((\w+)\) (\d{4})/, '$3 $2, $4 $1 UTC' )).toLocaleString(lang.get('dateformat'), timeoptions);
				var expiry = gblock.find('.TablePager_col_expiry').text();
				if ( expiry.startsWith( '(infiniteblock)' ) ) expiry = lang.get('user.block.until_infinity');
				else expiry = new Date(expiry.replace( /(\d{2}:\d{2}), (\d{1,2}) \((\w+)\) (\d{4})/, '$3 $2, $4 $1 UTC' )).toLocaleString(lang.get('dateformat'), timeoptions);
				if ( msg.showEmbed() ) {
					var gblocktitle = lang.get('user.gblock.header', username, gender).escapeFormatting();
					var globalblock = embed.fields.find( field => field.inline === false && field.name === lang.get('user.block.header', username, gender).escapeFormatting() && field.value.replace( /\[([^\]]*)\]\([^\)]*\)/g, '$1' ) === lang.get('user.block.' + ( reason.length > 4 ? 'text' : 'noreason' ), timestamp, expiry, reason[1].escapeFormatting(), reason.slice(4).join(', ').escapeFormatting()) );
					if ( globalblock ) globalblock.name = gblocktitle;
					else {
						var block_wiki = reason[3].replace( /Special:BlockList$/, '' );
						var gblocktext = lang.get('user.gblock.' + ( reason.length > 4 ? 'text' : 'noreason' ), timestamp, expiry, '[' + reason[1] + '](' + block_wiki + 'User:' + reason[1].toTitle(true) + ')', '[' + reason[2] + '](' + block_wiki + 'Special:Contribs/' + username.toTitle(true) + ')', reason.slice(4).join(', ').escapeFormatting());
						embed.addField( gblocktitle, gblocktext );
					}
				}
				else {
					var globalblock = splittext.indexOf('**' + lang.get('user.block.header', username, gender).escapeFormatting() + '**\n' + lang.get('user.block.' + ( reason.length > 4 ? 'text' : 'noreason' ), timestamp, expiry, reason[1].escapeFormatting(), reason.slice(4).join(', ').escapeFormatting()));
					if ( globalblock !== -1 ) splittext[globalblock] = '**' + lang.get('user.gblock.header', username, gender).escapeFormatting() + '**\n' + lang.get('user.block.' + ( reason.length > 4 ? 'text' : 'noreason' ), timestamp, expiry, reason[1].escapeFormatting(), reason.slice(4).join(', ').escapeFormatting());
					else splittext.push('**' + lang.get('user.gblock.header', username, gender).escapeFormatting() + '**\n' + lang.get('user.gblock.' + ( reason.length > 4 ? 'text' : 'noreason' ), timestamp, expiry, reason[1].escapeFormatting(), reason[2], reason.slice(4).join(', ').escapeFormatting()));
				}
			} );
			text = splittext.join('\n\n');
		}
	}, error => {
		console.log( '- Error while getting the global block: ' + error );
	} ).finally( () => {
		if ( !/^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
			got.get( 'https://help.gamepedia.com/UserProfile:' + encodeURIComponent( username ), {
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
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {
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
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {
							name: lang.get('user.info.globaleditcount'),
							value: '[' + globaledits + '](https://help.gamepedia.com/Gamepedia_Help_Wiki:Global_user_tracker#' + wiki.replace( /^https:\/\/([a-z\d-]{1,50})\.gamepedia\.com\/$/, '$1/' ) + username.toTitle(true) + ')',
							inline: true
						});
						else {
							let splittext = text.split('\n');
							splittext.splice(5, 0, lang.get('user.info.globaleditcount') + ' ' + globaledits);
							text = splittext.join('\n');
						}
					}
				}
			}, error => {
				console.log( '- Error while getting the global edit count: ' + error );
			} ).finally( () => {
				msg.edit( spoiler + text + spoiler, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
			} );
		}
		else msg.edit( spoiler + text + spoiler, {embed,allowedMentions:{parse:[]}} ).catch(log_error);
	} );
}

module.exports = global_block;
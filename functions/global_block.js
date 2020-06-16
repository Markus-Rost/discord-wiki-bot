const cheerio = require('cheerio');
const {timeoptions} = require('../util/default.json');

function global_block(lang, msg, username, text, embed, wiki, spoiler) {
	if ( !msg || msg.channel.type !== 'text' || !( msg.guild.id in patreons ) ) return;
	
	if ( msg.showEmbed() ) embed.fields.pop();
	else {
		let splittext = text.split('\n\n');
		splittext.pop();
		text = splittext.join('\n\n');
	}
	
	if ( wiki.isFandom() ) got.get( 'https://community.fandom.com/Special:Contributions/' + encodeURIComponent( username ) + '?limit=1' ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body ) {
			console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
		}
		else {
			let $ = cheerio.load(body);
			if ( $('#mw-content-text .errorbox').length ) {
				if ( msg.showEmbed() ) embed.addField( lang.user.gblock.disabled, '\u200b' );
				else text += '\n\n**' + lang.user.gblock.disabled + '**';
			}
			else if ( $('.mw-warning-with-logexcerpt').length && !$(".mw-warning-with-logexcerpt .mw-logline-block").length ) {
				if ( msg.showEmbed() ) embed.addField( lang.user.gblock.header.replaceSave( '%s', username ).escapeFormatting(), '\u200b' );
				else text += '\n\n**' + lang.user.gblock.header.replaceSave( '%s', username ).escapeFormatting() + '**';
			}
		}
	}, error => {
		console.log( '- Error while getting the global block: ' + error );
	} ).finally( () => {
		if ( !/^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
			got.get( 'https://community.fandom.com/wiki/Special:Editcount/' + encodeURIComponent( username ) ).then( gresponse => {
				var gbody = gresponse.body;
				if ( gresponse.statusCode !== 200 || !gbody ) {
					console.log( '- ' + gresponse.statusCode + ': Error while getting the global edit count.' );
				}
				else {
					let $ = cheerio.load(gbody);
					var globaledits = $('#editcount .TablePager th').eq(7).text().replace( /[,\.]/g, '' );
					if ( globaledits ) {
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {name:lang.user.info.globaleditcount,value:'[' + globaledits + '](https://community.fandom.com/wiki/Special:Editcount/' + username.toTitle(true) + ')',inline:true});
						else {
							let splittext = text.split('\n');
							splittext.splice(5, 0, lang.user.info.globaleditcount + ' ' + globaledits);
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
	else if ( wiki.endsWith( '.gamepedia.com/' ) ) got.get( 'https://help.gamepedia.com/Special:GlobalBlockList/' + encodeURIComponent( username ) + '?uselang=qqx' ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body ) {
			console.log( '- ' + response.statusCode + ': Error while getting the global block.' );
		}
		else {
			let $ = cheerio.load(body);
			var gblock = $('.mw-blocklist');
			if ( gblock.length ) {
				var reason = gblock.find('.TablePager_col_reason').text().replace( /\)$/, '' ).split(', ');
				var timestamp = new Date(gblock.find('.TablePager_col_timestamp').text().replace( /(\d{2}:\d{2}), (\d{1,2}) \((\w+)\) (\d{4})/, '$3 $2, $4 $1 UTC' )).toLocaleString(lang.dateformat, timeoptions);
				var expiry = gblock.find('.TablePager_col_expiry').text();
				if ( expiry.startsWith( '(infiniteblock)' ) ) expiry = lang.user.block.until_infinity;
				else expiry = new Date(expiry.replace( /(\d{2}:\d{2}), (\d{1,2}) \((\w+)\) (\d{4})/, '$3 $2, $4 $1 UTC' )).toLocaleString(lang.dateformat, timeoptions);
				if ( msg.showEmbed() ) {
					var gblocktitle = lang.user.gblock.header.replaceSave( '%s', username ).escapeFormatting();
					var globalblock = embed.fields.find( field => field.inline === false && field.name === lang.user.block.header.replaceSave( '%s', username ).escapeFormatting() && field.value.replace( /\[([^\]]*)\]\([^\)]*\)/g, '$1' ) === lang.user.block[( reason.length > 4 ? 'text' : 'noreason' )].replaceSave( '%1$s', timestamp ).replaceSave( '%2$s', expiry ).replaceSave( '%3$s', reason[1].escapeFormatting() ).replaceSave( '%4$s', reason.slice(4).join(', ').escapeFormatting() ) );
					if ( globalblock ) globalblock.name = gblocktitle;
					else {
						var block_wiki = reason[3].replace( /Special:BlockList$/, '' );
						var gblocktext = lang.user.gblock[( reason.length > 4 ? 'text' : 'noreason' )].replaceSave( '%1$s', timestamp ).replaceSave( '%2$s', expiry ).replaceSave( '%3$s', '[' + reason[1] + '](' + block_wiki + 'User:' + reason[1].toTitle(true) + ')' ).replaceSave( '%4$s', '[' + reason[2] + '](' + block_wiki + 'Special:Contribs/' + username.toTitle(true) + ')' ).replaceSave( '%5$s', reason.slice(4).join(', ').escapeFormatting() );
						embed.addField( gblocktitle, gblocktext );
					}
				}
				else {
					let splittext = text.split('\n\n');
					var globalblock = splittext.indexOf('**' + lang.user.block.header.replaceSave( '%s', username ).escapeFormatting() + '**\n' + lang.user.block[( reason.length > 4 ? 'text' : 'noreason' )].replaceSave( '%1$s', timestamp ).replaceSave( '%2$s', expiry ).replaceSave( '%3$s', reason[1].escapeFormatting() ).replaceSave( '%4$s', reason.slice(4).join(', ').escapeFormatting() ));
					if ( globalblock !== -1 ) splittext[globalblock] = '**' + lang.user.gblock.header.replaceSave( '%s', username ).escapeFormatting() + '**\n' + lang.user.block[( reason.length > 4 ? 'text' : 'noreason' )].replaceSave( '%1$s', timestamp ).replaceSave( '%2$s', expiry ).replaceSave( '%3$s', reason[1].escapeFormatting() ).replaceSave( '%4$s', reason.slice(4).join(', ').escapeFormatting() );
					else splittext.push('**' + lang.user.gblock.header.replaceSave( '%s', username ).escapeFormatting() + '**\n' + lang.user.gblock[( reason.length > 4 ? 'text' : 'noreason' )].replaceSave( '%1$s', timestamp ).replaceSave( '%2$s', expiry ).replaceSave( '%3$s', reason[1].escapeFormatting() ).replaceSave( '%4$s', reason[2] ).replaceSave( '%5$s', reason.slice(4).join(', ').escapeFormatting() ));
					text = splittext.join('\n\n');
				}
			}
		}
	}, error => {
		console.log( '- Error while getting the global block: ' + error );
	} ).finally( () => {
		if ( !/^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
			got.get( 'https://help.gamepedia.com/UserProfile:' + encodeURIComponent( username ) ).then( gresponse => {
				var gbody = gresponse.body;
				if ( gresponse.statusCode !== 200 || !gbody ) {
					console.log( '- ' + gresponse.statusCode + ': Error while getting the global edit count.' );
				}
				else {
					let $ = cheerio.load(gbody);
					var wikisedited = $('.curseprofile .rightcolumn .section.stats dd').eq(0).text().replace( /[,\.]/g, '' );
					if ( wikisedited ) {
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {name:lang.user.info.wikisedited,value:wikisedited,inline:true});
						else {
							let splittext = text.split('\n');
							splittext.splice(5, 0, lang.user.info.wikisedited + ' ' + wikisedited);
							text = splittext.join('\n');
						}
					}
					var globaledits = $('.curseprofile .rightcolumn .section.stats dd').eq(2).text().replace( /[,\.]/g, '' );
					if ( globaledits ) {
						if ( msg.showEmbed() ) embed.spliceFields(1, 0, {name:lang.user.info.globaleditcount,value:'[' + globaledits + '](https://help.gamepedia.com/Gamepedia_Help_Wiki:Global_user_tracker#' + wiki.replace( /^https:\/\/([a-z\d-]{1,50})\.gamepedia\.com\/$/, '$1/' ) + username.toTitle(true) + ')',inline:true});
						else {
							let splittext = text.split('\n');
							splittext.splice(5, 0, lang.user.info.globaleditcount + ' ' + globaledits);
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
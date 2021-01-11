const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const logging = require('../../../util/logging.js');

/**
 * Sends a random Fandom page.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the page.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function fandom_random(lang, msg, wiki, reaction, spoiler) {
	got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=description&siprop=general&generator=random&grnnamespace=0&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else {
			wiki.updateWiki(body.query.general);
			logging(wiki, msg.guild?.id, 'random', 'legacy');
			var querypage = Object.values(body.query.pages)[0];
			var pagelink = wiki.toLink(querypage.title);
			var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
			if ( querypage.title === body.query.general.mainpage && body.query.allmessages[0]['*'] ) {
				embed.setDescription( body.query.allmessages[0]['*'] );
				embed.setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png') );
				
				msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else got.get( wiki.toDescLink(querypage.title), {
				responseType: 'text'
			} ).then( descresponse => {
				var descbody = descresponse.body;
				if ( descresponse.statusCode !== 200 || !descbody ) {
					console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
				} else {
					var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png');
					var parser = new htmlparser.Parser( {
						onopentag: (tagname, attribs) => {
							if ( tagname === 'meta' && attribs.property === 'og:description' ) {
								var description = attribs.content.escapeFormatting();
								if ( description.length > 1000 ) description = description.substring(0, 1000) + '\u2026';
								embed.setDescription( description );
							}
							if ( tagname === 'meta' && attribs.property === 'og:image' && querypage.title !== body.query.general.mainpage ) {
								thumbnail = attribs.content;
							}
						}
					} );
					parser.write( descbody );
					parser.end();
					embed.setThumbnail( thumbnail );
				}
			}, error => {
				console.log( '- Error while getting the description: ' + error );
			} ).finally( () => {
				msg.sendChannel( '🎲 ' + spoiler + '<' + pagelink + '>' + spoiler, {embed} );
				
				if ( reaction ) reaction.removeEmoji();
			} );
		}
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Random') + '>' + spoiler );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'random',
	run: fandom_random
};
const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const gamepedia_overview = require('../gamepedia/overview.js').run;
const {timeoptions} = require('../../../util/default.json');

var allSites = [];
const getAllSites = require('../../../util/allSites.js');
getAllSites.then( sites => allSites = sites );

/**
 * Sends a Fandom wiki overview.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../../util/wiki.js')} wiki - The wiki for the overview.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function fandom_overview(lang, msg, wiki, reaction, spoiler) {
	if ( !allSites.length ) getAllSites.update();
	got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-Wiki_Manager|custom-GamepediaNotice|custom-FandomMergeNotice&amenableparser=true&siprop=general|statistics|wikidesc&titles=Special:Statistics&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the statistics: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Statistics') + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else if ( body.query.general.generator.startsWith( 'MediaWiki 1.3' ) ) {
			return gamepedia_overview(lang, msg, wiki, reaction, spoiler);
		}
		else got.get( 'https://community.fandom.com/api/v1/Wikis/Details?ids=' + body.query.wikidesc.id + '&format=json&cache=' + Date.now() ).then( ovresponse => {
			wiki.updateWiki(body.query.general);
			var ovbody = ovresponse.body;
			if ( ovresponse.statusCode !== 200 || !ovbody || ovbody.exception || !ovbody.items || !ovbody.items[body.query.wikidesc.id] ) {
				console.log( '- ' + ovresponse.statusCode + ': Error while getting the wiki details: ' + ( ovbody && ovbody.exception && ovbody.exception.details ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink(body.query.pages['-1'].title) + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				var site = ovbody.items[body.query.wikidesc.id];
				
				var vertical = [lang.get('overview.vertical'), site.hub];
				var topic = [lang.get('overview.topic'), site.topic];
				var founder = [lang.get('overview.founder'), site.founding_user_id];
				var manager = [lang.get('overview.manager'), body.query.allmessages[0]['*']];
				var crossover = [lang.get('overview.crossover')];
				if ( body.query.allmessages[1]['*'] ) {
					crossover.push('<https://' + body.query.allmessages[1]['*'] + '.gamepedia.com/>');
				}
				else if ( body.query.allmessages[2]['*'] ) {
					let merge = body.query.allmessages[2]['*'].split('/');
					crossover.push('<https://' + merge[0] + '.fandom.com/' + ( merge[1] ? merge[1] + '/' : '' ) + '>');
				}
				var created = [lang.get('overview.created'), new Date(site.creation_date).toLocaleString(lang.get('dateformat'), timeoptions)];
				var articles = [lang.get('overview.articles'), body.query.statistics.articles];
				var pages = [lang.get('overview.pages'), body.query.statistics.pages];
				var edits = [lang.get('overview.edits'), body.query.statistics.edits];
				var users = [lang.get('overview.users'), body.query.statistics.activeusers];
				var description = [lang.get('overview.description'), site.desc];
				var image = [lang.get('overview.image'), site.image];
				
				if ( description[1] ) {
					description[1] = description[1].escapeFormatting();
					if ( description[1].length > 1000 ) description[1] = description[1].substring(0, 1000) + '\u2026';
				}
				if ( image[1] && image[1].startsWith( '/' ) ) image[1] = new URL(image[1], wiki).href;
				
				var title = body.query.pages['-1'].title;
				var pagelink = wiki.toLink(title);
				if ( msg.showEmbed() ) {
					var text = '<' + pagelink + '>';
					var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( title.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( site.wordmark.startsWith( 'data:' ) ? wiki.toLink('Special:FilePath/Wiki-wordmark.png') : site.wordmark ) ).addField( vertical[0], vertical[1], true );
					if ( topic[1] ) embed.addField( topic[0], topic[1], true );
				}
				else {
					var embed = {};
					var text = '<' + pagelink + '>\n\n' + vertical.join(' ') + ( topic[1] ? '\n' + topic.join(' ') : '' );
				}
				
				if ( founder[1] > 0 ) got.get( wiki + 'api.php?action=query&list=users&usprop=&usids=' + founder[1] + '&format=json' ).then( usresponse => {
					var usbody = usresponse.body;
					if ( usbody && usbody.warnings ) log_warn(usbody.warnings);
					if ( usresponse.statusCode !== 200 || !usbody || !usbody.query || !usbody.query.users || !usbody.query.users[0] ) {
						console.log( '- ' + usresponse.statusCode + ': Error while getting the wiki founder: ' + ( usbody && usbody.error && usbody.error.info ) );
						founder[1] = 'ID: ' + founder[1];
					}
					else {
						var user = usbody.query.users[0].name;
						if ( msg.showEmbed() ) founder[1] = '[' + user + '](' + wiki.toLink('User:' + user, '', '', true) + ')';
						else founder[1] = user;
					}
				}, error => {
					console.log( '- Error while getting the wiki founder: ' + error );
					founder[1] = 'ID: ' + founder[1];
				} ).finally( () => {
					if ( msg.showEmbed() ) {
						embed.addField( founder[0], founder[1], true );
						if ( manager[1] ) embed.addField( manager[0], '[' + manager[1] + '](' + wiki.toLink('User:' + manager[1], '', '', true) + ') ([' + lang.get('overview.talk') + '](' + wiki.toLink('User talk:' + manager[1], '', '', true) + '))', true );
						embed.addField( created[0], created[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') );
						if ( crossover[1] ) {
							var crossoverSite = allSites.find( site => '<https://' + site.wiki_domain + '/>' === crossover[1] );
							if ( crossoverSite ) embed.addField( crossover[0], '[' + crossoverSite.wiki_display_name + '](' + crossover[1] + ')', true );
							else embed.addField( crossover[0], crossover[1], true );
						}
						if ( description[1] ) embed.addField( description[0], description[1] );
						if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
					}
					else {
						text += '\n' + founder.join(' ') + ( manager[1] ? '\n' + manager.join(' ') : '' ) + '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ');
						if ( crossover[1] ) text += '\n' + crossover.join(' ');
						if ( description[1] ) text += '\n' + description.join(' ');
						if ( image[1] ) {
							text += '\n' + image.join(' ');
							if ( msg.uploadFiles() ) embed.files = [image[1]];
						}
						text += '\n\n*' + lang.get('overview.inaccurate') + '*';
					}
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				} );
				else {
					founder[1] = lang.get('overview.none');
					if ( msg.showEmbed() ) {
						embed.addField( founder[0], founder[1], true ).addField( created[0], created[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') );
						if ( crossover[1] ) {
							var crossoverSite = allSites.find( site => '<https://' + site.wiki_domain + '/>' === crossover[1] );
							if ( crossoverSite ) embed.addField( crossover[0], '[' + crossoverSite.wiki_display_name + '](' + crossover[1] + ')', true );
							else embed.addField( crossover[0], crossover[1], true );
						}
						if ( description[1] ) embed.addField( description[0], description[1] );
						if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
					}
					else {
						text += '\n' + founder.join(' ') + '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ');
						if ( crossover[1] ) text += '\n' + crossover.join(' ');
						if ( description[1] ) text += '\n' + description.join(' ');
						if ( image[1] ) {
							text += '\n' + image.join(' ');
							if ( msg.uploadFiles() ) embed.files = [image[1]];
						}
						text += '\n\n*' + lang.get('overview.inaccurate') + '*';
					}
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				}
			}
		}, error => {
			console.log( '- Error while getting the wiki details: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.updateWiki(body.query.general).toLink(body.query.pages['-1'].title) + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}, error => {
		if ( wiki.noWiki(error.message) ) {
			console.log( '- This wiki doesn\'t exist!' );
			msg.reactEmoji('nowiki');
		}
		else {
			console.log( '- Error while getting the statistics: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Statistics') + '>' + spoiler );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

module.exports = {
	name: 'overview',
	run: fandom_overview
};
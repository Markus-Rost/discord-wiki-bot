const {MessageEmbed} = require('discord.js');
const fandom_overview = require('./fandom/overview.js').run;
const {timeoptions} = require('../../util/default.json');

var allSites = [];
const getAllSites = require('../../util/allSites.js');
getAllSites.then( sites => allSites = sites );

/**
 * Sends a Gamepedia wiki overview.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../../util/wiki.js')} wiki - The wiki for the overview.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function gamepedia_overview(lang, msg, wiki, reaction, spoiler) {
	if ( !allSites.length ) getAllSites.update();
	got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-Wiki_Manager|custom-GamepediaNotice|custom-FandomMergeNotice&amenableparser=true&siprop=general|statistics|languages&siinlanguagecode=' + lang.lang + '&list=allrevisions&arvdir=newer&arvlimit=1&arvprop=timestamp&titles=Special:Statistics&format=json' ).then( response => {
		var body = response.body;
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( wiki.noWiki(response.url, response.statusCode) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else if ( body?.query?.general?.generator === 'MediaWiki 1.19.24' && wiki.isFandom(false) ) {
				return fandom_overview(lang, msg, wiki, reaction, spoiler);
			}
			else {
				console.log( '- ' + response.statusCode + ': Error while getting the statistics: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink('Special:Statistics') + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else {
			wiki.updateWiki(body.query.general);
			var site = null;
			if ( allSites.some( site => site.wiki_domain === wiki.hostname ) ) {
				site = allSites.find( site => site.wiki_domain === wiki.hostname );
				
				var name = [lang.get('overview.name'), site.wiki_display_name];
				var manager = [lang.get('overview.manager'), site.wiki_managers];
				var official = [lang.get('overview.official'), lang.get('overview.' + ( site.official_wiki ? 'yes' : 'no' ))];
				var crossover = [lang.get('overview.crossover'), ( site.wiki_crossover ? '<https://' + site.wiki_crossover + '/>' : '' )];
				var description = [lang.get('overview.description'), site.wiki_description];
				var image = [lang.get('overview.image'), site.wiki_image];
				
				if ( description[1] ) {
					description[1] = description[1].escapeFormatting();
					if ( description[1].length > 1000 ) description[1] = description[1].substring(0, 1000) + '\u2026';
				}
				if ( image[1] && image[1].startsWith( '/' ) ) image[1] = new URL(image[1], wiki).href;
			}
			var created = [lang.get('overview.created')];
			var creation_date = null;
			if ( body.query.allrevisions?.[0]?.revisions?.[0]?.timestamp ) {
				creation_date = new Date(body.query.allrevisions[0].revisions[0].timestamp);
				created.push(creation_date.toLocaleString(lang.get('dateformat'), timeoptions));
			}
			var language = [lang.get('overview.lang'), body.query.languages.find( language => {
				return language.code === body.query.general.lang;
			} )['*']];
			var articles = [lang.get('overview.articles'), body.query.statistics.articles];
			var pages = [lang.get('overview.pages'), body.query.statistics.pages];
			var edits = [lang.get('overview.edits'), body.query.statistics.edits];
			var users = [lang.get('overview.users'), body.query.statistics.activeusers];
			
			var title = body.query.pages['-1'].title;
			var pagelink = wiki.toLink(title);
			
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( title.escapeFormatting() ).setURL( pagelink ).setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n\n';
			}
			
			if ( wiki.isFandom(false) ) got.get( 'https://community.fandom.com/api/v1/Wikis/ByString?expand=true&includeDomain=true&limit=10&string=' + body.query.general.servername + body.query.general.scriptpath + '&format=json&cache=' + Date.now() ).then( ovresponse => {
				var manager = [lang.get('overview.manager'), body.query.allmessages[0]['*']];
				var crossover = [lang.get('overview.crossover')];
				if ( body.query.allmessages[1]['*'] ) {
					crossover.push('<https://' + body.query.allmessages[1]['*'] + '.gamepedia.com/>');
				}
				else if ( body.query.allmessages[2]['*'] ) {
					let merge = body.query.allmessages[2]['*'].split('/');
					crossover.push('<https://' + merge[0] + '.fandom.com/' + ( merge[1] ? merge[1] + '/' : '' ) + '>');
				}
				var ovbody = ovresponse.body;
				if ( ovresponse.statusCode !== 200 || !ovbody || ovbody.exception || !ovbody.items || !ovbody.items.length ) {
					console.log( '- ' + ovresponse.statusCode + ': Error while getting the wiki details: ' + ( ovbody && ovbody.exception && ovbody.exception.details ) );

					if ( msg.showEmbed() ) {
						if ( created[1] ) embed.addField( created[0], created[1], true );
						embed.addField( language[0], language[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') );
					}
					else {
						if ( created[1] ) text += created.join(' ') + '\n';
						text += language.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ') + '\n\n*' + lang.get('overview.inaccurate') + '*';
					}
	
					msg.sendChannelError( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( ovbody.items.some( site => new URL(site.url).href === wiki.href ) ) {
					site = ovbody.items.find( site => new URL(site.url).href === wiki.href );
					
					var vertical = [lang.get('overview.vertical'), site.hub];
					var topic = [lang.get('overview.topic'), site.topic];
					var founder = [lang.get('overview.founder'), site.founding_user_id];
					if ( created[1] && creation_date > new Date(site.creation_date) ) {
						creation_date = new Date(site.creation_date);
						created[1] = creation_date.toLocaleString(lang.get('dateformat'), timeoptions);
					}
					var posts = [lang.get('overview.posts')];
					var walls = [lang.get('overview.walls')];
					var comments = [lang.get('overview.comments')];
					var description = [lang.get('overview.description'), site.desc];
					var image = [lang.get('overview.image'), site.image];
					
					if ( description[1] ) {
						description[1] = description[1].escapeFormatting();
						if ( description[1].length > 1000 ) description[1] = description[1].substring(0, 1000) + '\u2026';
					}
					if ( image[1] && image[1].startsWith( '/' ) ) image[1] = new URL(image[1], wiki).href;
					
					if ( msg.showEmbed() ) {
						embed.addField( vertical[0], vertical[1], true );
						if ( topic[1] ) embed.addField( topic[0], topic[1], true );
					}
					else text += vertical.join(' ') + ( topic[1] ? '\n' + topic.join(' ') : '' );
					
					Promise.all([
						( founder[1] > 0 ? got.get( wiki + 'api.php?action=query&list=users&usprop=&ususerids=' + founder[1] + '&format=json' ).then( usresponse => {
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
						} ) : founder[1] = lang.get('overview.none') ),
						got.get( 'https://services.fandom.com/discussion/' + site.id + '/posts?limit=1&format=json&cache=' + Date.now(), {
							headers: {
								Accept: 'application/hal+json'
							}
						} ).then( dsresponse => {
							var dsbody = dsresponse.body;
							if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
								if ( dsbody?.title !== 'site doesn\'t exists' ) console.log( '- ' + dsresponse.statusCode + ': Error while getting discussions stats: ' + dsbody?.title );
							}
							else {
								let counts = dsbody?._embedded?.count?.[0];
								if ( counts?.FORUM || counts?.WALL || counts?.ARTICLE_COMMENT ) {
									if ( counts?.FORUM ) posts.push(counts.FORUM);
									if ( counts?.WALL ) walls.push(counts.WALL);
									if ( counts?.ARTICLE_COMMENT ) comments.push(counts.ARTICLE_COMMENT);
								}
								else if ( counts?.total ) posts.push(counts.total);
							}
						}, error => {
							console.log( '- Error while getting discussions stats: ' + error );
						} )
					]).finally( () => {
						if ( msg.showEmbed() ) {
							embed.addField( founder[0], founder[1], true );
							if ( manager[1] ) embed.addField( manager[0], '[' + manager[1] + '](' + wiki.toLink('User:' + manager[1], '', '', true) + ') ([' + lang.get('overview.talk') + '](' + wiki.toLink('User talk:' + manager[1], '', '', true) + '))', true );
							if ( created[1] ) embed.addField( created[0], created[1], true );
							embed.addField( language[0], language[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true );
							if ( posts[1] ) embed.addField( posts[0], posts[1], true );
							if ( walls[1] ) embed.addField( walls[0], walls[1], true );
							if ( comments[1] ) embed.addField( comments[0], comments[1], true );
							embed.addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') + ' • ' + lang.get('overview.wikiid') + ' ' + site.id );
							if ( crossover[1] ) {
								var crossoverSite = allSites.find( site => '<https://' + site.wiki_domain + '/>' === crossover[1] );
								if ( crossoverSite ) embed.addField( crossover[0], '[' + crossoverSite.wiki_display_name + '](' + crossover[1] + ')', true );
								else embed.addField( crossover[0], crossover[1], true );
							}
							if ( description[1] ) embed.addField( description[0], description[1] );
							if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
						}
						else {
							text += '\n' + founder.join(' ');
							if ( manager[1] ) text += '\n' + manager.join(' ');
							if ( created[1] ) text += '\n' + created.join(' ');
							text += '\n' + language.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ');
							if ( posts[1] ) text += '\n' + posts.join(' ');
							if ( walls[1] ) text += '\n' + walls.join(' ');
							if ( comments[1] ) text += '\n' + comments.join(' ');
							text += '\n' + users.join(' ');
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
				}
				else {
					if ( msg.showEmbed() ) {
						if ( manager[1] ) embed.addField( manager[0], '[' + manager[1] + '](' + wiki.toLink('User:' + manager[1], '', '', true) + ') ([' + lang.get('overview.talk') + '](' + wiki.toLink('User talk:' + manager[1], '', '', true) + '))', true );
						if ( created[1] ) embed.addField( created[0], created[1], true );
						embed.addField( language[0], language[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') );
						if ( crossover[1] ) {
							var crossoverSite = allSites.find( site => '<https://' + site.wiki_domain + '/>' === crossover[1] );
							if ( crossoverSite ) embed.addField( crossover[0], '[' + crossoverSite.wiki_display_name + '](' + crossover[1] + ')', true );
							else embed.addField( crossover[0], crossover[1], true );
						}
					}
					else {
						if ( manager[1] ) text += manager.join(' ') + '\n';
						if ( created[1] ) text += created.join(' ') + '\n';
						text += language.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ');
						if ( crossover[1] ) text += '\n' + crossover.join(' ');
						text += '\n\n*' + lang.get('overview.inaccurate') + '*';
					}
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				}
			}, error => {
				console.log( '- Error while getting the wiki details: ' + error );

				if ( msg.showEmbed() ) embed.addField( language[0], language[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setFooter( lang.get('overview.inaccurate') );
				else text += language.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ') + '\n\n*' + lang.get('overview.inaccurate') + '*';

				msg.sendChannelError( spoiler + text + spoiler, {embed} );
				
				if ( reaction ) reaction.removeEmoji();
			} );
			else {
				if ( msg.showEmbed() ) {
					if ( site ) {
						var managerlist = manager[1].map( wm => '[' + wm + '](' + wiki.toLink('User:' + wm, '', '', true) + ') ([' + lang.get('overview.talk') + '](' + wiki.toLink('User talk:' + wm, '', '', true) + '))' ).join('\n');
						embed.addField( name[0], name[1], true ).addField( manager[0], ( managerlist || lang.get('overview.none') ), true ).addField( official[0], official[1], true );
					}
					if ( created[1] ) embed.addField( created[0], created[1], true );
					embed.addField( language[0], language[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setTimestamp( msg.client.readyTimestamp ).setFooter( lang.get('overview.inaccurate') );
					if ( site ) {
						if ( crossover[1] ) embed.addField( crossover[0], crossover[1], true );
						if ( description[1] ) embed.addField( description[0], description[1] );
						if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
					}
				}
				else {
					if ( site ) text += name.join(' ') + '\n' + manager[0] + ' ' + ( manager[1].join(', ') || lang.get('overview.none') ) + '\n' + official.join(' ') + '\n';
					if ( created[1] ) text += created.join(' ') + '\n';
					text += language.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ');
					if ( site ) {
						if ( crossover[1] ) text += '\n' + crossover.join(' ');
						if ( description[1] ) text += '\n' + description.join(' ');
						if ( image[1] ) {
							text += '\n' + image.join(' ');
							if ( msg.uploadFiles() ) embed.files = [{attachment:image[1],name:( spoiler ? 'SPOILER ' : '' ) + name[1] + image[1].substring(image[1].lastIndexOf('.'))}];
						}
					}
					text += '\n\n*' + lang.get('overview.inaccurate') + '*';
				}
				
				msg.sendChannel( spoiler + text + spoiler, {embed} );
				
				if ( reaction ) reaction.removeEmoji();
			}
		}
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
	run: gamepedia_overview
};

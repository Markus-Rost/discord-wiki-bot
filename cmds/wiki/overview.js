const {MessageEmbed} = require('discord.js');
const fandom_overview = require('./fandom/overview.js').run;
const {timeoptions} = require('../../util/default.json');
const {toFormatting, toPlaintext} = require('../../util/functions.js');

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
	got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-Wiki_Manager|custom-GamepediaNotice|custom-FandomMergeNotice&amenableparser=true&siprop=general|statistics|languages|rightsinfo' + ( wiki.isFandom() ? '|variables' : '' ) + '&siinlanguagecode=' + lang.lang + '&list=logevents&ledir=newer&lelimit=1&leprop=timestamp&titles=Special:Statistics&format=json' ).then( response => {
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
			var version = [lang.get('overview.version'), body.query.general.generator];
			var creation_date = null;
			var created = [lang.get('overview.created'), lang.get('overview.unknown')];
			if ( body.query.logevents?.[0]?.timestamp ) {
				creation_date = new Date(body.query.logevents[0].timestamp);
				created[1] = creation_date.toLocaleString(lang.get('dateformat'), timeoptions);
			}
			var language = [lang.get('overview.lang'), body.query.languages.find( language => {
				return language.code === body.query.general.lang;
			} )['*']];
			var rtl = [lang.get('overview.rtl'), ( body.query.general.rtl !== undefined ? lang.get('overview.yes') : undefined )];
			var articles = [lang.get('overview.articles'), body.query.statistics.articles];
			var pages = [lang.get('overview.pages'), body.query.statistics.pages];
			var edits = [lang.get('overview.edits'), body.query.statistics.edits];
			var users = [lang.get('overview.users'), body.query.statistics.activeusers];
			var license = [lang.get('overview.license'), lang.get('overview.unknown')];
			if ( body.query.rightsinfo.url ) {
				let licenseurl = body.query.rightsinfo.url
				if ( /^(?:https?:\/)?\//.test(licenseurl) ) licenseurl = new URL(licenseurl, wiki).href;
				else licenseurl = wiki.toLink(licenseurl, '', '', true);
				
				if ( body.query.rightsinfo.text ) {
					let licensetext = body.query.rightsinfo.text;
					if ( msg.showEmbed() ) {
						license[1] = '[' + toPlaintext(licensetext, true) + '](' + licenseurl + ')';
					}
					else license[1] = toPlaintext(licensetext, true) + ' (<' + licenseurl + '>)';
				}
				else license[1] = '<' + licenseurl + '>';
			}
			else if ( body.query.rightsinfo.text ) {
				license[1] = toFormatting(body.query.rightsinfo.text, msg.showEmbed(), wiki, '', true);
			}
			var misermode = [lang.get('overview.misermode'), lang.get('overview.' + ( body.query.general.misermode !== undefined ? 'yes' : 'no' ))];
			var readonly = [lang.get('overview.readonly')];
			if ( body.query.general.readonly !== undefined ) {
				if ( body.query.general.readonlyreason ) {
					let readonlyreason = body.query.general.readonlyreason;
					readonly.push(toFormatting(readonlyreason, msg.showEmbed(), wiki, '', true));
				}
				else readonly = ['\u200b', '**' + lang.get('overview.readonly') + '**'];
			}
			
			var title = body.query.pages['-1'].title;
			var pagelink = wiki.toLink(title);
			
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( title.escapeFormatting() ).setURL( pagelink ).setThumbnail( new URL(body.query.general.logo, wiki).href );
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n';
			}
			
			var wikiid = body.query.variables?.find?.( variable => variable?.id === 'wgCityId' )?.['*'];
			if ( wiki.isFandom() && wikiid ) {
				var vertical = [lang.get('overview.vertical')];
				var topic = [lang.get('overview.topic')];
				var official = [lang.get('overview.official')];
				var posts = [lang.get('overview.posts')];
				var walls = [lang.get('overview.walls')];
				var comments = [lang.get('overview.comments')];
				var manager = [lang.get('overview.manager'), body.query.allmessages[0]['*']];
				var founder = [lang.get('overview.founder')];
				var crossover = [lang.get('overview.crossover')];
				if ( body.query.allmessages[1]['*'] ) {
					crossover[1] = '<https://' + body.query.allmessages[1]['*'] + '.gamepedia.com/>';
				}
				else if ( body.query.allmessages[2]['*'] ) {
					let merge = body.query.allmessages[2]['*'].split('/');
					crossover[1] = '<https://' + merge[0] + '.fandom.com/' + ( merge[1] ? merge[1] + '/' : '' ) + '>';
				}
				var description = [lang.get('overview.description')];
				var image = [lang.get('overview.image')];
				if ( allSites.some( site => site.wiki_domain === wiki.hostname ) ) {
					let site = allSites.find( site => site.wiki_domain === wiki.hostname );
					
					manager[1] = ( site.wiki_managers[0] || lang.get('overview.none') );
					official[1] = lang.get('overview.' + ( site.official_wiki ? 'yes' : 'no' ));
					if ( site.created && creation_date > new Date(parseInt(site.created + '000', 10)) ) {
						creation_date = new Date(parseInt(site.created + '000', 10));
						created[1] = creation_date.toLocaleString(lang.get('dateformat'), timeoptions);
					}
					if ( site.wiki_crossover ) crossover[1] = '<https://' + site.wiki_crossover + '/>';
					if ( site.wiki_description ) {
						description[1] = site.wiki_description.escapeFormatting();
						if ( description[1].length > 1000 ) {
							description[1] = description[1].substring(0, 1000) + '\u2026';
						}
					}
					if ( site.wiki_image ) image[1] = new URL(site.wiki_image, wiki).href;
				}
				return got.get( 'https://community.fandom.com/api/v1/Wikis/Details?ids=' + wikiid + '&format=json&cache=' + Date.now() ).then( ovresponse => {
					var ovbody = ovresponse.body;
					if ( ovresponse.statusCode !== 200 || !ovbody || ovbody.exception || !ovbody.items || !ovbody.items[wikiid] ) {
						console.log( '- ' + ovresponse.statusCode + ': Error while getting the wiki details: ' + ( ovbody && ovbody.exception && ovbody.exception.details ) );
						return;
					}
					var site = ovbody.items[wikiid];
					
					vertical[1] = site.hub;
					topic[1] = site.topic;
					founder[1] = site.founding_user_id;
					if ( site.creation_date && creation_date > new Date(site.creation_date) ) {
						creation_date = new Date(site.creation_date);
						created[1] = creation_date.toLocaleString(lang.get('dateformat'), timeoptions);
					}
					if ( site.desc ) {
						description[1] = site.desc.escapeFormatting();
						if ( description[1].length > 1000 ) {
							description[1] = description[1].substring(0, 1000) + '\u2026';
						}
					}
					if ( site.image ) image[1] = new URL(site.image, wiki).href;
					
					return Promise.all([
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
						} ) : founder[1] = ( wiki.isGamepedia() ? null : lang.get('overview.none') ) ),
						got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&limit=1&format=json&cache=' + Date.now(), {
							headers: {
								Accept: 'application/hal+json'
							}
						} ).then( dsresponse => {
							var dsbody = dsresponse.body;
							if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
								if ( dsbody?.title !== 'site doesn\'t exists' ) console.log( '- ' + dsresponse.statusCode + ': Error while getting discussions stats: ' + dsbody?.title );
								return;
							}
							let counts = dsbody?._embedded?.count?.[0];
							if ( counts?.FORUM || counts?.WALL || counts?.ARTICLE_COMMENT ) {
								if ( counts?.FORUM ) posts.push(counts.FORUM);
								if ( counts?.WALL ) walls.push(counts.WALL);
								if ( counts?.ARTICLE_COMMENT ) comments.push(counts.ARTICLE_COMMENT);
							}
							else if ( counts?.total ) posts.push(counts.total);
						}, error => {
							console.log( '- Error while getting discussions stats: ' + error );
						} )
					]);
				}, error => {
					console.log( '- Error while getting the wiki details: ' + error );
					return;
				} ).finally( () => {
					if ( msg.showEmbed() ) {
						if ( vertical[1] ) embed.addField( vertical[0], vertical[1], true );
						if ( topic[1] ) embed.addField( topic[0], topic[1], true );
						if ( official[1] ) embed.addField( official[0], official[1], true );
						embed.addField( version[0], version[1], true ).addField( language[0], language[1], true );
						if ( rtl[1] ) embed.addField( rtl[0], rtl[1], true );
						embed.addField( created[0], created[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true );
						if ( posts[1] ) embed.addField( posts[0], posts[1], true );
						if ( walls[1] ) embed.addField( walls[0], walls[1], true );
						if ( comments[1] ) embed.addField( comments[0], comments[1], true );
						embed.addField( users[0], users[1], true );
						if ( manager[1] ) embed.addField( manager[0], '[' + manager[1] + '](' + wiki.toLink('User:' + manager[1], '', '', true) + ') ([' + lang.get('overview.talk') + '](' + wiki.toLink('User talk:' + manager[1], '', '', true) + '))', true );
						if ( founder[1] ) embed.addField( founder[0], founder[1], true );
						if ( crossover[1] ) {
							let crossoverSite = allSites.find( site => '<https://' + site.wiki_domain + '/>' === crossover[1] );
							if ( crossoverSite ) embed.addField( crossover[0], '[' + crossoverSite.wiki_display_name + '](' + crossover[1] + ')', true );
							else embed.addField( crossover[0], crossover[1], true );
						}
						embed.addField( license[0], license[1], true ).addField( misermode[0], misermode[1], true ).setFooter( lang.get('overview.inaccurate') + ( wikiid ? ' • ' + lang.get('overview.wikiid') + ' ' + wikiid : '' ) );
						if ( description[1] ) embed.addField( description[0], description[1] );
						if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
						if ( readonly[1] ) embed.addField( readonly[0], readonly[1] );
					}
					else {
						if ( vertical[1] ) text += '\n' + vertical.join(' ');
						if ( topic[1] ) text += '\n' + topic.join(' ');
						if ( official[1] ) text += '\n' + official.join(' ');
						text += '\n' + version.join(' ') + '\n' + language.join(' ');
						if ( rtl[1] ) text += '\n' + rtl.join(' ');
						text += '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ');
						if ( posts[1] ) text += '\n' + posts.join(' ');
						if ( walls[1] ) text += '\n' + walls.join(' ');
						if ( comments[1] ) text += '\n' + comments.join(' ');
						text += '\n' + users.join(' ');
						if ( manager[1] ) text += '\n' + manager.join(' ');
						if ( founder[1] ) text += '\n' + founder.join(' ');
						if ( crossover[1] ) text += '\n' + crossover.join(' ');
						text += '\n' + license.join(' ') + '\n' + misermode.join(' ');
						if ( description[1] ) text += '\n' + description.join(' ');
						if ( image[1] ) {
							text += '\n' + image.join(' ');
							if ( msg.uploadFiles() ) embed.files = [{attachment:image[1],name:( spoiler ? 'SPOILER ' : '' ) + body.query.general.sitename + image[1].substring(image[1].lastIndexOf('.'))}];
						}
						if ( readonly[1] ) text += '\n\n' + ( readonly[0] === '\u200b' ? readonly[1] : readonly.join('\n') );
						text += '\n\n*' + lang.get('overview.inaccurate') + '*';
					}
					
					msg.sendChannel( spoiler + text + spoiler, {embed} );
					
					if ( reaction ) reaction.removeEmoji();
				} );
			}
			if ( msg.showEmbed() ) {
				embed.addField( version[0], version[1], true ).addField( language[0], language[1], true );
				if ( rtl[1] ) embed.addField( rtl[0], rtl[1], true );
				embed.addField( created[0], created[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).addField( license[0], license[1], true ).addField( misermode[0], misermode[1], true ).setFooter( lang.get('overview.inaccurate') );
				if ( readonly[1] ) embed.addField( readonly[0], readonly[1] );
			}
			else {
				text += '\n' + version.join(' ') + '\n' + language.join(' ');
				if ( rtl[1] ) text += '\n' + rtl.join(' ');
				text += '\n' + created.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ') + '\n' + license.join(' ') + '\n' + misermode.join(' ');
				if ( readonly[1] ) text += '\n\n' + ( readonly[0] === '\u200b' ? readonly[1] : readonly.join('\n') );
				text += '\n\n*' + lang.get('overview.inaccurate') + '*';
			}
			
			msg.sendChannel( spoiler + text + spoiler, {embed} );
			
			if ( reaction ) reaction.removeEmoji();
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

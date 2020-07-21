const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const {limit: {discussion: discussionLimit}} = require('../util/default.json');

/**
 * Processes discussion commands.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} wiki - The wiki for the page.
 * @param {String} title - The title of the discussion post.
 * @param {Object} query - The siteinfo from the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function fandom_discussion(lang, msg, wiki, title, query, reaction, spoiler) {
	var limit = discussionLimit[( msg?.guild?.id in patreons ? 'patreon' : 'default' )];
	if ( !title ) {
		var pagelink = wiki + 'f';
		var embed = new MessageEmbed().setAuthor( query.general.sitename ).setTitle( lang.get('discussion.main') ).setURL( pagelink );
		got.get( wiki + 'f' ).then( descresponse => {
			var descbody = descresponse.body;
			if ( descresponse.statusCode !== 200 || !descbody ) {
				console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
			} else {
				var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', query.general);
				var parser = new htmlparser.Parser( {
					onopentag: (tagname, attribs) => {
						if ( tagname === 'meta' && attribs.property === 'og:description' ) {
							var description = attribs.content.escapeFormatting();
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						if ( tagname === 'meta' && attribs.property === 'og:image' ) {
							thumbnail = attribs.content;
						}
					}
				}, {decodeEntities:true} );
				parser.write( descbody );
				parser.end();
				embed.setThumbnail( thumbnail );
			}
		}, error => {
			console.log( '- Error while getting the description: ' + error );
		} ).finally( () => {
			msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, {embed} );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else if ( !query.wikidesc ) {
		return got.get( 'https://community.fandom.com/api/v1/Wikis/ByString?includeDomain=true&limit=10&string=' + query.general.servername + query.general.scriptpath + '&format=json', {
			responseType: 'json'
		} ).then( wvresponse => {
			var wvbody = wvresponse.body;
			if ( wvresponse.statusCode !== 200 || !wvbody || wvbody.exception || !wvbody.items || !wvbody.items.length ) {
				console.log( '- ' + wvresponse.statusCode + ': Error while getting the wiki id: ' + ( wvbody && wvbody.exception && wvbody.exception.details ) );
				msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( wvbody.items.some( site => site.domain === query.general.servername + query.general.scriptpath ) ) {
				query.wikidesc = {id: wvbody.items.find( site => site.domain === query.general.servername + query.general.scriptpath ).id};
				fandom_discussion(lang, msg, wiki, title, query, reaction, spoiler);
			}
			else {
				msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
		}, error => {
			console.log( '- Error while getting the wiki id: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else if ( title.split(' ')[0].toLowerCase() === 'post' || title.split(' ')[0].toLowerCase() === lang.get('discussion.post') ) {
		title = title.split(' ').slice(1).join(' ');
		got.get( 'https://services.fandom.com/discussion/' + query.wikidesc.id + '/posts?limit=' + limit + '&format=json', {
			headers: {
				Accept: 'application/hal+json'
			},
			responseType: 'json'
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body.title || !body._embedded || !body._embedded['doc:posts'] ) {
				console.log( '- ' + response.statusCode + ': Error while getting the posts: ' + ( body && body.title ) );
				msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( body._embedded['doc:posts'].length ) {
				var posts = body._embedded['doc:posts'];
				var embed = new MessageEmbed().setAuthor( query.general.sitename );
				
				if ( posts.some( post => post.id === title ) ) {
					discussion_send(lang, msg, wiki, posts.find( post => post.id === title ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( /^\d+$/.test(title) ) {
					got.get( 'https://services.fandom.com/discussion/' + query.wikidesc.id + '/posts/' + title + '?format=json', {
						headers: {
							Accept: 'application/hal+json'
						},
						responseType: 'json'
					} ).then( presponse => {
						var pbody = presponse.body;
						if ( presponse.statusCode !== 200 || !pbody || pbody.id !== title ) {
							if ( pbody && pbody.title === 'The requested resource was not found.' ) {
								if ( posts.some( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
									discussion_send(lang, msg, wiki, posts.find( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler);
								}
								else msg.reactEmoji('🤷');
							}
							else {
								console.log( '- ' + presponse.statusCode + ': Error while getting the post: ' + ( pbody && pbody.title ) );
								msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
							}
							
							if ( reaction ) reaction.removeEmoji();
						}
						else if ( pbody.title ) {
							discussion_send(lang, msg, wiki, pbody, embed, spoiler);
							
							if ( reaction ) reaction.removeEmoji();
						}
						else got.get( 'https://services.fandom.com/discussion/' + query.wikidesc.id + '/threads/' + pbody.threadId + '?format=json', {
							headers: {
								Accept: 'application/hal+json'
							},
							responseType: 'json'
						} ).then( thresponse => {
							var thbody = thresponse.body;
							if ( thresponse.statusCode !== 200 || !thbody || thbody.id !== pbody.threadId ) {
								console.log( '- ' + thresponse.statusCode + ': Error while getting the thread: ' + ( thbody && thbody.title ) );
								embed.setTitle( '~~' + pbody.threadId + '~~' );
							}
							else embed.setTitle( thbody.title.escapeFormatting() );
						}, error => {
							console.log( '- Error while getting the thread: ' + error );
							embed.setTitle( '~~' + pbody.threadId + '~~' );
						} ).finally( () => {
							discussion_send(lang, msg, wiki, pbody, embed, spoiler);
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}, error => {
						console.log( '- Error while getting the post: ' + error );
						msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
				else if ( posts.some( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
					discussion_send(lang, msg, wiki, posts.find( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					msg.reactEmoji('🤷');
					
					if ( reaction ) reaction.removeEmoji();
				}
			}
			else {
				msg.reactEmoji('🤷');
				
				if ( reaction ) reaction.removeEmoji();
			}
		}, error => {
			console.log( '- Error while getting the posts: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else {
		got.get( 'https://services.fandom.com/discussion/' + query.wikidesc.id + '/threads?sortKey=trending&limit=' + limit + '&format=json', {
			headers: {
				Accept: 'application/hal+json'
			},
			responseType: 'json'
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body.title || !body._embedded || !body._embedded.threads ) {
				console.log( '- ' + response.statusCode + ': Error while getting the threads: ' + ( body && body.title ) );
				msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( body._embedded.threads.length ) {
				var threads = body._embedded.threads;
				var embed = new MessageEmbed().setAuthor( query.general.sitename );
				
				if ( threads.some( thread => thread.id === title ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.id === title ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( threads.some( thread => thread.title === title ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.title === title ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( threads.some( thread => thread.title.toLowerCase() === title.toLowerCase() ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.title.toLowerCase() === title.toLowerCase() ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( threads.some( thread => thread.title.includes( title ) ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.title.includes( title ) ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( threads.some( thread => thread.title.toLowerCase().includes( title.toLowerCase() ) ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.title.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else if ( /^\d+$/.test(title) ) {
					got.get( 'https://services.fandom.com/discussion/' + query.wikidesc.id + '/threads/' + title + '?format=json', {
						headers: {
							Accept: 'application/hal+json'
						},
						responseType: 'json'
					} ).then( thresponse => {
						var thbody = thresponse.body;
						if ( thresponse.statusCode !== 200 || !thbody || thbody.id !== title ) {
							if ( thbody && thbody.status === 404 ) {
								if (threads.some( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
									discussion_send(lang, msg, wiki, threads.find( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler);
								}
								else msg.reactEmoji('🤷');
							}
							else {
								console.log( '- ' + thresponse.statusCode + ': Error while getting the thread: ' + ( thbody && thbody.title ) );
								msg.sendChannelError( spoiler + '<' + wiki + 'f/p/' + title + '>' + spoiler );
							}
						}
						else discussion_send(lang, msg, wiki, thbody, embed, spoiler);
					}, error => {
						console.log( '- Error while getting the thread: ' + error );
						msg.sendChannelError( spoiler + '<' + wiki + 'f/p/' + title + '>' + spoiler );
					} ).finally( () => {
						if ( reaction ) reaction.removeEmoji();
					} );
				}
				else if ( threads.some( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
					discussion_send(lang, msg, wiki, threads.find( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler);
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					msg.reactEmoji('🤷');
					
					if ( reaction ) reaction.removeEmoji();
				}
			}
			else {
				msg.reactEmoji('🤷');
				
				if ( reaction ) reaction.removeEmoji();
			}
		}, error => {
			console.log( '- Error while getting the threads: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki + 'f' + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

/**
 * Send discussion posts.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} wiki - The wiki for the page.
 * @param {Object} discussion - The discussion post.
 * @param {import('discord.js').MessageEmbed} embed - The embed for the page.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function discussion_send(lang, msg, wiki, discussion, embed, spoiler) {
	if ( discussion.title ) {
		embed.setTitle( discussion.title.escapeFormatting() );
		var pagelink = wiki + 'f/p/' + ( discussion.threadId || discussion.id );
	}
	else {
		if ( discussion._embedded.thread ) embed.setTitle( discussion._embedded.thread[0].title.escapeFormatting() );
		var pagelink = wiki + 'f/p/' + discussion.threadId + '/r/' + discussion.id;
	}
	var text = '<' + pagelink + '>';
	embed.setURL( pagelink ).setFooter( discussion.createdBy.name, discussion.createdBy.avatarUrl ).setTimestamp( discussion.creationDate.epochSecond * 1000 );
	var description = '';
	switch ( discussion.funnel ) {
		case 'IMAGE':
			embed.setImage( discussion._embedded.contentImages[0].url );
			break;
		case 'POLL':
			discussion.poll.answers.forEach( answer => embed.addField( answer.text.escapeFormatting(), ( answer.image ? '[__' + lang.get('discussion.image').escapeFormatting() + '__](' + answer.image.url + ')\n' : '' ) + lang.get('discussion.votes', answer.votes), true ) );
			break;
		case 'QUIZ':
			description = discussion.quiz.title.escapeFormatting();
			if ( discussion._embedded.openGraph ) embed.setThumbnail( discussion._embedded.openGraph[0].imageUrl );
			break;
		default:
			if ( discussion.jsonModel ) {
				try {
					description = discussion_formatting(JSON.parse(discussion.jsonModel)).replace( /(?:\*\*\*\*|(?<!\\)\_\_)/g, '' ).replace( /{@wiki}/g, wiki );
					if ( discussion._embedded.contentImages.length ) {
						if ( description.trim().endsWith( '{@0}' ) ) {
							embed.setImage( discussion._embedded.contentImages[0].url );
							description = description.replace( '{@0}', '' ).trim();
						}
						else {
							description = description.replace( /\{\@(\d+)\}/g, (match, n) => {
								if ( n >= discussion._embedded.contentImages.length ) return '';
								else return '[__' + lang.get('discussion.image').escapeFormatting() + '__](' + discussion._embedded.contentImages[n].url + ')';
							} );
							embed.setThumbnail( discussion._embedded.contentImages[0].url );
						}
					}
					else embed.setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png') );
				}
				catch ( jsonerror ) {
					console.log( '- Error while getting the formatting: ' + jsonerror );
					description = discussion.rawContent.escapeFormatting();
					if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
				}
			}
			else if ( discussion.renderedContent ) {
				var current_tag = '';
				var parser = new htmlparser.Parser( {
					onopentag: (tagname, attribs) => {
						if ( tagname === 'a' ) {
							current_tag = attribs.href;
							description += '[';
						}
					},
					ontext: (htmltext) => {
						description += htmltext.escapeFormatting();
					},
					onclosetag: (tagname) => {
						if ( tagname === 'a' ) {
							description += '](' + current_tag + ')';
							current_tag = '';
						}
						if ( tagname === 'p' ) description += '\n';
					}
				}, {decodeEntities:true} );
				parser.write( discussion.renderedContent );
				parser.end();
				if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
			}
			else {
				description = discussion.rawContent.escapeFormatting();
				if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
			}
	}
	if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
	embed.setDescription( description );
	
	msg.sendChannel( spoiler + text + spoiler, {embed} );
}

/**
 * Format discussion content
 * @param {Object} jsonModel - The content of the discussion post.
 * @returns {String}
 */
function discussion_formatting(jsonModel) {
	var description = '';
	switch ( jsonModel.type ) {
		case 'doc':
			if ( jsonModel.content ) jsonModel.content.forEach( content => description += discussion_formatting(content) );
			break;
		case 'paragraph':
			if ( jsonModel.content ) jsonModel.content.forEach( content => description += discussion_formatting(content) );
			description += '\n';
			break;
		case 'openGraph':
			if ( !jsonModel.attrs.wasAddedWithInlineLink ) description += jsonModel.attrs.url + '\n';
			break;
		case 'text':
			var prepend = '';
			var append = '';
			if ( jsonModel.marks ) {
				jsonModel.marks.forEach( mark => {
					switch ( mark.type ) {
						case 'mention':
							prepend += '[';
							append = ']({@wiki}f/u/' + mark.attrs.userId + ')' + append;
							break;
						case 'link':
							prepend += '[';
							append = '](' + mark.attrs.href + ')' + append;
							break;
						case 'strong':
							prepend += '**';
							append = '**' + append;
							break;
						case 'em':
							prepend += '_';
							append = '_' + append;
							break;
					}
				} );
			}
			description += prepend + jsonModel.text.escapeFormatting() + append;
			break;
		case 'image':
			if ( jsonModel.attrs.id !== null ) description += '{@' + jsonModel.attrs.id + '}\n';
			break;
		case 'code_block':
			description += '```\n';
			if ( jsonModel.content ) jsonModel.content.forEach( content => description += discussion_formatting(content) );
			description += '\n```\n';
			break;
		case 'bulletList':
			jsonModel.content.forEach( listItem => {
				description += '\t• ';
				if ( listItem.content ) listItem.content.forEach( content => description += discussion_formatting(content) );
			} );
			break;
		case 'orderedList':
			var n = 1;
			jsonModel.content.forEach( listItem => {
				description += '\t' + n + '. ';
				n++;
				if ( listItem.content ) listItem.content.forEach( content => description += discussion_formatting(content) );
			} );
			break;
	}
	return description;
}

module.exports = fandom_discussion;
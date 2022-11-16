import { Parser as HTMLParser } from 'htmlparser2';
import { EmbedBuilder } from 'discord.js';
import { got, htmlToDiscord, escapeFormatting, splitMessage } from '../../util/functions.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {limit: {discussion: discussionLimit}} = require('../../util/default.json');

/**
 * Processes discussion commands.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the page.
 * @param {String} title - The title of the discussion post.
 * @param {String} sitename - The sitename of the wiki.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>}
 */
export default function fandom_discussion(lang, msg, wiki, title, sitename, spoiler, noEmbed) {
	var limit = discussionLimit[( patreonGuildsPrefix.has(msg.guildId) ? 'patreon' : 'default' )];
	if ( !title ) {
		var pagelink = wiki + 'f';
		if ( noEmbed ) {
			return Promise.resolve( {message: spoiler + '<' + pagelink + '>' + spoiler} );
		}
		var embed = new EmbedBuilder().setAuthor( {name: sitename} ).setTitle( lang.get('discussion.main') ).setURL( pagelink );
		return got.get( wiki + 'f', {
			responseType: 'text',
			context: {
				guildId: msg.guildId
			}
		} ).then( descresponse => {
			var descbody = descresponse.body;
			if ( descresponse.statusCode !== 200 || !descbody ) {
				return console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
			}
			var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png');
			var parser = new HTMLParser( {
				onopentag: (tagname, attribs) => {
					if ( tagname === 'body' ) parser.pause(); // Prevent the parser from running too long
					if ( tagname === 'meta' && attribs.property === 'og:description' ) {
						var description = escapeFormatting(attribs.content);
						if ( description.length > DESC_LENGTH ) description = description.substring(0, DESC_LENGTH) + '\u2026';
						embed.setDescription( description );
					}
					if ( tagname === 'meta' && attribs.property === 'og:image' ) {
						thumbnail = attribs.content;
					}
				}
			} );
			parser.write( descbody );
			parser.end();
			embed.setThumbnail( thumbnail );
		}, error => {
			console.log( '- Error while getting the description: ' + error );
		} ).then( () => {
			return {message: {
				content: spoiler + '<' + pagelink + '>' + spoiler,
				embeds: [embed]
			}};
		} );
	}
	if ( title.split(' ')[0].toLowerCase() === 'post' || title.split(' ')[0].toLowerCase() === lang.get('discussion.post') ) {
		title = title.split(' ').slice(1).join(' ');
		return got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=' + limit + '&format=json&cache=' + Date.now(), {
			headers: {
				Accept: 'application/hal+json'
			},
			context: {
				guildId: msg.guildId
			}
		} ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body.title || !body._embedded || !body._embedded['doc:posts'] ) {
				console.log( '- ' + response.statusCode + ': Error while getting the posts: ' + ( body && body.title ) );
				return {
					reaction: WB_EMOJI.error,
					message: spoiler + '<' + wiki + 'f' + '>' + spoiler
				};
			}
			if ( body._embedded['doc:posts'].length ) {
				var posts = body._embedded['doc:posts'];
				var embed = new EmbedBuilder().setAuthor( {name: sitename} );
				
				if ( posts.some( post => post.id === title ) ) {
					return discussion_send(lang, msg, wiki, posts.find( post => post.id === title ), embed, spoiler, noEmbed);
				}
				if ( /^\d+$/.test(title) ) {
					return got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPost&postId=' + title + '&format=json&cache=' + Date.now(), {
						headers: {
							Accept: 'application/hal+json'
						},
						context: {
							guildId: msg.guildId
						}
					} ).then( presponse => {
						var pbody = presponse.body;
						if ( presponse.statusCode !== 200 || !pbody || pbody.id !== title ) {
							if ( pbody && pbody.title === 'The requested resource was not found.' ) {
								if ( posts.some( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
									return discussion_send(lang, msg, wiki, posts.find( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler, noEmbed);
								}
								return {reaction: WB_EMOJI.shrug};
							}
							console.log( '- ' + presponse.statusCode + ': Error while getting the post: ' + ( pbody && pbody.title ) );
							return {
								reaction: WB_EMOJI.error,
								message: spoiler + '<' + wiki + 'f' + '>' + spoiler
							};
						}
						if ( pbody.title ) {
							return discussion_send(lang, msg, wiki, pbody, embed, spoiler, noEmbed);
						}
						return got.get( wiki + 'wikia.php?controller=DiscussionThread&method=getThread&threadId=' + pbody.threadId + '&format=json&cache=' + Date.now(), {
							headers: {
								Accept: 'application/hal+json'
							},
							context: {
								guildId: msg.guildId
							}
						} ).then( thresponse => {
							var thbody = thresponse.body;
							if ( thresponse.statusCode !== 200 || !thbody || thbody.id !== pbody.threadId ) {
								console.log( '- ' + thresponse.statusCode + ': Error while getting the thread: ' + ( thbody && thbody.title ) );
								embed.setTitle( '~~' + pbody.threadId + '~~' );
							}
							else embed.setTitle( escapeFormatting(thbody.title) );
						}, error => {
							console.log( '- Error while getting the thread: ' + error );
							embed.setTitle( '~~' + pbody.threadId + '~~' );
						} ).then( () => {
							return discussion_send(lang, msg, wiki, pbody, embed, spoiler, noEmbed);
						} );
					}, error => {
						console.log( '- Error while getting the post: ' + error );
						return {
							reaction: WB_EMOJI.error,
							message: spoiler + '<' + wiki + 'f' + '>' + spoiler
						};
					} );
				}
				if ( posts.some( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
					return discussion_send(lang, msg, wiki, posts.find( post => post.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler, noEmbed);
				}
			}
			return {reaction: WB_EMOJI.shrug};
		}, error => {
			console.log( '- Error while getting the posts: ' + error );
			return {
				reaction: WB_EMOJI.error,
				message: spoiler + '<' + wiki + 'f' + '>' + spoiler
			};
		} );
	}
	return got.get( wiki + 'wikia.php?controller=DiscussionThread&method=getThreads&sortKey=trending&limit=' + limit + '&format=json&cache=' + Date.now(), {
		headers: {
			Accept: 'application/hal+json'
		},
		context: {
			guildId: msg.guildId
		}
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body || body.title || !body._embedded || !body._embedded.threads ) {
			console.log( '- ' + response.statusCode + ': Error while getting the threads: ' + ( body && body.title ) );
			return {
				reaction: WB_EMOJI.error,
				message: spoiler + '<' + wiki + 'f' + '>' + spoiler
			};
		}
		if ( body._embedded.threads.length ) {
			var threads = body._embedded.threads;
			var embed = new EmbedBuilder().setAuthor( {name: sitename} );
			
			if ( threads.some( thread => thread.id === title ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.id === title ), embed, spoiler, noEmbed);
			}
			if ( threads.some( thread => thread.title === title ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.title === title ), embed, spoiler, noEmbed);
			}
			if ( threads.some( thread => thread.title.toLowerCase() === title.toLowerCase() ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.title.toLowerCase() === title.toLowerCase() ), embed, spoiler, noEmbed);
			}
			if ( threads.some( thread => thread.title.includes( title ) ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.title.includes( title ) ), embed, spoiler, noEmbed);
			}
			if ( threads.some( thread => thread.title.toLowerCase().includes( title.toLowerCase() ) ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.title.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler, noEmbed);
			}
			if ( /^\d+$/.test(title) ) {
				return got.get( wiki + 'wikia.php?controller=DiscussionThread&method=getThread&threadId=' + title + '&format=json&cache=' + Date.now(), {
					headers: {
						Accept: 'application/hal+json'
					},
					context: {
						guildId: msg.guildId
					}
				} ).then( thresponse => {
					var thbody = thresponse.body;
					if ( thresponse.statusCode !== 200 || !thbody || thbody.id !== title ) {
						if ( thbody && thbody.status === 404 ) {
							if (threads.some( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
								return discussion_send(lang, msg, wiki, threads.find( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler, noEmbed);
							}
							return {reaction: WB_EMOJI.shrug};
						}
						console.log( '- ' + thresponse.statusCode + ': Error while getting the thread: ' + ( thbody && thbody.title ) );
						return {
							reaction: WB_EMOJI.error,
							message: spoiler + '<' + wiki + 'f/p/' + title + '>' + spoiler
						};
					}
					return discussion_send(lang, msg, wiki, thbody, embed, spoiler, noEmbed);
				}, error => {
					console.log( '- Error while getting the thread: ' + error );
					return {
						reaction: WB_EMOJI.error,
						message: spoiler + '<' + wiki + 'f/p/' + title + '>' + spoiler
					};
				} );
			}
			if ( threads.some( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ) ) {
				return discussion_send(lang, msg, wiki, threads.find( thread => thread.rawContent.toLowerCase().includes( title.toLowerCase() ) ), embed, spoiler, noEmbed);
			}
		}
		return {reaction: WB_EMOJI.shrug};
	}, error => {
		console.log( '- Error while getting the threads: ' + error );
		return {
			reaction: WB_EMOJI.error,
			message: spoiler + '<' + wiki + 'f' + '>' + spoiler
		};
	} );
}

/**
 * Send discussion posts.
 * @param {import('../../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message|import('discord.js').ChatInputCommandInteraction} msg - The Discord message.
 * @param {import('../../util/wiki.js').default} wiki - The wiki for the page.
 * @param {Object} discussion - The discussion post.
 * @param {EmbedBuilder} embed - The embed for the page.
 * @param {String} spoiler - If the response is in a spoiler.
 * @param {Boolean} noEmbed - If the response should be without an embed.
 * @returns {Promise<{reaction?: WB_EMOJI, message?: String|import('discord.js').MessageOptions}>}
 */
function discussion_send(lang, msg, wiki, discussion, embed, spoiler, noEmbed) {
	if ( discussion.title ) {
		embed.setTitle( escapeFormatting(discussion.title) );
		var pagelink = wiki + 'f/p/' + ( discussion.threadId || discussion.id );
	}
	else {
		if ( discussion._embedded.thread ) embed.setTitle( escapeFormatting(discussion._embedded.thread[0].title) );
		var pagelink = wiki + 'f/p/' + discussion.threadId + '/r/' + discussion.id;
	}
	if ( noEmbed ) return {message: spoiler + '<' + pagelink + '>' + spoiler};
	embed.setURL( pagelink ).setFooter( {text: discussion.createdBy.name, iconURL: discussion.createdBy.avatarUrl} ).setTimestamp( discussion.creationDate.epochSecond * 1000 );
	var description = '';
	switch ( discussion.funnel ) {
		case 'IMAGE':
			embed.setImage( discussion._embedded.contentImages[0].url );
			break;
		case 'POLL':
			embed.addFields(...discussion.poll.answers.map( answer => {
				return {
					name: escapeFormatting(answer.text),
					value: ( answer.image ? '[__' + lang.get('discussion.image') + '__](<' + answer.image.url + '>)\n' : '' ) + lang.get('discussion.votes', answer.votes.toLocaleString(lang.get('dateformat')), answer.votes, ( ( answer.votes / discussion.poll.totalVotes ) * 100 ).toFixed(1).toLocaleString(lang.get('dateformat'))),
					inline: true
				};
			} ));
			break;
		case 'QUIZ':
			description = escapeFormatting(discussion._embedded.quizzes[0].title);
			embed.setThumbnail( discussion._embedded.quizzes[0].image );
			break;
		default:
			if ( discussion.jsonModel ) {
				try {
					description = discussion_formatting(JSON.parse(discussion.jsonModel)).replace( /(?:\*\*\*\*|(?<!\\)\_\_)/g, '' ).replaceAll( '{@wiki}', wiki );
					if ( discussion._embedded.contentImages.length ) {
						if ( description.trim().endsWith( '{@0}' ) ) {
							embed.setImage( discussion._embedded.contentImages[0].url );
							description = description.replace( '{@0}', '' ).trim();
						}
						else {
							description = description.replace( /\{\@(\d+)\}/g, (match, n) => {
								if ( n >= discussion._embedded.contentImages.length ) return '';
								else return '[__' + lang.get('discussion.image') + '__](<' + discussion._embedded.contentImages[n].url + '>)';
							} );
							embed.setThumbnail( discussion._embedded.contentImages[0].url );
						}
					}
					else embed.setThumbnail( wiki.toLink('Special:FilePath/Wiki-wordmark.png') );
				}
				catch ( jsonerror ) {
					console.log( '- Error while getting the formatting: ' + jsonerror );
					description = escapeFormatting(discussion.rawContent);
					if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
				}
			}
			else if ( discussion.renderedContent ) {
				description = htmlToDiscord(discussion.renderedContent, pagelink);
				if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
			}
			else {
				description = escapeFormatting(discussion.rawContent);
				if ( discussion._embedded.contentImages.length ) embed.setThumbnail( discussion._embedded.contentImages[0].url );
			}
	}
	if ( description.length > DESC_LENGTH ) description = description.substring(0, DESC_LENGTH) + '\u2026';
	if ( description ) embed.setDescription( description );
	if ( discussion.tags?.length ) {
		embed.addFields( {name: lang.get('discussion.tags'), value: splitMessage( discussion.tags.map( tag => '[' + escapeFormatting(tag.articleTitle) + '](<' + wiki.toLink(tag.articleTitle, '', '', true) + '>)' ).join(', '), {char: ', ', maxLength: FIELD_LENGTH} )[0], inline: false} );
	}
	
	return {message: {
		content: spoiler + '<' + pagelink + '>' + spoiler,
		embeds: [embed]
	}};
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
		case 'text': {
			let prepend = '';
			let append = '';
			if ( jsonModel.marks ) {
				jsonModel.marks.forEach( mark => {
					switch ( mark.type ) {
						case 'mention':
							prepend += '[';
							append = '](<{@wiki}f/u/' + mark.attrs.userId + '>)' + append;
							break;
						case 'link':
							prepend += '[';
							append = '](<' + mark.attrs.href + '>)' + append;
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
			description += prepend + escapeFormatting(jsonModel.text) + append;
			break;
		}
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
		case 'orderedList': {
			let n = 1;
			jsonModel.content.forEach( listItem => {
				description += '\t' + n + '. ';
				n++;
				if ( listItem.content ) listItem.content.forEach( content => description += discussion_formatting(content) );
			} );
			break;
		}
	}
	return description;
}
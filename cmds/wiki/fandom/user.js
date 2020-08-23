const htmlparser = require('htmlparser2');
const {MessageEmbed} = require('discord.js');
const global_block = require('../../../functions/global_block.js');
const {timeoptions, usergroups} = require('../../../util/default.json');

/**
 * Processes a Fandom user.
 * @param {import('../../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String} namespace - The user namespace on the wiki.
 * @param {String} username - The name of the user.
 * @param {String} wiki - The wiki for the page.
 * @param {String} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {Object} querypage - The user page on the wiki.
 * @param {String} contribs - The contributions page on the wiki.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function fandom_user(lang, msg, namespace, username, wiki, querystring, fragment, querypage, contribs, reaction, spoiler) {
	if ( /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
		got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( response.statusCode !== 200 || !body || !body.query || !body.query.blocks ) {
				if ( body && body.error && ( body.error.code === 'param_ip' || body.error.code === 'cidrtoobroad' ) ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) {
						msg.reactEmoji('error');
						
						if ( reaction ) reaction.removeEmoji();
					}
					else {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment);
						var embed = new MessageEmbed().setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						got.get( wiki.toDescLink(querypage.title), {
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
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring.toTitle(), fragment) + '>' + spoiler );
					
					if ( reaction ) reaction.removeEmoji();
				}
			}
			else {
				if ( !querypage.noRedirect || ( querypage.missing === undefined && querypage.ns !== -1 ) ) namespace = contribs;
				var blocks = body.query.blocks.map( block => {
					var isBlocked = false;
					var blockedtimestamp = new Date(block.timestamp).toLocaleString(lang.get('dateformat'), timeoptions);
					var blockexpiry = block.expiry;
					if ( ['infinity', 'infinite'].includes(blockexpiry) ) {
						blockexpiry = lang.get('user.block.until_infinity');
						isBlocked = true;
					} else if ( blockexpiry ) {
						if ( Date.parse(blockexpiry) > Date.now() ) isBlocked = true;
						blockexpiry = new Date(blockexpiry).toLocaleString(lang.get('dateformat'), timeoptions);
					}
					if ( isBlocked ) return {
						header: lang.get('user.block.header', block.user, 'unknown').escapeFormatting(),
						text: lang.get('user.block.' + ( block.reason ? 'text' : 'noreason' ), blockedtimestamp, blockexpiry),
						by: block.by,
						reason: block.reason
					};
				} ).filter( block => block !== undefined );
				if ( username.includes( '/' ) ) {
					var rangeprefix = username;
					if ( username.includes( ':' ) ) {
						var range = parseInt(username.replace( /^.+\/(\d{2,3})$/, '$1' ), 10);
						if ( range === 128 ) username = username.replace( /^(.+)\/\d{2,3}$/, '$1' );
						else if ( range >= 112 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){7}).+$/, '$1' );
						else if ( range >= 96 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){6}).+$/, '$1' );
						else if ( range >= 80 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){5}).+$/, '$1' );
						else if ( range >= 64 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){4}).+$/, '$1' );
						else if ( range >= 48 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){3}).+$/, '$1' );
						else if ( range >= 32 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){2}).+$/, '$1' );
						else if ( range >= 19 ) rangeprefix = username.replace( /^((?:[\dA-F]{1,4}:){1}).+$/, '$1' );
					}
					else {
						var range = parseInt(username.substring(username.length - 2), 10);
						if ( range === 32 ) username = username.replace( /^(.+)\/\d{2}$/, '$1' );
						else if ( range >= 24 ) rangeprefix = username.replace( /^((?:\d{1,3}\.){3}).+$/, '$1' );
						else if ( range >= 16 ) rangeprefix = username.replace( /^((?:\d{1,3}\.){2}).+$/, '$1' );
					}
				}
				got.get( wiki + 'api.php?action=query&list=usercontribs&ucprop=&uclimit=50&ucuser=' + encodeURIComponent( username ) + '&format=json' ).then( ucresponse => {
					var ucbody = ucresponse.body;
					if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
					if ( ucbody && ucbody.warnings ) log_warn(ucbody.warnings);
					if ( ucresponse.statusCode !== 200 || !ucbody || !ucbody.query || !ucbody.query.usercontribs ) {
						if ( ucbody && ucbody.error && ucbody.error.code === 'baduser_ucuser' ) {
							msg.reactEmoji('error');
						}
						else {
							console.log( '- ' + ucresponse.statusCode + ': Error while getting the search results: ' + ( ucbody && ucbody.error && ucbody.error.info ) );
							msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
						}
					}
					else {
						var editcount = [lang.get('user.info.editcount'), ( username.includes( '/' ) ? '~' : '' ) + ucbody.query.usercontribs.length + ( ucbody.continue ? '+' : '' )];
						
						var pagelink = wiki.toLink(namespace + username, querystring.toTitle(), fragment, body.query.general);
						if ( msg.showEmbed() ) {
							var text = '<' + pagelink + '>';
							var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( username ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink(contribs + username, '', '', body.query.general, true) + ')' );
							if ( blocks.length ) {
								block.text = block.text.replaceSave( /\$3/g, '[' + block.by.escapeFormatting() + '](' + wiki.toLink('User:' + block.by, '', '', body.query.general, true) + ')' );
								if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, block.reason.toMarkdown(wiki, body.query.general) );
								embed.addField( block.header, block.text );
							}
						}
						else {
							var embed = {};
							var text = '<' + pagelink + '>\n\n' + editcount.join(' ');
							if ( blocks.length ) {
								block.text = block.text.replaceSave( /\$3/g, block.by.escapeFormatting() );
								if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, block.reason.toPlaintext() );
								text += '\n\n**' + block.header + '**\n' + block.text;
							}
						}
						
						if ( msg.channel.type === 'text' && msg.guild.id in patreons ) {
							if ( msg.showEmbed() ) embed.addField( '\u200b', '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**' );
							else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';
							
							msg.sendChannel( spoiler + text + spoiler, {embed} ).then( message => global_block(lang, message, username, text, embed, wiki, spoiler) );
						}
						else msg.sendChannel( spoiler + text + spoiler, {embed} );
					}
				}, error => {
					if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
					console.log( '- Error while getting the search results: ' + error );
					msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring.toTitle(), fragment, body.query.general) + '>' + spoiler );
				} ).finally( () => {
					if ( reaction ) reaction.removeEmoji();
				} );
			}
		}, error => {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink(( querypage.noRedirect ? namespace : contribs ) + username, querystring.toTitle(), fragment) + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	} else {
		got.get( wiki + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-Wiki_Manager&amenableparser=true&siprop=general&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ) + '&format=json' ).then( response => {
			var body = response.body;
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( response.statusCode !== 200 || !body || !body.query || !body.query.users ) {
				console.log( '- ' + response.statusCode + ': Error while getting the search results: ' + ( body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring.toTitle(), fragment) + '>' + spoiler );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				var queryuser = body.query.users[0];
				if ( !queryuser ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) {
						msg.reactEmoji('🤷');
						
						if ( reaction ) reaction.removeEmoji();
					}
					else {
						var pagelink = wiki.toLink(querypage.title, querystring.toTitle(), fragment, body.query.general);
						var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						got.get( wiki.toDescLink(querypage.title), {
							responseType: 'text'
						} ).then( descresponse => {
							var descbody = descresponse.body;
							if ( descresponse.statusCode !== 200 || !descbody ) {
								console.log( '- ' + descresponse.statusCode + ': Error while getting the description.' );
							} else {
								var thumbnail = wiki.toLink('Special:FilePath/Wiki-wordmark.png', '', '', body.query.general);
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
				}
				else {
					username = queryuser.name;
					var gender = [lang.get('user.info.gender')];
					switch (queryuser.gender) {
						case 'male':
							gender.push(lang.get('user.gender.male'));
							break;
						case 'female':
							gender.push(lang.get('user.gender.female'));
							break;
						default: 
							gender.push(lang.get('user.gender.unknown'));
					}
					var registration = [lang.get('user.info.registration'), new Date(queryuser.registration).toLocaleString(lang.get('dateformat'), timeoptions)];
					var editcount = [lang.get('user.info.editcount'), queryuser.editcount];
					var groups = queryuser.groups;
					var group = [lang.get('user.info.group')];
					for ( var i = 0; i < usergroups.length; i++ ) {
						if ( groups.includes( usergroups[i] ) && ( group.length === 1 || !['autoconfirmed', 'user'].includes( usergroups[i] ) ) ) {
							if ( usergroups[i] === 'wiki-manager' && body.query.allmessages[0]['*'] === username ) {
								group.push('**' + lang.get('user.groups.' + usergroups[i], queryuser.gender) + '**');
							}
							else group.push(lang.get('user.groups.' + usergroups[i], queryuser.gender));
						}
					}
					var isBlocked = false;
					var blockexpiry = queryuser.blockexpiry;
					if ( ['infinity', 'infinite'].includes(blockexpiry) ) {
						blockexpiry = lang.get('user.block.until_infinity');
						isBlocked = true;
					} else if ( blockexpiry ) {
						var blockexpirydate = blockexpiry.replace( /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z' );
						blockexpiry = new Date(blockexpirydate).toLocaleString(lang.get('dateformat'), timeoptions);
						if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
					}
					var blockedby = '[[User:' + queryuser.blockedby + '|' + queryuser.blockedby + ']]';
					var blockreason = queryuser.blockreason;
					var block = {
						header: lang.get('user.block.header', username, queryuser.gender).escapeFormatting(),
						text: lang.get('user.block.nofrom' + ( blockreason ? 'text' : 'noreason' ), '', blockexpiry ),
						by: blockedby,
						reason: blockreason
					};
					
					var pagelink = wiki.toLink(namespace + username, querystring.toTitle(), fragment, body.query.general);
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var embed = new MessageEmbed().setAuthor( body.query.general.sitename ).setTitle( username.escapeFormatting() ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink(contribs + username, '', '', body.query.general, true) + ')', true ).addField( group[0], group.slice(1).join(',\n'), true ).addField( gender[0], gender[1], true ).addField( registration[0], registration[1], true );
					}
					else {
						var embed = {};
						var text = '<' + pagelink + '>\n\n' + gender.join(' ') + '\n' + registration.join(' ') + '\n' + editcount.join(' ') + '\n' + group[0] + ' ' + group.slice(1).join(', ');
					}
					
					got.get( 'https://services.fandom.com/user-attribute/user/' + queryuser.userid + '?format=json&cache=' + Date.now(), {
						headers: {
							Accept: 'application/hal+json'
						}
					} ).then( presponse => {
						var pbody = presponse.body;
						if ( presponse.statusCode !== 200 || !pbody || pbody.title || !pbody._embedded || !pbody._embedded.properties ) {
							if ( !( pbody && pbody.status === 404 ) ) {
								console.log( '- ' + presponse.statusCode + ': Error while getting the user profile: ' + ( pbody && pbody.title ) );
							}
						}
						else {
							var profile = pbody._embedded.properties;
							var discordfield = profile.find( field => field.name === 'discordHandle' );
							var avatarfield = profile.find( field => field.name === 'avatar' );
							var biofield = profile.find( field => field.name === 'bio' );
							if ( discordfield && discordfield.value ) {
								discordfield.value = htmlToPlain( discordfield.value ).replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/, '$1#$2' );
								if ( discordfield.value.length > 50 ) discordfield.value = discordfield.value.substring(0, 50) + '\u2026';
								if ( msg.channel.type === 'text' ) var discordmember = msg.guild.members.cache.find( member => {
									return member.user.tag.escapeFormatting() === discordfield.value;
								} );
								var discordname = [lang.get('user.info.discord'),discordfield.value];
								if ( discordmember ) discordname[1] = discordmember.toString();
								
								if ( msg.showEmbed() ) embed.addField( discordname[0], discordname[1], true );
								else text += '\n' + discordname.join(' ');
							}
							if ( msg.showEmbed() ) {
								if ( avatarfield && avatarfield.value ) embed.setThumbnail( avatarfield.value );
								if ( biofield && biofield.value && !embed.description ) {
									var bio = biofield.value.escapeFormatting();
									if ( bio.length > 2000 ) bio = bio.substring(0, 2000) + '\u2026';
									embed.setDescription( bio );
								}
							}
						}
					}, error => {
						console.log( '- Error while getting the user profile: ' + error );
					} ).finally( () => {
						if ( msg.showEmbed() ) {
							if ( isBlocked ) {
								block.text = block.text.replaceSave( /\$3/g, '[' + block.by.escapeFormatting() + '](' + wiki.toLink('User:' + block.by, '', '', body.query.general, true) + ')' );
								if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, block.reason.toMarkdown(wiki, body.query.general) );
								embed.addField( block.header, block.text );
							}
						}
						else {
							if ( isBlocked ) {
								block.text = block.text.replaceSave( /\$3/g, block.by.escapeFormatting() );
								if ( block.reason ) block.text = block.text.replaceSave( /\$4/g, block.reason.toPlaintext() );
								text += '\n\n**' + block.header + '**\n' + block.text;
							}
						}
						
						if ( msg.channel.type === 'text' && msg.guild.id in patreons ) {
							if ( msg.showEmbed() ) embed.addField( '\u200b', '<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**' );
							else text += '\n\n<a:loading:641343250661113886> **' + lang.get('user.info.loading') + '**';
							
							msg.sendChannel( spoiler + text + spoiler, {embed} ).then( message => global_block(lang, message, username, text, embed, wiki, spoiler, queryuser.gender) );
						}
						else msg.sendChannel( spoiler + text + spoiler, {embed} );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
			}
		}, error => {
			console.log( '- Error while getting the search results: ' + error );
			msg.sendChannelError( spoiler + '<' + wiki.toLink(namespace + username, querystring.toTitle(), fragment) + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

/**
 * Change HTML text to plain text.
 * @param {String} html - The text in HTML.
 * @returns {String}
 */
function htmlToPlain(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		}
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

module.exports = {
	name: 'user',
	run: fandom_user
};
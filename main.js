const fs = require('fs');

const Discord = require('discord.js');
var request = require('request');
request = request.defaults({jar: true});

var client = new Discord.Client( {disableEveryone:true} );

var i18n = JSON.parse(fs.readFileSync('i18n.json', 'utf8'));

var pause = {};

var defaultSettings = {
	"default": {
		"lang": "en",
		"wiki": "help"
	}
}
var settings = defaultSettings;

function getSettings(callback) {
	request( {
		uri: process.env.site + process.env.page + '?action=raw&ctype=javascript',
		json: true
	}, function( error, response, body ) {
		if ( error || !response || !body ) {
			console.log( 'Fehler beim Erhalten der Einstellungen' + ( error ? ': ' + error.message : '.' ) );
		}
		else {
			console.log( 'Einstellungen erfolgreich ausgelesen.' );
			settings = Object.assign({}, body);
		}
		callback();
	} );
}

function setStatus() {
	if ( settings == defaultSettings ) client.user.setStatus('invisible');
	else client.user.setStatus('online');
}

client.on('ready', () => {
	getSettings(setStatus);
	console.log( 'Erfolgreich als ' + client.user.username + ' angemeldet!' );
	client.user.setActivity( process.env.prefix + 'help' );
} );


var cmdmap = {
	help: cmd_help,
	test: cmd_test,
	invite: cmd_invite,
	stop: cmd_stop,
	pause: cmd_pause,
	server: cmd_serverlist,
	say: cmd_multiline,
	delete: cmd_multiline,
	purge: cmd_multiline,
	poll: cmd_multiline,
	voice: cmd_voice,
	settings: cmd_settings,
	info: cmd_info,
	eval: cmd_multiline
}

var multilinecmdmap = {
	say: cmd_say,
	delete: cmd_delete,
	poll: cmd_umfrage,
	eval: cmd_eval
}

var pausecmdmap = {
	test: cmd_test,
	stop: cmd_stop,
	pause: cmd_pause,
	server: cmd_serverlist,
	say: cmd_multiline,
	delete: cmd_multiline,
	eval: cmd_multiline
}

function cmd_settings(lang, msg, args, line) {
	if ( admin(msg) ) {
		if ( msg.guild.id in settings ) var text = lang.settings.current + '\n`' + process.env.prefix + 'settings lang` – ' + settings[msg.guild.id].lang + '\n`' + process.env.prefix + 'settings wiki` – ' + settings[msg.guild.id].wiki;
		else var text = lang.settings.missing.replace( '%1$s', '`' + process.env.prefix + 'settings lang`' ).replace( '%2$s', '`' + process.env.prefix + 'settings wiki`' );
		if ( args.length ) {
			if ( args[0] ) args[0] = args[0].toLowerCase();
			if ( args[1] ) args[1] = args[1].toLowerCase();
			var langs = '\n' + lang.settings.langs + ' `' + Object.keys(i18n) + '`';
			var wikis = '\n' + lang.settings.wikis;
			var nolangs = lang.settings.nolangs + langs;
			var regex = /^(?:(?:https?:)?\/\/)?([a-z\d-]{1,30})/
			if ( msg.guild.id in settings ) {
				if ( args[0] == 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n ) edit_settings(lang, msg, 'lang', args[1]);
						else msg.reply( nolangs );
					} else msg.reply( lang.settings.lang + ' `' + settings[msg.guild.id].lang + '`' + langs );
				} else if ( args[0] == 'wiki' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'wiki', regex.exec(args[1])[1]);
						else cmd_settings(lang, msg, ['wiki'], line);
					} else msg.reply( lang.settings.wiki + '\nhttps://' + settings[msg.guild.id].wiki + '.gamepedia.com/' + wikis );
				} else msg.reply( text );
			} else {
				if ( args[0] == 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n ) edit_settings(lang, msg, 'lang', args[1]);
						else msg.reply( nolangs );
					} else msg.reply( lang.settings.nolang + langs );
				} else if ( args[0] == 'wiki' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'wiki', regex.exec(args[1])[1]);
						else cmd_settings(lang, msg, ['wiki'], line);
					} else msg.reply( lang.settings.nowiki + wikis );
				} else msg.reply( text );
			}
		} else msg.reply( text );
	} else {
		msg.react('❌');
	}
}

function edit_settings(lang, msg, key, value) {
	var hourglass;
	msg.react('⏳').then( function( reaction ) {
		hourglass = reaction;
		var url = process.env.site + 'api.php';
		request.get( {
			uri: url + '?action=query&format=json&meta=tokens&type=login',
			json: true
		}, function( error, response, body ) {
			if ( error || !response || !body || body.error || !body.query ) {
				console.log( 'Fehler beim Erhalten des Anmeldetoken' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
				msg.reply( lang.settings.save_failed );
			}
			else {
				request.post( {
					uri: url,
					form: {
						action: 'login',
						format: 'json',
						lgname: process.env.username,
						lgpassword: process.env.password,
						lgtoken: body.query.tokens.logintoken
					},
					json: true
				}, function( lerror, lresponse, lbody ) {
					if ( lerror || !lresponse || !lbody || lbody.error || !body.query ) {
						console.log( 'Fehler beim Anmelden' + ( lerror ? ': ' + lerror.message : ( lbody ? ( lbody.error ? ': ' + lbody.error.info : '.' ) : '.' ) ) );
						msg.reply( lang.settings.save_failed );
					}
					else {
						request.post( {
							uri: url,
							form: {
								action: 'query',
								format: 'json',
								meta: 'tokens',
								type: 'csrf'
							},
							json: true
						}, function( perror, presponse, pbody ) {
							if ( perror || !presponse || !pbody || pbody.error || !body.query ) {
								console.log( 'Fehler beim Erhalten des Bearbeitungstoken' + ( perror ? ': ' + perror.message : ( pbody ? ( pbody.error ? ': ' + pbody.error.info : '.' ) : '.' ) ) );
								msg.reply( lang.settings.save_failed );
							}
							else if ( settings == defaultSettings ) {
								console.log( 'Fehler beim Erhalten bestehender Einstellungen.' );
								msg.reply( lang.settings.save_failed );
							}
							else {
								var temp_settings = Object.assign({}, settings);
								if ( !( msg.guild.id in temp_settings ) ) temp_settings[msg.guild.id] = Object.assign({}, defaultSettings['default']);
								temp_settings[msg.guild.id][key] = value;
								Object.keys(temp_settings).forEach( function(guild) {
									if ( !client.guilds.has(guild) && guild != 'default' ) delete temp_settings[guild];
								} );
								request.post( {
									uri: url,
									form: {
										action: 'edit',
										format: 'json',
										title: process.env.page,
										text: JSON.stringify( temp_settings, null, '\t' ),
										summary: 'Einstellungen aktualisiert.',
										bot: true,
										token: pbody.query.tokens.csrftoken
									},
									json: true
								}, function( eerror, eresponse, ebody ) {
									if ( eerror || !eresponse || !ebody || ebody.error || !body.query ) {
										console.log( 'Fehler beim Bearbeiten' + ( eerror ? ': ' + eerror.message : ( ebody ? ( ebody.error ? ': ' + ebody.error.info : '.' ) : '.' ) ) );
										msg.reply( lang.settings.save_failed );
									}
									else {
										settings = Object.assign({}, temp_settings);
										if ( key == 'lang' ) lang = i18n[value];
										cmd_settings(lang, msg, [key], '');
										console.log( 'Einstellungen erfolgreich aktualisiert.' );
									}
								} );
							}
						} );
					}
				} );
			}
			
			if ( hourglass != undefined ) hourglass.remove();
		} );
	} );
}

function cmd_info(lang, msg, args, line) {
	if ( args.length ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	else {
		var owner = '*MarkusRost*';
		if ( msg.channel.type == 'text' && msg.guild.members.has(process.env.owner) ) owner = '<@' + msg.guild.members.has(process.env.owner) + '>';
		msg.channel.send( lang.disclaimer.replace( '%s', owner ) + '\nhttps://discord.gg/v77RTk5' );
		cmd_invite(lang, msg, args, line);
	}
}

function cmd_help(lang, msg, args, line) {
	if ( admin(msg) && !( msg.guild.id in settings ) ) cmd_settings(lang, msg, [], line);
	var cmds = lang.help.list;
	if ( args.length ) {
		if ( args[0].toLowerCase() == 'admin' && ( msg.channel.type != 'text' || admin(msg) ) ) {
			if ( args[1] && args[1].toLowerCase() == 'emoji' ) {
				var cmdlist = lang.help.emoji + '\n';
				var i = 0;
				client.emojis.forEach( function(emoji) {
					var br = '\t\t';
					if ( i % 3 == 2 ) br = '\n';
					cmdlist += emoji.toString() + '`' + emoji.toString().replace(emoji.name + ':', '') + '`' + br;
					i++;
				} );
				msg.channel.send( cmdlist, {split:true} );
			}
			else {
				var cmdlist = lang.help.admin + '\n';
				for ( var i = 0; i < cmds.length; i++ ) {
					if ( cmds[i].admin && !cmds[i].hide ) {
						cmdlist += '🔹 `' + process.env.prefix + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
					}
				}
				
				msg.channel.send( cmdlist );
			}
		}
		else {
			var cmdlist = ''
			for ( var i = 0; i < cmds.length; i++ ) {
				if ( cmds[i].cmd.split(' ')[0] === args[0].toLowerCase() && !cmds[i].unsearchable && ( msg.channel.type != 'text' || !cmds[i].admin || admin(msg) ) ) {
					cmdlist += '🔹 `' + process.env.prefix + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
				}
			}
			
			if ( cmdlist == '' ) msg.react('❓');
			else msg.channel.send( cmdlist );
		}
	}
	else {
		var cmdlist = lang.help.all + '\n';
		for ( var i = 0; i < cmds.length; i++ ) {
			if ( !cmds[i].hide && !cmds[i].admin ) {
				cmdlist += '🔹 `' + process.env.prefix + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
			}
		}
		
		msg.channel.send( cmdlist );
	}
}

function cmd_say(lang, msg, args, line) {
	if ( admin(msg) ) {
		args = emoji(args);
		var text = args.join(' ');
		if ( args[0] == 'alarm' ) text = '🚨 **' + args.slice(1).join(' ') + '** 🚨';
		var imgs = [];
		var i = 0;
		msg.attachments.forEach( function(img) {
			imgs[i] = {attachment:img.proxyURL,name:img.filename};
			i++;
		} );
		if ( msg.author.id == process.env.owner ) {
			try {
				text = eval( '`' + text + '`' );
			} catch ( error ) {
				console.log( error.name + ': ' + error.message );
			}
		}
		if ( text || imgs[0] ) {
			msg.channel.send( text, {disableEveryone:false,files:imgs} ).then( message => msg.delete(), error => msg.react('440871715938238494') );
		}
	} else {
		msg.react('❌');
	}
}

function cmd_test(lang, msg, args, line) {
	if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		var text = '';
		var x = Math.floor(Math.random() * lang.test.random);
		if ( x < lang.test.text.length ) text = lang.test.text[x];
		else text = lang.test.default;
		msg.reply( text );
		console.log( 'Dies ist ein Test: Voll funktionsfähig!' );
	} else {
		msg.reply( lang.test.pause );
		console.log( 'Dies ist ein Test: Pausiert!' );
	}
}

function cmd_invite(lang, msg, args, line) {
	if ( args.length ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	} else {
		client.generateInvite(268954689).then( invite => msg.channel.send( lang.invite.bot + '\n<' + invite + '>' ) );
	}
}

function cmd_eval(lang, msg, args, line) {
	if ( msg.author.id == process.env.owner && args.length ) {
		try {
			var text = eval( args.join(' ') );
		} catch ( error ) {
			var text = error.name + ': ' + error.message;
		}
		console.log( text );
		msg.channel.send( '```js\n' + text + '```', {split:{prepend:'```js\n',append:'```'}} ).catch( err => msg.channel.send( '```js\n' + err.name + ': ' + err.message + '```', {split:{prepend:'```js\n',append:'```'}} ) );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		msg.react('❌');
	}
}

function cmd_stop(lang, msg, args, line) {
	if ( msg.author.id == process.env.owner && args.length && args[0].replace( '!', '' ) == '<@' + client.user.id + '>' ) {
		msg.reply( 'ich schalte mich nun aus!' );
		console.log( 'Ich schalte mich nun aus!' );
		client.destroy();
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	}
}

function cmd_pause(lang, msg, args, line) {
	if ( msg.channel.type == 'text' && msg.author.id == process.env.owner && args.length && args[0].replace( '!', '' ) == '<@' + client.user.id + '>' ) {
		if ( pause[msg.guild.id] ) {
			msg.reply( 'ich bin wieder wach!' );
			console.log( 'Ich bin wieder wach!' );
			pause[msg.guild.id] = false;
		} else {
			msg.reply( 'ich lege mich nun schlafen!' );
			console.log( 'Ich lege mich nun schlafen!' );
			pause[msg.guild.id] = true;
		}
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	}
}

function cmd_delete(lang, msg, args, line) {
	if ( admin(msg) ) {
		if ( /^\d+$/.test(args[0]) && parseInt(args[0], 10) + 1 > 0 ) {
			if ( parseInt(args[0], 10) > 99 ) {
				msg.reply( lang.delete.big.replace( '%s', '`99`' ) );
			}
			else {
				msg.channel.bulkDelete(parseInt(args[0], 10) + 1, true).then( messages => {
					msg.reply( lang.delete.success.replace( '%s', messages.size - 1 ) ).then( antwort => antwort.delete(3000) );
					console.log( 'Die letzten ' + ( messages.size - 1 ) + ' Nachrichten in #' + msg.channel.name + ' wurden gelöscht!' );
				} );
			}
		}
		else {
			msg.reply( lang.delete.invalid );
		}
	} else {
		msg.react('❌');
	}
}

function cmd_link(lang, msg, title, wiki, cmd) {
	if ( cmd == '' && admin(msg) && !( msg.guild.id in settings ) ) cmd_settings(lang, msg, [], '');
	var invoke = title.split(' ')[0].toLowerCase();
	var args = title.split(' ').slice(1);
	
	if ( invoke == 'page' || invoke == lang.search.page ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + args.join('_') );
	else if ( invoke == 'search' || invoke == lang.search.search ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/Special:Search/' + args.join('_') );
	else if ( invoke == 'diff' ) cmd_diff(lang, msg, args, wiki);
	else if ( title == '' || title.indexOf( '#' ) != -1 || title.indexOf( '?' ) != -1 ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title.replace( / /g, '_' ) );
	else if ( invoke == 'user' || invoke == lang.search.user.unknown || invoke == lang.search.user.male || invoke == lang.search.user.female ) cmd_user(lang, msg, args.join('_'), wiki, title.replace( / /g, '_' ));
	else if ( invoke.startsWith('user:') ) cmd_user(lang, msg, title.substr(5), wiki, title.replace( / /g, '_' ));
	else if ( invoke.startsWith('userprofile:') ) cmd_user(lang, msg, title.substr(12), wiki, title.replace( / /g, '_' ));
	else if ( invoke.startsWith(lang.search.user.unknown + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.unknown.length + 1), wiki, title.replace( / /g, '_' ));
	else if ( invoke.startsWith(lang.search.user.male + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.male.length + 1), wiki, title.replace( / /g, '_' ));
	else if ( invoke.startsWith(lang.search.user.female + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.female.length + 1), wiki, title.replace( / /g, '_' ));
	else {
		var hourglass;
		msg.react('⏳').then( function( reaction ) {
			hourglass = reaction;
			request( {
				uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&meta=siteinfo&siprop=interwikimap&redirects=true&titles=' + encodeURI( title ),
				json: true
			}, function( error, response, body ) {
				if ( error || !response || !body || !body.query ) {
					console.log( 'Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) msg.react('440871715938238494');
					else msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title.replace( / /g, '_' ) ).then( message => message.react('440871715938238494') );
				}
				else {
					if ( body.query.pages ) {
						if ( body.query.pages['-1'] && body.query.pages['-1'].missing != undefined ) {
							request( {
								uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=search&srnamespace=0|4|6|10|12|14&srsearch=' + encodeURI( title ) + '&srlimit=1',
								json: true
							}, function( srerror, srresponse, srbody ) {
								if ( srerror || !srresponse || !srbody || !srbody.query || ( !srbody.query.search[0] && srbody.query.searchinfo.totalhits != 0 ) ) {
									console.log( 'Fehler beim Erhalten der Suchergebnisse' + ( srerror ? ': ' + srerror.message : ( srbody ? ( srbody.error ? ': ' + srbody.error.info : '.' ) : '.' ) ) );
									msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title.replace( / /g, '_' ) ).then( message => message.react('440871715938238494') );
								}
								else {
									if ( srbody.query.searchinfo.totalhits == 0 ) {
										msg.react('🤷');
									}
									else if ( srbody.query.searchinfo.totalhits == 1 ) {
										msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + srbody.query.search[0].title.replace( / /g, '_' ) + '\n' + lang.search.infopage.replace( '%s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ) );
									}
									else {
										msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + srbody.query.search[0].title.replace( / /g, '_' ) + '\n' + lang.search.infosearch.replace( '%1$s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ).replace( '%2$s', '`' + process.env.prefix + cmd + lang.search.search + ' ' + title + '`' ) );
									}
								}
							} );
						}
						else {
							msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + ( Object.values(body.query.pages)[0].title + ( body.query.redirects && body.query.redirects[0].tofragment ? '#' + encodeURI( body.query.redirects[0].tofragment ) : '' ) ).replace( / /g, '_' ) );
						}
					}
					else if ( body.query.interwiki ) {
						var inter = body.query.interwiki[0];
						var intertitle = inter.title.substr(inter.iw.length+1);
						var regex = /^(?:https?:)?\/\/(.*)\.gamepedia\.com\//
						var entry = body.query.interwikimap;
						for ( var i = 0; i < entry.length; i++ ) {
							if ( entry[i].prefix == inter.iw ) {
								if ( regex.test(entry[i].url) ) {
									var iwtitle = entry[i].url.replace( '$1', intertitle ).replace( regex.exec(entry[i].url)[0], '' );
									var link = regex.exec(entry[i].url)[1];
									cmd_link(lang, msg, iwtitle, link, '!' + link + ' ');
								}
								else msg.channel.send( entry[i].url.replace( '$1', intertitle.replace( / /g, '_' ) ) );
								break;
							}
						}
					}
					else {
						msg.react('🤷');
					}
				}
				
				if ( hourglass != undefined ) hourglass.remove();
			} );
		} );
	}
}

function cmd_serverlist(lang, msg, args, line) {
	if ( msg.author.id == process.env.owner && args.join(' ') == 'list all <@' + client.user.id + '>' ) {
		var guilds = client.guilds;
		var serverlist = 'Ich befinde mich aktuell auf ' + guilds.size + ' Servern:\n\n';
		guilds.forEach( function(guild) {
			serverlist += '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern\n' + guild.channels.find('type', 'text').toString() + ' (' + guild.id + ')\n\n';
		} );
		msg.author.send( serverlist, {split:{char:'\n\n'}} );
	} else if ( msg.author.id == process.env.owner && args.join(' ') == 'list all <@' + client.user.id + '> permissions' ) {
		var guilds = client.guilds;
		var serverlist = 'Ich befinde mich aktuell auf ' + guilds.size + ' Servern:\n\n';
		guilds.forEach( function(guild) {
			var perms = '  ';
			var allperms = Object.entries(guild.me.permissions.serialize());
			allperms.forEach( function(perm) {
				if ( perm[1] ) perms += perm[0] + ', ';
			} );
			perms = perms.substr(0, perms.length -2);
			serverlist += '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern\n' + guild.channels.find('type', 'text').toString() + perms + '\n\n';
		} );
		msg.author.send( serverlist, {split:{char:'\n\n'}} );
	} else if ( msg.author.id == process.env.owner && args.join(' ') == 'list all <@' + client.user.id + '> members' ) {
		var guilds = client.guilds;
		var serverlist = 'Ich befinde mich aktuell auf ' + guilds.size + ' Servern:\n\n';
		guilds.forEach( function(guild) {
			var members = '  ';
			var allmembers = guild.members;
			if ( !allmembers.has(process.env.owner) && guild.memberCount < 50 ) {
				allmembers.forEach( function(member) {
					members += member.toString() + ', ';
				} );
			}
			members = members.substr(0, members.length -2);
			serverlist += '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern\n' + guild.channels.find('type', 'text').toString() + members + '\n\n';
		} );
		msg.author.send( serverlist, {split:{char:'\n\n'}} );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	}
}

function cmd_umfrage(lang, msg, args, line) {
	if ( admin(msg) ) {
		var imgs = [];
		var a = 0;
		msg.attachments.forEach( function(img) {
			imgs[a] = {attachment:img.proxyURL,name:img.filename};
			a++;
		} );
		if ( args.length || imgs[0] ) {
			var reactions = [];
			args = emoji(args);
			for ( var i = 0; ( i < args.length || imgs[0] ); i++ ) {
				var reaction = args[i];
				var custom = /^<a?:/;
				var pattern = /^[\w\säÄöÖüÜßẞ!"#$%&'()*+,./:;<=>?@^`{|}~–[\]\-\\]{2,}/;
				if ( !custom.test(reaction) && pattern.test(reaction) ) {
					cmd_sendumfrage(lang, msg, args, reactions, imgs, i);
					break;
				} else if ( reaction == '' ) {
				} else {
					if ( custom.test(reaction) ) {
						reaction = reaction.substring(reaction.lastIndexOf(':')+1, reaction.length-1);
					}
					reactions[i] = reaction;
					if ( i == args.length-1 ) {
						cmd_sendumfrage(lang, msg, args, reactions, imgs, i+1);
						break;
					}
				}
			}
		} else {
			args[0] = line.split(' ')[1];
			cmd_help(lang, msg, args, line);
		}
	} else {
		msg.react('❌');
	}
}

function cmd_sendumfrage(lang, msg, args, reactions, imgs, i) {
	msg.channel.send( lang.poll.title + args.slice(i).join(' '), {disableEveryone:false,files:imgs} ).then( poll => {
		msg.delete();
		if ( reactions.length ) {
			reactions.forEach( function(entry) {
				poll.react(entry).catch( error => poll.react('440871715938238494') );
			} );
		} else {
			poll.react('448222377009086465');
			poll.react('448222455425794059');
		}
	}, error => msg.react('440871715938238494') );
}

function cmd_user(lang, msg, username, wiki, title) {
	if ( !username || username.indexOf( '/' ) != -1 || username.toLowerCase().startsWith('talk:') || username.toLowerCase().startsWith(lang.user.talk) ) {
		msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title );
	} else {
		var hourglass;
		msg.react('⏳').then( function( reaction ) {
			hourglass = reaction;
			request( {
				uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURI( username ),
				json: true
			}, function( error, response, body ) {
				if ( error || !response || !body || !body.query || !body.query.users[0] ) {
					console.log( 'Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) msg.react('440871715938238494');
					else msg.channel.send( '<https://' + wiki + '.gamepedia.com/User:' + username + '>' ).then( message => message.react('440871715938238494') );
				}
				else {
					if ( body.query.users[0].missing == "" || body.query.users[0].invalid == "" ) {
						msg.react('🤷');
					}
					else {
						username = body.query.users[0].name.replace( / /g, '_' );
						var options = {
							year: "numeric",
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit"
						}
						var gender = body.query.users[0].gender;
						switch (gender) {
							case 'male':
								gender = lang.user.gender.male;
								break;
							case 'female':
								gender = lang.user.gender.female;
								break;
							default: 
								gender = lang.user.gender.unknown;
						}
						var registration = (new Date(body.query.users[0].registration)).toLocaleString(lang.user.dateformat, options);
						var editcount = body.query.users[0].editcount;
						var groups = body.query.users[0].groups;
						var group = '';
						for ( var i = 0; i < lang.user.group.length; i++ ) {
							if ( groups.includes(lang.user.group[i][0]) ) {
								group = lang.user.group[i][1];
								break;
							}
						}
						var isBlocked = false;
						var blockedtimestamp = (new Date(body.query.users[0].blockedtimestamp)).toLocaleString(lang.user.dateformat, options);
						var blockexpiry = body.query.users[0].blockexpiry;
						if ( blockexpiry == 'infinity' ) {
							blockexpiry = lang.user.until_infinity;
							isBlocked = true;
						} else if ( blockexpiry ) {
							var blockexpirydate = blockexpiry.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z');
							blockexpiry = (new Date(blockexpirydate)).toLocaleString(lang.user.dateformat, options);
							if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
						}
						var blockedby = body.query.users[0].blockedby;
						var blockreason = body.query.users[0].blockreason;
						msg.channel.send( '<https://' + wiki + '.gamepedia.com/UserProfile:' + username + '>\n\n' + lang.user.info.replace( '%1$s', gender ).replace( '%2$s', registration ).replace( '%3$s', editcount ).replace( '%4$s', group ) + ( isBlocked ? '\n\n' + lang.user.blocked.replace( '%1$s', blockedtimestamp ).replace( '%2$s', blockexpiry ).replace( '%3$s', blockedby ).replace( '%4$s', blockreason ) : '' ) );
					}
				}
				
				if ( hourglass != undefined ) hourglass.remove();
			} );
		} );
	}
}

function cmd_diff(lang, msg, args, wiki) {
	if ( args[0] ) {
		var error = false;
		var title = '';
		var revision = 0;
		var diff = 'prev';
		if ( /^\d+$/.test(args[0]) ) {
			revision = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					diff = args[1];
				}
				else if ( args[1] == 'prev' || args[1] == 'next' ) {
					diff = args[1];
				}
				else error = true;
			}
		}
		else if ( args[0] == 'prev' || args[0] == 'next' ) {
			diff = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					revision = args[1];
				}
				else error = true;
			}
			else error = true;
		}
		else title = args.join('_');
		
		if ( error ) msg.react('440871715938238494');
		else if ( /^\d+$/.test(diff) ) {
			var argids = [];
			if ( parseInt(revision, 10) > parseInt(diff, 10) ) argids = [revision, diff];
			else if ( parseInt(revision, 10) == parseInt(diff, 10) ) argids = [revision];
			else argids = [diff, revision];
			cmd_diffsend(lang, msg, argids, wiki);
		}
		else {
			var hourglass;
			msg.react('⏳').then( function( reaction ) {
				hourglass = reaction;
				request( {
					uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&prop=revisions&rvprop=' + ( title ? '&titles=' + title : '&revids=' + revision ) + '&rvdiffto=' + diff,
					json: true
				}, function( error, response, body ) {
					if ( error || !response || !body || !body.query ) {
						console.log( 'Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
						if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) msg.react('440871715938238494');
						else msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + diff + ( title ? '' : '&oldid=' + revision ) + '>' ).then( message => message.react('440871715938238494') );
					}
					else {
						if ( body.query.badrevids ) msg.reply( lang.diff.badrev );
						else if ( body.query.pages && body.query.pages[-1] ) msg.react('440871715938238494');
						else if ( body.query.pages ) {
							var argids = [];
							var ids = Object.values(body.query.pages)[0].revisions[0].diff;
							if ( ids.from ) {
								if ( ids.from > ids.to ) argids = [ids.from, ids.to];
								else if ( ids.from == ids.to ) argids = [ids.to];
								else argids = [ids.to, ids.from];
							}
							else argids = [ids.to];
							cmd_diffsend(lang, msg, argids, wiki);
						}
						else msg.react('440871715938238494');
					}
					
					if ( hourglass != undefined ) hourglass.remove();
				} );
			} );
		}
	}
	else msg.react('440871715938238494');
}

function cmd_diffsend(lang, msg, args, wiki) {
	request( {
		uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags&revids=' + args.join('|'),
		json: true
	}, function( error, response, body ) {
		if ( error || !response || !body || !body.query ) {
			console.log( 'Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
			if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) msg.react('440871715938238494');
		else msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' ).then( message => message.react('440871715938238494') );
		}
		else {
			if ( body.query.badrevids ) msg.reply( lang.diff.badrev );
			else if ( body.query.pages ) {
				var pages = Object.values(body.query.pages);
				if ( pages.length != 1 ) msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' );
				else {
					var title = pages[0].title.replace( / /g, '_' );
					var revisions = [];
					if ( pages[0].revisions[1] ) revisions = [pages[0].revisions[1], pages[0].revisions[0]];
					else revisions = [pages[0].revisions[0]];
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = ( revisions[0].userhidden != undefined ? lang.diff.hidden : revisions[0].user );
					var options = {
						year: "numeric",
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit"
					}
					var timestamp = (new Date(revisions[0].timestamp)).toLocaleString(lang.user.dateformat, options);
					var size = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
					var comment = ( revisions[0].commenthidden != undefined ? lang.diff.hidden : revisions[0].comment );
					if ( !comment ) comment = lang.diff.nocomment;
					var tags = [lang.diff.notags];
					var entry = body.query.tags;
					revisions[0].tags.forEach( function(tag, t) {
						for ( var i = 0; i < entry.length; i++ ) {
							if ( entry[i].name == tag ) {
								tags[t] = entry[i].displayname;
								break;
							}
						}
					} );
						
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + diff + '&oldid=' + oldid + '>\n\n' + lang.diff.info.replace( '%1$s', editor ).replace( '%2$s', timestamp ).replace( '%3$s', size ).replace( '%4$s', comment ).replace( '%5$s', tags.join(', ') ) );
				}
			}
			else msg.react('440871715938238494');
		}
		
	} );
}

function cmd_multiline(lang, msg, args, line) {
	msg.react('440871715938238494');
}

function cmd_voice(lang, msg, args, line) {
	if ( admin(msg) ) {
		msg.reply( lang.voice.text + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`' );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
	}
}

function admin(msg) {
	if ( msg.channel.type == 'text' && ( ( msg.member && msg.member.permissions.has('MANAGE_GUILD') ) || msg.author.id == process.env.owner ) ) return true;
	else return false;
}

function emoji(args) {
	var text = args.join(' ');
	var regex = /(<a?:)(\d+)(>)/g;
	if ( regex.test(text) ) {
		regex.lastIndex = 0;
		var emojis = client.emojis;
		var entry;
		while ( ( entry = regex.exec(text) ) !== null ) {
			if ( emojis.has(entry[2]) ) {
				text = text.replace(entry[0], emojis.get(entry[2]).toString());
			} else {
				text = text.replace(entry[0], entry[1] + 'unknown_emoji:' + entry[2] + entry[3]);
			}
		}
		args = text.split(' ');
	}
	return args;
}


client.on('message', msg => {
	var cont = msg.content;
	var author = msg.author;
	var channel = msg.channel;
	if ( cont.toLowerCase().indexOf( process.env.prefix ) != -1 && !msg.webhookID && author.id != client.user.id && ( channel.type != 'text' || channel.permissionsFor(client.user).has(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS']) ) ) {
		if ( settings == defaultSettings ) getSettings(setStatus);
		var setting = Object.assign({}, settings['default']);
		if ( channel.type == 'text' && msg.guild.id in settings ) setting = Object.assign({}, settings[msg.guild.id]);
		var lang = i18n[setting.lang];
		lang.link = setting.wiki;
		var invoke = cont.split(' ')[1].toLowerCase();
		var aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
		if ( cont.toLowerCase().startsWith(process.env.prefix) && aliasInvoke in multilinecmdmap ) {
			if ( channel.type != 'text' || channel.permissionsFor(client.user).has('MANAGE_MESSAGES') ) {
				var args = cont.split(' ').slice(2);
				console.log((msg.guild ? msg.guild.name : '@' + author.username) + ': ' + invoke + ' - ' + args);
				if ( channel.type != 'text' || !pause[msg.guild.id] || ( author.id == process.env.owner && aliasInvoke in pausecmdmap ) ) multilinecmdmap[aliasInvoke](lang, msg, args, cont);
			} else {
				msg.reply( lang.missingperm + ' `MANAGE_MESSAGES`' );
			}
		} else {
			cont.split('\n').forEach( function(line) {
				if ( line.toLowerCase().startsWith(process.env.prefix) ) {
					invoke = line.split(' ')[1].toLowerCase();
					var args = line.split(' ').slice(2);
					aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
					console.log((msg.guild ? msg.guild.name : '@' + author.username) + ': ' + invoke + ' - ' + args);
					if ( channel.type != 'text' || !pause[msg.guild.id] ) {
						if ( aliasInvoke in cmdmap ) cmdmap[aliasInvoke](lang, msg, args, line);
						else if ( invoke.startsWith('!') ) cmd_link(lang, msg, args.join(' '), invoke.substr(1), invoke + ' ');
						else cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, '');
					} else if ( channel.type == 'text' && pause[msg.guild.id] && author.id == process.env.owner && aliasInvoke in pausecmdmap ) {
						pausecmdmap[aliasInvoke](lang, msg, args, line);
					}
				}
			} );
		}
	}
});


client.on('voiceStateUpdate', (oldm, newm) => {
	if ( settings == defaultSettings ) getSettings(setStatus);
	if ( oldm.guild.me.permissions.has('MANAGE_ROLES') && oldm.voiceChannelID != newm.voiceChannelID ) {
		var setting = Object.assign({}, settings['default']);
		if ( oldm.guild.id in settings ) setting = Object.assign({}, settings[oldm.guild.id]);
		var lang = i18n[setting.lang];
		lang.link = setting.wiki;
		if ( oldm.voiceChannel ) {
			var oldrole = oldm.guild.roles.find('name', lang.voice.channel + ' – ' + oldm.voiceChannel.name);
			if ( oldrole && oldrole.comparePositionTo(oldm.guild.me.highestRole) < 0 ) {
				oldm.removeRole( oldrole, lang.voice.left.replace( '%1$s', oldm.displayName ).replace( '%2$s', oldm.voiceChannel.name ) );
				console.log( oldm.guild.name + ': ' + oldm.displayName + ' hat den Sprachkanal "' + oldm.voiceChannel.name + '" verlassen.' );
			}
		}
		if ( newm.voiceChannel ) {
			var newrole = newm.guild.roles.find('name', lang.voice.channel + ' – ' + newm.voiceChannel.name);
			if ( newrole && newrole.comparePositionTo(newm.guild.me.highestRole) < 0 ) {
				newm.addRole( newrole, lang.voice.join.replace( '%1$s', newm.displayName ).replace( '%2$s', newm.voiceChannel.name ) );
				console.log( newm.guild.name + ': ' + newm.displayName + ' hat den Sprachkanal "' + newm.voiceChannel.name + '" betreten.' );
			}
		}
	}
});


client.on('guildCreate', guild => {
	client.fetchUser(process.env.owner).then( owner => owner.send( 'Ich wurde zu einem Server hinzugefügt:\n\n' + '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern\n' + guild.channels.find('type', 'text').toString() + ' (' + guild.id + ')' ) );
	console.log( 'Ich wurde zu einem Server hinzugefügt.' );
});

client.on('guildDelete', guild => {
	client.fetchUser(process.env.owner).then( owner => owner.send( 'Ich wurde von einem Server entfernt:\n\n' + '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern\n' + guild.channels.find('type', 'text').toString() + ' (' + guild.id + ')' ) );
	console.log( 'Ich wurde von einem Server entfernt.' );
	
	var url = process.env.site + 'api.php';
	request.get( {
		uri: url + '?action=query&format=json&meta=tokens&type=login',
		json: true
	}, function( error, response, body ) {
		if ( error || !response || !body || body.error || !body.query ) {
			console.log( 'Fehler beim Erhalten des Anmeldetoken' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
		}
		else {
			request.post( {
				uri: url,
				form: {
					action: 'login',
					format: 'json',
					lgname: process.env.username,
					lgpassword: process.env.password,
					lgtoken: body.query.tokens.logintoken
				},
				json: true
			}, function( lerror, lresponse, lbody ) {
				if ( lerror || !lresponse || !lbody || lbody.error || !body.query ) {
					console.log( 'Fehler beim Anmelden' + ( lerror ? ': ' + lerror.message : ( lbody ? ( lbody.error ? ': ' + lbody.error.info : '.' ) : '.' ) ) );
				}
				else {
					request.post( {
						uri: url,
						form: {
							action: 'query',
							format: 'json',
							meta: 'tokens',
							type: 'csrf'
						},
						json: true
					}, function( perror, presponse, pbody ) {
						if ( perror || !presponse || !pbody || pbody.error || !body.query ) {
							console.log( 'Fehler beim Erhalten des Bearbeitungstoken' + ( perror ? ': ' + perror.message : ( pbody ? ( pbody.error ? ': ' + pbody.error.info : '.' ) : '.' ) ) );
						}
						else if ( settings == defaultSettings ) {
							console.log( 'Fehler beim Erhalten bestehender Einstellungen.' );
						}
						else {
							var temp_settings = Object.assign({}, settings);
							Object.keys(temp_settings).forEach( function(guild) {
								if ( !client.guilds.has(guild) && guild != 'default' ) delete temp_settings[guild];
							} );
							request.post( {
								uri: url,
								form: {
									action: 'edit',
									format: 'json',
									title: process.env.page,
									text: JSON.stringify( temp_settings, null, '\t' ),
									summary: 'Einstellungen aktualisiert.',
									bot: true,
									token: pbody.query.tokens.csrftoken
								},
								json: true
							}, function( eerror, eresponse, ebody ) {
								if ( eerror || !eresponse || !ebody || ebody.error || !body.query ) {
									console.log( 'Fehler beim Bearbeiten' + ( eerror ? ': ' + eerror.message : ( ebody ? ( ebody.error ? ': ' + ebody.error.info : '.' ) : '.' ) ) );
									msg.reply( lang.settings.save_failed );
								}
								else {
									settings = Object.assign({}, temp_settings);
									console.log( 'Einstellungen erfolgreich aktualisiert.' );
								}
							} );
						}
					} );
				}
			} );
		}
	} );
});


client.login(process.env.token);

const fs = require('fs');

const Discord = require('discord.js');
const DBL = require("dblapi.js");
var request = require('request');

var client = new Discord.Client( {disableEveryone:true} );
const dbl = new DBL(process.env.dbltoken, {statsInterval:10800000}, client);

var i18n = JSON.parse(fs.readFileSync('i18n.json', 'utf8').trim());
var minecraft = JSON.parse(fs.readFileSync('minecraft.json', 'utf8').trim());

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
		uri: process.env.read + process.env.file + process.env.access,
		json: true
	}, function( error, response, body ) {
		if ( error || !response || !body || body.error ) {
			console.log( '- Fehler beim Erhalten der Einstellungen' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error : '.' ) : '.' ) ) );
		}
		else {
			console.log( '- Einstellungen erfolgreich ausgelesen.' );
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
	console.log( '- Erfolgreich als ' + client.user.username + ' angemeldet!' );
	client.user.setActivity( process.env.prefix + ' help' );
} );

dbl.on('posted', () => {
	request.post( {
		uri: 'https://bots.discord.pw/api/bots/' + client.user.id + '/stats',
		headers: {
			authorization: process.env.dbpwtoken
		},
		body: {
			server_count: client.guilds.size
		},
		json: true
	}, function( error, response, body ) {
		console.log( '- Anzahl der Server: ' + client.guilds.size );
	} );
} );


var cmdmap = {
	help: cmd_help,
	test: cmd_test,
	invite: cmd_invite,
	stop: cmd_stop,
	pause: cmd_pause,
	say: cmd_multiline,
	delete: cmd_multiline,
	poll: cmd_multiline,
	voice: cmd_voice,
	settings: cmd_settings,
	info: cmd_info,
	eval: cmd_eval,
	get: cmd_get
}

var multilinecmdmap = {
	say: cmd_say,
	delete: cmd_delete,
	poll: cmd_umfrage,
	eval: cmd_eval,
	get: cmd_get
}

var pausecmdmap = {
	test: cmd_test,
	stop: cmd_stop,
	pause: cmd_pause,
	say: cmd_multiline,
	delete: cmd_multiline,
	eval: cmd_eval,
	get: cmd_get
}

var minecraftcmdmap = {
	command: cmd_befehl2,
	bug: cmd_bug
}

function cmd_settings(lang, msg, args, line) {
	if ( admin(msg) ) {
		if ( msg.guild.id in settings ) {
			var text = lang.settings.current.replace( '%s', '- `' + process.env.prefix + ' settings lang`' ) + ' https://' + settings[msg.guild.id].wiki + '.gamepedia.com/ - `' + process.env.prefix + ' settings wiki`';
			if ( settings[msg.guild.id].channels ) {
				text += '\n' + lang.settings.currentchannel + ' - `' + process.env.prefix + ' settings channel`';
				Object.keys(settings[msg.guild.id].channels).forEach( function(channel) {
					text += '\n<#' + channel + '>: <https://' + settings[msg.guild.id].channels[channel] + '.gamepedia.com/>';
				} );
			}
		} else {
			var text = lang.settings.missing.replace( '%1$s', '`' + process.env.prefix + ' settings lang`' ).replace( '%2$s', '`' + process.env.prefix + ' settings wiki`' );
		}
		if ( args.length ) {
			if ( args[0] ) args[0] = args[0].toLowerCase();
			if ( args[1] ) args[1] = args[1].toLowerCase();
			var langs = '\n' + lang.settings.langhelp.replace( '%s', process.env.prefix + ' settings lang' ) + ' `' + i18n.allLangs[1].join(', ') + '`';
			var wikis = '\n' + lang.settings.wikihelp.replace( '%s', process.env.prefix + ' settings wiki' );
			var channels = '\n' + lang.settings.wikihelp.replace( '%s', process.env.prefix + ' settings channel' );
			var nolangs = lang.settings.langinvalid + langs;
			var nowikis = lang.settings.wikiinvalid + wikis;
			var nochannels = lang.settings.wikiinvalid + channels;
			var regex = /^(?:(?:https?:)?\/\/)?([a-z\d-]{1,30})(?:\.gamepedia\.com|$)/
			if ( msg.guild.id in settings ) {
				var current	= args[0] + ( line == 'changed' ? line : '' );
				if ( args[0] == 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n.allLangs[0] ) edit_settings(lang, msg, 'lang', i18n.allLangs[0][args[1]]);
						else msg.reply( nolangs );
					} else msg.reply( lang.settings[current] + langs );
				} else if ( args[0] == 'wiki' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'wiki', regex.exec(args[1])[1]);
						else msg.reply( nowikis );
					} else msg.reply( lang.settings[current] + ' https://' + settings[msg.guild.id].wiki + '.gamepedia.com/' + wikis );
				} else if ( args[0] == 'channel' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'channel', regex.exec(args[1])[1]);
						else msg.reply( nochannels );
					} else if ( settings[msg.guild.id].channels && msg.channel.id in settings[msg.guild.id].channels ) {
						msg.reply( lang.settings[current] + ' https://' + settings[msg.guild.id].channels[msg.channel.id] + '.gamepedia.com/' + channels );
					} else msg.reply( lang.settings[current] + ' https://' + settings[msg.guild.id].wiki + '.gamepedia.com/' + channels );
				} else msg.reply( text );
			} else {
				if ( args[0] == 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n.allLangs[0] ) edit_settings(lang, msg, 'lang', i18n.allLangs[0][args[1]]);
						else msg.reply( nolangs );
					} else msg.reply( lang.settings.lang + langs );
				} else if ( args[0] == 'wiki' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'wiki', regex.exec(args[1])[1]);
						else msg.reply( nowikis );
					} else msg.reply( lang.settings.wikimissing + wikis );
				} else msg.reply( text );
			}
		} else msg.reply( text );
	} else {
		msg.reactEmoji('❌');
	}
}

function edit_settings(lang, msg, key, value) {
	var hourglass;
	msg.reactEmoji('⏳').then( function( reaction ) {
		hourglass = reaction;
		if ( settings == defaultSettings ) {
			console.log( '- Fehler beim Erhalten bestehender Einstellungen.' );
			msg.reply( lang.settings.save_failed );
			if ( hourglass != undefined ) hourglass.remove();
		}
		else {
			var temp_settings = Object.assign({}, settings);
			if ( !( msg.guild.id in temp_settings ) ) temp_settings[msg.guild.id] = Object.assign({}, defaultSettings['default']);
			if ( key == 'channel' ) {
				if ( !temp_settings[msg.guild.id].channels ) temp_settings[msg.guild.id].channels = {};
				temp_settings[msg.guild.id].channels[msg.channel.id] = value;
			} else temp_settings[msg.guild.id][key] = value;
			Object.keys(temp_settings).forEach( function(guild) {
				if ( !client.guilds.has(guild) && guild != 'default' ) {
					delete temp_settings[guild];
				} else {
					var channels = temp_settings[guild].channels;
					if ( channels ) {
						Object.keys(channels).forEach( function(channel) {
							if ( channels[channel] == temp_settings[guild].wiki || !client.guilds.get(guild).channels.has(channel) ) delete channels[channel];
						} );
						if ( !Object.keys(channels).length ) delete temp_settings[guild].channels;
					}
				}
			} );
			request.post( {
				uri: process.env.save + process.env.access,
				body: {
					branch: 'master',
					commit_message: 'Wiki-Bot: Einstellungen aktualisiert.',
					actions: [
						{
							action: 'update',
							file_path: process.env.file,
							content: JSON.stringify( temp_settings, null, '\t' )
						}
					]
				},
				json: true
			}, function( error, response, body ) {
				if ( error || !response || response.statusCode != 201 || !body || body.error ) {
					console.log( '- Fehler beim Bearbeiten' + ( error ? ': ' + error.message : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
					msg.reply( lang.settings.save_failed );
				}
				else {
					settings = Object.assign({}, temp_settings);
					if ( key == 'lang' ) lang = i18n[value];
					cmd_settings(lang, msg, [key], 'changed');
					console.log( '- Einstellungen erfolgreich aktualisiert.' );
				}
				
				if ( hourglass != undefined ) hourglass.remove();
			} );
		}
	} );
}

function cmd_info(lang, msg, args, line) {
	if ( args.length ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
	else {
		var owner = '*MarkusRost*';
		if ( msg.channel.type == 'text' && msg.guild.members.has(process.env.owner) ) owner = '<@' + process.env.owner + '>';
		msg.channel.send( lang.disclaimer.replace( '%s', owner ) );
		cmd_helpserver(lang, msg);
		cmd_invite(lang, msg, args, line);
	}
}

function cmd_helpserver(lang, msg) {
	msg.channel.send( lang.helpserver + '\nhttps://discord.gg/v77RTk5' );
}

function cmd_help(lang, msg, args, line) {
	if ( admin(msg) && !( msg.guild.id in settings ) ) cmd_settings(lang, msg, [], line);
	var cmds = lang.help.list;
	var isMinecraft = ( lang.link == minecraft[lang.lang].link );
	if ( args.length ) {
		if ( mention(msg, args.join(' ')) ) cmd_helpserver(lang, msg);
		else if ( args[0].toLowerCase() == 'admin' ) {
			if ( msg.channel.type != 'text' || admin(msg) ) {
				var cmdlist = lang.help.admin + '\n';
				for ( var i = 0; i < cmds.length; i++ ) {
					if ( cmds[i].admin && !cmds[i].hide ) {
						cmdlist += '🔹 `' + process.env.prefix + ' ' + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
					}
				}
				
				msg.channel.send( cmdlist, {split:true} );
			}
			else {
				msg.reply( lang.help.noadmin );
			}
		}
		else {
			var cmdlist = ''
			for ( var i = 0; i < cmds.length; i++ ) {
				if ( cmds[i].cmd.split(' ')[0] === args[0].toLowerCase() && !cmds[i].unsearchable && ( msg.channel.type != 'text' || !cmds[i].admin || admin(msg) ) && ( !cmds[i].minecraft || isMinecraft ) ) {
					cmdlist += '🔹 `' + process.env.prefix + ' ' + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
				}
			}
			
			if ( cmdlist == '' ) msg.reactEmoji('❓');
			else msg.channel.send( cmdlist, {split:true} );
		}
	}
	else {
		var cmdlist = lang.help.all + '\n';
		for ( var i = 0; i < cmds.length; i++ ) {
			if ( !cmds[i].hide && !cmds[i].admin && ( !cmds[i].minecraft || isMinecraft ) ) {
				cmdlist += '🔹 `' + process.env.prefix + ' ' + cmds[i].cmd + '`\n\t' + cmds[i].desc + '\n';
			}
		}
		
		msg.channel.send( cmdlist, {split:true} );
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
				console.log( '- ' + error.name + ': ' + error.message );
			}
		}
		if ( text || imgs[0] ) {
			msg.channel.send( text, {disableEveryone:false,files:imgs} ).then( message => msg.delete().catch( error => console.log( '- ' + error.name + ': ' + error.message ) ), error => msg.reactEmoji('error') );
		}
	} else {
		msg.reactEmoji('❌');
	}
}

function cmd_test(lang, msg, args, line) {
	if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		var text = lang.test.default;
		var x = Math.floor(Math.random() * lang.test.random);
		if ( x < lang.test.text.length ) text = lang.test.text[x];
		msg.reply( text );
		console.log( '- Dies ist ein Test: Voll funktionsfähig!' );
	} else {
		msg.reply( lang.test.pause );
		console.log( '- Dies ist ein Test: Pausiert!' );
	}
}

function cmd_invite(lang, msg, args, line) {
	if ( args.length ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
	} else {
		client.generateInvite(268954688).then( invite => msg.channel.send( lang.invite.bot + '\n<' + invite + '>' ) );
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
		if ( text == '[object Promise]' ) msg.reactEmoji('✅');
		else msg.channel.send( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'}} ).catch( err => msg.channel.send( '```js\n' + err.name + ': ' + err.message + '\n```', {split:{prepend:'```js\n',append:'\n```'}} ) );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		msg.reactEmoji('❌');
	}
}

function cmd_stop(lang, msg, args, line) {
	if ( msg.author.id == process.env.owner && mention(msg, args.join(' ')) ) {
		msg.reply( 'ich schalte mich nun aus!' );
		console.log( '- Ich schalte mich nun aus!' );
		client.destroy();
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
	}
}

function cmd_pause(lang, msg, args, line) {
	if ( msg.channel.type == 'text' && msg.author.id == process.env.owner && mention(msg, args.join(' ')) ) {
		if ( pause[msg.guild.id] ) {
			msg.reply( 'ich bin wieder wach!' );
			console.log( '- Ich bin wieder wach!' );
			delete pause[msg.guild.id];
		} else {
			msg.reply( 'ich lege mich nun schlafen!' );
			console.log( '- Ich lege mich nun schlafen!' );
			pause[msg.guild.id] = true;
		}
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
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
					console.log( '- Die letzten ' + ( messages.size - 1 ) + ' Nachrichten in #' + msg.channel.name + ' wurden gelöscht!' );
				} );
			}
		}
		else {
			msg.reply( lang.delete.invalid );
		}
	} else {
		msg.reactEmoji('❌');
	}
}

function cmd_link(lang, msg, title, wiki, cmd) {
	if ( cmd == ' ' && admin(msg) && !( msg.guild.id in settings ) ) cmd_settings(lang, msg, [], '');
	var invoke = title.split(' ')[0].toLowerCase();
	var args = title.split(' ').slice(1);
	
	var mclang = minecraft[lang.lang];
	var aliasInvoke = ( invoke in mclang.aliase ) ? mclang.aliase[invoke] : invoke;
	if ( !msg.notminecraft && wiki == mclang.link && ( aliasInvoke in minecraftcmdmap || invoke.startsWith('/') ) ) {
		if ( aliasInvoke in minecraftcmdmap ) minecraftcmdmap[aliasInvoke](lang, mclang, msg, args, title, cmd);
		else cmd_befehl(lang, mclang, msg, invoke.substr(1), args, title, cmd);
	}
	else if ( ( invoke == 'random' || invoke == '🎲' ) && !args.join('') ) cmd_random(lang, msg, wiki);
	else if ( invoke == 'page' || invoke == lang.search.page ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + args.join('_').toTitle() );
	else if ( invoke == 'search' || invoke == lang.search.search ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/Special:Search/' + args.join('_').toTitle() );
	else if ( invoke == 'diff' ) cmd_diff(lang, msg, args, wiki);
	else if ( title.includes( '#' ) ) msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title.split('#')[0].toTitle() + '#' + title.split('#').slice(1).join('#').toSection() );
	else if ( invoke == 'user' || invoke == lang.search.user.unknown || invoke == lang.search.user.male || invoke == lang.search.user.female ) cmd_user(lang, msg, args.join('_').toTitle(), wiki, title.toTitle());
	else if ( invoke.startsWith('user:') ) cmd_user(lang, msg, title.substr(5).toTitle(), wiki, title.toTitle());
	else if ( invoke.startsWith('userprofile:') ) cmd_user(lang, msg, title.substr(12).toTitle(), wiki, title.toTitle());
	else if ( invoke.startsWith(lang.search.user.unknown + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.unknown.length + 1).toTitle(), wiki, title.toTitle());
	else if ( invoke.startsWith(lang.search.user.male + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.male.length + 1).toTitle(), wiki, title.toTitle());
	else if ( invoke.startsWith(lang.search.user.female + ':') ) cmd_user(lang, msg, title.substr(lang.search.user.female.length + 1).toTitle(), wiki, title.toTitle());
	else {
		var hourglass;
		msg.reactEmoji('⏳').then( function( reaction ) {
			hourglass = reaction;
			request( {
				uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&meta=siteinfo&siprop=general&iwurl=true&redirects=true&titles=' + encodeURI( title ),
				json: true
			}, function( error, response, body ) {
				if ( error || !response || !body || !body.query ) {
					if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
						console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
						msg.reactEmoji('nowiki');
					}
					else {
						console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
						msg.channel.send( 'https://' + wiki + '.gamepedia.com/Special:Search/' + title.toTitle() ).then( message => message.reactEmoji('error') );
					}
				}
				else {
					if ( body.query.pages ) {
						if ( body.query.pages['-1'] && ( ( body.query.pages['-1'].missing != undefined && body.query.pages['-1'].known == undefined ) || body.query.pages['-1'].invalid != undefined ) ) {
							request( {
								uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=search&srnamespace=0|4|12|14|10000|10002|10004|10006|10008|10010&srsearch=' + encodeURI( title ) + '&srlimit=1',
								json: true
							}, function( srerror, srresponse, srbody ) {
								if ( srerror || !srresponse || !srbody || !srbody.query || ( !srbody.query.search[0] && srbody.query.searchinfo.totalhits != 0 ) ) {
									console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( srerror ? ': ' + srerror.message : ( srbody ? ( srbody.error ? ': ' + srbody.error.info : '.' ) : '.' ) ) );
									msg.channel.send( 'https://' + wiki + '.gamepedia.com/Special:Search/' + title.toTitle() ).then( message => message.reactEmoji('error') );
								}
								else {
									if ( srbody.query.searchinfo.totalhits == 0 ) {
										msg.reactEmoji('🤷');
									}
									else if ( srbody.query.searchinfo.totalhits == 1 ) {
										msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + srbody.query.search[0].title.toTitle() + '\n' + lang.search.infopage.replace( '%s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ) );
									}
									else {
										msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + srbody.query.search[0].title.toTitle() + '\n' + lang.search.infosearch.replace( '%1$s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ).replace( '%2$s', '`' + process.env.prefix + cmd + lang.search.search + ' ' + title + '`' ) );
									}
								}
							} );
						}
						else {
							msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + Object.values(body.query.pages)[0].title.toTitle() + ( body.query.redirects && body.query.redirects[0].tofragment ? '#' + body.query.redirects[0].tofragment.toSection() : '' ) );
						}
					}
					else if ( body.query.interwiki ) {
						var inter = body.query.interwiki[0];
						var intertitle = inter.title.substr(inter.iw.length+1);
						var regex = /^(?:https?:)?\/\/(.*)\.gamepedia\.com\//.exec(inter.url);
						if ( regex != null ) {
							var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replace( intertitle.replace( /\_/g, ' ' ), intertitle );
							cmd_link(lang, msg, iwtitle, regex[1], ' !' + regex[1] + ' ');
						} else msg.channel.send( inter.url );
					}
					else {
						msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + body.query.general.mainpage.toTitle() );
					}
				}
				
				if ( hourglass != undefined ) hourglass.remove();
			} );
		} );
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
		msg.reactEmoji('❌');
	}
}

function cmd_sendumfrage(lang, msg, args, reactions, imgs, i) {
	msg.channel.send( lang.poll.title + args.slice(i).join(' '), {disableEveryone:false,files:imgs} ).then( poll => {
		msg.delete().catch( error => console.log( '- ' + error.name + ': ' + error.message ) );
		if ( reactions.length ) {
			reactions.forEach( function(entry) {
				poll.react(entry).catch( error => poll.reactEmoji('error') );
			} );
		} else {
			poll.reactEmoji('support');
			poll.reactEmoji('oppose');
		}
	}, error => msg.reactEmoji('error') );
}

function cmd_user(lang, msg, username, wiki, title) {
	if ( !username || username.includes( '/' ) || username.toLowerCase().startsWith('talk:') || username.toLowerCase().startsWith(lang.user.talk) ) {
		msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + title );
	} else {
		var hourglass;
		msg.reactEmoji('⏳').then( function( reaction ) {
			hourglass = reaction;
			request( {
				uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURI( username ),
				json: true
			}, function( error, response, body ) {
				if ( error || !response || !body || !body.query || !body.query.users[0] ) {
					if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
						console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
						msg.reactEmoji('nowiki');
					}
					else {
						console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
						msg.channel.send( '<https://' + wiki + '.gamepedia.com/User:' + username + '>' ).then( message => message.reactEmoji('error') );
					}
				}
				else {
					if ( body.query.users[0].missing == "" || body.query.users[0].invalid == "" ) {
						msg.reactEmoji('🤷');
					}
					else {
						username = body.query.users[0].name.replace( / /g, '_' );
						var timeoptions = {
							year: 'numeric',
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit',
							timeZone: 'UTC',
							timeZoneName: 'short'
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
						var registration = (new Date(body.query.users[0].registration)).toLocaleString(lang.user.dateformat, timeoptions);
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
						var blockedtimestamp = (new Date(body.query.users[0].blockedtimestamp)).toLocaleString(lang.user.dateformat, timeoptions);
						var blockexpiry = body.query.users[0].blockexpiry;
						if ( blockexpiry == 'infinity' ) {
							blockexpiry = lang.user.until_infinity;
							isBlocked = true;
						} else if ( blockexpiry ) {
							var blockexpirydate = blockexpiry.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z');
							blockexpiry = (new Date(blockexpirydate)).toLocaleString(lang.user.dateformat, timeoptions);
							if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
						}
						var blockedby = body.query.users[0].blockedby;
						var blockreason = body.query.users[0].blockreason;
						msg.channel.send( '<https://' + wiki + '.gamepedia.com/UserProfile:' + username + '>\n\n' + lang.user.info.replace( '%1$s', gender ).replace( '%2$s', registration ).replace( '%3$s', editcount ).replace( '%4$s', group ) + ( isBlocked ? '\n\n' + lang.user.blocked.replace( '%1$s', blockedtimestamp ).replace( '%2$s', blockexpiry ).replace( '%3$s', blockedby ).replace( '%4$s', blockreason.wikicode() ) : '' ) );
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
		else title = args.join('_').replace( /\?/g, '%3F' );
		
		if ( error ) msg.reactEmoji('error');
		else if ( /^\d+$/.test(diff) ) {
			var argids = [];
			if ( parseInt(revision, 10) > parseInt(diff, 10) ) argids = [revision, diff];
			else if ( parseInt(revision, 10) == parseInt(diff, 10) ) argids = [revision];
			else argids = [diff, revision];
			cmd_diffsend(lang, msg, argids, wiki);
		}
		else {
			var hourglass;
			msg.reactEmoji('⏳').then( function( reaction ) {
				hourglass = reaction;
				request( {
					uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&prop=revisions&rvprop=' + ( title ? '&titles=' + title : '&revids=' + revision ) + '&rvdiffto=' + diff,
					json: true
				}, function( error, response, body ) {
					if ( error || !response || !body || !body.query ) {
						if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
							console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
							msg.reactEmoji('nowiki');
						}
						else {
							console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
							msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + diff + ( title ? '' : '&oldid=' + revision ) + '>' ).then( message => message.reactEmoji('error') );
						}
					}
					else {
						if ( body.query.badrevids ) msg.reply( lang.diff.badrev );
						else if ( body.query.pages && body.query.pages[-1] ) msg.reactEmoji('error');
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
						else msg.reactEmoji('error');
					}
					
					if ( hourglass != undefined ) hourglass.remove();
				} );
			} );
		}
	}
	else msg.reactEmoji('error');
}

function cmd_diffsend(lang, msg, args, wiki) {
	request( {
		uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags&revids=' + args.join('|'),
		json: true
	}, function( error, response, body ) {
		if ( error || !response || !body || !body.query ) {
			if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
				console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
				msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' ).then( message => message.reactEmoji('error') );
			}
		}
		else {
			if ( body.query.badrevids ) msg.reply( lang.diff.badrev );
			else if ( body.query.pages ) {
				var pages = Object.values(body.query.pages);
				if ( pages.length != 1 ) msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' );
				else {
					var title = pages[0].title.toTitle();
					var revisions = [];
					if ( pages[0].revisions[1] ) revisions = [pages[0].revisions[1], pages[0].revisions[0]];
					else revisions = [pages[0].revisions[0]];
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = ( revisions[0].userhidden != undefined ? lang.diff.hidden : revisions[0].user );
					var timeoptions = {
						year: 'numeric',
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						timeZone: 'UTC',
						timeZoneName: 'short'
					}
					var timestamp = (new Date(revisions[0].timestamp)).toLocaleString(lang.user.dateformat, timeoptions);
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
						
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + diff + '&oldid=' + oldid + '>\n\n' + lang.diff.info.replace( '%1$s', editor ).replace( '%2$s', timestamp ).replace( '%3$s', size ).replace( '%4$s', comment.wikicode() ).replace( '%5$s', tags.join(', ').replace( /<[^>]+>(.+)<\/[^>]+>/g, '$1' ) ) );
				}
			}
			else msg.reactEmoji('error');
		}
		
	} );
}

function cmd_random(lang, msg, wiki) {
	var hourglass;
	msg.reactEmoji('⏳').then( function( reaction ) {
		hourglass = reaction;
		request( {
			uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=random&rnnamespace=0',
			json: true
		}, function( error, response, body ) {
			if ( error || !response || !body || !body.query || !body.query.random[0] ) {
				if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
					console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error.message : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.channel.send( 'https://' + wiki + '.gamepedia.com/Special:Random' ).then( message => message.reactEmoji('error') );
				}
			}
			else {
				msg.channel.send( '🎲 https://' + wiki + '.gamepedia.com/' + body.query.random[0].title.toTitle() );
			}
			
			if ( hourglass != undefined ) hourglass.remove();
		} );
	} );
}

function cmd_bug(lang, mclang, msg, args, title, cmd) {
	if ( args.length && /\d+$/.test(args[0]) && !args[1] ) {
		var hourglass;
		msg.reactEmoji('⏳').then( function( reaction ) {
			hourglass = reaction;
			var project = '';
			if ( /^\d+$/.test(args[0]) ) project = 'MC-';
			request( {
				uri: 'https://bugs.mojang.com/rest/api/2/issue/' + project + args[0] + '?fields=summary',
				json: true
			}, function( error, response, body ) {
				if ( error || !response || !body || body['status-code'] == 404 ) {
					console.log( '- Fehler beim Erhalten der Zusammenfassung' + ( error ? ': ' + error.message : ( body ? ': ' + body.message : '.' ) ) );
					if ( body && body['status-code'] == 404 ) msg.reactEmoji('error');
					else msg.channel.send( 'https://bugs.mojang.com/browse/' + project + args[0] ).then( message => message.reactEmoji('error') );
				}
				else {
					if ( body.errorMessages || body.errors ) {
						if ( body.errorMessages && body.errorMessages[0] == 'Issue Does Not Exist' ) {
							msg.reactEmoji('❓');
						}
						else {
							msg.channel.send( mclang.bug.private + '\nhttps://bugs.mojang.com/browse/' + project + args[0] );
						}
					}
					else if ( !body.fields ) {
						msg.reactEmoji('error');
					}
					else {
						msg.channel.send( body.fields.summary + '\nhttps://bugs.mojang.com/browse/' + body.key );
					}
				}
				
				if ( hourglass != undefined ) hourglass.remove();
			} );
		} );
	}
	else {
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd);
	}
}

function cmd_befehl(lang, mclang, msg, befehl, args, title, cmd) {
	var aliasCmd = ( ( befehl in mclang.cmd.aliase ) ? mclang.cmd.aliase[befehl] : befehl ).toLowerCase();
	
	if ( aliasCmd in mclang.cmd.list ) {
		var regex = new RegExp('/' + aliasCmd, 'g');
		var cmdSyntax = mclang.cmd.list[aliasCmd].join( '\n' ).replace( regex, '/' + befehl );
		msg.channel.send( '```md\n' + cmdSyntax + '```<https://' + mclang.link + '.gamepedia.com/' + mclang.cmd.page + aliasCmd + '>', {split:{maxLength:2000,prepend:'```md\n',append:'```'}} );
	}
	else {
		msg.reactEmoji('❓');
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd);
	}
}

function cmd_befehl2(lang, mclang, msg, args, title, cmd) {
	if ( args.length ) {
		if ( args[0].startsWith('/') ) cmd_befehl(lang, mclang, msg, args[0].substr(1), args.slice(1), title, cmd);
		else cmd_befehl(lang, mclang, msg, args[0], args.slice(1), title, cmd);
	}
	else {
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd);
	}
}

function cmd_multiline(lang, msg, args, line) {
	msg.reactEmoji('error');
}

function cmd_voice(lang, msg, args, line) {
	if ( admin(msg) && !args.length ) msg.reply( lang.voice.text + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`' );
	else cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
}

function cmd_get(lang, msg, args, line) {
	var id = args.join().replace( /^\\?<(?:!?@|#)(\d+)>$/, '$1' );
	if ( msg.author.id == process.env.owner && /^\d+$/.test(id) ) {
		if ( client.guilds.has(id) ) {
			var guild = client.guilds.get(id);
			var owner = guild.owner.user.tag;
			if ( msg.channel.type == 'text' && msg.guild.members.has(guild.ownerID) ) owner = msg.guild.members.get(guild.ownerID).toString();
			var permissions = ( guild.me.permissions.has(268954688) ? '*none*' : '`' + guild.me.permissions.missing(new Discord.Permissions(268954688).toArray()).join('`, `') + '`' );
			var guildsettings = ( guild.id in settings ? '```json\n' + JSON.stringify( settings[guild.id], null, '\t' ) + '\n```' : '*default*' );
			msg.channel.send( 'Guild: ' + guild.name + ' `' + guild.id + '`\nOwner: ' + owner + ' `' + guild.ownerID + '`\nMissing permissions: ' + permissions + '\nSettings: ' + guildsettings, {split:true} );
		} else if ( client.guilds.some( guild => guild.members.has(id) ) ) {
			var text = '';
			client.guilds.filter( guild => guild.members.has(id) ).forEach( function(guild) {
				var member = guild.members.get(id);
				if ( !text ) {
					var user = member.user.tag;
					if ( msg.channel.type == 'text' && msg.guild.members.has(member.id) ) user = msg.guild.members.get(member.id).toString();
					text = 'User: ' + user + ' `' + member.id + '`\nGuilds:';
				}
				text += '\n' + guild.name + ' `' + guild.id + '`' + ( member.permissions.has('MANAGE_GUILD') ? '\*' : '' );
			} );
			msg.channel.send( text, {split:true} );
		} else if ( client.guilds.some( guild => guild.channels.filter( chat => chat.type == 'text' ).has(id) ) ) {
			var channel = client.guilds.find( guild => guild.channels.filter( chat => chat.type == 'text' ).has(id) ).channels.get(id);
			var permissions = ( channel.memberPermissions(channel.guild.me).has(268954688) ? '*none*' : '`' + channel.memberPermissions(channel.guild.me).missing(new Discord.Permissions(268954688).toArray()).join('`, `') + '`' );
			var wiki = ( channel.guild.id in settings ? ( channel.id in settings[channel.guild.id] ? settings[channel.guild.id].channels[channel.id] : settings[channel.guild.id].wiki ) : settings['default'].wiki );
			msg.channel.send( 'Guild: ' + channel.guild.name + ' `' + channel.guild.id + '`\nChannel: #' + channel.name + ' `' + channel.id + '` ' + channel.toString() + '\nMissing permissions: ' + permissions + '\nDefault Wiki: `' + wiki + '`', {split:true} );
		} else msg.reply( 'I couldn\'t find a result for `' + id + '`' );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
}

function mention(msg, arg) {
	if ( arg == '@' + client.user.username || ( msg.channel.type == 'text' && arg == '@' + msg.guild.me.displayName ) ) return true;
	else return false;
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

String.prototype.toTitle = function() {
	return this.replace( / /g, '_' ).replace( /\%/g, '%25' ).replace( /\?/g, '%3F' );
};

String.prototype.toSection = function() {
	return encodeURIComponent( this.replace( / /g, '_' ) ).replace( /\'/g, '%27' ).replace( /\(/g, '%28' ).replace( /\)/g, '%29' ).replace( /\%/g, '.' );
};

String.prototype.wikicode = function() {
	return this.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' );
};

Object.prototype.reactEmoji = function(name) {
	var emoji = '440871715938238494';
	switch ( name ) {
		case 'nowiki':
			emoji = '505884572001763348';
			break;
		case 'error':
			emoji = '440871715938238494';
			break;
		case 'support':
			emoji = '448222377009086465';
			break;
		case 'oppose':
			emoji = '448222455425794059';
			break;
		default:
			emoji = name;
	}
	return this.react(emoji).catch( error => console.log( '- ' + error.name + ': ' + error.message ) );
};


function prefix(text) {
	if ( text.toLowerCase().startsWith( process.env.prefix + ' ' ) || text.toLowerCase() == process.env.prefix ) return true;
	else return false;
}

client.on('message', msg => {
	var cont = msg.content;
	var author = msg.author;
	var channel = msg.channel;
	if ( channel.type == 'text' ) var permissions = channel.permissionsFor(client.user);
	else var permissions = new Discord.Permissions(0);
	if ( cont.toLowerCase().includes( process.env.prefix ) && !msg.webhookID && author.id != client.user.id ) {
		if ( settings == defaultSettings ) getSettings(setStatus);
		var setting = Object.assign({}, settings['default']);
		if ( channel.type == 'text' && msg.guild.id in settings ) setting = Object.assign({}, settings[msg.guild.id]);
		var lang = i18n[setting.lang];
		lang.link = setting.wiki;
		if ( setting.channels && channel.id in setting.channels ) lang.link = setting.channels[channel.id];
		if ( ( channel.type != 'text' || permissions.has(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS']) ) ) {
			var invoke = cont.split(' ')[1] ? cont.split(' ')[1].toLowerCase() : '';
			var aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
			if ( prefix( cont ) && aliasInvoke in multilinecmdmap ) {
				if ( channel.type != 'text' || permissions.has('MANAGE_MESSAGES') ) {
					var args = cont.split(' ').slice(2);
					console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + cont );
					if ( channel.type != 'text' || !pause[msg.guild.id] || ( author.id == process.env.owner && aliasInvoke in pausecmdmap ) ) multilinecmdmap[aliasInvoke](lang, msg, args, cont);
				} else {
					console.log( msg.guild.name + ': Fehlende Berechtigungen - MANAGE_MESSAGES' );
					msg.reply( lang.missingperm + ' `MANAGE_MESSAGES`' );
				}
			} else {
				var count = 0;
				msg.cleanContent.replace(/\u200b/g, '').split('\n').forEach( function(line) {
					if ( prefix( line ) && count < 10 ) {
						count++;
						invoke = line.split(' ')[1] ? line.split(' ')[1].toLowerCase() : '';
						var args = line.split(' ').slice(2);
						aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
						console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + line );
						if ( channel.type != 'text' || !pause[msg.guild.id] ) {
							if ( aliasInvoke in cmdmap ) cmdmap[aliasInvoke](lang, msg, args, line);
							else if ( invoke.startsWith('!') ) cmd_link(lang, msg, args.join(' '), invoke.substr(1), ' ' + invoke + ' ');
							else cmd_link(lang, msg, line.split(' ').slice(1).join(' '), lang.link, ' ');
						} else if ( channel.type == 'text' && pause[msg.guild.id] && author.id == process.env.owner && aliasInvoke in pausecmdmap ) {
							pausecmdmap[aliasInvoke](lang, msg, args, line);
						}
					} else if ( prefix( line ) && count == 10 ) {
						count++;
						console.log( '- Nachricht enthält zu viele Befehle!' );
						msg.reactEmoji('⚠');
						channel.send( lang.limit.replace( '%s', author.toString() ) ).then( message => message.reactEmoji('⚠') );
					}
				} );
			}
		} else {
			console.log( msg.guild.name + ': Fehlende Berechtigungen - ' + permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS']) );
			if ( permissions.has(['SEND_MESSAGES']) ) msg.reply( lang.missingperm + ' `' + permissions.missing(['ADD_REACTIONS','USE_EXTERNAL_EMOJIS']).join('`, `') + '`' );
		}
	}
});


client.on('voiceStateUpdate', (oldm, newm) => {
	if ( settings == defaultSettings ) getSettings(setStatus);
	if ( oldm.guild.me.permissions.has('MANAGE_ROLES') && oldm.voiceChannelID != newm.voiceChannelID ) {
		var setting = Object.assign({}, settings['default']);
		if ( oldm.guild.id in settings ) setting = Object.assign({}, settings[oldm.guild.id]);
		var lang = i18n[setting.lang];
		if ( oldm.voiceChannel ) {
			var oldrole = oldm.roles.find( role => role.name == lang.voice.channel + ' – ' + oldm.voiceChannel.name );
			if ( oldrole && oldrole.comparePositionTo(oldm.guild.me.highestRole) < 0 ) {
				oldm.removeRole( oldrole, lang.voice.left.replace( '%1$s', oldm.displayName ).replace( '%2$s', oldm.voiceChannel.name ) );
				console.log( oldm.guild.name + ': ' + oldm.displayName + ' hat den Sprachkanal "' + oldm.voiceChannel.name + '" verlassen.' );
			}
		}
		if ( newm.voiceChannel ) {
			var newrole = newm.guild.roles.find( role => role.name == lang.voice.channel + ' – ' + newm.voiceChannel.name );
			if ( newrole && newrole.comparePositionTo(newm.guild.me.highestRole) < 0 ) {
				newm.addRole( newrole, lang.voice.join.replace( '%1$s', newm.displayName ).replace( '%2$s', newm.voiceChannel.name ) );
				console.log( newm.guild.name + ': ' + newm.displayName + ' hat den Sprachkanal "' + newm.voiceChannel.name + '" betreten.' );
			}
		}
	}
});


client.on('guildCreate', guild => {
	client.fetchUser(process.env.owner).then( owner => owner.send( 'Ich wurde zu einem Server hinzugefügt:\n\n' + '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern.\n(' + guild.id + ')' ) );
	console.log( '- Ich wurde zu einem Server hinzugefügt.' );
});

client.on('guildDelete', guild => {
	client.fetchUser(process.env.owner).then( owner => owner.send( 'Ich wurde von einem Server entfernt:\n\n' + '"' + guild.toString() + '" von ' + guild.owner.toString() + ' mit ' + guild.memberCount + ' Mitgliedern.\n(' + guild.id + ')' ) );
	console.log( '- Ich wurde von einem Server entfernt.' );
	
	if ( !guild.available ) {
		console.log( '- Dieser Server ist nicht erreichbar.' );
	}
	else if ( settings == defaultSettings ) {
		console.log( '- Fehler beim Erhalten bestehender Einstellungen.' );
	}
	else {
		var temp_settings = Object.assign({}, settings);
		Object.keys(temp_settings).forEach( function(guild) {
			if ( !client.guilds.has(guild) && guild != 'default' ) delete temp_settings[guild];
		} );
		request.post( {
			uri: process.env.save + process.env.access,
			body: {
				branch: 'master',
				commit_message: 'Wiki-Bot: Einstellungen entfernt.',
				actions: [
					{
						action: 'update',
						file_path: process.env.file,
						content: JSON.stringify( temp_settings, null, '\t' )
					}
				]
			},
			json: true
		}, function( error, response, body ) {
			if ( error || !response || response.statusCode != 201 || !body || body.error ) {
				console.log( '- Fehler beim Bearbeiten' + ( error ? ': ' + error.message : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
			}
			else {
				settings = Object.assign({}, temp_settings);
				console.log( '- Einstellungen erfolgreich aktualisiert.' );
			}
		} );
	}
});


client.login(process.env.token);


client.on('error', error => {
	console.log( '--- ERROR: ' + new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' }) + ' ---\n- ' + error.name + ': ' + error.message );
});

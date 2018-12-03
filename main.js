require('dotenv').config();
const fs = require('fs');
const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

const Discord = require('discord.js');
const DBL = require("dblapi.js");
var request = require('request');

var client = new Discord.Client( {disableEveryone:true} );
const dbl = new DBL(process.env.dbltoken, {statsInterval:10800000}, client);

var i18n = JSON.parse(fs.readFileSync('i18n.json', 'utf8').trim());
var minecraft = JSON.parse(fs.readFileSync('minecraft.json', 'utf8').trim());

var pause = {};
var access = {'PRIVATE-TOKEN': process.env.access};
var defaultPermissions = new Discord.Permissions(268954688).toArray();

var ready = {
	settings: true,
	allSites: true
}

var defaultSettings = {
	"default": {
		"lang": "en",
		"wiki": "help"
	}
}
var settings = defaultSettings;

function getSettings(callback) {
	ready.settings = true;
	request( {
		uri: process.env.read + process.env.file + process.env.raw,
		headers: access,
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode != 200 || !body || body.message || body.error ) {
			console.log( '- Fehler beim Erhalten der Einstellungen' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
			ready.settings = false;
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
	else {
		client.user.setStatus('online');
		client.user.setActivity( process.env.prefix + ' help' );
	}
}

var defaultSites = [];
var allSites = defaultSites;

function getAllSites() {
	ready.allSites = true;
	request( {
		uri: 'https://help.gamepedia.com/api.php?action=allsites&format=json&formatversion=2&do=getSiteStats&filter=wikis|wiki_domain,wiki_display_name,official_wiki,wiki_managers',
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode != 200 || !body || body.status != 'okay' || !body.data || !body.data.wikis ) {
			console.log( '- Fehler beim Erhalten der Wikis' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
			ready.allSites = false;
		}
		else {
			console.log( '- Wikis erfolgreich ausgelesen.' );
			allSites = Object.assign([], body.data.wikis.filter( site => /^[a-z\d-]{1,30}\.gamepedia\.com$/.test(site.wiki_domain) ));
		}
	} );
}

client.on('ready', () => {
	console.log( '- Erfolgreich als ' + client.user.username + ' angemeldet!' );
	getSettings(setStatus);
	getAllSites();
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

dbl.on('error', error => {
	console.log( '--- DBL-ERROR: ' + new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' }) + ' ---\n- ' + error );
} );


var timeoptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'UTC',
	timeZoneName: 'short'
}
	
	
var cmdmap = {
	help: cmd_help,
	test: cmd_test,
	invite: cmd_invite,
	say: cmd_multiline,
	delete: cmd_multiline,
	poll: cmd_multiline,
	voice: cmd_voice,
	settings: cmd_settings,
	info: cmd_info
}

var multilinecmdmap = {
	say: cmd_say,
	delete: cmd_delete,
	poll: cmd_umfrage
}

var ownercmdmap = {
	stop: cmd_stop,
	pause: cmd_pause,
	eval: cmd_eval,
	get: cmd_get
}

var pausecmdmap = {
	test: cmd_test,
	say: cmd_multiline,
	delete: cmd_multiline,
	settings: cmd_settings
}

var minecraftcmdmap = {
	command: cmd_befehl2,
	bug: cmd_bug
}

function cmd_settings(lang, msg, args, line) {
	if ( msg.isAdmin() ) {
		if ( msg.guild.id in settings ) {
			var text = lang.settings.current.replace( '%1$s', '- `' + process.env.prefix + ' settings lang`' ).replace( '%2$s', 'https://' + settings[msg.guild.id].wiki + '.gamepedia.com/ - `' + process.env.prefix + ' settings wiki`' ) + ' - `' + process.env.prefix + ' settings channel`\n';
			if ( settings[msg.guild.id].channels ) {
				Object.keys(settings[msg.guild.id].channels).forEach( function(channel) {
					text += '<#' + channel + '>: <https://' + settings[msg.guild.id].channels[channel] + '.gamepedia.com/>\n';
				} );
			} else text += lang.settings.nochannels;
		} else {
			var text = lang.settings.missing.replace( '%1$s', '`' + process.env.prefix + ' settings lang`' ).replace( '%2$s', '`' + process.env.prefix + ' settings wiki`' );
		}
		if ( args.length ) {
			if ( args[0] ) args[0] = args[0].toLowerCase();
			if ( args[1] ) args[1] = args.slice(1).join(' ').toLowerCase();
			var langs = '\n' + lang.settings.langhelp.replace( '%s', process.env.prefix + ' settings lang' ) + ' `' + i18n.allLangs[1].join(', ') + '`';
			var wikis = '\n' + lang.settings.wikihelp.replace( '%s', process.env.prefix + ' settings wiki' );
			var channels = '\n' + lang.settings.wikihelp.replace( '%s', process.env.prefix + ' settings channel' );
			var nolangs = lang.settings.langinvalid + langs;
			var nowikis = lang.settings.wikiinvalid + wikis;
			var nochannels = lang.settings.wikiinvalid + channels;
			var regex = /^(?:(?:https?:)?\/\/)?([a-z\d-]{1,30})\.gamepedia\.com/
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
						else find_wikis(lang, msg, 'wiki', args[1].split(' '), nowikis);
					} else msg.reply( lang.settings[current] + ' https://' + settings[msg.guild.id].wiki + '.gamepedia.com/' + wikis );
				} else if ( args[0] == 'channel' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'channel', regex.exec(args[1])[1]);
						else find_wikis(lang, msg, 'channel', args[1].split(' '), nochannels);
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
				} else if ( args[0] == 'wiki' || args[0] == 'channel' ) {
					if ( args[1] ) {
						if ( regex.test(args[1]) ) edit_settings(lang, msg, 'wiki', regex.exec(args[1])[1]);
						else find_wikis(lang, msg, 'wiki', args[1].split(' '), nowikis);
					} else msg.reply( lang.settings.wikimissing + wikis );
				} else msg.reply( text );
			}
		} else msg.reply( text );
	} else {
		msg.reactEmoji('❌');
	}
}

function find_wikis(lang, msg, key, value, text) {
	if ( allSites.find( site => site.wiki_domain == value.join('') + '.gamepedia.com' ) ) edit_settings(lang, msg, key, value.join(''));
	else {
		var sites = allSites.filter( site => site.wiki_display_name.toLowerCase().includes( value.join(' ') ) );
		if ( 0 < sites.length && sites.length < 21 ) {
			text += '\n\n' + lang.settings.foundwikis;
			sites.forEach( function(site) {
				text += '\n' + site.wiki_display_name + ': `' + site.wiki_domain + '`';
			} );
		}
		msg.reply( text, {split:true} );
	}
}

function edit_settings(lang, msg, key, value) {
	msg.reactEmoji('⏳').then( function( reaction ) {
		if ( settings == defaultSettings ) {
			console.log( '- Fehler beim Erhalten bestehender Einstellungen.' );
			msg.reply( lang.settings.save_failed );
			if ( reaction ) reaction.removeEmoji();
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
				uri: process.env.save,
				headers: access,
				body: {
					branch: 'master',
					commit_message: client.user.username + ': Einstellungen aktualisiert.',
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
					console.log( '- Fehler beim Bearbeiten' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
					msg.reply( lang.settings.save_failed );
				}
				else {
					settings = Object.assign({}, temp_settings);
					if ( key == 'lang' ) lang = i18n[value];
					cmd_settings(lang, msg, [key], 'changed');
					console.log( '- Einstellungen erfolgreich aktualisiert.' );
				}
				
				if ( reaction ) reaction.removeEmoji();
			} );
		}
	} );
}

function cmd_info(lang, msg, args, line) {
	if ( args.length ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	else {
		var owner = '*MarkusRost*';
		if ( msg.channel.type == 'text' && msg.guild.members.has(process.env.owner) ) owner = '<@' + process.env.owner + '>';
		msg.channel.send( lang.disclaimer.replace( '%s', owner ) );
		cmd_helpserver(lang, msg);
		cmd_invite(lang, msg, args, line);
	}
}

function cmd_helpserver(lang, msg) {
	msg.channel.send( lang.helpserver + '\n' + process.env.invite );
}

function cmd_help(lang, msg, args, line) {
	if ( msg.isAdmin() && !( msg.guild.id in settings ) && settings != defaultSettings ) {
		cmd_settings(lang, msg, [], line);
		cmd_helpserver(lang, msg);
	}
	var cmds = lang.help.list;
	var isMinecraft = ( lang.link == minecraft[lang.lang].link );
	if ( args.length ) {
		if ( args.join(' ').isMention(msg.guild) ) cmd_helpserver(lang, msg);
		else if ( args[0].toLowerCase() == 'admin' ) {
			if ( msg.channel.type != 'text' || msg.isAdmin() ) {
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
				if ( cmds[i].cmd.split(' ')[0] === args[0].toLowerCase() && !cmds[i].unsearchable && ( msg.channel.type != 'text' || !cmds[i].admin || msg.isAdmin() ) && ( !cmds[i].minecraft || isMinecraft ) ) {
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
	args = args.toEmojis();
	var text = args.join(' ');
	if ( args[0] == 'alarm' ) text = '🚨 **' + args.slice(1).join(' ') + '** 🚨';
	var imgs = msg.attachments.map( function(img) {
		return {attachment:img.url,name:img.filename};
	} );
	if ( msg.isOwner() ) {
		try {
			text = eval( '`' + text + '`' );
		} catch ( error ) {
			console.log( '- ' + error );
		}
	}
	if ( text || imgs.length ) {
		msg.channel.send( text, {disableEveryone:!msg.member.hasPermission(['MENTION_EVERYONE']),files:imgs} ).then( message => msg.delete().catch( error => console.log( '- ' + error ) ), error => msg.reactEmoji('error') );
	} else {
		args[0] = line.split(' ')[1];
		cmd_help(lang, msg, args, line);
	}
}

function cmd_test(lang, msg, args, line) {
	if ( args.length ) {
		if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
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
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	} else {
		client.generateInvite(defaultPermissions).then( invite => msg.channel.send( lang.invite.bot + '\n<' + invite + '>' ) );
	}
}

function cmd_eval(lang, msg, args, line) {
	try {
		var text = util.inspect( eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.toString();
	}
	console.log( '--- EVAL START ---\n\u200b' + text.replace( /\n/g, '\n\u200b' ) + '\n--- EVAL END ---' );
	if ( text == 'Promise {\n  <pending>\n}' ) msg.reactEmoji('✅');
	else msg.channel.send( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'}} ).catch( err => console.log( '- ' + err ) );
}

function cmd_stop(lang, msg, args, line) {
	if ( args.join(' ').split('\n')[0].isMention(msg.guild) ) {
		msg.reply( 'I\'ll turn me off now!' );
		console.log( '- Ich schalte mich nun aus!' );
		client.destroy();
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	}
}

function cmd_pause(lang, msg, args, line) {
	if ( msg.channel.type == 'text' && args.join(' ').split('\n')[0].isMention(msg.guild) ) {
		if ( pause[msg.guild.id] ) {
			msg.reply( 'I\'m up again!' );
			console.log( '- Ich bin wieder wach!' );
			delete pause[msg.guild.id];
		} else {
			msg.reply( 'I\'m going to sleep now!' );
			console.log( '- Ich lege mich nun schlafen!' );
			pause[msg.guild.id] = true;
		}
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	}
}

function cmd_delete(lang, msg, args, line) {
	if ( /^\d+$/.test(args[0]) && parseInt(args[0], 10) + 1 > 0 ) {
		if ( parseInt(args[0], 10) > 99 ) {
			msg.reply( lang.delete.big.replace( '%s', '`99`' ) );
		}
		else {
			msg.channel.bulkDelete(parseInt(args[0], 10) + 1, true).then( messages => {
				msg.reply( lang.delete.success.replace( '%s', messages.size - 1 ) ).then( antwort => antwort.delete(3000) );
				console.log( '- Die letzten ' + ( messages.size - 1 ) + ' Nachrichten in #' + msg.channel.name + ' wurden von @' + msg.member.displayName + ' gelöscht!' );
			} );
		}
	}
	else {
		msg.reply( lang.delete.invalid );
	}
}

function cmd_link(lang, msg, title, wiki = lang.link, cmd = ' ', querystring = '', fragment = '') {
	if ( cmd == ' ' && msg.isAdmin() && !( msg.guild.id in settings ) && settings != defaultSettings ) {
		cmd_settings(lang, msg, [], '');
	}
	if ( title.includes( '#' ) ) {
		fragment = title.split('#').slice(1).join('#');
		title = title.split('#')[0];
	}
	if ( /\?[a-z]+=/.test(title) ) {
		var querystart = title.search(/\?[a-z]+=/);
		querystring = title.substr(querystart + 1);
		title = title.substr(0, querystart);
	}
	var linksuffix = ( querystring ? '?' + querystring.toTitle() : '' ) + ( fragment ? '#' + fragment.toSection() : '' );
	if ( title.length > 300 ) {
		title = title.substr(0, 300);
		msg.reactEmoji('⚠');
	}
	var invoke = title.split(' ')[0].toLowerCase();
	var args = title.split(' ').slice(1);
	
	var mclang = minecraft[lang.lang];
	var aliasInvoke = ( invoke in mclang.aliase ) ? mclang.aliase[invoke] : invoke;
	if ( !msg.notminecraft && wiki == mclang.link && ( aliasInvoke in minecraftcmdmap || invoke.startsWith('/') ) ) {
		if ( aliasInvoke in minecraftcmdmap ) minecraftcmdmap[aliasInvoke](lang, mclang, msg, args, title, cmd, querystring, fragment);
		else cmd_befehl(lang, mclang, msg, invoke.substr(1), args, title, cmd, querystring, fragment);
	}
	else if ( ( invoke == 'random' || invoke == '🎲' ) && !args.join('') && !linksuffix ) cmd_random(lang, msg, wiki);
	else if ( invoke == 'page' || invoke == lang.search.page ) msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + args.join('_').toTitle() + linksuffix + '>' );
	else if ( invoke == 'search' || invoke == lang.search.search ) msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Search/' + args.join('_').toTitle() + linksuffix + '>' );
	else if ( invoke == 'diff' ) cmd_diff(lang, msg, args, wiki);
	else {
		msg.reactEmoji('⏳').then( function( reaction ) {
			request( {
				uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&meta=siteinfo&siprop=general&iwurl=true' + ( /(?:^|&)redirect=no(?:&|$)/.test( querystring ) ? '' : '&redirects=true' ) + '&prop=pageimages|extracts&exsentences=10&exintro=true&explaintext=true&titles=' + encodeURIComponent( title ),
				json: true
			}, function( error, response, body ) {
				if ( error || !response || response.statusCode != 200 || !body || body.batchcomplete == undefined || !body.query ) {
					if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
						console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
						msg.reactEmoji('nowiki');
					}
					else {
						console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
						msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + ( linksuffix ? title.toTitle() + linksuffix : 'Special:Search/' + title.toTitle() ) + '>' ).then( message => message.reactEmoji('error') );
					}
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					if ( body.query.pages ) {
						var querypage = Object.values(body.query.pages)[0];
						if ( ( querypage.ns == 2 || querypage.ns == 202 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:[\d\.]+\/\d\d$/.test(querypage.title) ) ) {
							var userparts = querypage.title.split(':');
							cmd_user(lang, msg, userparts[0].toTitle() + ':', userparts.slice(1).join(':'), wiki, linksuffix, reaction);
						}
						else if ( body.query.pages['-1'] && ( ( body.query.pages['-1'].missing != undefined && body.query.pages['-1'].known == undefined ) || body.query.pages['-1'].invalid != undefined ) ) {
							request( {
								uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&prop=pageimages|extracts&exsentences=10&exintro=true&explaintext=true&generator=search&gsrnamespace=0|4|12|14|10000|10002|10004|10006|10008|10010&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ),
								json: true
							}, function( srerror, srresponse, srbody ) {
								if ( srerror || !srresponse || srresponse.statusCode != 200 || !srbody || srbody.batchcomplete == undefined ) {
									console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( srerror ? ': ' + srerror : ( srbody ? ( srbody.error ? ': ' + srbody.error.info : '.' ) : '.' ) ) );
									msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Search/' + title.toTitle() + '>' ).then( message => message.reactEmoji('error') );
								}
								else {
									if ( !srbody.query ) {
										msg.reactEmoji('🤷');
									}
									else {
										querypage = Object.values(srbody.query.pages)[0];
										var pagelink = 'https://' + wiki + '.gamepedia.com/' + querypage.title.toTitle() + linksuffix;
										var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title ).setURL( pagelink );
										if ( querypage.extract ) {
											var extract = querypage.extract;
											if ( extract.length > 2000 ) extract = extract.substr(0, 2000) + '\u2026';
											embed.setDescription( extract );
										}
										if ( querypage.pageimage ) {
											var pageimage = 'https://' + wiki + '.gamepedia.com/Special:FilePath/' + querypage.pageimage;
											if ( querypage.ns == 6 ) embed.setImage( pageimage );
											else embed.setThumbnail( pageimage );
										} else embed.setThumbnail( body.query.general.logo );
										if ( title.replace( /\-/g, ' ' ).toTitle().toLowerCase() == querypage.title.replace( /\-/g, ' ' ).toTitle().toLowerCase() ) {
											msg.channel.send( pagelink, embed );
										}
										else if ( !srbody.continue ) {
											msg.channel.send( pagelink + '\n' + lang.search.infopage.replace( '%s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ), embed );
										}
										else {
											msg.channel.send( pagelink + '\n' + lang.search.infosearch.replace( '%1$s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + '`' ).replace( '%2$s', '`' + process.env.prefix + cmd + lang.search.search + ' ' + title + '`' ), embed );
										}
									}
								}
								
								if ( reaction ) reaction.removeEmoji();
							} );
						}
						else {
							var pagelink = 'https://' + wiki + '.gamepedia.com/' + querypage.title.toTitle() + ( querystring ? '?' + querystring.toTitle() : '' ) + ( body.query.redirects && body.query.redirects[0].tofragment ? '#' + body.query.redirects[0].tofragment.toSection() : ( fragment ? '#' + fragment.toSection() : '' ) );
							var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title ).setURL( pagelink );
							if ( querypage.extract ) {
								var extract = querypage.extract;
								if ( extract.length > 2000 ) extract = extract.substr(0, 2000) + '\u2026';
								embed.setDescription( extract );
							}
							if ( querypage.pageimage ) {
								var pageimage = 'https://' + wiki + '.gamepedia.com/Special:FilePath/' + querypage.pageimage;
								if ( querypage.ns == 6 ) embed.setImage( pageimage );
								else embed.setThumbnail( pageimage );
							} else embed.setThumbnail( body.query.general.logo );
							msg.channel.send( pagelink, embed );
							
							if ( reaction ) reaction.removeEmoji();
						}
					}
					else if ( body.query.interwiki ) {
						var inter = body.query.interwiki[0];
						var intertitle = inter.title.substr(inter.iw.length + 1);
						var regex = /^(?:https?:)?\/\/(.*)\.gamepedia\.com\//.exec(inter.url);
						if ( regex != null ) {
							var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replace( intertitle.replace( /\_/g, ' ' ), intertitle );
							cmd_link(lang, msg, iwtitle, regex[1], ' !' + regex[1] + ' ', querystring, fragment);
						} else {
							msg.channel.send( inter.url + linksuffix );
							
							if ( reaction ) reaction.removeEmoji();
						}
					}
					else {
						msg.channel.send( 'https://' + wiki + '.gamepedia.com/' + body.query.general.mainpage.toTitle() + linksuffix );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
			} );
		} );
	}
}

function cmd_umfrage(lang, msg, args, line) {
	var imgs = msg.attachments.map( function(img) {
		return {attachment:img.url,name:img.filename};
	} );
	if ( args.length || imgs.length ) {
		var reactions = [];
		args = args.toEmojis();
		for ( var i = 0; ( i < args.length || imgs.length ); i++ ) {
			var reaction = args[i];
			var custom = /^<a?:/;
			var pattern = /^[\w\säÄöÖüÜßẞ!"#$%&'()*+,./:;<=>?@^`{|}~–[\]\-\\]{2,}/;
			if ( !custom.test(reaction) && pattern.test(reaction) ) {
				cmd_sendumfrage(lang, msg, args, reactions, imgs, i);
				break;
			} else if ( reaction == '' ) {
			} else {
				if ( custom.test(reaction) ) {
					reaction = reaction.substring(reaction.lastIndexOf(':') + 1, reaction.length - 1);
				}
				reactions[i] = reaction;
				if ( i == args.length - 1 ) {
					cmd_sendumfrage(lang, msg, args, reactions, imgs, i + 1);
					break;
				}
			}
		}
	} else {
		args[0] = line.split(' ')[1];
		cmd_help(lang, msg, args, line);
	}
}

function cmd_sendumfrage(lang, msg, args, reactions, imgs, i) {
	msg.channel.send( lang.poll.title + args.slice(i).join(' '), {disableEveryone:!msg.member.hasPermission(['MENTION_EVERYONE']),files:imgs} ).then( poll => {
		msg.delete().catch( error => console.log( '- ' + error ) );
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

function cmd_user(lang, msg, namespace, username, wiki, linksuffix, reaction) {
	if ( /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d\d)?$/.test(username) ) {
		request( {
			uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ),
			json: true
		}, function( error, response, body ) {
			if ( error || !response || response.statusCode != 200 || !body || body.batchcomplete == undefined || !body.query || !body.query.blocks ) {
				if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
					console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else if ( body && body.error && ( body.error.code == 'param_ip' || body.error.code == 'cidrtoobroad' ) ) {
					msg.reactEmoji('error');
				}
				else {
					console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Contributions/' + username.toTitle() + '>' ).then( message => message.reactEmoji('error') );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				var blocks = body.query.blocks.map( function(block) {
					var isBlocked = false;
					var blockedtimestamp = (new Date(block.timestamp)).toLocaleString(lang.user.dateformat, timeoptions);
					var blockexpiry = block.expiry;
					if ( blockexpiry == 'infinity' ) {
						blockexpiry = lang.user.until_infinity;
						isBlocked = true;
					} else if ( blockexpiry ) {
						if ( Date.parse(blockexpiry) > Date.now() ) isBlocked = true;
						blockexpiry = (new Date(blockexpiry)).toLocaleString(lang.user.dateformat, timeoptions);
					}
					if ( isBlocked ) return '\n\n' + lang.user.blocked.replace( '%1$s', block.user ).replace( '%2$s', blockedtimestamp ).replace( '%3$s', blockexpiry ).replace( '%4$s', block.by ).replace( '%5$s', block.reason.noWikicode() );
					else return '';
				} ).join('');
				if ( username.includes( '/' ) ) {
					var rangeprefix = username;
					var range = parseInt(username.substr(-2, 2), 10);
					if ( range >= 24 ) rangeprefix = username.replace( /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.).+$/, '$1' );
					else if ( range >= 16 ) rangeprefix = username.replace( /^(\d{1,3}\.\d{1,3}\.).+$/, '$1' );
				}
				request( {
					uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=usercontribs&ucprop=' + ( username.includes( '/' ) ? '&ucuserprefix=' + encodeURIComponent( rangeprefix ) : '&ucuser=' + encodeURIComponent( username ) ),
					json: true
				}, function( ucerror, ucresponse, ucbody ) {
					if ( ucerror || !ucresponse || ucresponse.statusCode != 200 || !ucbody || ucbody.batchcomplete == undefined || !ucbody.query || !ucbody.query.usercontribs ) {
						if ( ucbody && ucbody.error && ucbody.error.code == 'baduser_ucuser' ) {
							msg.reactEmoji('error');
						}
						else {
							console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( ucerror ? ': ' + ucerror : ( ucbody ? ( ucbody.error ? ': ' + ucbody.error.info : '.' ) : '.' ) ) );
							msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Contributions/' + username.toTitle() + '>' ).then( message => message.reactEmoji('error') );
						}
					}
					else {
						var editcount = '\n' + lang.user.info.editcount + ' ' + ( username.includes( '/' ) && range != 24 && range != 16 ? '~' : '' ) + ucbody.query.usercontribs.length + ( ucbody.continue ? '+' : '' );
						msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Contributions/' + username.toTitle() + '>\n' + editcount + blocks );
					}
					
					if ( reaction ) reaction.removeEmoji();
				} );
			}
		} );
	} else {
		request( {
			uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ),
			json: true
		}, function( error, response, body ) {
			if ( error || !response || response.statusCode != 200 || !body || body.batchcomplete == undefined || !body.query || !body.query.users[0] ) {
				if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
					console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + namespace + username.toTitle() + linksuffix + '>' ).then( message => message.reactEmoji('error') );
				}
			}
			else {
				if ( body.query.users[0].missing == "" || body.query.users[0].invalid == "" ) {
					msg.reactEmoji('🤷');
				}
				else {
					username = body.query.users[0].name;
					var gender = '\n' + lang.user.info.gender + ' ';
					switch (body.query.users[0].gender) {
						case 'male':
							gender += lang.user.gender.male;
							break;
						case 'female':
							gender += lang.user.gender.female;
							break;
						default: 
							gender += lang.user.gender.unknown;
					}
					var registration = '\n' + lang.user.info.registration + ' ' + (new Date(body.query.users[0].registration)).toLocaleString(lang.user.dateformat, timeoptions);
					var editcount = '\n' + lang.user.info.editcount + ' ' + body.query.users[0].editcount;
					var groups = body.query.users[0].groups;
					var group = '\n' + lang.user.info.group + ' ';
					for ( var i = 0; i < lang.user.groups.length; i++ ) {
						if ( groups.includes( lang.user.groups[i][0] ) ) {
							var thisSite = allSites.find( site => site.wiki_domain == wiki + '.gamepedia.com' );
							if ( lang.user.groups[i][0] == 'hydra_staff' && thisSite && thisSite.wiki_managers.includes( username ) ) group += lang.user.manager;
							else group += lang.user.groups[i][1];
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
					var blocktext = '\n' + lang.user.blocked.replace( '%1$s', username ).replace( '%2$s', blockedtimestamp ).replace( '%3$s', blockexpiry ).replace( '%4$s', blockedby ).replace( '%5$s', blockreason.noWikicode() );
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + namespace + username.toTitle() + linksuffix + '>\n' + gender + registration + editcount + group + ( isBlocked ? '\n' + blocktext : '' ) );
				}
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

function cmd_diff(lang, msg, args, wiki) {
	if ( args[0] ) {
		var error = false;
		var title = '';
		var revision = 0;
		var diff = 0;
		var relative = 'prev';
		if ( /^\d+$/.test(args[0]) ) {
			revision = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					diff = args[1];
				}
				else if ( args[1] == 'prev' || args[1] == 'next' || args[1] == 'cur' ) {
					relative = args[1];
				}
				else error = true;
			}
		}
		else if ( args[0] == 'prev' || args[0] == 'next' || args[0] == 'cur' ) {
			relative = args[0];
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
		else if ( diff ) {
			var argids = [];
			if ( parseInt(revision, 10) > parseInt(diff, 10) ) argids = [revision, diff];
			else if ( parseInt(revision, 10) == parseInt(diff, 10) ) argids = [revision];
			else argids = [diff, revision];
			msg.reactEmoji('⏳').then( function( reaction ) {
				cmd_diffsend(lang, msg, argids, wiki, reaction);
			} );
		}
		else {
			msg.reactEmoji('⏳').then( function( reaction ) {
				request( {
					uri: 'https://' + wiki + '.gamepedia.com/api.php?action=compare&format=json&prop=ids' + ( title ? '&fromtitle=' + title : '&fromrev=' + revision ) + '&torelative=' + relative,
					json: true
				}, function( error, response, body ) {
					if ( error || !response || response.statusCode != 200 || !body || !body.compare ) {
						var noerror = false;
						if ( body && body.error ) {
							switch ( body.error.code ) {
								case 'nosuchrevid':
									noerror = true;
									break;
								case 'missingtitle':
									noerror = true;
									break;
								case 'invalidtitle':
									noerror = true;
									break;
								default:
									noerror = false;
							}
						}
						if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
							console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
							msg.reactEmoji('nowiki');
						}
						else if ( noerror ) {
							msg.reply( lang.diff.badrev );
						}
						else {
							console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
							msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + relative + ( title ? '' : '&oldid=' + revision ) + '>' ).then( message => message.reactEmoji('error') );
						}
						
						if ( reaction ) reaction.removeEmoji();
					}
					else {
						if ( body.compare.fromarchive != undefined || body.compare.toarchive != undefined ) {
							msg.reactEmoji('error');
							
							if ( reaction ) reaction.removeEmoji();
						} else {
							var argids = [];
							var ids = body.compare;
							if ( ids.fromrevid && !ids.torevid ) argids = [ids.fromrevid];
							else if ( !ids.fromrevid && ids.torevid ) argids = [ids.torevid];
							else if ( ids.fromrevid > ids.torevid ) argids = [ids.fromrevid, ids.torevid];
							else if ( ids.fromrevid == ids.torevid ) argids = [ids.fromrevid];
							else argids = [ids.torevid, ids.fromrevid];
							cmd_diffsend(lang, msg, argids, wiki, reaction);
						}
					}
				} );
			} );
		}
	}
	else msg.reactEmoji('error');
}

function cmd_diffsend(lang, msg, args, wiki, reaction) {
	request( {
		uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags&revids=' + args.join('|'),
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode != 200 || !body || body.batchcomplete == undefined || !body.query ) {
			if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
				console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
				msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' ).then( message => message.reactEmoji('error') );
			}
		}
		else {
			if ( body.query.badrevids ) msg.reply( lang.diff.badrev );
			else if ( body.query.pages && !body.query.pages['-1'] ) {
				var pages = Object.values(body.query.pages);
				if ( pages.length != 1 ) msg.channel.send( '<https://' + wiki + '.gamepedia.com/?diff=' + args[0] + ( args[1] ? '&oldid=' + args[1] : '' ) + '>' );
				else {
					var title = pages[0].title.toTitle();
					var revisions = [];
					if ( pages[0].revisions[1] ) revisions = [pages[0].revisions[1], pages[0].revisions[0]];
					else revisions = [pages[0].revisions[0]];
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = '\n' + lang.diff.info.editor + ' ' + ( revisions[0].userhidden != undefined ? lang.diff.hidden : revisions[0].user );
					var timestamp = '\n' + lang.diff.info.timestamp + ' ' + (new Date(revisions[0].timestamp)).toLocaleString(lang.user.dateformat, timeoptions);
					var size = '\n' + lang.diff.info.size.replace( '%s', revisions[0].size - ( revisions[1] ? revisions[1].size : 0 ) );
					var comment = '\n' + lang.diff.info.comment + ' ' + ( revisions[0].commenthidden != undefined ? lang.diff.hidden : ( revisions[0].comment ? revisions[0].comment.noWikicode() : lang.diff.nocomment ) );
					var tags = '\n' + lang.diff.info.tags + ' ' + ( revisions[0].tags.length ? body.query.tags.filter( tag => revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname ).join(', ').replace( /<[^>]+>(.+)<\/[^>]+>/g, '$1' ) : lang.diff.notags );
						
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/' + title + '?diff=' + diff + '&oldid=' + oldid + '>\n' + editor + timestamp + size + comment + tags );
				}
			}
			else msg.reactEmoji('error');
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

function cmd_random(lang, msg, wiki) {
	msg.reactEmoji('⏳').then( function( reaction ) {
		request( {
			uri: 'https://' + wiki + '.gamepedia.com/api.php?action=query&format=json&meta=siteinfo&siprop=general&prop=pageimages|extracts&exsentences=10&exintro=true&explaintext=true&generator=random&grnnamespace=0',
			json: true
		}, function( error, response, body ) {
			if ( error || !response || response.statusCode != 200 || !body || body.batchcomplete == undefined || !body.query || !body.query.pages ) {
				if ( response && response.request && response.request.uri && response.request.uri.href == 'https://www.gamepedia.com/' ) {
					console.log( '- Dieses Wiki existiert nicht! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- Fehler beim Erhalten der Suchergebnisse' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.channel.send( '<https://' + wiki + '.gamepedia.com/Special:Random>' ).then( message => message.reactEmoji('error') );
				}
			}
			else {
				querypage = Object.values(body.query.pages)[0];
				var pagelink = 'https://' + wiki + '.gamepedia.com/' + querypage.title.toTitle();
				var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title ).setURL( pagelink );
				if ( querypage.extract ) {
					var extract = querypage.extract;
					if ( extract.length > 2000 ) extract = extract.substr(0, 2000) + '\u2026';
					embed.setDescription( extract );
				}
				if ( querypage.pageimage ) {
					var pageimage = 'https://' + wiki + '.gamepedia.com/Special:FilePath/' + querypage.pageimage;
					if ( querypage.ns == 6 ) embed.setImage( pageimage );
					else embed.setThumbnail( pageimage );
				} else embed.setThumbnail( body.query.general.logo );
				msg.channel.send( '🎲 ' + pagelink, embed );
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	} );
}

function cmd_bug(lang, mclang, msg, args, title, cmd, querystring, fragment) {
	if ( args.length && /\d+$/.test(args[0]) && !args[1] ) {
		msg.reactEmoji('⏳').then( function( reaction ) {
			var project = '';
			if ( /^\d+$/.test(args[0]) ) project = 'MC-';
			request( {
				uri: 'https://bugs.mojang.com/rest/api/2/issue/' + project + args[0] + '?fields=summary,fixVersions,resolution,status',
				json: true
			}, function( error, response, body ) {
				if ( error || !response || response.statusCode != 200 || !body || body['status-code'] == 404 || body.errorMessages || body.errors ) {
					if ( body.errorMessages || body.errors ) {
						if ( body.errorMessages ) {
							if ( body.errorMessages.includes( 'Issue Does Not Exist' ) ) {
								msg.reactEmoji('❓');
							}
							else if ( body.errorMessages.includes( 'You do not have the permission to see the specified issue.' ) ) {
								msg.channel.send( mclang.bug.private + '\nhttps://bugs.mojang.com/browse/' + project + args[0] );
							}
							else {
								console.log( '- Fehler beim Erhalten der Zusammenfassung' + ( error ? ': ' + error : ( body ? ( body.errorMessages ? ': ' + body.errorMessages.join(' - ') : '.' ) : '.' ) ) );
								msg.reactEmoji('error');
							}
						}
						else msg.reactEmoji('error');
					}
					else {
						console.log( '- Fehler beim Erhalten der Zusammenfassung' + ( error ? ': ' + error : ( body ? ': ' + body.message : '.' ) ) );
						if ( body && body['status-code'] == 404 ) msg.reactEmoji('error');
						else msg.channel.send( 'https://bugs.mojang.com/browse/' + project + args[0] ).then( message => message.reactEmoji('error') );
					}
				}
				else {
					if ( !body.fields ) {
						msg.reactEmoji('error');
					}
					else {
						var status = '**' + ( body.fields.resolution ? body.fields.resolution.name : body.fields.status.name ) + ':** ';
						var fixed = ( body.fields.fixVersions.length ? mclang.bug.fixed + ' ' + body.fields.fixVersions.map( v => v.name ).join(', ') : '' );
						msg.channel.send( status + body.fields.summary + '\n<https://bugs.mojang.com/browse/' + body.key + '>\n' + fixed );
					}
				}
				
				if ( reaction ) reaction.removeEmoji();
			} );
		} );
	}
	else {
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd, querystring, fragment);
	}
}

function cmd_befehl(lang, mclang, msg, befehl, args, title, cmd, querystring, fragment) {
	var aliasCmd = ( ( befehl in mclang.cmd.aliase ) ? mclang.cmd.aliase[befehl] : befehl ).toLowerCase();
	
	if ( aliasCmd in mclang.cmd.list ) {
		var regex = new RegExp('/' + aliasCmd, 'g');
		var cmdSyntax = mclang.cmd.list[aliasCmd].join( '\n' ).replace( regex, '/' + befehl );
		msg.channel.send( '```md\n' + cmdSyntax + '```<https://' + mclang.link + '.gamepedia.com/' + mclang.cmd.page + aliasCmd + '>', {split:{maxLength:2000,prepend:'```md\n',append:'```'}} );
	}
	else {
		msg.reactEmoji('❓');
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd, querystring, fragment);
	}
}

function cmd_befehl2(lang, mclang, msg, args, title, cmd, querystring, fragment) {
	if ( args.length ) {
		if ( args[0].startsWith('/') ) cmd_befehl(lang, mclang, msg, args[0].substr(1), args.slice(1), title, cmd);
		else cmd_befehl(lang, mclang, msg, args[0], args.slice(1), title, cmd);
	}
	else {
		msg.notminecraft = true;
		cmd_link(lang, msg, title, mclang.link, cmd, querystring, fragment);
	}
}

function cmd_multiline(lang, msg, args, line) {
	if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) {
		if ( msg.isAdmin() ) msg.reactEmoji('error');
		else msg.reactEmoji('❌');
	}
}

function cmd_voice(lang, msg, args, line) {
	if ( msg.isAdmin() && !args.length ) msg.reply( lang.voice.text + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`' );
	else cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
}

function cmd_get(lang, msg, args, line) {
	var id = args.join().replace( /^\\?<(?:@!?|#)(\d+)>$/, '$1' );
	if ( /^\d+$/.test(id) ) {
		if ( client.guilds.has(id) ) {
			var guild = client.guilds.get(id);
			var permissions = ( guild.me.permissions.has(defaultPermissions) ? '*none*' : '`' + guild.me.permissions.missing(defaultPermissions).join('`, `') + '`' );
			var guildsettings = ( guild.id in settings ? '```json\n' + JSON.stringify( settings[guild.id], null, '\t' ) + '\n```' : '*default*' );
			msg.channel.send( 'Guild: ' + guild.name + ' `' + guild.id + '`\nOwner: ' + guild.owner.user.tag + ' `' + guild.ownerID + '` ' + guild.owner.toString() + '\nMissing permissions: ' + permissions + '\nSettings: ' + guildsettings, {split:true} );
		} else if ( client.guilds.some( guild => guild.members.has(id) ) ) {
			var text = '';
			client.guilds.filter( guild => guild.members.has(id) ).forEach( function(guild) {
				var member = guild.members.get(id);
				if ( !text ) text = 'User: ' + member.user.tag + ' `' + member.id + '` ' + member.toString() + '\nGuilds:';
				text += '\n' + guild.name + ' `' + guild.id + '`' + ( member.permissions.has('MANAGE_GUILD') ? '\*' : '' );
			} );
			msg.channel.send( text, {split:true} );
		} else if ( client.guilds.some( guild => guild.channels.filter( chat => chat.type == 'text' ).has(id) ) ) {
			var channel = client.guilds.find( guild => guild.channels.filter( chat => chat.type == 'text' ).has(id) ).channels.get(id);
			var permissions = ( channel.memberPermissions(channel.guild.me).has(defaultPermissions) ? '*none*' : '`' + channel.memberPermissions(channel.guild.me).missing(defaultPermissions).join('`, `') + '`' );
			var wiki = ( channel.guild.id in settings ? ( settings[channel.guild.id].channels && channel.id in settings[channel.guild.id].channels ? settings[channel.guild.id].channels[channel.id] : settings[channel.guild.id].wiki ) : settings['default'].wiki );
			msg.channel.send( 'Guild: ' + channel.guild.name + ' `' + channel.guild.id + '`\nChannel: #' + channel.name + ' `' + channel.id + '` ' + channel.toString() + '\nMissing permissions: ' + permissions + '\nDefault Wiki: `' + wiki + '`', {split:true} );
		} else msg.reply( 'I couldn\'t find a result for `' + id + '`' );
	} else if ( msg.channel.type != 'text' || !pause[msg.guild.id] ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
}

String.prototype.isMention = function(guild) {
	var text = this.trim();
	if ( text == '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) == client.user.id || ( guild && text == '@' + guild.me.displayName ) ) return true;
	else return false;
}

Discord.Message.prototype.isAdmin = function() {
	if ( this.channel.type == 'text' && this.member && this.member.permissions.has('MANAGE_GUILD') ) return true;
	else return false;
}

Discord.Message.prototype.isOwner = function() {
	if ( this.author.id == process.env.owner ) return true;
	else return false;
}

Array.prototype.toEmojis = function() {
	var text = this.join(' ');
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
		return text.split(' ');
	}
	else return this;
}

String.prototype.toTitle = function() {
	return this.replace( / /g, '_' ).replace( /\%/g, '%25' ).replace( /\?/g, '%3F' );
};

String.prototype.toSection = function() {
	return encodeURIComponent( this.replace( / /g, '_' ) ).replace( /\'/g, '%27' ).replace( /\(/g, '%28' ).replace( /\)/g, '%29' ).replace( /\%/g, '.' );
};

String.prototype.noWikicode = function() {
	return this.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' );
};

Discord.Message.prototype.reactEmoji = function(name) {
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
	return this.react(emoji).catch( error => console.log( '- ' + error ) );
};

Discord.MessageReaction.prototype.removeEmoji = function() {
	return this.remove().catch( error => console.log( '- ' + error ) );
};

String.prototype.hasPrefix = function(flags = '') {
	if ( RegExp( '^' + process.env.prefix + '(?: |$)', flags).test(this.toLowerCase()) ) return true;
	else return false;
}

client.on('message', msg => {
	var cont = msg.content;
	var author = msg.author;
	var channel = msg.channel;
	if ( channel.type == 'text' ) var permissions = channel.permissionsFor(client.user);
	
	if ( cont.hasPrefix('m') && !msg.webhookID && author.id != client.user.id ) {
		if ( !ready.settings && settings == defaultSettings ) getSettings(setStatus);
		if ( !ready.allSites && allSites == defaultSites ) getAllSites();
		var setting = Object.assign({}, settings['default']);
		if ( settings == defaultSettings ) {
			msg.channel.send( '⚠ **Limited Functionality** ⚠\nNo settings found, please contact the bot owner!\n' + process.env.invite );
		} else if ( channel.type == 'text' && msg.guild.id in settings ) setting = Object.assign({}, settings[msg.guild.id]);
		var lang = i18n[setting.lang];
		lang.link = setting.wiki;
		if ( setting.channels && channel.id in setting.channels ) lang.link = setting.channels[channel.id];
		if ( channel.type != 'text' || permissions.has(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS']) ) {
			var invoke = cont.split(' ')[1] ? cont.split(' ')[1].split('\n')[0].toLowerCase() : '';
			var aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
			var ownercmd = msg.isOwner() && aliasInvoke in ownercmdmap;
			if ( cont.hasPrefix() && ( ( msg.isAdmin() && aliasInvoke in multilinecmdmap ) || ownercmd ) ) {
				if ( ownercmd || permissions.has('MANAGE_MESSAGES') ) {
					var args = cont.split(' ').slice(2);
					if ( cont.split(' ')[1].split('\n')[1] ) args.unshift( '', cont.split(' ')[1].split('\n')[1] );
					if ( !( ownercmd || aliasInvoke in pausecmdmap ) && pause[msg.guild.id] ) console.log( msg.guild.name + ': Pausiert' );
					else console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + cont );
					if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, cont);
					else if ( !pause[msg.guild.id] || aliasInvoke in pausecmdmap ) multilinecmdmap[aliasInvoke](lang, msg, args, cont);
				} else {
					console.log( msg.guild.name + ': Fehlende Berechtigungen - MANAGE_MESSAGES' );
					msg.reply( lang.missingperm + ' `MANAGE_MESSAGES`' );
				}
			} else {
				var count = 0;
				msg.cleanContent.replace(/\u200b/g, '').split('\n').forEach( function(line) {
					if ( line.hasPrefix() && count < 10 ) {
						count++;
						invoke = line.split(' ')[1] ? line.split(' ')[1].toLowerCase() : '';
						var args = line.split(' ').slice(2);
						aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
						ownercmd = msg.isOwner() && aliasInvoke in ownercmdmap;
						if ( channel.type == 'text' && pause[msg.guild.id] && !( ( msg.isAdmin() && aliasInvoke in pausecmdmap ) || ownercmd ) ) console.log( msg.guild.name + ': Pausiert' );
						else console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + line );
						if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, line);
						else if ( channel.type != 'text' || !pause[msg.guild.id] || ( msg.isAdmin() && aliasInvoke in pausecmdmap ) ) {
							if ( aliasInvoke in cmdmap ) cmdmap[aliasInvoke](lang, msg, args, line);
							else if ( /^![a-z\d-]{1,30}$/.test(invoke) ) cmd_link(lang, msg, args.join(' '), invoke.substr(1), ' ' + invoke + ' ');
							else cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
						}
					} else if ( line.hasPrefix() && count == 10 ) {
						count++;
						console.log( '- Nachricht enthält zu viele Befehle!' );
						msg.reactEmoji('⚠');
						channel.send( lang.limit.replace( '%s', author.toString() ) ).then( message => message.reactEmoji('⚠') );
					}
				} );
			}
		} else if ( msg.isAdmin() ) {
			console.log( msg.guild.name + ': Fehlende Berechtigungen - ' + permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS']) );
			if ( permissions.has(['SEND_MESSAGES']) ) msg.reply( lang.missingperm + ' `' + permissions.missing(['ADD_REACTIONS','USE_EXTERNAL_EMOJIS']).join('`, `') + '`' );
		}
	}
});


client.on('voiceStateUpdate', (oldm, newm) => {
	if ( !ready.settings && settings == defaultSettings ) getSettings(setStatus);
	if ( !ready.allSites && allSites == defaultSites ) getAllSites();
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
			uri: process.env.save,
			headers: access,
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
				console.log( '- Fehler beim Bearbeiten' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
			}
			else {
				settings = Object.assign({}, temp_settings);
				console.log( '- Einstellungen erfolgreich aktualisiert.' );
			}
		} );
	}
});


client.login(process.env.token).catch( error => console.log( '--- LOGIN-ERROR: ' + new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' }) + ' ---\n- ' + error.name + ': ' + error.message ) );


client.on('error', error => {
	console.log( '--- ERROR: ' + new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' }) + ' ---\n- ' + error.name + ': ' + error.message );
});

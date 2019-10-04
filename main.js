require('dotenv').config();
const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

const Discord = require('discord.js');
const DBL = require('dblapi.js');
var request = require('request');
var htmlparser = require('htmlparser2');

var client = new Discord.Client( {
	messageCacheLifetime: 600,
	messageSweepInterval: 6000,
	disableEveryone: true,
	disabledEvents: ["TYPING_START"]
} );
const dbl = new DBL(process.env.dbltoken);

var i18n = require('./i18n/allLangs.json');
Object.keys(i18n.allLangs[1]).forEach( lang => i18n[lang] = require('./i18n/' + lang + '.json') );
var minecraft = require('./minecraft.json');
var multiManager = require('./wiki_manager.json');

var pause = {};
var stop = false;
var isDebug = ( process.argv[2] === 'debug' );
const access = {'PRIVATE-TOKEN': process.env.access};
const defaultPermissions = new Discord.Permissions(268954688).toArray();
const timeoptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'UTC',
	timeZoneName: 'short'
}


var ready = {
	settings: true,
	allSites: true
}

const defaultSettings = {
	"default": {
		"lang": "en",
		"wiki": "https://help.gamepedia.com/"
	}
}
var settings = defaultSettings;

function getSettings() {
	ready.settings = true;
	request( {
		uri: process.env.read + process.env.file + process.env.raw,
		headers: access,
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode !== 200 || !body || body.message || body.error ) {
			console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the settings: ' + ( error || body && ( body.message || body.error ) ) );
			ready.settings = false;
		}
		else {
			console.log( '- Settings successfully loaded.' );
			if ( body.default ) settings = JSON.parse(JSON.stringify(body));
			else if ( settings === defaultSettings ) settings = JSON.parse(JSON.stringify(defaultSettings));
		}
		setStatus();
	} );
}

function setStatus(hardreset) {
	if ( settings === defaultSettings ) client.user.setStatus('invisible').catch(log_error);
	else if ( hardreset === true ) client.user.setStatus('invisible').then(setStatus, log_error);
	else {
		client.user.setStatus('online').catch(log_error);
		client.user.setActivity( process.env.prefix + ' help' ).catch(log_error);
	}
}

var allSites = [];

function getAllSites(callback, ...args) {
	ready.allSites = true;
	request( {
		uri: 'https://help.gamepedia.com/api.php?action=allsites&formatversion=2&do=getSiteStats&filter=wikis|wiki_domain,wiki_display_name,wiki_image,wiki_description,wiki_managers,official_wiki,created&format=json',
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode !== 200 || !body || body.status !== 'okay' || !body.data || !body.data.wikis ) {
			console.log( '- ' + ( response && response.statusCode ) + ': Error while gettings all sites: ' + ( error || body && body.error && body.error.info ) );
			ready.allSites = false;
		}
		else {
			console.log( '- Sites successfully loaded.' );
			allSites = JSON.parse(JSON.stringify(body.data.wikis.filter( site => /^[a-z\d-]{1,50}\.gamepedia\.com$/.test(site.wiki_domain) )));
			allSites.filter( site => site.wiki_domain in multiManager ).forEach( function(site) {
				site.wiki_managers = multiManager[site.wiki_domain].concat(site.wiki_managers).filter( (value, index, self) => self.indexOf(value) === index );
			} );
		}
		if ( callback ) callback(...args);
	} );
}

client.on( 'ready', () => {
	console.log( '\n- Successfully logged in as ' + client.user.username + '!' );
	getSettings();
	getAllSites();
	
	if ( !isDebug ) client.setInterval( () => {
		console.log( '- Current server count: ' + client.guilds.size );
		dbl.postStats(client.guilds.size).catch( () => {} );
		request.post( {
			uri: 'https://discord.bots.gg/api/v1/bots/' + client.user.id + '/stats',
			headers: {Authorization: process.env.dbggtoken},
			body: {guildCount: client.guilds.size},
			json: true
		}, () => {} );
	}, 10800000 ).unref();
} );
	
	
var cmdmap = {
	help: cmd_help,
	test: cmd_test,
	pause: cmd_pause,
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
	help: cmd_help,
	test: cmd_test,
	pause: cmd_pause,
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
			var text = lang.settings.current.replaceSave( '%1$s', '- `' + process.env.prefix + ' settings lang`' ).replaceSave( '%2$s', settings[msg.guild.id].wiki + ' - `' + process.env.prefix + ' settings wiki`' ) + ' - `' + process.env.prefix + ' settings channel`\n';
			if ( settings[msg.guild.id].channels ) {
				Object.keys(settings[msg.guild.id].channels).forEach( function(channel) {
					text += '<#' + channel + '>: <' + settings[msg.guild.id].channels[channel] + '>\n';
				} );
			} else text += lang.settings.nochannels;
		} else {
			var text = lang.settings.missing.replaceSave( '%1$s', '`' + process.env.prefix + ' settings lang`' ).replaceSave( '%2$s', '`' + process.env.prefix + ' settings wiki`' );
		}
		if ( args.length ) {
			if ( args[0] ) args[0] = args[0].toLowerCase();
			args[1] = args.slice(1).join(' ').toLowerCase().trim().replace( /^<(.*)>$/, '$1' );
			if ( args[1] && ( args[0] === 'wiki' || args[0] === 'channel' ) ) {
				var regex = args[1].match( /^(?:(?:https?:)?\/\/)?([a-z\d-]{1,50})\.gamepedia\.com(?:\/|$)/ );
			}
			var langs = '\n' + lang.settings.langhelp.replaceSave( '%s', process.env.prefix + ' settings lang' ) + ' `' + Object.values(i18n.allLangs[1]).join(', ') + '`';
			var wikis = '\n' + lang.settings.wikihelp.replaceSave( '%s', process.env.prefix + ' settings wiki' );
			var channels = '\n' + lang.settings.wikihelp.replaceSave( '%s', process.env.prefix + ' settings channel' );
			var nolangs = lang.settings.langinvalid + langs;
			var nowikis = lang.settings.wikiinvalid + wikis;
			var nochannels = lang.settings.wikiinvalid + channels;
			if ( msg.guild.id in settings ) {
				var current	= args[0] + ( line === 'changed' ? line : '' );
				if ( args[0] === 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n.allLangs[0] ) edit_settings(lang, msg, 'lang', i18n.allLangs[0][args[1]]);
						else msg.replyMsg( nolangs, {}, true );
					} else msg.replyMsg( lang.settings[current] + langs, {}, true );
				} else if ( args[0] === 'wiki' ) {
					if ( args[1] ) {
						if ( regex !== null ) edit_settings(lang, msg, 'wiki', 'https://' + regex[1] + '.gamepedia.com/');
						else find_wikis(lang, msg, 'wiki', args[1].split(' '), nowikis);
					} else msg.replyMsg( lang.settings[current] + ' ' + settings[msg.guild.id].wiki + wikis, {}, true );
				} else if ( args[0] === 'channel' ) {
					if ( args[1] ) {
						if ( regex !== null ) edit_settings(lang, msg, 'channel', 'https://' + regex[1] + '.gamepedia.com/');
						else find_wikis(lang, msg, 'channel', args[1].split(' '), nochannels);
					} else if ( settings[msg.guild.id].channels && msg.channel.id in settings[msg.guild.id].channels ) {
						msg.replyMsg( lang.settings[current] + ' ' + settings[msg.guild.id].channels[msg.channel.id] + channels, {}, true );
					} else msg.replyMsg( lang.settings[current] + ' ' + settings[msg.guild.id].wiki + channels, {}, true );
				} else msg.replyMsg( text, {}, true );
			} else {
				if ( args[0] === 'lang' ) {
					if ( args[1] ) {
						if ( args[1] in i18n.allLangs[0] ) edit_settings(lang, msg, 'lang', i18n.allLangs[0][args[1]]);
						else msg.replyMsg( nolangs, {}, true );
					} else msg.replyMsg( lang.settings.lang + langs, {}, true );
				} else if ( args[0] === 'wiki' || args[0] === 'channel' ) {
					if ( args[1] ) {
						if ( regex !== null ) edit_settings(lang, msg, 'wiki', 'https://' + regex[1] + '.gamepedia.com/');
						else find_wikis(lang, msg, 'wiki', args[1].split(' '), nowikis);
					} else msg.replyMsg( lang.settings.wikimissing + wikis, {}, true );
				} else msg.replyMsg( text, {split:true}, true );
			}
		} else msg.replyMsg( text, {split:true}, true );
	} else {
		msg.reactEmoji('❌');
	}
}

function find_wikis(lang, msg, key, value, text) {
	if ( value.length === 2 && value[1] === '--force' ) {
		msg.reactEmoji('⏳', true).then( function( reaction ) {
			request( {
				uri: value[0] + 'api.php?action=query&format=json',
				json: true
			}, function( error, response, body ) {
				if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !( body instanceof Object ) ) {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while reaching the wiki: ' + ( error || body && body.error && body.error.info ) );
					msg.reactEmoji('nowiki', true);
					if ( reaction ) reaction.removeEmoji();
				}
				else edit_settings(lang, msg, key, value[0]);
			} );
		} );
	} else if ( allSites.some( site => site.wiki_domain === value.join('') + '.gamepedia.com' ) ) {
		edit_settings(lang, msg, key, 'https://' + value.join('') + '.gamepedia.com/');
	} else {
		var sites = allSites.filter( site => site.wiki_display_name.toLowerCase().includes( value.join(' ') ) );
		if ( 0 < sites.length && sites.length < 21 ) {
			text += '\n\n' + lang.settings.foundwikis + '\n' + sites.map( site => site.wiki_display_name + ': `' + site.wiki_domain + '`' ).join('\n');
		}
		msg.replyMsg( text, {split:true}, true );
	}
}

function edit_settings(lang, msg, key, value) {
	msg.reactEmoji('⏳', true).then( function( reaction ) {
		if ( settings === defaultSettings ) {
			console.log( '- Error while getting current settings.' );
			msg.replyMsg( lang.settings.save_failed, {}, true );
			if ( reaction ) reaction.removeEmoji();
		}
		else {
			var temp_settings = JSON.parse(JSON.stringify(settings));
			var save = false;
			if ( !( msg.guild.id in temp_settings ) ) {
				temp_settings[msg.guild.id] = Object.assign({}, settings.default);
				save = true;
			}
			if ( key === 'channel' ) {
				if ( !temp_settings[msg.guild.id].channels ) temp_settings[msg.guild.id].channels = {};
				if ( temp_settings[msg.guild.id].channels[msg.channel.id] !== value ) {
					temp_settings[msg.guild.id].channels[msg.channel.id] = value;
					save = true;
				}
			} else if ( temp_settings[msg.guild.id][key] !== value ) {
				temp_settings[msg.guild.id][key] = value;
				save = true;
			}
			Object.keys(temp_settings).forEach( function(guild) {
				if ( !client.guilds.has(guild) && guild !== 'default' ) {
					delete temp_settings[guild];
					save = true;
				} else {
					var channels = temp_settings[guild].channels;
					if ( channels ) {
						Object.keys(channels).forEach( function(channel) {
							if ( channels[channel] === temp_settings[guild].wiki || !client.guilds.get(guild).channels.has(channel) ) {
								delete channels[channel];
								save = true;
							}
						} );
						if ( !Object.keys(channels).length ) {
							delete temp_settings[guild].channels;
							save = true;
						}
					}
				}
			} );
			if ( save ) request.post( {
				uri: process.env.save,
				headers: access,
				body: {
					branch: 'master',
					commit_message: client.user.username + ': Settings updated.',
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
				if ( error || !response || response.statusCode !== 201 || !body || body.error ) {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while editing the settings: ' + ( error || body && ( body.message || body.error ) ) );
					msg.replyMsg( lang.settings.save_failed, {}, true );
				}
				else {
					settings = JSON.parse(JSON.stringify(temp_settings));
					if ( key === 'lang' ) lang = i18n[value];
					cmd_settings(lang, msg, [key], 'changed');
					console.log( '- Settings successfully updated.' );
				}
				
				if ( reaction ) reaction.removeEmoji();
			} );
			else {
				cmd_settings(lang, msg, [key], 'changed');
				
				if ( reaction ) reaction.removeEmoji();
			}
		}
	} );
}

function cmd_info(lang, msg, args, line) {
	if ( args.join('') ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	else {
		msg.sendChannel( lang.disclaimer.replaceSave( '%s', ( msg.channel.type === 'text' && msg.guild.members.get(process.env.owner) || '*MarkusRost*' ) ) + '\n<https://www.patreon.com/WikiBot>' );
		cmd_helpserver(lang, msg);
		cmd_invite(lang, msg, args, line);
	}
}

function cmd_helpserver(lang, msg) {
	msg.sendChannel( lang.helpserver + '\n' + process.env.invite );
}

function cmd_invite(lang, msg, args, line) {
	if ( args.join('') ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	} else {
		client.generateInvite(defaultPermissions).then( invite => msg.sendChannel( lang.invite.bot + '\n<' + invite + '>' ), log_error );
	}
}

function cmd_help(lang, msg, args, line) {
	if ( msg.channel.type === 'text' && pause[msg.guild.id] && ( args.join('') || !msg.isAdmin() ) ) return;
	if ( msg.isAdmin() && !( msg.guild.id in settings ) && settings !== defaultSettings ) {
		cmd_settings(lang, msg, [], line);
		cmd_helpserver(lang, msg);
	}
	var cmds = lang.help.list;
	var isMinecraft = ( msg.channel.getWiki() === minecraft[lang.lang].link );
	var cmdintro = '🔹 `' + process.env.prefix + ' ';
	if ( args.join('') ) {
		if ( args.join(' ').isMention(msg.guild) ) cmd_helpserver(lang, msg);
		else if ( args[0].toLowerCase() === 'admin' ) {
			if ( msg.channel.type !== 'text' || msg.isAdmin() ) {
				var cmdlist = lang.help.admin + '\n' + cmds.filter( cmd => cmd.admin && !cmd.hide ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
				cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : client.user.username ) );
				msg.sendChannel( cmdlist, {split:true} );
			}
			else {
				msg.replyMsg( lang.help.noadmin );
			}
		}
		else if ( args[0].toLowerCase() === 'minecraft' ) {
			var cmdlist = '<' + minecraft[lang.lang].link + '>\n' + cmds.filter( cmd => cmd.minecraft && !cmd.hide ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
			cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : client.user.username ) );
			msg.sendChannel( cmdlist, {split:true} );
		}
		else {
			var cmdlist = cmds.filter( cmd => cmd.cmd.split(' ')[0] === args[0].toLowerCase() && !cmd.unsearchable && ( msg.channel.type !== 'text' || !cmd.admin || msg.isAdmin() ) && ( !cmd.minecraft || isMinecraft ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
			cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : client.user.username ) );
			if ( cmdlist === '' ) msg.reactEmoji('❓');
			else msg.sendChannel( cmdlist, {split:true} );
		}
	}
	else if ( msg.isAdmin() && pause[msg.guild.id] ) {
		var cmdlist = lang.help.pause + '\n' + cmds.filter( cmd => cmd.pause ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
		cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : client.user.username ) );
		msg.sendChannel( cmdlist, {split:true}, true );
	}
	else {
		var cmdlist = lang.help.all + '\n' + cmds.filter( cmd => !cmd.hide && !cmd.admin && ( !cmd.minecraft || isMinecraft ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n') + '\n\n🔸 ' + lang.help.footer;
		cmdlist = cmdlist.replaceSave( /@mention/g, '@' + ( msg.channel.type === 'text' ? msg.guild.me.displayName : client.user.username ) );
		msg.sendChannel( cmdlist, {split:true} );
	}
}

function cmd_say(lang, msg, args, line) {
	args = args.toEmojis();
	var text = args.join(' ');
	if ( args[0] === 'alarm' ) text = '🚨 **' + args.slice(1).join(' ') + '** 🚨';
	var imgs = [];
	if ( msg.uploadFiles() ) imgs = msg.attachments.map( function(img) {
		return {attachment:img.url,name:img.filename};
	} );
	if ( msg.isOwner() ) {
		try {
			text = eval( '`' + text + '`' );
		} catch ( error ) {
			log_error(error);
		}
	}
	if ( text || imgs.length ) {
		msg.channel.send( text, {disableEveryone:!msg.member.hasPermission(['MENTION_EVERYONE']),files:imgs} ).then( () => msg.deleteMsg(), error => {
			log_error(error);
			msg.reactEmoji('error', true);
		} );
	} else {
		args[0] = line.split(' ')[1];
		cmd_help(lang, msg, args, line);
	}
}

function cmd_umfrage(lang, msg, args, line) {
	var imgs = [];
	if ( msg.uploadFiles() ) imgs = msg.attachments.map( function(img) {
		return {attachment:img.url,name:img.filename};
	} );
	if ( args.length || imgs.length ) {
		var text = args.join(' ').split('\n');
		args = text.shift().split(' ');
		if ( text.length ) args.push('\n' + text.join('\n'));
		var reactions = [];
		args = args.toEmojis();
		for ( var i = 0; ( i < args.length || imgs.length ); i++ ) {
			var reaction = args[i];
			var custom = /^<a?:/;
			var pattern = /^[\u0000-\u1FFF]{1,4}$/;
			if ( !custom.test(reaction) && ( reaction.length > 4 || pattern.test(reaction) ) ) {
				cmd_sendumfrage(lang, msg, args.slice(i).join(' ').replace( /^\n| (\n)/, '$1' ), reactions, imgs);
				break;
			} else if ( reaction !== '' ) {
				if ( custom.test(reaction) ) {
					reaction = reaction.substring(reaction.lastIndexOf(':') + 1, reaction.length - 1);
				}
				reactions[i] = reaction;
				if ( i === args.length - 1 ) {
					cmd_sendumfrage(lang, msg, args.slice(i + 1).join(' ').replace( /^\n| (\n)/, '$1' ), reactions, imgs);
					break;
				}
			}
		}
	} else {
		args[0] = line.split(' ')[1];
		cmd_help(lang, msg, args, line);
	}
}

function cmd_sendumfrage(lang, msg, text, reactions, imgs) {
	msg.channel.send( lang.poll.title + text, {disableEveryone:!msg.member.hasPermission(['MENTION_EVERYONE']),files:imgs} ).then( poll => {
		msg.deleteMsg();
		if ( reactions.length ) {
			reactions.forEach( function(entry) {
				poll.react(entry).catch( error => {
					log_error(error);
					poll.reactEmoji('error');
				} );
			} );
		} else {
			poll.reactEmoji('support');
			poll.reactEmoji('oppose');
		}
	}, error => {
		log_error(error);
		msg.reactEmoji('error');
	} );
}

function cmd_test(lang, msg, args, line) {
	if ( args.join('') ) {
		if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		var text = lang.test.text[Math.floor(Math.random() * lang.test.random)] || lang.test.default;
		console.log( '- Test: Fully functioning!' );
		var now = Date.now();
		msg.replyMsg( text ).then( edit => {
			var then = Date.now();
			var embed = new Discord.RichEmbed().setTitle( lang.test.time ).addField( 'Discord', ( then - now ) + 'ms' );
			now = Date.now();
			request( {
				uri: msg.channel.getWiki() + 'api.php?action=query&format=json',
				json: true
			}, function( error, response, body ) {
				then = Date.now();
				if ( body && body.warnings ) log_warn(body.warnings);
				var ping = ( then - now ) + 'ms';
				if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !( body instanceof Object ) ) {
					if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
						console.log( '- This wiki doesn\'t exist!' );
						ping += ' <:unknown_wiki:505887262077353984>';
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while reaching the wiki: ' + ( error || body && body.error && body.error.info ) );
						ping += ' <:error:505887261200613376>';
					}
				}
				embed.addField( msg.channel.getWiki(), ping );
				if ( edit ) edit.edit( edit.content, embed ).catch(log_error);
			} );
		} );
	} else {
		console.log( '- Test: Paused!' );
		msg.replyMsg( lang.test.pause, {}, true );
	}
}

async function cmd_eval(lang, msg, args, line) {
	try {
		var text = util.inspect( await eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.toString();
	}
	if ( isDebug ) console.log( '--- EVAL START ---\n' + text + '\n--- EVAL END ---' );
	if ( text.length > 2000 ) msg.reactEmoji('✅', true);
	else msg.sendChannel( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'}}, true );
}

async function cmd_stop(lang, msg, args, line) {
	if ( args.join(' ').split('\n')[0].isMention(msg.guild) ) {
		await msg.replyMsg( 'I\'ll destroy myself now!', {}, true );
		await client.destroy();
		console.log( '- I\'m now shutting down!' );
		setTimeout( async () => {
			console.log( '- I need to long to close, terminating!' );
			process.exit(1);
		}, 1000 ).unref();
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	}
}

function cmd_pause(lang, msg, args, line) {
	if ( msg.channel.type === 'text' && args.join(' ').split('\n')[0].isMention(msg.guild) && ( msg.isAdmin() || msg.isOwner() ) ) {
		if ( pause[msg.guild.id] ) {
			delete pause[msg.guild.id];
			console.log( '- Pause ended.' );
			msg.replyMsg( lang.pause.off, {}, true );
		} else {
			msg.replyMsg( lang.pause.on, {}, true );
			console.log( '- Pause started.' );
			pause[msg.guild.id] = true;
		}
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	}
}

function cmd_delete(lang, msg, args, line) {
	if ( msg.channel.memberPermissions(msg.member).has('MANAGE_MESSAGES') ) {
		if ( /^\d+$/.test(args[0]) && parseInt(args[0], 10) + 1 > 0 ) {
			if ( parseInt(args[0], 10) > 99 ) {
				msg.replyMsg( lang.delete.big.replace( '%s', '`99`' ), {}, true );
			}
			else {
				msg.channel.bulkDelete(parseInt(args[0], 10) + 1, true).then( messages => {
					msg.reply( lang.delete.success.replace( '%s', messages.size - 1 ) ).then( antwort => antwort.deleteMsg(5000), log_error );
					console.log( '- The last ' + ( messages.size - 1 ) + ' messages in #' + msg.channel.name + ' were deleted by @' + msg.member.displayName + '!' );
				}, log_error );
			}
		}
		else {
			msg.replyMsg( lang.delete.invalid, {}, true );
		}
	}
	else {
		msg.reactEmoji('❌');
	}
}

function cmd_link(lang, msg, title, wiki = msg.channel.getWiki(), cmd = ' ') {
	if ( cmd === ' ' && msg.isAdmin() && !( msg.guild.id in settings ) && settings !== defaultSettings ) {
		cmd_settings(lang, msg, [], '');
	}
	if ( /^\|\|(?:(?!\|\|).)+\|\|$/.test(title) ) {
		title = title.substring( 2, title.length - 2);
		var spoiler = '||';
	}
	msg.reactEmoji('⏳').then( reaction => check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler) );
}

function check_wiki(lang, msg, title, wiki, cmd, reaction, spoiler = '', querystring = '', fragment = '', selfcall = 0) {
	if ( title.includes( '#' ) ) {
		fragment = title.split('#').slice(1).join('#');
		title = title.split('#')[0];
	}
	if ( /\?\w+=/.test(title) ) {
		var querystart = title.search(/\?\w+=/);
		querystring = title.substring(querystart + 1) + ( querystring ? '&' + querystring : '' );
		title = title.substring(0, querystart);
	}
	var linksuffix = ( querystring ? '?' + querystring.toTitle() : '' ) + ( fragment ? '#' + fragment.toSection() : '' );
	if ( title.length > 300 ) {
		title = title.substring(0, 300);
		msg.reactEmoji('⚠');
	}
	var invoke = title.split(' ')[0].toLowerCase();
	var aliasInvoke = ( lang.aliase[invoke] || invoke );
	var args = title.split(' ').slice(1);
	
	var mclang = minecraft[lang.lang];
	var mcaliasInvoke = ( mclang.aliase[invoke] || invoke );
	if ( !msg.notminecraft && wiki === mclang.link && ( mcaliasInvoke in minecraftcmdmap || invoke.startsWith( '/' ) ) ) {
		if ( mcaliasInvoke in minecraftcmdmap ) minecraftcmdmap[mcaliasInvoke](lang, mclang, msg, args, title, cmd, querystring, fragment, reaction, spoiler);
		else cmd_befehl(lang, mclang, msg, invoke.substring(1), args, title, cmd, querystring, fragment, reaction, spoiler);
	}
	else if ( aliasInvoke === 'random' && !args.join('') && !linksuffix ) cmd_random(lang, msg, wiki, reaction, spoiler);
	else if ( aliasInvoke === 'overview' && !args.join('') && !linksuffix ) {
		if ( allSites.some( site => 'https://' + site.wiki_domain + '/' === wiki ) ) cmd_overview(lang, msg, wiki, reaction, spoiler);
		else getAllSites(cmd_overview, lang, msg, wiki, reaction, spoiler);
	}
	else if ( aliasInvoke === 'page' ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink() + args.join('_').toTitle() + linksuffix + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( aliasInvoke === 'search' ) {
		linksuffix = ( linksuffix.startsWith( '?' ) ? '&' + linksuffix.substring(1) : linksuffix );
		msg.sendChannel( spoiler + '<' + wiki.toLink() + 'Special:Search?search=' + args.join(' ').toSearch() + linksuffix + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( aliasInvoke === 'diff' && args.join('') && !linksuffix ) cmd_diff(lang, msg, args, wiki, reaction, spoiler);
	else {
		var noRedirect = ( /(?:^|&)redirect=no(?:&|$)/.test(querystring) || /(?:^|&)action=(?!view(?:&|$))/.test(querystring) );
		request( {
			uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general|namespaces|specialpagealiases&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageimages|categoryinfo|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle&exsentences=10&exintro=true&explaintext=true&titles=' + encodeURIComponent( title ) + '&format=json',
			json: true
		}, function( error, response, body ) {
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
				if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + ( linksuffix || !title ? title.toTitle() + linksuffix : 'Special:Search?search=' + title.toSearch() ) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				if ( body.query.pages ) {
					var querypages = Object.values(body.query.pages);
					var querypage = querypages[0];
					if ( body.query.redirects && body.query.redirects[0].from.split(':')[0] === body.query.namespaces['-1']['*'] && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk','MyLanguage'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ) ) {
						querypage.title = body.query.redirects[0].from;
						delete body.query.redirects[0].tofragment;
						delete querypage.missing;
						querypage.ns = -1;
						querypage.special = '';
					}
					if ( querypages.length !== 1 ) querypage = {
						title: title,
						invalidreason: 'The requested page title contains invalid characters: "|".',
						invalid: ''
					}
					
					var contribs = body.query.namespaces['-1']['*'] + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
					if ( ( querypage.ns === 2 || querypage.ns === 202 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
						var userparts = querypage.title.split(':');
						querypage.noRedirect = noRedirect;
						cmd_user(lang, msg, userparts[0].toTitle() + ':', userparts.slice(1).join(':'), wiki, linksuffix, querypage, contribs.toTitle(), reaction, spoiler);
					}
					else if ( querypage.ns === -1 && querypage.title.startsWith( contribs ) && querypage.title.length > contribs.length ) {
						var username = querypage.title.split('/').slice(1).join('/');
						request( {
							uri: wiki + 'api.php?action=query&titles=User:' + encodeURIComponent( username ) + '&format=json',
							json: true
						}, function( uerror, uresponse, ubody ) {
							if ( uerror || !uresponse || uresponse.statusCode !== 200 || !ubody || ubody.batchcomplete === undefined || !ubody.query ) {
								console.log( '- ' + ( uresponse && uresponse.statusCode ) + ': Error while getting the user: ' + ( uerror || ubody && ubody.error && ubody.error.info ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink() + ( contribs + username ).toTitle() + linksuffix + '>' + spoiler );
								
								if ( reaction ) reaction.removeEmoji();
							}
							else {
								querypage = Object.values(ubody.query.pages)[0];
								if ( querypage.ns === 2 ) {
									username = querypage.title.split(':').slice(1).join(':');
									querypage.title = contribs + username;
									delete querypage.missing;
									querypage.ns = -1;
									querypage.special = '';
									querypage.noRedirect = noRedirect;
									cmd_user(lang, msg, contribs.toTitle(), username, wiki, linksuffix, querypage, contribs.toTitle(), reaction, spoiler);
								}
								else {
									msg.reactEmoji('error');
									
									if ( reaction ) reaction.removeEmoji();
								}
							}
						} );
					}
					else if ( ( querypage.missing !== undefined && querypage.known === undefined && !( noRedirect || querypage.categoryinfo ) ) || querypage.invalid !== undefined ) {
						request( {
							uri: wiki + 'api.php?action=query&prop=pageimages|categoryinfo|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle&exsentences=10&exintro=true&explaintext=true&generator=search&gsrnamespace=4|12|14|' + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json',
							json: true
						}, function( srerror, srresponse, srbody ) {
							if ( srbody && srbody.warnings ) log_warn(srbody.warnings);
							if ( srerror || !srresponse || srresponse.statusCode !== 200 || !srbody || srbody.batchcomplete === undefined ) {
								console.log( '- ' + ( srresponse && srresponse.statusCode ) + ': Error while getting the search results: ' + ( srerror || srbody && srbody.error && srbody.error.info ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Search?search=' + title.toSearch() + '>' + spoiler );
							}
							else {
								if ( !srbody.query ) {
									msg.reactEmoji('🤷');
								}
								else {
									querypage = Object.values(srbody.query.pages)[0];
									var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
									var text = '';
									var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
									if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
										var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
										if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
										embed.setTitle( displaytitle );
									}
									if ( querypage.pageprops && querypage.pageprops.description ) {
										var description = htmlToPlain( querypage.pageprops.description );
										if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
										embed.setDescription( description );
									}
									else if ( querypage.extract ) {
										var extract = querypage.extract.escapeFormatting();
										if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
										embed.setDescription( extract );
									}
									if ( querypage.pageimage && querypage.original && querypage.title !== body.query.general.mainpage ) {
										var pageimage = querypage.original.source;
										if ( querypage.ns === 6 ) {
											if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.pageimage.toLowerCase()) ) embed.setImage( pageimage );
											else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + querypage.pageimage}] );
										} else embed.setThumbnail( pageimage );
									} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
									
									if ( title.replace( /\-/g, ' ' ).toTitle().toLowerCase() === querypage.title.replace( /\-/g, ' ' ).toTitle().toLowerCase() ) {
										text = '';
									}
									else if ( !srbody.continue ) {
										text = '\n' + lang.search.infopage.replaceSave( '%s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + linksuffix + '`' );
									}
									else {
										text = '\n' + lang.search.infosearch.replaceSave( '%1$s', '`' + process.env.prefix + cmd + lang.search.page + ' ' + title + linksuffix + '`' ).replaceSave( '%2$s', '`' + process.env.prefix + cmd + lang.search.search + ' ' + title + linksuffix + '`' );
									}
									
									if ( querypage.categoryinfo ) {
										var langCat = lang.search.category;
										var category = [langCat.content];
										if ( querypage.categoryinfo.size === 0 ) category.push(langCat.empty);
										if ( querypage.categoryinfo.pages > 0 ) {
											var pages = querypage.categoryinfo.pages;
											category.push(( langCat.pages[pages] || langCat.pages['*' + pages % 100] || langCat.pages['*' + pages % 10] || langCat.pages.default ).replaceSave( '%s', pages ));
										}
										if ( querypage.categoryinfo.files > 0 ) {
											var files = querypage.categoryinfo.files;
											category.push(( langCat.files[files] || langCat.files['*' + files % 100] || langCat.files['*' + files % 10] || langCat.files.default ).replaceSave( '%s', files ));
										}
										if ( querypage.categoryinfo.subcats > 0 ) {
											var subcats = querypage.categoryinfo.subcats;
											category.push(( langCat.subcats[subcats] || langCat.subcats['*' + subcats % 100] || langCat.subcats['*' + subcats % 10] || langCat.subcats.default ).replaceSave( '%s', subcats ));
										}
										if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
										else text += '\n\n' + category.join('\n');
									}
						
									msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, embed );
								}
							}
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else if ( querypage.ns === -1 ) {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
						var embed =  new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						var specialpage = body.query.specialpagealiases.find( sp => body.query.namespaces['-1']['*'] + ':' + sp.aliases[0].replace( /\_/g, ' ' ) === querypage.title.split('/')[0] );
						specialpage = ( specialpage ? specialpage.realname : querypage.title.replace( body.query.namespaces['-1']['*'] + ':', '' ).split('/')[0] ).toLowerCase();
						special_page(lang, msg, querypage.title, specialpage, embed, wiki, reaction, spoiler);
					}
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + ( querystring ? '?' + querystring.toTitle() : '' ) + ( fragment ? '#' + fragment.toSection() : ( body.query.redirects && body.query.redirects[0].tofragment ? '#' + body.query.redirects[0].tofragment.toSection() : '' ) );
						var text = '';
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
							var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
							if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
							embed.setTitle( displaytitle );
						}
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = htmlToPlain( querypage.pageprops.description );
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						else if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage && querypage.original && querypage.title !== body.query.general.mainpage ) {
							var pageimage = querypage.original.source;
							if ( querypage.ns === 6 ) {
								if ( msg.showEmbed() && /\.(?:png|jpg|jpeg|gif)$/.test(querypage.pageimage.toLowerCase()) ) embed.setImage( pageimage );
								else if ( msg.uploadFiles() ) embed.attachFiles( [{attachment:pageimage,name:( spoiler ? 'SPOILER ' : '' ) + querypage.pageimage}] );
							} else embed.setThumbnail( pageimage );
						} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						if ( querypage.categoryinfo ) {
							var langCat = lang.search.category;
							var category = [langCat.content];
							if ( querypage.categoryinfo.size === 0 ) category.push(langCat.empty);
							if ( querypage.categoryinfo.pages > 0 ) {
								var pages = querypage.categoryinfo.pages;
								category.push(( langCat.pages[pages] || langCat.pages['*' + pages % 100] || langCat.pages['*' + pages % 10] || langCat.pages.default ).replaceSave( '%s', pages ));
							}
							if ( querypage.categoryinfo.files > 0 ) {
								var files = querypage.categoryinfo.files;
								category.push(( langCat.files[files] || langCat.files['*' + files % 100] || langCat.files['*' + files % 10] || langCat.files.default ).replaceSave( '%s', files ));
							}
							if ( querypage.categoryinfo.subcats > 0 ) {
								var subcats = querypage.categoryinfo.subcats;
								category.push(( langCat.subcats[subcats] || langCat.subcats['*' + subcats % 100] || langCat.subcats['*' + subcats % 10] || langCat.subcats.default ).replaceSave( '%s', subcats ));
							}
							if ( msg.showEmbed() ) embed.addField( category[0], category.slice(1).join('\n') );
							else text += '\n\n' + category.join('\n');
						}
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + text + spoiler, embed );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
				else if ( body.query.interwiki ) {
					var inter = body.query.interwiki[0];
					var intertitle = inter.title.substring(inter.iw.length + 1);
					var regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.gamepedia\.com(?:\/|$)/ );
					if ( regex !== null && selfcall < 5 ) {
						if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
							var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
							selfcall++;
							check_wiki(lang, msg, iwtitle, 'https://' + regex[1] + '.gamepedia.com/', ' !' + regex[1] + ' ', reaction, spoiler, querystring, fragment, selfcall);
						} else {
							if ( reaction ) reaction.removeEmoji();
							console.log( '- Aborted, paused.' );
						}
					} else {
						regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50}\.(?:wikipedia|mediawiki|wiktionary|wikimedia|wikibooks|wikisource|wikidata|wikiversity|wikiquote|wikinews|wikivoyage)\.org)(?:\/wiki\/|\/?$)/ );
						if ( regex !== null && selfcall < 5 ) {
							if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
								var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
								selfcall++;
								check_wiki(lang, msg, iwtitle, 'https://' + regex[1] + '/w/', cmd + inter.iw + ':', reaction, spoiler, querystring, fragment, selfcall);
							} else {
								if ( reaction ) reaction.removeEmoji();
								console.log( '- Aborted, paused.' );
							}
						} else {
							if ( fragment ) fragment = '#' + fragment.toSection();
							if ( inter.url.includes( '#' ) ) {
								if ( !fragment ) fragment = '#' + inter.url.split('#').slice(1).join('#');
								inter.url = inter.url.split('#')[0];
							}
							if ( querystring ) inter.url += ( inter.url.includes( '?' ) ? '&' : '?' ) + querystring.toTitle();
							msg.sendChannel( spoiler + ' ' + inter.url.replace( /@(here|everyone)/g, '%40$1' ) + fragment + ' ' + spoiler ).then( message => {
								if ( message && selfcall === 5 ) message.reactEmoji('⚠');
							} );
							if ( reaction ) reaction.removeEmoji();
						}
					}
				}
				else if ( body.query.redirects ) {
					var pagelink = wiki.toLink() + body.query.redirects[0].to.toTitle() + ( querystring ? '?' + querystring.toTitle() : '' ) + ( fragment ? '#' + fragment.toSection() : ( body.query.redirects[0].tofragment ? '#' + body.query.redirects[0].tofragment.toSection() : '' ) );
					var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.redirects[0].to.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
					
					msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
					
					if ( reaction ) reaction.removeEmoji();;
				}
				else {
					var pagelink = wiki.toLink() + body.query.general.mainpage.toTitle() + linksuffix;
					var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.general.mainpage.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
					request( {
						uri: wiki + 'api.php?action=query' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageprops|extracts&ppprop=description|displaytitle&exsentences=10&exintro=true&explaintext=true&titles=' + encodeURIComponent( body.query.general.mainpage ) + '&format=json',
						json: true
					}, function( mperror, mpresponse, mpbody ) {
						if ( mpbody && mpbody.warnings ) log_warn(body.warnings);
						if ( mperror || !mpresponse || mpresponse.statusCode !== 200 || !mpbody || mpbody.batchcomplete === undefined || !mpbody.query ) {
							console.log( '- ' + ( mpresponse && mpresponse.statusCode ) + ': Error while getting the main page: ' + ( mperror || mpbody && mpbody.error && mpbody.error.info ) );
						} else {
							querypage = Object.values(mpbody.query.pages)[0];
							if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
								var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
								if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
								embed.setTitle( displaytitle );
							}
							if ( querypage.pageprops && querypage.pageprops.description ) {
								var description = htmlToPlain( querypage.pageprops.description );
								if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
								embed.setDescription( description );
							}
							else if ( querypage.extract ) {
								var extract = querypage.extract.escapeFormatting();
								if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
								embed.setDescription( extract );
							}
						}
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
						
						if ( reaction ) reaction.removeEmoji();
					} );
				}
			}
		} );
	}
}

function special_page(lang, msg, title, specialpage, embed, wiki, reaction, spoiler) {
	var overwrites = {
		randompage: (lang, msg, args, embed, wiki, reaction, spoiler) => cmd_random(lang, msg, wiki, reaction, spoiler),
		diff: (lang, msg, args, embed, wiki, reaction, spoiler) => cmd_diff(lang, msg, args, wiki, reaction, spoiler, embed),
		statistics: (lang, msg, args, embed, wiki, reaction, spoiler) => cmd_overview(lang, msg, wiki, reaction, spoiler)
	}
	if ( specialpage in overwrites ) {
		var args = title.split('/').slice(1,3);
		overwrites[specialpage](lang, msg, args, embed, wiki, reaction, spoiler);
		return;
	}
	request( {
		uri: wiki + 'api.php?action=query&meta=allmessages&amenableparser=true&amtitle=' + encodeURIComponent( title ) + '&ammessages=' + encodeURIComponent( specialpage ) + '-summary&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined ) {
			console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the special page: ' + ( error || body && body.error && body.error.info ) );
		}
		else {
			if ( body.query.allmessages[0]['*'] ) {
				var description = body.query.allmessages[0]['*'].toPlaintext();
				if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
				embed.setDescription( description );
			}
		}
		
		msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, embed );
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

function cmd_user(lang, msg, namespace, username, wiki, linksuffix, querypage, contribs, reaction, spoiler) {
	if ( /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
		request( {
			uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ) + '&format=json',
			json: true
		}, function( error, response, body ) {
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.blocks ) {
				if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else if ( body && body.error && ( body.error.code === 'param_ip' || body.error.code === 'cidrtoobroad' ) ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('error');
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
							var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
							if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
							embed.setTitle( displaytitle );
						}
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = htmlToPlain( querypage.pageprops.description );
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						else if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage && querypage.original ) {
							var pageimage = querypage.original.source;
							embed.setThumbnail( pageimage );
						} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
					}
				}
				else {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + ( querypage.noRedirect ? namespace : contribs ) + username.toTitle() + linksuffix + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				if ( !querypage.noRedirect || ( querypage.missing === undefined && querypage.ns !== -1 ) ) namespace = contribs;
				var blocks = body.query.blocks.map( function(block) {
					var isBlocked = false;
					var blockedtimestamp = new Date(block.timestamp).toLocaleString(lang.dateformat, timeoptions);
					var blockexpiry = block.expiry;
					if ( blockexpiry === 'infinity' ) {
						blockexpiry = lang.user.block.until_infinity;
						isBlocked = true;
					} else if ( blockexpiry ) {
						if ( Date.parse(blockexpiry) > Date.now() ) isBlocked = true;
						blockexpiry = new Date(blockexpiry).toLocaleString(lang.dateformat, timeoptions);
					}
					if ( isBlocked ) return [lang.user.block.header.replaceSave( '%s', block.user ).escapeFormatting(), lang.user.block[( block.reason ? 'text' : 'noreason' )].replaceSave( '%1$s', blockedtimestamp ).replaceSave( '%2$s', blockexpiry ).replaceSave( '%3$s', '[[User:' + block.by + '|' + block.by + ']]' ).replaceSave( '%4$s', block.reason )];
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
				request( {
					uri: wiki + 'api.php?action=query&list=usercontribs&ucprop=&uclimit=50' + ( username.includes( '/' ) ? '&ucuserprefix=' + encodeURIComponent( rangeprefix ) : '&ucuser=' + encodeURIComponent( username ) ) + '&format=json',
					json: true
				}, function( ucerror, ucresponse, ucbody ) {
					if ( rangeprefix && !username.includes( '/' ) ) username = rangeprefix;
					if ( ucbody && ucbody.warnings ) log_warn(ucbody.warnings);
					if ( ucerror || !ucresponse || ucresponse.statusCode !== 200 || !ucbody || ucbody.batchcomplete === undefined || !ucbody.query || !ucbody.query.usercontribs ) {
						if ( ucbody && ucbody.error && ucbody.error.code === 'baduser_ucuser' ) {
							msg.reactEmoji('error');
						}
						else {
							console.log( '- ' + ( ucresponse && ucresponse.statusCode ) + ': Error while getting the search results: ' + ( ucerror || ucbody && ucbody.error && ucbody.error.info ) );
							msg.sendChannelError( spoiler + '<' + wiki.toLink() + namespace + username.toTitle() + linksuffix + '>' + spoiler );
						}
					}
					else {
						var editcount = [lang.user.info.editcount, ( username.includes( '/' ) && ( ( username.includes( ':' ) && range % 16 ) || range % 8 ) ? '~' : '' ) + ucbody.query.usercontribs.length + ( ucbody.continue ? '+' : '' )];
						
						var pagelink = wiki.toLink() + namespace + username.toTitle() + linksuffix;
						if ( msg.showEmbed() ) {
							var text = '<' + pagelink + '>';
							var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( username ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink() + contribs + username.toTitle(true) + ')' );
							if ( blocks.length ) blocks.forEach( block => embed.addField( block[0], block[1].toMarkdown(wiki) ) );
						}
						else {
							var embed = {};
							var text = '<' + pagelink + '>\n\n' + editcount.join(' ');
							if ( blocks.length ) blocks.forEach( block => text += '\n\n**' + block[0] + '**\n' + block[1].toPlaintext() );
						}
						
						msg.sendChannel( spoiler + text + spoiler, embed );
					}
					
					if ( reaction ) reaction.removeEmoji();
				} );
			}
		} );
	} else {
		request( {
			uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=users&usprop=blockinfo|groups|editcount|registration|gender&ususers=' + encodeURIComponent( username ) + '&format=json',
			json: true
		}, function( error, response, body ) {
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.users[0] ) {
				if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
					console.log( '- This wiki doesn\'t exist!' );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + namespace + username.toTitle() + linksuffix + '>' + spoiler );
				}
			}
			else {
				if ( body.query.users[0].missing !== undefined || body.query.users[0].invalid !== undefined ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('🤷');
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
							var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
							if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
							embed.setTitle( displaytitle );
						}
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = htmlToPlain( querypage.pageprops.description );
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						else if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage && querypage.original ) {
							var pageimage = querypage.original.source;
							embed.setThumbnail( pageimage );
						} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
					}
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					username = body.query.users[0].name;
					var gender = [lang.user.info.gender];
					switch (body.query.users[0].gender) {
						case 'male':
							gender.push(lang.user.gender.male);
							break;
						case 'female':
							gender.push(lang.user.gender.female);
							break;
						default: 
							gender.push(lang.user.gender.unknown);
					}
					var registration = [lang.user.info.registration, new Date(body.query.users[0].registration).toLocaleString(lang.dateformat, timeoptions)];
					var editcount = [lang.user.info.editcount, body.query.users[0].editcount];
					var groups = body.query.users[0].groups;
					var group = [lang.user.info.group];
					for ( var i = 0; i < lang.user.groups.length; i++ ) {
						if ( groups.includes( lang.user.groups[i][0] ) ) {
							var thisSite = allSites.find( site => site.wiki_domain === body.query.general.servername );
							if ( lang.user.groups[i][0] === 'hydra_staff' && thisSite && thisSite.wiki_managers.includes( username ) ) {
								group.push('**' + lang.user.manager + '**,');
							}
							group.push(lang.user.groups[i][1]);
							break;
						}
					}
					var isBlocked = false;
					var blockedtimestamp = new Date(body.query.users[0].blockedtimestamp).toLocaleString(lang.dateformat, timeoptions);
					var blockexpiry = body.query.users[0].blockexpiry;
					if ( blockexpiry === 'infinity' ) {
						blockexpiry = lang.user.block.until_infinity;
						isBlocked = true;
					} else if ( blockexpiry ) {
						var blockexpirydate = blockexpiry.replace( /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z' );
						blockexpiry = new Date(blockexpirydate).toLocaleString(lang.dateformat, timeoptions);
						if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
					}
					var blockedby = '[[User:' + body.query.users[0].blockedby + '|' + body.query.users[0].blockedby + ']]';
					var blockreason = body.query.users[0].blockreason;
					var block = [lang.user.block.header.replaceSave( '%s', username ).escapeFormatting(), lang.user.block[( blockreason ? 'text' : 'noreason' )].replaceSave( '%1$s', blockedtimestamp ).replaceSave( '%2$s', blockexpiry ).replaceSave( '%3$s', blockedby ).replaceSave( '%4$s', blockreason )];
					
					var pagelink = wiki.toLink() + namespace + username.toTitle() + linksuffix;
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( username.escapeFormatting() ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink() + contribs + username.toTitle(true) + ')', true ).addField( group[0], group.slice(1).join('\n'), true ).addField( gender[0], gender[1], true ).addField( registration[0], registration[1], true );
						
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = htmlToPlain( querypage.pageprops.description );
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						else if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
					}
					else {
						var embed = {};
						var text = '<' + pagelink + '>\n\n' + gender.join(' ') + '\n' + registration.join(' ') + '\n' + editcount.join(' ') + '\n' + group.join(' ');
					}
					
					if ( wiki.endsWith( '.gamepedia.com/' ) ) request( {
						uri: wiki + 'api.php?action=profile&do=getPublicProfile&user_name=' + encodeURIComponent( username ) + '&format=json',
						json: true
					}, function( perror, presponse, pbody ) {
						if ( perror || !presponse || presponse.statusCode !== 200 || !pbody || pbody.error || pbody.errormsg || !pbody.profile ) {
							console.log( '- ' + ( presponse && presponse.statusCode ) + ': Error while getting the user profile: ' + ( perror || pbody && ( pbody.error && pbody.error.info || pbody.errormsg ) ) );
						}
						else if ( pbody.profile['link-discord'] ) {
							if ( msg.channel.type === 'text' ) var discordmember = msg.guild.members.find( member => {
								return member.user.tag === pbody.profile['link-discord'].replace( /^\s*([^@#:]{2,32}?)\s*#(\d{4,6})\s*$/, '$1#$2' );
							} );
							var discordname = [lang.user.info.discord,pbody.profile['link-discord'].escapeFormatting()];
							if ( discordmember ) {
								if ( msg.showEmbed() ) discordname[1] = discordmember.toString();
								else if ( discordmember.nickname ) discordname[1] += ' (' + discordmember.nickname.escapeFormatting() + ')';
							}
							
							if ( msg.showEmbed() ) embed.addField( discordname[0], discordname[1], true );
							else text += '\n' + discordname.join(' ');
						}
						
						if ( isBlocked ) {
							if ( msg.showEmbed() ) embed.addField( block[0], block[1].toMarkdown(wiki) );
							else text += '\n\n**' + block[0] + '**\n' + block[1].toPlaintext();
						}
						
						msg.sendChannel( spoiler + text + spoiler, embed );
						
						if ( reaction ) reaction.removeEmoji();
					} );
					else {
						if ( isBlocked ) {
							if ( msg.showEmbed() ) embed.addField( block[0], block[1].toMarkdown(wiki) );
							else text += '\n\n**' + block[0] + '**\n' + block[1].toPlaintext();
						}
						
						msg.sendChannel( spoiler + text + spoiler, embed );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
			}
		} );
	}
}

function cmd_diff(lang, msg, args, wiki, reaction, spoiler, embed) {
	if ( args[0] ) {
		var error = false;
		var title = '';
		var revision = 0;
		var diff = 0;
		var relative = 'prev';
		if ( /^\d+$/.test(args[0]) ) {
			revision = parseInt(args[0], 10);
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					diff = parseInt(args[1], 10);
				}
				else if ( args[1] === 'prev' || args[1] === 'next' || args[1] === 'cur' ) {
					relative = args[1];
				}
				else error = true;
			}
		}
		else if ( args[0] === 'prev' || args[0] === 'next' || args[0] === 'cur' ) {
			relative = args[0];
			if ( args[1] ) {
				if ( /^\d+$/.test(args[1]) ) {
					revision = parseInt(args[1], 10);
				}
				else error = true;
			}
			else error = true;
		}
		else title = args.join(' ');
		
		if ( error ) {
			msg.reactEmoji('error');
			if ( reaction ) reaction.removeEmoji();
		}
		else if ( diff ) {
			cmd_diffsend(lang, msg, [diff, revision], wiki, reaction, spoiler);
		}
		else {
			request( {
				uri: wiki + 'api.php?action=compare&prop=ids|diff' + ( title ? '&fromtitle=' + encodeURIComponent( title ) : '&fromrev=' + revision ) + '&torelative=' + relative + '&format=json',
				json: true
			}, function( error, response, body ) {
				if ( body && body.warnings ) log_warn(body.warnings);
				if ( error || !response || response.statusCode !== 200 || !body || !body.compare ) {
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
							case 'missingcontent':
								noerror = true;
								break;
							default:
								noerror = false;
						}
					}
					if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
						console.log( '- This wiki doesn\'t exist!' );
						msg.reactEmoji('nowiki');
					}
					else if ( noerror ) {
						msg.replyMsg( lang.diff.badrev );
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
						msg.sendChannelError( spoiler + '<' + wiki.toLink() + title.toTitle() + '?diff=' + relative + ( title ? '' : '&oldid=' + revision ) + '>' + spoiler );
					}
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					if ( body.compare.fromarchive !== undefined || body.compare.toarchive !== undefined ) {
						msg.reactEmoji('error');
						
						if ( reaction ) reaction.removeEmoji();
					} else {
						var argids = [];
						var ids = body.compare;
						if ( ids.fromrevid && !ids.torevid ) argids = [ids.fromrevid];
						else if ( !ids.fromrevid && ids.torevid ) argids = [ids.torevid];
						else {
							argids = [ids.torevid, ids.fromrevid];
							var compare = ['', ''];
							if ( ids.fromtexthidden === undefined && ids.totexthidden === undefined && ids['*'] !== undefined ) {
								var more = '\n__' + lang.diff.info.more + '__';
								var current_tag = '';
								var small_prev_ins = '';
								var small_prev_del = '';
								var ins_length = more.length;
								var del_length = more.length;
								var added = false;
								var parser = new htmlparser.Parser( {
									onopentag: (tagname, attribs) => {
										if ( tagname === 'ins' || tagname == 'del' ) {
											current_tag = tagname;
										}
										if ( tagname === 'td' && attribs.class === 'diff-addedline' ) {
											current_tag = tagname+'a';
										}
										if ( tagname === 'td' && attribs.class === 'diff-deletedline' ) {
											current_tag = tagname+"d";
										}
										if ( tagname === 'td' && attribs.class === 'diff-marker' ) {
											added = true;
										}
									},
									ontext: (htmltext) => {
										if ( current_tag === 'ins' && ins_length <= 1000 ) {
											ins_length += ( '**' + htmltext.escapeFormatting() + '**' ).length;
											if ( ins_length <= 1000 ) small_prev_ins += '**' + htmltext.escapeFormatting() + '**';
											else small_prev_ins += more;
										}
										if ( current_tag === 'del' && del_length <= 1000 ) {
											del_length += ( '~~' + htmltext.escapeFormatting() + '~~' ).length;
											if ( del_length <= 1000 ) small_prev_del += '~~' + htmltext.escapeFormatting() + '~~';
											else small_prev_del += more;
										}
										if ( ( current_tag === 'afterins' || current_tag === 'tda') && ins_length <= 1000 ) {
											ins_length += htmltext.escapeFormatting().length;
											if ( ins_length <= 1000 ) small_prev_ins += htmltext.escapeFormatting();
											else small_prev_ins += more;
										}
										if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && del_length <= 1000 ) {
											del_length += htmltext.escapeFormatting().length;
											if ( del_length <= 1000 ) small_prev_del += htmltext.escapeFormatting();
											else small_prev_del += more;
										}
										if ( added ) {
											if ( htmltext === '+' && ins_length <= 1000 ) {
												ins_length++;
												if ( ins_length <= 1000 ) small_prev_ins += '\n';
												else small_prev_ins += more;
											}
											if ( htmltext === '−' && del_length <= 1000 ) {
												del_length++;
												if ( del_length <= 1000 ) small_prev_del += '\n';
												else small_prev_del += more;
											}
											added = false;
										}
									},
									onclosetag: (tagname) => {
										if ( tagname === 'ins' ) {
											current_tag = 'afterins';
										} else if ( tagname === 'del' ) {
											current_tag = 'afterdel';
										} else {
											current_tag = '';
										}
									}
								}, {decodeEntities:true} );
								parser.write( ids['*'] );
								parser.end();
								if ( small_prev_del.length ) {
									if ( small_prev_del.replace( /\~\~/g, '' ).trim().length ) {
										compare[0] = small_prev_del.replace( /\~\~\~\~/g, '' );
									} else compare[0] = '__' + lang.diff.info.whitespace + '__';
								}
								if ( small_prev_ins.length ) {
									if ( small_prev_ins.replace( /\*\*/g, '' ).trim().length ) {
										compare[1] = small_prev_ins.replace( /\*\*\*\*/g, '' );
									} else compare[1] = '__' + lang.diff.info.whitespace + '__';
								}
							}
							else if ( ids.fromtexthidden !== undefined ) compare[0] = '__' + lang.diff.hidden + '__';
							else if ( ids.totexthidden !== undefined ) compare[1] = '__' + lang.diff.hidden + '__';
						}
						cmd_diffsend(lang, msg, argids, wiki, reaction, spoiler, compare);
					}
				}
			} );
		}
	}
	else {
		if ( embed ) msg.sendChannel( spoiler + '<' + embed.url + '>' + spoiler, embed );
		else msg.reactEmoji('error');
		
		if ( reaction ) reaction.removeEmoji();
	}
}

function cmd_diffsend(lang, msg, args, wiki, reaction, spoiler, compare) {
	request( {
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags' + ( args.length === 1 || args[0] === args[1] ? '|content' : '' ) + '&revids=' + args.join('|') + '&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0] + '>' + spoiler );
			}
			
			if ( reaction ) reaction.removeEmoji();
		}
		else {
			if ( body.query.badrevids ) {
				msg.replyMsg( lang.diff.badrev );
				
				if ( reaction ) reaction.removeEmoji();
			}
			else if ( body.query.pages && !body.query.pages['-1'] ) {
				var pages = Object.values(body.query.pages);
				if ( pages.length !== 1 ) {
					msg.sendChannel( spoiler + '<' + wiki.toLink() + 'Special:Diff/' + ( args[1] ? args[1] + '/' : '' ) + args[0] + '>' + spoiler );
					
					if ( reaction ) reaction.removeEmoji();
				}
				else {
					var title = pages[0].title;
					var revisions = pages[0].revisions.sort( (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp) );
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = [lang.diff.info.editor, ( revisions[0].userhidden !== undefined ? lang.diff.hidden : revisions[0].user )];
					var timestamp = [lang.diff.info.timestamp, new Date(revisions[0].timestamp).toLocaleString(lang.dateformat, timeoptions)];
					var difference = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
					var size = [lang.diff.info.size, lang.diff.info.bytes.replace( '%s', ( difference > 0 ? '+' : '' ) + difference )];
					var comment = [lang.diff.info.comment, ( revisions[0].commenthidden !== undefined ? lang.diff.hidden : ( revisions[0].comment ? revisions[0].comment.toFormatting(msg.showEmbed(), wiki, title) : lang.diff.nocomment ) )];
					if ( revisions[0].tags.length ) var tags = [lang.diff.info.tags, body.query.tags.filter( tag => revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname ).join(', ')];
					
					var pagelink = wiki.toLink() + title.toTitle() + '?diff=' + diff + '&oldid=' + oldid;
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var editorlink = '[' + editor[1] + '](' + wiki.toLink() + 'User:' + editor[1].toTitle(true) + ')';
						if ( revisions[0].anon !== undefined ) {
							editorlink = '[' + editor[1] + '](' + wiki.toLink() + 'Special:Contributions/' + editor[1].toTitle(true) + ')';
						}
						if ( editor[1] === lang.diff.hidden ) editorlink = editor[1];
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( ( title + '?diff=' + diff + '&oldid=' + oldid ).escapeFormatting() ).setURL( pagelink ).addField( editor[0], editorlink, true ).addField( size[0], size[1], true ).addField( comment[0], comment[1] ).setFooter( timestamp[1] );
						if ( tags ) {
							var taglink = '';
							var tagtext = '';
							var tagparser = new htmlparser.Parser( {
								onopentag: (tagname, attribs) => {
									if ( tagname === 'a' ) taglink = attribs.href;
								},
								ontext: (htmltext) => {
									if ( taglink ) tagtext += '[' + htmltext.escapeFormatting() + '](' + taglink + ')'
									else tagtext += htmltext.escapeFormatting();
								},
								onclosetag: (tagname) => {
									if ( tagname === 'a' ) taglink = '';
								}
							}, {decodeEntities:true} );
							tagparser.write( tags[1] );
							tagparser.end();
							embed.addField( tags[0], tagtext );
						}
						
						var more = '\n__' + lang.diff.info.more + '__';
						if ( !compare && oldid ) request( {
							uri: wiki + 'api.php?action=compare&prop=diff&fromrev=' + oldid + '&torev=' + diff + '&format=json',
							json: true
						}, function( cperror, cpresponse, cpbody ) {
							if ( cpbody && cpbody.warnings ) log_warn(cpbody.warnings);
							if ( cperror || !cpresponse || cpresponse.statusCode !== 200 || !cpbody || !cpbody.compare || cpbody.compare['*'] === undefined ) {
								var noerror = false;
								if ( cpbody && cpbody.error ) {
									switch ( cpbody.error.code ) {
										case 'nosuchrevid':
											noerror = true;
											break;
										case 'missingcontent':
											noerror = true;
											break;
										default:
											noerror = false;
									}
								}
								if ( !noerror ) console.log( '- ' + ( cpresponse && cpresponse.statusCode ) + ': Error while getting the diff: ' + ( cperror || cpbody && cpbody.error && cpbody.error.info ) );
							}
							else if ( cpbody.compare.fromtexthidden === undefined && cpbody.compare.totexthidden === undefined && cpbody.compare.fromarchive === undefined && cpbody.compare.toarchive === undefined ) {
								var current_tag = '';
								var small_prev_ins = '';
								var small_prev_del = '';
								var ins_length = more.length;
								var del_length = more.length;
								var added = false;
								var parser = new htmlparser.Parser( {
									onopentag: (tagname, attribs) => {
										if ( tagname === 'ins' || tagname == 'del' ) {
											current_tag = tagname;
										}
										if ( tagname === 'td' && attribs.class === 'diff-addedline' ) {
											current_tag = tagname+'a';
										}
										if ( tagname === 'td' && attribs.class === 'diff-deletedline' ) {
											current_tag = tagname+"d";
										}
										if ( tagname === 'td' && attribs.class === 'diff-marker' ) {
											added = true;
										}
									},
									ontext: (htmltext) => {
										if ( current_tag === 'ins' && ins_length <= 1000 ) {
											ins_length += ( '**' + htmltext.escapeFormatting() + '**' ).length;
											if ( ins_length <= 1000 ) small_prev_ins += '**' + htmltext.escapeFormatting() + '**';
											else small_prev_ins += more;
										}
										if ( current_tag === 'del' && del_length <= 1000 ) {
											del_length += ( '~~' + htmltext.escapeFormatting() + '~~' ).length;
											if ( del_length <= 1000 ) small_prev_del += '~~' + htmltext.escapeFormatting() + '~~';
											else small_prev_del += more;
										}
										if ( ( current_tag === 'afterins' || current_tag === 'tda') && ins_length <= 1000 ) {
											ins_length += htmltext.escapeFormatting().length;
											if ( ins_length <= 1000 ) small_prev_ins += htmltext.escapeFormatting();
											else small_prev_ins += more;
										}
										if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && del_length <= 1000 ) {
											del_length += htmltext.escapeFormatting().length;
											if ( del_length <= 1000 ) small_prev_del += htmltext.escapeFormatting();
											else small_prev_del += more;
										}
										if ( added ) {
											if ( htmltext === '+' && ins_length <= 1000 ) {
												ins_length++;
												if ( ins_length <= 1000 ) small_prev_ins += '\n';
												else small_prev_ins += more;
											}
											if ( htmltext === '−' && del_length <= 1000 ) {
												del_length++;
												if ( del_length <= 1000 ) small_prev_del += '\n';
												else small_prev_del += more;
											}
											added = false;
										}
									},
									onclosetag: (tagname) => {
										if ( tagname === 'ins' ) {
											current_tag = 'afterins';
										} else if ( tagname === 'del' ) {
											current_tag = 'afterdel';
										} else {
											current_tag = '';
										}
									}
								}, {decodeEntities:true} );
								parser.write( cpbody.compare['*'] );
								parser.end();
								if ( small_prev_del.length ) {
									if ( small_prev_del.replace( /\~\~/g, '' ).trim().length ) {
										embed.addField( lang.diff.info.removed, small_prev_del.replace( /\~\~\~\~/g, '' ), true );
									} else embed.addField( lang.diff.info.removed, '__' + lang.diff.info.whitespace + '__', true );
								}
								if ( small_prev_ins.length ) {
									if ( small_prev_ins.replace( /\*\*/g, '' ).trim().length ) {
										embed.addField( lang.diff.info.added, small_prev_ins.replace( /\*\*\*\*/g, '' ), true );
									} else embed.addField( lang.diff.info.added, '__' + lang.diff.info.whitespace + '__', true );
								}
							}
							else if ( cpbody.compare.fromtexthidden !== undefined ) {
								embed.addField( lang.diff.info.removed, '__' + lang.diff.hidden + '__', true );
							}
							else if ( cpbody.compare.totexthidden !== undefined ) {
								embed.addField( lang.diff.info.added, '__' + lang.diff.hidden + '__', true );
							}
							
							msg.sendChannel( spoiler + text + spoiler, embed );
							
							if ( reaction ) reaction.removeEmoji();
						} );
						else {
							if ( compare ) {
								if ( compare[0].length ) embed.addField( lang.diff.info.removed, compare[0], true );
								if ( compare[1].length ) embed.addField( lang.diff.info.added, compare[1], true );
							}
							else if ( revisions[0]['*'] ) {
								var content = revisions[0]['*'].escapeFormatting();
								if ( content.trim().length ) {
									if ( content.length <= 1000 ) content = '**' + content + '**';
									else {
										content = content.substring(0, 1000 - more.length);
										content = '**' + content.substring(0, content.lastIndexOf('\n')) + '**' + more;
									}
									embed.addField( lang.diff.info.added, content, true );
								} else embed.addField( lang.diff.info.added, '__' + lang.diff.info.whitespace + '__', true );
							}
							
							msg.sendChannel( spoiler + text + spoiler, embed );
							
							if ( reaction ) reaction.removeEmoji();
						}
					}
					else {
						var embed = {};
						var text = '<' + pagelink + '>\n\n' + editor.join(' ') + '\n' + timestamp.join(' ') + '\n' + size.join(' ') + '\n' + comment.join(' ');
						if ( tags ) text += htmlToPlain( '\n' + tags.join(' ') );
						
						msg.sendChannel( spoiler + text + spoiler, embed );
						
						if ( reaction ) reaction.removeEmoji();
					}
				}
			}
			else {
				msg.reactEmoji('error');
				
				if ( reaction ) reaction.removeEmoji();
			}
		}
	} );
}

function cmd_random(lang, msg, wiki, reaction, spoiler) {
	request( {
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&prop=pageimages|pageprops|extracts&piprop=original|name&ppprop=description|displaytitle&exsentences=10&exintro=true&explaintext=true&generator=random&grnnamespace=0&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Random>' + spoiler );
			}
		}
		else {
			querypage = Object.values(body.query.pages)[0];
			var pagelink = wiki.toLink() + querypage.title.toTitle();
			var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
			if ( querypage.pageprops && querypage.pageprops.displaytitle ) {
				var displaytitle = htmlToDiscord( querypage.pageprops.displaytitle );
				if ( displaytitle.length > 250 ) displaytitle = displaytitle.substring(0, 250) + '\u2026';
				embed.setTitle( displaytitle );
			}
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = htmlToPlain( querypage.pageprops.description );
				if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
				embed.setDescription( description );
			}
			else if ( querypage.extract ) {
				var extract = querypage.extract.escapeFormatting();
				if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
				embed.setDescription( extract );
			}
			if ( querypage.pageimage && querypage.original && querypage.title !== body.query.general.mainpage ) {
				embed.setThumbnail( querypage.original.source );
			}
			else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
			
			msg.sendChannel( '🎲 ' + spoiler + '<' + pagelink + '>' + spoiler, embed );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

function cmd_overview(lang, msg, wiki, reaction, spoiler) {
	request( {
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general|statistics&titles=Special:Statistics&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( response && ( response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' || response.statusCode === 410 ) ) {
				console.log( '- This wiki doesn\'t exist!' );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the search results: ' + ( error || body && body.error && body.error.info ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Statistics>' + spoiler );
			}
		}
		else {
			var site = false;
			if ( allSites.some( site => site.wiki_domain === body.query.general.servername ) ) {
				site = allSites.find( site => site.wiki_domain === body.query.general.servername );
				
				var name = [lang.overview.name, site.wiki_display_name];
				var created = [lang.overview.created, new Date(parseInt(site.created + '000', 10)).toLocaleString(lang.dateformat, timeoptions)];
				var manager = [lang.overview.manager, site.wiki_managers];
				var official = [lang.overview.official, ( site.official_wiki ? lang.overview.yes : lang.overview.no )];
				var description = [lang.overview.description, site.wiki_description];
				var image = [lang.overview.image, site.wiki_image];
				
				if ( description[1] ) {
					description[1] = description[1].escapeFormatting();
					if ( description[1].length > 1000 ) description[1] = description[1].substring(0, 1000) + '\u2026';
				}
				if ( image[1] && image[1].startsWith( '/' ) ) image[1] = wiki.substring(0, wiki.length - 1) + image[1];
			}
			var articles = [lang.overview.articles, body.query.statistics.articles];
			var pages = [lang.overview.pages, body.query.statistics.pages];
			var edits = [lang.overview.edits, body.query.statistics.edits];
			var users = [lang.overview.users, body.query.statistics.activeusers];
			
			var title = body.query.pages['-1'].title;
			var pagelink = wiki.toLink() + title.toTitle();
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( title.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
				if ( site ) {
					var managerlist = manager[1].map( manager => '[' + manager + '](' + wiki.toLink() + 'User:' + manager.toTitle(true) + ') ([' + lang.overview.talk + '](' + wiki.toLink() + 'User_talk:' + manager.toTitle(true) + '))' ).join('\n');
					embed.addField( name[0], name[1], true ).addField( created[0], created[1], true ).addField( manager[0], ( managerlist || lang.overview.none ), true ).addField( official[0], official[1], true );
				}
				embed.addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setTimestamp( client.readyTimestamp ).setFooter( lang.overview.inaccurate );
				if ( site ) {
					if ( description[1] ) embed.addField( description[0], description[1] )
					if ( image[1] ) embed.addField( image[0], image[1] ).setImage( image[1] );
				}
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n\n';
				if ( site ) text += name.join(' ') + '\n' + created.join(' ') + '\n' + manager[0] + ' ' + ( manager[1].join(', ') || lang.overview.none ) + '\n' + official.join(' ') + '\n';
				text += articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ');
				if ( site ) {
					if ( description[1] ) text += '\n' + description.join(' ');
					if ( image[1] ) {
						text += '\n' + image.join(' ');
						if ( msg.uploadFiles() ) embed.files = [{attachment:image[1],name:( spoiler ? 'SPOILER ' : '' ) + name[1] + image[1].substring(image[1].lastIndexOf('.'))}];
					}
				}
				text += '\n\n*' + lang.overview.inaccurate + '*';
			}
			
			msg.sendChannel( spoiler + text + spoiler, embed );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

function cmd_bug(lang, mclang, msg, args, title, cmd, querystring, fragment, reaction, spoiler) {
	var invoke = args[0];
	args = args.slice(1);
	if ( invoke && /\d+$/.test(invoke) && !args.length ) {
		var project = '';
		if ( /^\d+$/.test(invoke) ) project = 'MC-';
		request( {
			uri: 'https://bugs.mojang.com/rest/api/2/issue/' + encodeURIComponent( project + invoke ) + '?fields=summary,issuelinks,fixVersions,resolution,status',
			json: true
		}, function( error, response, body ) {
			var link = 'https://bugs.mojang.com/browse/';
			if ( error || !response || response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'Issue Does Not Exist' ) ) {
						msg.reactEmoji('🤷');
					}
					else if ( body.errorMessages.includes( 'You do not have the permission to see the specified issue.' ) ) {
						msg.sendChannel( spoiler + mclang.bug.private + '\n<' + link + project + invoke + '>' + spoiler );
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issue: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issue: ' + ( error || body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + link + project + invoke + '>' + spoiler );
				}
			}
			else {
				if ( !body.fields ) {
					msg.reactEmoji('error');
				}
				else {
					var bugs = body.fields.issuelinks.filter( bug => bug.outwardIssue || ( bug.inwardIssue && bug.type.name != 'Duplicate' ) );
					if ( bugs.length ) {
						var embed = new Discord.RichEmbed();
						var extrabugs = [];
						bugs.forEach( bug => {
							var ward = ( bug.outwardIssue ? 'outward' : 'inward' );
							var issue = bug[ward + 'Issue'];
							var name = bug.type[ward] + ' ' + issue.key;
							var value = issue.fields.status.name + ': [' + issue.fields.summary.escapeFormatting() + '](' + link + issue.key + ')';
							if ( embed.fields.length < 25 ) embed.addField( name, value );
							else extrabugs.push({name,value,inline:false});
						} );
						if ( extrabugs.length ) embed.setFooter( mclang.bug.more.replaceSave( '%s', extrabugs.length ) );
					}
					var status = '**' + ( body.fields.resolution ? body.fields.resolution.name : body.fields.status.name ) + ':** ';
					var fixed = '';
					if ( body.fields.resolution && body.fields.fixVersions && body.fields.fixVersions.length ) {
						fixed = '\n' + mclang.bug.fixed + ' ' + body.fields.fixVersions.map( v => v.name ).join(', ');
					}
					msg.sendChannel( spoiler + status + body.fields.summary.escapeFormatting() + '\n<' + link + body.key + '>' + fixed + spoiler, embed );
				}
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else if ( invoke && invoke.toLowerCase() === 'version' && args.length && args.join(' ').length < 100 ) {
		var jql = 'fixVersion="' + args.join(' ').replace( /("|\\)/g, '\\$1' ).toSearch() + '"+order+by+key';
		request( {
			uri: 'https://bugs.mojang.com/rest/api/2/search?fields=summary,resolution,status&jql=' + jql + '&maxResults=25',
			json: true
		}, function( error, response, body ) {
			var link = 'https://bugs.mojang.com/issues/?jql=' + jql;
			if ( error || !response || response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'The value \'' + args.join(' ') + '\' does not exist for the field \'fixVersion\'.' ) ) {
						msg.reactEmoji('🤷');
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issues: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issues: ' + ( error || body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + link + '>' + spoiler );
				}
			}
			else {
				if ( !body.issues ) {
					msg.reactEmoji('error');
				}
				else {
					if ( body.total > 0 ) {
						var embed = new Discord.RichEmbed();
						body.issues.forEach( bug => {
							var status = ( bug.fields.resolution ? bug.fields.resolution.name : bug.fields.status.name );
							var value = status + ': [' + bug.fields.summary.escapeFormatting() + '](https://bugs.mojang.com/browse/' + bug.key + ')';
							embed.addField( bug.key, value );
						} );
						if ( body.total > 25 ) embed.setFooter( mclang.bug.more.replaceSave( '%s', body.total - 25 ) );
					}
					var total = '**' + args.join(' ') + ':** ' + mclang.bug.total.replaceSave( '%s', body.total );
					msg.sendChannel( spoiler + total + '\n<' + link + '>' + spoiler, embed );
				}
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else {
		msg.notminecraft = true;
		check_wiki(lang, msg, title, mclang.link, cmd, reaction, spoiler, querystring, fragment);
	}
}

function cmd_befehl(lang, mclang, msg, befehl, args, title, cmd, querystring, fragment, reaction, spoiler) {
	befehl = befehl.toLowerCase();
	var aliasCmd = ( minecraft.cmd.aliase[befehl] || befehl );
	
	if ( aliasCmd in minecraft.cmd.list ) {
		var regex = new RegExp('/' + aliasCmd, 'g');
		var cmdSyntax = minecraft.cmd.list[aliasCmd].join( '\n' ).replaceSave( regex, '/' + befehl );
		msg.sendChannel( spoiler + '```md\n' + cmdSyntax + '```<' + mclang.link + mclang.cmd.page + aliasCmd + '>' + spoiler, {split:{maxLength:2000,prepend:spoiler + '```md\n',append:'```' + spoiler}} );
		if ( reaction ) reaction.removeEmoji();
	}
	else {
		msg.reactEmoji('❓');
		msg.notminecraft = true;
		check_wiki(lang, msg, title, mclang.link, cmd, reaction, spoiler, querystring, fragment);
	}
}

function cmd_befehl2(lang, mclang, msg, args, title, cmd, querystring, fragment, reaction, spoiler) {
	if ( args.join('') ) {
		if ( args[0].startsWith( '/' ) ) cmd_befehl(lang, mclang, msg, args[0].substring(1), args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
		else cmd_befehl(lang, mclang, msg, args[0], args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
	}
	else {
		msg.notminecraft = true;
		check_wiki(lang, msg, title, mclang.link, cmd, reaction, spoiler, querystring, fragment);
	}
}

function cmd_multiline(lang, msg, args, line) {
	if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		if ( msg.isAdmin() ) msg.reactEmoji('error', true);
		else msg.reactEmoji('❌');
	}
}

function cmd_voice(lang, msg, args, line) {
	if ( msg.isAdmin() && !args.join('') ) msg.replyMsg( lang.voice.text + '\n`' + lang.voice.channel + ' – <' + lang.voice.name + '>`' );
	else cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
}

function cmd_get(lang, msg, args, line) {
	var id = args.join().replace( /^\\?<(?:@!?|#)(\d+)>$/, '$1' );
	if ( /^\d+$/.test(id) ) {
		if ( client.guilds.has(id) ) {
			var guild = client.guilds.get(id);
			var guildname = ['Guild:', guild.name.escapeFormatting() + ' `' + guild.id + '`' + ( pause[guild.id] ? '\\*' : '' )];
			var guildowner = ['Owner:', guild.owner.user.tag.escapeFormatting() + ' `' + guild.ownerID + '` ' + guild.owner.toString()];
			var guildsize = ['Size:', guild.memberCount + ' members (' + guild.members.filter( member => member.user.bot ).size + ' bots)'];
			var guildpermissions = ['Missing permissions:', ( guild.me.permissions.has(defaultPermissions) ? '*none*' : '`' + guild.me.permissions.missing(defaultPermissions).join('`, `') + '`' )];
			var guildsettings = ['Settings:', ( guild.id in settings ? '```json\n' + JSON.stringify( settings[guild.id], null, '\t' ) + '\n```' : '*default*' )];
			if ( msg.showEmbed() ) {
				var text = '';
				var embed = new Discord.RichEmbed().addField( guildname[0], guildname[1] ).addField( guildowner[0], guildowner[1] ).addField( guildsize[0], guildsize[1] ).addField( guildpermissions[0], guildpermissions[1] );
				var split = Discord.Util.splitMessage( guildsettings[1], {maxLength:1000,prepend:'```json\n{',append:'\n```'} );
				if ( split.length < guildsettings[1].length ) split.forEach( guildsettingspart => embed.addField( guildsettings[0], guildsettingspart ) );
				else embed.addField( guildsettings[0], split );
			}
			else {
				var embed = {};
				var text = guildname.join(' ') + '\n' + guildowner.join(' ') + '\n' + guildsize.join(' ') + '\n' + guildpermissions.join(' ') + '\n' + guildsettings.join(' ');
			}
			msg.sendChannel( text, {embed,split:{prepend:'```json\n{',append:'\n```'}}, true );
		} else if ( client.guilds.some( guild => guild.members.has(id) ) ) {
			var username = [];
			var guildlist = ['Guilds:'];
			var guilds = client.guilds.filter( guild => guild.members.has(id) );
			guildlist.push('\n' + guilds.map( function(guild) {
				var member = guild.members.get(id);
				if ( !username.length ) username.push('User:', member.user.tag.escapeFormatting() + ' `' + member.id + '` ' + member.toString());
				return guild.name.escapeFormatting() + ' `' + guild.id + '`' + ( member.permissions.has('MANAGE_GUILD') ? '\\*' : '' );
			} ).join('\n'));
			if ( guildlist[1].length > 1000 ) guildlist[1] = guilds.size;
			if ( msg.showEmbed() ) {
				var text = '';
				var embed = new Discord.RichEmbed().addField( username[0], username[1] ).addField( guildlist[0], guildlist[1] );
			}
			else {
				var embed = {};
				var text = username.join(' ') + '\n' + guildlist.join(' ');
			}
			msg.sendChannel( text, embed, true );
		} else if ( client.guilds.some( guild => guild.channels.filter( chat => chat.type === 'text' ).has(id) ) ) {
			var channel = client.guilds.find( guild => guild.channels.filter( chat => chat.type === 'text' ).has(id) ).channels.get(id);
			var channelguild = ['Guild:', channel.guild.name.escapeFormatting() + ' `' + channel.guild.id + '`' + ( pause[channel.guild.id] ? '\\*' : '' )];
			var channelname = ['Channel:', '#' + channel.name.escapeFormatting() + ' `' + channel.id + '` ' + channel.toString()];
			var channelpermissions = ['Missing permissions:', ( channel.memberPermissions(channel.guild.me).has(defaultPermissions) ? '*none*' : '`' + channel.memberPermissions(channel.guild.me).missing(defaultPermissions).join('`, `') + '`' )];
			var channelwiki = ['Default Wiki:', channel.getWiki()];
			if ( msg.showEmbed() ) {
				var text = '';
				var embed = new Discord.RichEmbed().addField( channelguild[0], channelguild[1] ).addField( channelname[0], channelname[1] ).addField( channelpermissions[0], channelpermissions[1] ).addField( channelwiki[0], channelwiki[1] );
			}
			else {
				var embed = {};
				var text = channelguild.join(' ') + '\n' + channelname.join(' ') + '\n' + channelpermissions.join(' ') + '\n' + channelwiki[0] + ' <' + channelwiki[1] + '>';
			}
			msg.sendChannel( text, embed, true );
		} else msg.replyMsg( 'I couldn\'t find a result for `' + id + '`', {}, true );
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
}

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

function htmlToDiscord(html) {
	var text = '';
	var parser = new htmlparser.Parser( {
		onopentag: (tagname, attribs) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		},
		ontext: (htmltext) => {
			text += htmltext.escapeFormatting();
		},
		onclosetag: (tagname) => {
			switch (tagname) {
				case 'b':
					text += '**';
					break;
				case 'i':
					text += '*';
					break;
				case 's':
					text += '~~';
					break;
				case 'u':
					text += '__';
					break;
			}
		}
	}, {decodeEntities:true} );
	parser.write( html );
	parser.end();
	return text;
};

String.prototype.toLink = function() {
	if ( this.endsWith( '.org/w/' ) ) return this.substring(0, this.length - 2) + 'wiki/';
	else return this;
};

String.prototype.isMention = function(guild) {
	var text = this.trim();
	return text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.me.displayName );
};

Discord.Channel.prototype.getWiki = function() {
	if ( this.type === 'text' && this.guild.id in settings ) {
		if ( settings[this.guild.id].channels && this.id in settings[this.guild.id].channels ) return settings[this.guild.id].channels[this.id];
		else return settings[this.guild.id].wiki;
	}
	else return settings.default.wiki;
};

Discord.Message.prototype.isAdmin = function() {
	return this.channel.type === 'text' && this.member && this.member.permissions.has('MANAGE_GUILD');
};

Discord.Message.prototype.isOwner = function() {
	return this.author.id === process.env.owner;
};

Discord.Message.prototype.showEmbed = function() {
	return this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('EMBED_LINKS');
};

Discord.Message.prototype.uploadFiles = function() {
	return this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('ATTACH_FILES');
};

Array.prototype.toEmojis = function() {
	var text = this.join(' ');
	var regex = /(<a?:)(\d+)(>)/g;
	if ( regex.test(text) ) {
		regex.lastIndex = 0;
		var emojis = client.emojis;
		while ( ( entry = regex.exec(text) ) !== null ) {
			if ( emojis.has(entry[2]) ) {
				text = text.replaceSave(entry[0], emojis.get(entry[2]).toString());
			} else {
				text = text.replaceSave(entry[0], entry[1] + 'unknown_emoji:' + entry[2] + entry[3]);
			}
		}
		return text.split(' ');
	}
	else return this;
};

String.prototype.toTitle = function(isMarkdown = false) {
	var title = this.replace( / /g, '_' ).replace( /\%/g, '%25' ).replace( /\?/g, '%3F' ).replace( /@(here|everyone)/g, '%40$1' );
	if ( isMarkdown ) title = title.replace( /(\(|\))/g, '\\$1' );
	return title;
};

String.prototype.toSearch = function() {
	return encodeURIComponent( this ).replace( /%20/g, '+' );
};

String.prototype.toSection = function() {
	return encodeURIComponent( this.replace( / /g, '_' ) ).replace( /\'/g, '%27' ).replace( /\(/g, '%28' ).replace( /\)/g, '%29' ).replace( /\%/g, '.' );
};

String.prototype.toFormatting = function(showEmbed = false, ...args) {
	if ( showEmbed ) return this.toMarkdown(...args);
	else return this.toPlaintext();
};

String.prototype.toMarkdown = function(wiki, title = '') {
	var text = this;
	while ( ( link = /\[\[(?:([^\|\]]+)\|)?([^\]]+)\]\]([a-z]*)/g.exec(text) ) !== null ) {
		if ( link[1] ) {
			var page = ( /^(#|\/)/.test(link[1]) ? title.toTitle(true) + ( /^#/.test(link[1]) ? '#' + link[1].substring(1).toSection() : link[1].toTitle(true) ) : link[1].toTitle(true) );
			text = text.replaceSave( link[0], '[' + link[2] + link[3] + '](' + wiki.toLink() + page + ')' );
		} else {
			var page = ( /^(#|\/)/.test(link[2]) ? title.toTitle(true) + ( /^#/.test(link[2]) ? '#' + link[2].substring(1).toSection() : link[2].toTitle(true) ) : link[2].toTitle(true) );
			text = text.replaceSave( link[0], '[' + link[2] + link[3] + '](' + wiki.toLink() + page + ')' );
		}
	}
	while ( title !== '' && ( link = /\/\*\s*([^\*]+?)\s*\*\/\s*(.)?/g.exec(text) ) !== null ) {
		var page = title.toTitle(true) + '#' + link[1].toSection();
		text = text.replaceSave( link[0], '[→](' + wiki.toLink() + page + ')' + link[1] + ( link[2] ? ': ' + link[2] : '' ) );
	}
	return text.escapeFormatting();
};

String.prototype.toPlaintext = function() {
	return this.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' ).escapeFormatting();
};

String.prototype.escapeFormatting = function() {
	return this.replace( /(`|_|\*|~|:|<|>|{|}|@|\||\\|\/\/)/g, '\\$1' );
};

String.prototype.replaceSave = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replace( '$', '$$$$' ) : replacement ) );
};

Discord.Message.prototype.reactEmoji = function(name, ignorePause = false) {
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
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
		return this.react(emoji).catch(log_error);
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

Discord.MessageReaction.prototype.removeEmoji = function() {
	return this.remove().catch(log_error);
};

Discord.Message.prototype.sendChannel = function(content, options, ignorePause = false) {
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		return this.channel.send(content, options).then( msg => {
			if ( msg.length ) msg.forEach( message => message.allowDelete(this.author.id) );
			else msg.allowDelete(this.author.id);
			return msg;
		}, log_error );
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

Discord.Message.prototype.sendChannelError = function(content, options) {
	return this.channel.send(content, options).then( msg => {
		if ( msg.length ) msg.forEach( message => {
			message.reactEmoji('error');
			message.allowDelete(this.author.id);
		} );
		else {
			msg.reactEmoji('error');
			msg.allowDelete(this.author.id);
		}
		return msg;
	}, log_error );
};

Discord.Message.prototype.replyMsg = function(content, options, ignorePause = false) {
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		return this.reply(content, options).then( msg => {
			if ( msg.length ) msg.forEach( message => message.allowDelete(this.author.id) );
			else msg.allowDelete(this.author.id);
			return msg;
		}, log_error );
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

Discord.Message.prototype.deleteMsg = function(timeout = 0) {
	return this.delete(timeout).catch(log_error);
};

Discord.Message.prototype.allowDelete = function(author) {
	return this.awaitReactions( (reaction, user) => reaction.emoji.name === '🗑' && user.id === author, {max:1,time:60000} ).then( reaction => {
		if ( reaction.size ) {
			this.deleteMsg();
		}
	} );
};

String.prototype.hasPrefix = function(flags = '') {
	return RegExp( '^' + process.env.prefix + '(?: |$)', flags ).test(this.replace( /\u200b/g, '' ).toLowerCase());
};

client.on( 'message', msg => {
	if ( stop || msg.type !== 'DEFAULT' || !msg.content.hasPrefix('m') || msg.webhookID || msg.author.id === client.user.id ) return;
	
	var cont = msg.content;
	var author = msg.author;
	var channel = msg.channel;
	if ( channel.type === 'text' ) var permissions = channel.permissionsFor(client.user);
	
	if ( !ready.settings && settings === defaultSettings ) getSettings();
	if ( !ready.allSites && !allSites.length ) getAllSites();
	if ( settings === defaultSettings ) {
		msg.sendChannel( '⚠ **Limited Functionality** ⚠\nNo settings found, please contact the bot owner!\n' + process.env.invite, {}, true );
	}
	var lang = i18n[( channel.type === 'text' && settings[msg.guild.id] || settings.default ).lang];
	
	if ( channel.type !== 'text' || permissions.has(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']) ) {
		var invoke = ( cont.split(' ')[1] ? cont.split(' ')[1].split('\n')[0].toLowerCase() : '' );
		var aliasInvoke = ( lang.aliase[invoke] || invoke );
		var ownercmd = ( msg.isOwner() && aliasInvoke in ownercmdmap );
		if ( cont.hasPrefix() && ( ( msg.isAdmin() && aliasInvoke in multilinecmdmap ) || ownercmd ) ) {
			if ( ownercmd || permissions.has('MANAGE_MESSAGES') ) {
				var args = cont.split(' ').slice(2);
				if ( cont.split(' ')[1].split('\n')[1] ) args.unshift( '', cont.split(' ')[1].split('\n')[1] );
				if ( !( ownercmd || aliasInvoke in pausecmdmap ) && pause[msg.guild.id] ) console.log( msg.guild.name + ': Paused' );
				else console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + cont );
				if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, cont);
				else if ( !pause[msg.guild.id] || aliasInvoke in pausecmdmap ) multilinecmdmap[aliasInvoke](lang, msg, args, cont);
			} else {
				console.log( msg.guild.name + ': Missing permissions - MANAGE_MESSAGES' );
				msg.replyMsg( lang.missingperm + ' `MANAGE_MESSAGES`' );
			}
		} else {
			var count = 0;
			msg.cleanContent.replace( /\u200b/g, '' ).split('\n').forEach( function(line) {
				if ( line.hasPrefix() && count < 10 ) {
					count++;
					invoke = ( line.split(' ')[1] ? line.split(' ')[1].toLowerCase() : '' );
					var args = line.split(' ').slice(2);
					aliasInvoke = ( lang.aliase[invoke] || invoke );
					ownercmd = ( msg.isOwner() && aliasInvoke in ownercmdmap );
					if ( channel.type === 'text' && pause[msg.guild.id] && !( ( msg.isAdmin() && aliasInvoke in pausecmdmap ) || ownercmd ) ) console.log( msg.guild.name + ': Paused' );
					else console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + line );
					if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, line);
					else if ( channel.type !== 'text' || !pause[msg.guild.id] || ( msg.isAdmin() && aliasInvoke in pausecmdmap ) ) {
						if ( aliasInvoke in cmdmap ) cmdmap[aliasInvoke](lang, msg, args, line);
						else if ( /^![a-z\d-]{1,50}$/.test(invoke) ) cmd_link(lang, msg, args.join(' '), 'https://' + invoke.substring(1) + '.gamepedia.com/', ' ' + invoke + ' ');
						else cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
					}
				} else if ( line.hasPrefix() && count === 10 ) {
					count++;
					console.log( '- Message contains too many commands!' );
					msg.reactEmoji('⚠');
					msg.sendChannelError( lang.limit.replaceSave( '%s', author ) );
				}
			} );
		}
	} else if ( msg.isAdmin() || msg.isOwner() ) {
		var missing = permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']);
		console.log( msg.guild.name + ': Missing permissions - ' + missing.join(', ') );
		if ( !missing.includes( 'SEND_MESSAGES' ) ) msg.replyMsg( lang.missingperm + ' `' + missing.join('`, `') + '`' );
	}
} );


client.on( 'voiceStateUpdate', (oldm, newm) => {
	if ( stop ) return;
	
	if ( !ready.settings && settings === defaultSettings ) getSettings();
	if ( !ready.allSites && !allSites.length ) getAllSites();
	if ( oldm.guild.me.permissions.has('MANAGE_ROLES') && oldm.voiceChannelID !== newm.voiceChannelID ) {
		var lang = i18n[( settings[oldm.guild.id] || settings.default ).lang].voice;
		if ( oldm.voiceChannel ) {
			var oldrole = oldm.roles.find( role => role.name === lang.channel + ' – ' + oldm.voiceChannel.name );
			if ( oldrole && oldrole.comparePositionTo(oldm.guild.me.highestRole) < 0 ) {
				console.log( oldm.guild.name + ': ' + oldm.displayName + ' left the voice channel "' + oldm.voiceChannel.name + '".' );
				oldm.removeRole( oldrole, lang.left.replaceSave( '%1$s', oldm.displayName ).replaceSave( '%2$s', oldm.voiceChannel.name ) ).catch(log_error);
			}
		}
		if ( newm.voiceChannel ) {
			var newrole = newm.guild.roles.find( role => role.name === lang.channel + ' – ' + newm.voiceChannel.name );
			if ( newrole && newrole.comparePositionTo(newm.guild.me.highestRole) < 0 ) {
				console.log( newm.guild.name + ': ' + newm.displayName + ' joined the voice channel "' + newm.voiceChannel.name + '".' );
				newm.addRole( newrole, lang.join.replaceSave( '%1$s', newm.displayName ).replaceSave( '%2$s', newm.voiceChannel.name ) ).catch(log_error);
			}
		}
	}
} );


client.on( 'guildCreate', guild => {
	console.log( '- I\'ve been added to a server.' );
} );

client.on( 'guildDelete', guild => {
	console.log( '- I\'ve been removed from a server.' );
	if ( !guild.available ) {
		console.log( '- ' + guild.name + ': This server isn\'t responding.' );
		return;
	}
	
	if ( settings === defaultSettings ) {
		console.log( '- Error while getting current settings.' );
	}
	else {
		var temp_settings = JSON.parse(JSON.stringify(settings));
		var save = false;
		Object.keys(temp_settings).forEach( function(guild) {
			if ( !client.guilds.has(guild) && guild !== 'default' ) {
				delete temp_settings[guild];
				save = true;
			}
		} );
		if ( save ) request.post( {
			uri: process.env.save,
			headers: access,
			body: {
				branch: 'master',
				commit_message: client.user.username + ': Settings removed',
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
			if ( error || !response || response.statusCode !== 201 || !body || body.error ) {
				console.log( '- ' + ( response && response.statusCode ) + ': Error while removing the settings: ' + ( error || body && ( body.message || body.error ) ) );
			}
			else {
				settings = JSON.parse(JSON.stringify(temp_settings));
				console.log( '- Settings successfully removed.' );
			}
		} );
	}
} );


client.login(process.env.token).catch( error => {
	log_error(error, true, 'LOGIN-');
	client.login(process.env.token).catch( error => {
		log_error(error, true, 'LOGIN-');
		client.login(process.env.token).catch( error => {
			log_error(error, true, 'LOGIN-');
			process.exit(1);
		} );
	} );
} );


client.on( 'error', error => log_error(error, true) );
client.on( 'warn', warning => log_warn(warning, false) );

if ( isDebug ) client.on( 'debug', debug => {
	if ( isDebug ) console.log( '- Debug: ' + debug );
} );


function log_error(error, isBig = false, type = '') {
	var time = new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
	if ( isDebug ) {
		console.error( '--- ' + type + 'ERROR START ' + time + ' ---\n', error, '\n--- ' + type + 'ERROR END ' + time + ' ---' );
	} else {
		if ( isBig ) console.log( '--- ' + type + 'ERROR: ' + time + ' ---\n-', error );
		else console.log( '- ' + error.name + ': ' + error.message );
	}
}

function log_warn(warning, api = true) {
	if ( isDebug ) {
		console.warn( '--- Warning start ---\n' + util.inspect( warning ) + '\n--- Warning end ---' );
	} else {
		if ( api ) console.warn( '- Warning: ' + Object.keys(warning).join(', ') );
		else console.warn( '--- Warning ---\n' + util.inspect( warning ) );
	}
}

async function graceful(code = 0) {
	stop = true;
	console.log( '- SIGTERM: Preparing to close...' );
	setTimeout( async () => {
		console.log( '- SIGTERM: Destroying client...' );
		await client.destroy();
		setTimeout( async () => {
			console.log( '- SIGTERM: Closing takes too long, terminating!' );
			process.exit(code);
		}, 1000 ).unref();
	}, 2000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
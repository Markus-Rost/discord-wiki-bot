require('dotenv').config();
const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

const Discord = require('discord.js');
const DBL = require('dblapi.js');
var request = require('request');
var htmlparser = require('htmlparser2');

var client = new Discord.Client( {disableEveryone:true} );
const dbl = new DBL(process.env.dbltoken);

var i18n = require('./i18n/allLangs.json');
Object.keys(i18n.allLangs[1]).forEach( lang => i18n[lang] = require('./i18n/' + lang + '.json') );
var minecraft = require('./minecraft.json');
var multiManager = require('./wiki_manager.json');

var pause = {};
var stop = false;
var isDebug = ( process.argv[2] === 'debug' ? true : false );
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
			console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the settings' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
			ready.settings = false;
		}
		else {
			console.log( '- Settings successfully loaded.' );
			settings = JSON.parse(JSON.stringify(body));
		}
		setStatus();
	} );
}

function setStatus() {
	if ( settings === defaultSettings ) client.user.setStatus('invisible').catch(log_error);
	else {
		client.user.setStatus('online').catch(log_error);
		client.user.setActivity( process.env.prefix + ' help' ).catch(log_error);
	}
}

var allSites = [];

function getAllSites() {
	ready.allSites = true;
	request( {
		uri: 'https://help.gamepedia.com/api.php?action=allsites&formatversion=2&do=getSiteStats&filter=wikis|wiki_domain,wiki_display_name,wiki_managers,official_wiki,created,ss_good_articles,ss_total_pages,ss_total_edits,ss_active_users&format=json',
		json: true
	}, function( error, response, body ) {
		if ( error || !response || response.statusCode !== 200 || !body || body.status !== 'okay' || !body.data || !body.data.wikis ) {
			console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while gettings all sites' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
			ready.allSites = false;
		}
		else {
			console.log( '- Sites successfully loaded.' );
			allSites = JSON.parse(JSON.stringify(body.data.wikis.filter( site => /^[a-z\d-]{1,50}\.gamepedia\.com$/.test(site.wiki_domain) )));
			allSites.filter( site => site.wiki_domain in multiManager ).forEach( function(site) {
				site.wiki_managers = multiManager[site.wiki_domain].concat(site.wiki_managers).filter( (value, index, self) => self.indexOf(value) === index );
			} );
			allSites.filter( site => site.wiki_managers.length === 0 ).forEach( site => site.wiki_managers.push('MediaWiki default') );
		}
	} );
}

client.on( 'ready', () => {
	console.log( '- Successfully logged in as ' + client.user.username + '!' );
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
		} );
	}, 10800000 );
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
				} else msg.replyMsg( text, {}, true );
			}
		} else msg.replyMsg( text, {}, true );
	} else {
		msg.reactEmoji('❌');
	}
}

function find_wikis(lang, msg, key, value, text) {
	if ( allSites.some( site => site.wiki_domain === value.join('') + '.gamepedia.com' ) ) {
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
			if ( !( msg.guild.id in temp_settings ) ) temp_settings[msg.guild.id] = Object.assign({}, settings['default']);
			if ( key === 'channel' ) {
				if ( !temp_settings[msg.guild.id].channels ) temp_settings[msg.guild.id].channels = {};
				temp_settings[msg.guild.id].channels[msg.channel.id] = value;
			} else temp_settings[msg.guild.id][key] = value;
			Object.keys(temp_settings).forEach( function(guild) {
				if ( !client.guilds.has(guild) && guild !== 'default' ) {
					delete temp_settings[guild];
				} else {
					var channels = temp_settings[guild].channels;
					if ( channels ) {
						Object.keys(channels).forEach( function(channel) {
							if ( channels[channel] === temp_settings[guild].wiki || !client.guilds.get(guild).channels.has(channel) ) delete channels[channel];
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
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while editing the settings' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
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
		}
	} );
}

function cmd_info(lang, msg, args, line) {
	if ( args.join('') ) cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	else {
		var owner = '*MarkusRost*';
		if ( msg.channel.type === 'text' && msg.guild.members.has(process.env.owner) ) owner = '<@' + process.env.owner + '>';
		msg.sendChannel( lang.disclaimer.replaceSave( '%s', owner ) );
		cmd_helpserver(lang, msg);
		cmd_invite(lang, msg, args, line);
	}
}

function cmd_helpserver(lang, msg) {
	msg.sendChannel( lang.helpserver + '\n' + process.env.invite );
}

function cmd_help(lang, msg, args, line) {
	if ( msg.channel.type === 'text' && pause[msg.guild.id] && ( args.join('') || !msg.isAdmin() ) ) return;
	if ( msg.isAdmin() && !( msg.guild.id in settings ) && settings !== defaultSettings ) {
		cmd_settings(lang, msg, [], line);
		cmd_helpserver(lang, msg);
	}
	var cmds = lang.help.list;
	var isMinecraft = ( lang.link === minecraft[lang.lang].link );
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
		var cmdlist = lang.help.all + '\n' + cmds.filter( cmd => !cmd.hide && !cmd.admin && ( !cmd.minecraft || isMinecraft ) ).map( cmd => cmdintro + cmd.cmd + '`\n\t' + cmd.desc ).join('\n');
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
			} else if ( reaction === '' ) {
			} else {
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
		var text = lang.test.default;
		var x = Math.floor(Math.random() * lang.test.random);
		if ( x < lang.test.text.length ) text = lang.test.text[x];
		console.log( '- Test: Fully functioning!' );
		var now = Date.now();
		if ( msg.showEmbed() ) msg.replyMsg( text ).then( edit => {
			var then = Date.now();
			var embed = new Discord.RichEmbed().setTitle( lang.test.time ).addField( 'Discord', ( then - now ) + 'ms' );
			now = Date.now();
			request( {
				uri: lang.link + 'api.php?action=query&format=json',
				json: true
			}, function( error, response, body ) {
				then = Date.now();
				if ( body && body.warnings ) log_warn(body.warnings);
				var ping = ( then - now ) + 'ms';
				if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !( body instanceof Object ) ) {
					if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
						console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
						ping += ' <:unknown_wiki:505887262077353984>';
					}
					else {
						console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while reaching the wiki' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
						ping += ' <:error:505887261200613376>';
					}
				}
				embed.addField( lang.link, ping );
				if ( edit ) edit.edit( edit.content, embed ).catch(log_error);
			} );
		} );
	} else {
		console.log( '- Test: Paused!' );
		msg.replyMsg( lang.test.pause, {}, true );
	}
}

function cmd_invite(lang, msg, args, line) {
	if ( args.join('') ) {
		cmd_link(lang, msg, line.split(' ').slice(1).join(' '));
	} else {
		client.generateInvite(defaultPermissions).then( invite => msg.sendChannel( lang.invite.bot + '\n<' + invite + '>' ), log_error );
	}
}

async function cmd_eval(lang, msg, args, line) {
	try {
		var text = util.inspect( await eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.name + ': ' + error.message;
	}
	if ( text.length > 2000 ) msg.reactEmoji('✅', true);
	else msg.sendChannel( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'}}, true );
	if ( isDebug ) console.log( '--- EVAL START ---\n\u200b' + text.replace( /\n/g, '\n\u200b' ) + '\n--- EVAL END ---' );
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

function cmd_link(lang, msg, title, wiki = lang.link, cmd = ' ') {
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
	var args = title.split(' ').slice(1);
	
	var mclang = minecraft[lang.lang];
	var aliasInvoke = ( invoke in mclang.aliase ) ? mclang.aliase[invoke] : invoke;
	if ( !msg.notminecraft && wiki === mclang.link && ( aliasInvoke in minecraftcmdmap || invoke.startsWith('/') ) ) {
		if ( aliasInvoke in minecraftcmdmap ) minecraftcmdmap[aliasInvoke](lang, mclang, msg, args, title, cmd, querystring, fragment, reaction, spoiler);
		else cmd_befehl(lang, mclang, msg, invoke.substring(1), args, title, cmd, querystring, fragment, reaction, spoiler);
	}
	else if ( ( invoke === 'random' || invoke === '🎲' || invoke === lang.search.random ) && !args.join('') && !linksuffix ) cmd_random(lang, msg, wiki, reaction, spoiler);
	else if ( ( invoke === 'overview' || invoke === lang.search.overview ) && !args.join('') && !linksuffix && wiki.endsWith( '.gamepedia.com/' ) ) cmd_overview(lang, msg, wiki, reaction, spoiler);
	else if ( invoke === 'page' || invoke === lang.search.page ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink() + args.join('_').toTitle() + linksuffix + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( invoke === 'search' || invoke === lang.search.search ) {
		msg.sendChannel( spoiler + '<' + wiki.toLink() + 'Special:Search/' + args.join('_').toTitle() + linksuffix + '>' + spoiler );
		if ( reaction ) reaction.removeEmoji();
	}
	else if ( invoke === 'diff' && args.join('') ) cmd_diff(lang, msg, args, wiki, reaction, spoiler);
	else {
		var noRedirect = ( /(?:^|&)redirect=no(?:&|$)/.test(querystring) || /(?:^|&)action=(?!view(?:&|$))/.test(querystring) );
		request( {
			uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general|namespaces|specialpagealiases&iwurl=true' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageimages|categoryinfo|pageprops|extracts&ppprop=description&exsentences=10&exintro=true&explaintext=true&titles=' + encodeURIComponent( title ) + '&format=json',
			json: true
		}, function( error, response, body ) {
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
				if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
					console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + ( linksuffix || !title ? title.toTitle() + linksuffix : 'Special:Search/' + title.toTitle() ) + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				if ( body.query.pages ) {
					var querypage = Object.values(body.query.pages)[0];
					if ( body.query.redirects && body.query.redirects[0].from.split(':')[0] === body.query.namespaces['-1']['*'] && body.query.specialpagealiases.filter( sp => ['Mypage','Mytalk','MyLanguage'].includes( sp.realname ) ).map( sp => sp.aliases[0] ).includes( body.query.redirects[0].from.split(':').slice(1).join(':').split('/')[0].replace( / /g, '_' ) ) ) {
						querypage.title = body.query.redirects[0].from;
						delete body.query.redirects[0].tofragment;
						delete querypage.missing;
						querypage.ns = -1;
						querypage.special = '';
					}
					
					var contribs = body.query.namespaces['-1']['*'] + ':' + body.query.specialpagealiases.find( sp => sp.realname === 'Contributions' ).aliases[0] + '/';
					if ( ( querypage.ns === 2 || querypage.ns === 202 ) && ( !querypage.title.includes( '/' ) || /^[^:]+:(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{2}|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}\/\d{2,3})$/.test(querypage.title) ) ) {
						var userparts = querypage.title.split(':');
						querypage.noRedirect = noRedirect;
						cmd_user(lang, msg, userparts[0].toTitle() + ':', userparts.slice(1).join(':'), wiki, linksuffix, querypage, contribs.toTitle(), reaction, spoiler);
					}
					else if ( querypage.ns === -1 && querypage.title.startsWith(contribs) && querypage.title.length > contribs.length ) {
						var username = querypage.title.split('/').slice(1).join('/');
						request( {
							uri: wiki + 'api.php?action=query&titles=User:' + encodeURIComponent( username ) + '&format=json',
							json: true
						}, function( uerror, uresponse, ubody ) {
							if ( uerror || !uresponse || uresponse.statusCode !== 200 || !ubody || ubody.batchcomplete === undefined || !ubody.query ) {
								console.log( '- ' + ( uresponse ? uresponse.statusCode + ': ' : '' ) + 'Error while getting the user' + ( uerror ? ': ' + uerror : ( ubody ? ( ubody.error ? ': ' + ubody.error.info : '.' ) : '.' ) ) );
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
							uri: wiki + 'api.php?action=query&prop=pageimages|categoryinfo|pageprops|extracts&ppprop=description&exsentences=10&exintro=true&explaintext=true&generator=search&gsrnamespace=4|12|14|' + Object.values(body.query.namespaces).filter( ns => ns.content !== undefined ).map( ns => ns.id ).join('|') + '&gsrlimit=1&gsrsearch=' + encodeURIComponent( title ) + '&format=json',
							json: true
						}, function( srerror, srresponse, srbody ) {
							if ( srbody && srbody.warnings ) log_warn(srbody.warnings);
							if ( srerror || !srresponse || srresponse.statusCode !== 200 || !srbody || srbody.batchcomplete === undefined ) {
								console.log( '- ' + ( srresponse ? srresponse.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( srerror ? ': ' + srerror : ( srbody ? ( srbody.error ? ': ' + srbody.error.info : '.' ) : '.' ) ) );
								msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Search/' + title.toTitle() + '>' + spoiler );
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
									if ( querypage.pageprops && querypage.pageprops.description ) {
										var description = querypage.pageprops.description.escapeFormatting();
										if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
										embed.setDescription( description );
									}
									else if ( querypage.extract ) {
										var extract = querypage.extract.escapeFormatting();
										if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
										embed.setDescription( extract );
									}
									if ( querypage.pageimage && querypage.title !== body.query.general.mainpage ) {
										var pageimage = wiki.toLink() + 'Special:FilePath/' + querypage.pageimage + '?v=' + Date.now();
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
											category.push(langCat.pages[( pages in langCat.pages ? pages : 'default' )].replaceSave( '%s', pages ));
										}
										if ( querypage.categoryinfo.files > 0 ) {
											var files = querypage.categoryinfo.files;
											category.push(langCat.files[( files in langCat.files ? files : 'default' )].replaceSave( '%s', files ));
										}
										if ( querypage.categoryinfo.subcats > 0 ) {
											var subcats = querypage.categoryinfo.subcats;
											category.push(langCat.subcats[( subcats in langCat.subcats ? subcats : 'default' )].replaceSave( '%s', subcats ));
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
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + ( querystring ? '?' + querystring.toTitle() : '' ) + ( body.query.redirects && body.query.redirects[0].tofragment ? '#' + body.query.redirects[0].tofragment.toSection() : ( fragment ? '#' + fragment.toSection() : '' ) );
						var text = '';
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.pageprops && querypage.pageprops.description ) {
							var description = querypage.pageprops.description.escapeFormatting();
							if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
							embed.setDescription( description );
						}
						else if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage && querypage.title !== body.query.general.mainpage ) {
							var pageimage = wiki.toLink() + 'Special:FilePath/' + querypage.pageimage + '?v=' + Date.now();
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
								category.push(langCat.pages[( pages in langCat.pages ? pages : 'default' )].replaceSave( '%s', pages ));
							}
							if ( querypage.categoryinfo.files > 0 ) {
								var files = querypage.categoryinfo.files;
								category.push(langCat.files[( files in langCat.files ? files : 'default' )].replaceSave( '%s', files ));
							}
							if ( querypage.categoryinfo.subcats > 0 ) {
								var subcats = querypage.categoryinfo.subcats;
								category.push(langCat.subcats[( subcats in langCat.subcats ? subcats : 'default' )].replaceSave( '%s', subcats ));
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
					var regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50})\.gamepedia\.com\// );
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
						regex = inter.url.match( /^(?:https?:)?\/\/([a-z\d-]{1,50}\.(?:wikipedia|mediawiki|wiktionary|wikimedia|wikibooks|wikisource|wikidata|wikiversity|wikiquote|wikinews|wikivoyage)\.org\/)wiki\// );
						if ( regex !== null && selfcall < 5 ) {
							if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
								var iwtitle = decodeURIComponent( inter.url.replace( regex[0], '' ) ).replace( /\_/g, ' ' ).replaceSave( intertitle.replace( /\_/g, ' ' ), intertitle );
								selfcall++;
								check_wiki(lang, msg, iwtitle, 'https://' + regex[1] + 'w/', cmd + inter.iw + ':', reaction, spoiler, querystring, fragment, selfcall);
							} else {
								if ( reaction ) reaction.removeEmoji();
								console.log( '- Aborted, paused.' );
							}
						} else {
							if ( inter.url.includes( '#' ) ) {
								if ( !fragment ) fragment = '#' + inter.url.split('#').slice(1).join('#');
								else fragment = '#' + fragment.toSection();
								inter.url = inter.url.split('#')[0];
							}
							if ( querystring ) inter.url += ( inter.url.includes( '?' ) ? '&' : '?' ) + querystring.toTitle() + fragment;
							msg.sendChannel( spoiler + inter.url.replace( /@(here|everyone)/g, '%40$1' ) + spoiler ).then( message => {
								if ( message && selfcall === 5 ) message.reactEmoji('⚠');
							} );
							if ( reaction ) reaction.removeEmoji();
						}
					}
				}
				else {
					var pagelink = wiki.toLink() + body.query.general.mainpage.toTitle() + linksuffix;
					var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( body.query.general.mainpage.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
					request( {
						uri: wiki + 'api.php?action=query' + ( noRedirect ? '' : '&redirects=true' ) + '&prop=pageprops|extracts&ppprop=description&exsentences=10&exintro=true&explaintext=true&titles=' + encodeURIComponent( body.query.general.mainpage ) + '&format=json',
						json: true
					}, function( mperror, mpresponse, mpbody ) {
						if ( mpbody && mpbody.warnings ) log_warn(body.warnings);
						if ( mperror || !mpresponse || mpresponse.statusCode !== 200 || !mpbody || mpbody.batchcomplete === undefined || !mpbody.query ) {
							console.log( '- ' + ( mpresponse ? mpresponse.statusCode + ': ' : '' ) + 'Error while getting the main page' + ( mperror ? ': ' + mperror : ( mpbody ? ( mpbody.error ? ': ' + mpbody.error.info : '.' ) : '.' ) ) );
						} else {
							querypage = Object.values(mpbody.query.pages)[0];
							if ( querypage.pageprops && querypage.pageprops.description ) {
								var description = querypage.pageprops.description.escapeFormatting();
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

function cmd_user(lang, msg, namespace, username, wiki, linksuffix, querypage, contribs, reaction, spoiler) {
	if ( /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{2})?|(?:[\dA-F]{1,4}:){7}[\dA-F]{1,4}(?:\/\d{2,3})?)$/.test(username) ) {
		request( {
			uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=blocks&bkprop=user|by|timestamp|expiry|reason&bkip=' + encodeURIComponent( username ) + '&format=json',
			json: true
		}, function( error, response, body ) {
			if ( body && body.warnings ) log_warn(body.warnings);
			if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.blocks ) {
				if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
					console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else if ( body && body.error && ( body.error.code === 'param_ip' || body.error.code === 'cidrtoobroad' ) ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('error');
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage ) {
							var pageimage = wiki.toLink() + 'Special:FilePath/' + querypage.pageimage + '?v=' + Date.now();
							embed.setThumbnail( pageimage );
						} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
					}
				}
				else {
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + ( querypage.noRedirect ? namespace : contribs ) + username.toTitle() + linksuffix + '>' + spoiler );
				}
				
				if ( reaction ) reaction.removeEmoji();
			}
			else {
				if ( !querypage.noRedirect || ( querypage.missing === undefined && querypage.ns !== -1 ) ) namespace = contribs;
				var blocks = body.query.blocks.map( function(block) {
					var isBlocked = false;
					var blockedtimestamp = (new Date(block.timestamp)).toLocaleString(lang.user.dateformat, timeoptions);
					var blockexpiry = block.expiry;
					if ( blockexpiry === 'infinity' ) {
						blockexpiry = lang.user.block.until_infinity;
						isBlocked = true;
					} else if ( blockexpiry ) {
						if ( Date.parse(blockexpiry) > Date.now() ) isBlocked = true;
						blockexpiry = (new Date(blockexpiry)).toLocaleString(lang.user.dateformat, timeoptions);
					}
					if ( isBlocked ) return [lang.user.block.header.replaceSave( '%s', block.user ), lang.user.block.text.replaceSave( '%1$s', blockedtimestamp ).replaceSave( '%2$s', blockexpiry ).replaceSave( '%3$s', '[[User:' + block.by + '|' + block.by + ']]' ).replaceSave( '%4$s', block.reason )];
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
							console.log( '- ' + ( ucresponse ? ucresponse.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( ucerror ? ': ' + ucerror : ( ucbody ? ( ucbody.error ? ': ' + ucbody.error.info : '.' ) : '.' ) ) );
							msg.sendChannelError( spoiler + '<' + wiki.toLink() + namespace + username.toTitle() + linksuffix + '>' + spoiler );
						}
					}
					else {
						var editcount = [lang.user.info.editcount, ( username.includes( '/' ) && ( ( username.includes( ':' ) && range % 16 ) || range % 8 ) ? '~' : '' ) + ucbody.query.usercontribs.length + ( ucbody.continue ? '+' : '' )];
						
						var pagelink = wiki.toLink() + namespace + username.toTitle() + linksuffix;
						if ( msg.showEmbed() ) {
							var text = '<' + pagelink + '>';
							var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( username ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink() + contribs + username.toTitle() + ')' );
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
				if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
					console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
					msg.reactEmoji('nowiki');
				}
				else {
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
					msg.sendChannelError( spoiler + '<' + wiki.toLink() + namespace + username.toTitle() + linksuffix + '>' + spoiler );
				}
			}
			else {
				if ( body.query.users[0].missing !== undefined || body.query.users[0].invalid !== undefined ) {
					if ( querypage.missing !== undefined || querypage.ns === -1 ) msg.reactEmoji('🤷');
					else {
						var pagelink = wiki.toLink() + querypage.title.toTitle() + linksuffix;
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
						if ( querypage.extract ) {
							var extract = querypage.extract.escapeFormatting();
							if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
							embed.setDescription( extract );
						}
						if ( querypage.pageimage ) {
							var pageimage = wiki.toLink() + 'Special:FilePath/' + querypage.pageimage + '?v=' + Date.now();
							embed.setThumbnail( pageimage );
						} else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
						
						msg.sendChannel( spoiler + '<' + pagelink + '>' + spoiler, embed );
					}
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
					var registration = [lang.user.info.registration, (new Date(body.query.users[0].registration)).toLocaleString(lang.user.dateformat, timeoptions)];
					var editcount = [lang.user.info.editcount, body.query.users[0].editcount];
					var groups = body.query.users[0].groups;
					var group = [lang.user.info.group];
					for ( var i = 0; i < lang.user.groups.length; i++ ) {
						if ( groups.includes( lang.user.groups[i][0] ) ) {
							var thisSite = allSites.find( site => site.wiki_domain === body.query.general.servername );
							if ( lang.user.groups[i][0] === 'hydra_staff' && thisSite && thisSite.wiki_managers.includes( username ) ) group.push(lang.user.manager);
							else group.push(lang.user.groups[i][1]);
							break;
						}
					}
					var isBlocked = false;
					var blockedtimestamp = (new Date(body.query.users[0].blockedtimestamp)).toLocaleString(lang.user.dateformat, timeoptions);
					var blockexpiry = body.query.users[0].blockexpiry;
					if ( blockexpiry === 'infinity' ) {
						blockexpiry = lang.user.block.until_infinity;
						isBlocked = true;
					} else if ( blockexpiry ) {
						var blockexpirydate = blockexpiry.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2,3})/, '$1-$2-$3T$4:$5:$6Z');
						blockexpiry = (new Date(blockexpirydate)).toLocaleString(lang.user.dateformat, timeoptions);
						if ( Date.parse(blockexpirydate) > Date.now() ) isBlocked = true;
					}
					var blockedby = '[[User:' + body.query.users[0].blockedby + '|' + body.query.users[0].blockedby + ']]';
					var blockreason = body.query.users[0].blockreason;
					var block = [lang.user.block.header.replaceSave( '%s', username ), lang.user.block.text.replaceSave( '%1$s', blockedtimestamp ).replaceSave( '%2$s', blockexpiry ).replaceSave( '%3$s', blockedby ).replaceSave( '%4$s', blockreason )];
					
					var pagelink = wiki.toLink() + namespace + username.toTitle() + linksuffix;
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( username.escapeFormatting() ).setURL( pagelink ).addField( editcount[0], '[' + editcount[1] + '](' + wiki.toLink() + contribs + username.toTitle() + ')', true ).addField( group[0], group[1], true ).addField( gender[0], gender[1], true ).addField( registration[0], registration[1], true );
						if ( isBlocked ) embed.addField( block[0], block[1].toMarkdown(wiki) );
					}
					else {
						var embed = {};
						var text = '<' + pagelink + '>\n\n' + gender.join(' ') + '\n' + registration.join(' ') + '\n' + editcount.join(' ') + '\n' + group.join(' ');
						if ( isBlocked ) text += '\n\n**' + block[0] + '**\n' + block[1].toPlaintext();
					}
					
					msg.sendChannel( spoiler + text + spoiler, embed );
				}
			}
			
			if ( reaction ) reaction.removeEmoji();
		} );
	}
}

function cmd_diff(lang, msg, args, wiki, reaction, spoiler) {
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
		
		if ( error ) msg.reactEmoji('error');
		else if ( diff ) {
			cmd_diffsend(lang, msg, [diff, revision], wiki, reaction, spoiler);
		}
		else {
			request( {
				uri: wiki + 'api.php?action=compare&prop=ids' + ( title ? '&fromtitle=' + encodeURIComponent( title ) : '&fromrev=' + revision ) + '&torelative=' + relative + '&format=json',
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
							default:
								noerror = false;
						}
					}
					if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
						console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
						msg.reactEmoji('nowiki');
					}
					else if ( noerror ) {
						msg.replyMsg( lang.diff.badrev );
					}
					else {
						console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
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
						else argids = [ids.torevid, ids.fromrevid];
						cmd_diffsend(lang, msg, argids, wiki, reaction, spoiler);
					}
				}
			} );
		}
	}
	else {
		msg.reactEmoji('error');
		if ( reaction ) reaction.removeEmoji();
	}
}

function cmd_diffsend(lang, msg, args, wiki, reaction, spoiler) {
	request( {
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=tags&tglimit=500&tgprop=displayname&prop=revisions&rvprop=ids|timestamp|flags|user|size|comment|tags&revids=' + args.join('|') + '&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query ) {
			if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
				console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
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
					var revisions = pages[0].revisions.sort( (first, second) => first.timestamp < second.timestamp );
					var diff = revisions[0].revid;
					var oldid = ( revisions[1] ? revisions[1].revid : 0 );
					var editor = [lang.diff.info.editor, ( revisions[0].userhidden !== undefined ? lang.diff.hidden : revisions[0].user )];
					var timestamp = [lang.diff.info.timestamp, (new Date(revisions[0].timestamp)).toLocaleString(lang.user.dateformat, timeoptions)];
					var difference = revisions[0].size - ( revisions[1] ? revisions[1].size : 0 );
					var size = [lang.diff.info.size, lang.diff.info.bytes.replace( '%s', ( difference > 0 ? '+' : '' ) + difference )];
					var comment = [lang.diff.info.comment, ( revisions[0].commenthidden !== undefined ? lang.diff.hidden : ( revisions[0].comment ? revisions[0].comment.toFormatting(msg.showEmbed(), wiki, title) : lang.diff.nocomment ) )];
					if ( revisions[0].tags.length ) {
						var tags = [lang.diff.info.tags, body.query.tags.filter( tag => revisions[0].tags.includes( tag.name ) ).map( tag => tag.displayname ).join(', ')];
						var tagregex = /<a [^>]*title="([^"]+)"[^>]*>(.+)<\/a>/g;
					}
					
					var pagelink = wiki.toLink() + title.toTitle() + '?diff=' + diff + '&oldid=' + oldid;
					if ( msg.showEmbed() ) {
						var text = '<' + pagelink + '>';
						var editorlink = '[' + editor[1] + '](' + wiki.toLink() + 'User:' + editor[1].toTitle() + ')';
						if ( /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(editor[1]) ) editorlink = '[' + editor[1] + '](' + wiki.toLink() + 'Special:Contributions/' + editor[1].toTitle(true) + ')';
						var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( ( title + '?diff=' + diff + '&oldid=' + oldid ).escapeFormatting() ).setURL( pagelink ).addField( editor[0], editorlink, true ).addField( size[0], size[1], true ).addField( comment[0], comment[1] ).setFooter( timestamp[1] );
						if ( tags ) {
							var taglink = wiki.toLink() + tags[1].replace( tagregex, '$1' ).toTitle(true);
							embed.addField( tags[0], tags[1].replace( tagregex, '[$2](' + taglink.replace( '$', '$$$$' ) + ')' ) );
						}
						request( {
							uri: wiki + 'api.php?action=compare&fromrev=' + oldid + '&torev=' + diff + '&format=json',
							json: true
						}, function( cperror, cpresponse, cpbody ) {
							if ( cpbody && cpbody.warnings ) log_warn(cpbody.warnings);
							if ( cperror || !cpresponse || cpresponse.statusCode !== 200 || !cpbody || !cpbody.compare || !cpbody.compare['*'] ) {
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
								if ( !noerror ) console.log( '- ' + ( cpresponse ? cpresponse.statusCode + ': ' : '' ) + 'Error while getting the diff' + ( cperror ? ': ' + cperror : ( cpbody ? ( cpbody.error ? ': ' + cpbody.error.info : '.' ) : '.' ) ) );
							}
							else if ( cpbody.compare.fromtexthidden === undefined || cpbody.compare.totexthidden === undefined || cpbody.compare.fromarchive === undefined || cpbody.compare.toarchive === undefined ) {
								var current_tag = '';
								var small_prev_ins = '';
								var small_prev_del = '';
								var ins_too_long = false;
								var del_too_long = false;
								var added = false;
								var parser = new htmlparser.Parser( {
									onopentag: (name, attribs) => {
										if ( name === 'ins' || name == 'del' ) {
											current_tag = name;
										}
										if ( name === 'td' && attribs.class === 'diff-addedline' ) {
											current_tag = name+'a';
										}
										if ( name === 'td' && attribs.class === 'diff-deletedline' ) {
											current_tag = name+"d";
										}
										if ( name === 'td' && attribs.class === 'diff-marker' ) {
											added = true;
										}
									},
									ontext: (text) => {
										if ( current_tag === 'ins' && !ins_too_long ) {
											if ( ( small_prev_ins + '**' + text.escapeFormatting() + '**' ).length > 1000 ) ins_too_long = true;
											else small_prev_ins += '**' + text.escapeFormatting() + '**';
										}
										if ( current_tag === 'del' && !del_too_long ) {
											if ( ( small_prev_del + '~~' + text.escapeFormatting() + '~~' ).length > 1000 ) del_too_long = true;
											else small_prev_del += '~~' + text.escapeFormatting() + '~~';
										}
										if ( ( current_tag === 'afterins' || current_tag === 'tda') && !ins_too_long ) {
											if ( ( small_prev_ins + text.escapeFormatting() ).length > 1000 ) ins_too_long = true;
											else small_prev_ins += text.escapeFormatting();
										}
										if ( ( current_tag === 'afterdel' || current_tag === 'tdd') && !del_too_long ) {
											if ( ( small_prev_del + text.escapeFormatting() ).length > 1000 ) del_too_long = true;
											else small_prev_del += text.escapeFormatting();
										}
										if ( added && text === '+' ) {
											if ( !ins_too_long ) small_prev_ins += '\n';
											if ( small_prev_ins.length > 1000 ) ins_too_long = true;
											added = false;
										}
										if ( added && text === '−' ) {
											if ( !del_too_long ) small_prev_del += '\n';
											if ( small_prev_del.length > 1000 ) del_too_long = true;
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
								if ( small_prev_del.trim().length ) {
									embed.addField( 'Removed', small_prev_del.replace( /\~\~\~\~/g, '' ) + ( ins_too_long ? '\n\n__And more__' : '' ) );
								}
								if ( small_prev_ins.trim().length ) {
									embed.addField( 'Added', small_prev_ins.replace( /\*\*\*\*/g, '' ) + ( del_too_long ? '\n\n__And more__' : '' ) );
								}
							}
							
							msg.sendChannel( spoiler + text + spoiler, embed );
							
							if ( reaction ) reaction.removeEmoji();
						} );
					}
					else {
						var embed = {};
						var text = '<' + pagelink + '>\n\n' + editor.join(' ') + '\n' + timestamp.join(' ') + '\n' + size.join(' ') + '\n' + comment.join(' ') + ( tags ? '\n' + tags.join(' ').replace( tagregex, '$2' ) : '' );
						
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
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&prop=pageimages|pageprops|extracts&ppprop=description&exsentences=10&exintro=true&explaintext=true&generator=random&grnnamespace=0&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
				console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Random>' + spoiler );
			}
		}
		else {
			querypage = Object.values(body.query.pages)[0];
			var pagelink = wiki.toLink() + querypage.title.toTitle();
			var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( querypage.title.escapeFormatting() ).setURL( pagelink );
			if ( querypage.pageprops && querypage.pageprops.description ) {
				var description = querypage.pageprops.description.escapeFormatting();
				if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
				embed.setDescription( description );
			}
			else if ( querypage.extract ) {
				var extract = querypage.extract.escapeFormatting();
				if ( extract.length > 2000 ) extract = extract.substring(0, 2000) + '\u2026';
				embed.setDescription( extract );
			}
			if ( querypage.pageimage && querypage.title !== body.query.general.mainpage ) {
				embed.setThumbnail( wiki.toLink() + 'Special:FilePath/' + querypage.pageimage + '?v=' + Date.now() );
			}
			else embed.setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo );
			
			msg.sendChannel( spoiler + '🎲 <' + pagelink + '>' + spoiler, embed );
		}
		
		if ( reaction ) reaction.removeEmoji();
	} );
}

function cmd_overview(lang, msg, wiki, reaction, spoiler) {
	request( {
		uri: wiki + 'api.php?action=query&meta=siteinfo&siprop=general&titles=Special:Statistics&format=json',
		json: true
	}, function( error, response, body ) {
		if ( body && body.warnings ) log_warn(body.warnings);
		if ( error || !response || response.statusCode !== 200 || !body || body.batchcomplete === undefined || !body.query || !body.query.pages ) {
			if ( response && response.request && response.request.uri && response.request.uri.href === 'https://www.gamepedia.com/' ) {
				console.log( '- This wiki doesn\'t exist! ' + ( error ? error.message : ( body ? ( body.error ? body.error.info : '' ) : '' ) ) );
				msg.reactEmoji('nowiki');
			}
			else {
				console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the search results' + ( error ? ': ' + error : ( body ? ( body.error ? ': ' + body.error.info : '.' ) : '.' ) ) );
				msg.sendChannelError( spoiler + '<' + wiki.toLink() + 'Special:Statistics>' + spoiler );
			}
		}
		else if ( allSites.some( site => site.wiki_domain === body.query.general.servername ) ) {
			var site = allSites.find( site => site.wiki_domain === body.query.general.servername );
			
			var name = [lang.overview.name, site.wiki_display_name];
			var created = [lang.overview.created, (new Date(parseInt(site.created + '000', 10))).toLocaleString(lang.user.dateformat, timeoptions)];
			var manager = [lang.overview.manager, site.wiki_managers];
			var official = [lang.overview.official, ( site.official_wiki ? lang.overview.yes : lang.overview.no )];
			var articles = [lang.overview.articles, site.ss_good_articles];
			var pages = [lang.overview.pages, site.ss_total_pages];
			var edits = [lang.overview.edits, site.ss_total_edits];
			var users = [lang.overview.users, site.ss_active_users];
			
			var title = body.query.pages['-1'].title;
			var pagelink = wiki.toLink() + title.toTitle();
			if ( msg.showEmbed() ) {
				var text = '<' + pagelink + '>';
				var managerlist = manager[1].map( manager => '[' + manager + '](' + wiki.toLink() + 'User:' + manager.toTitle(true) + ') ([' + lang.overview.talk + '](' + wiki.toLink() + 'User_talk:' + manager.toTitle(true) + '))' ).join('\n');
				var embed = new Discord.RichEmbed().setAuthor( body.query.general.sitename ).setTitle( title.escapeFormatting() ).setURL( pagelink ).setThumbnail( ( body.query.general.logo.startsWith( '//' ) ? 'https:' : '' ) + body.query.general.logo ).addField( name[0], name[1], true ).addField( created[0], created[1], true ).addField( manager[0], managerlist, true ).addField( official[0], official[1], true ).addField( articles[0], articles[1], true ).addField( pages[0], pages[1], true ).addField( edits[0], edits[1], true ).addField( users[0], users[1], true ).setTimestamp( client.readyTimestamp ).setFooter( lang.overview.inaccurate );
			}
			else {
				var embed = {};
				var text = '<' + pagelink + '>\n\n' + name.join(' ') + '\n' + created.join(' ') + '\n' + manager[0] + ' ' + manager[1].join(', ') + '\n' + official.join(' ') + '\n' + articles.join(' ') + '\n' + pages.join(' ') + '\n' + edits.join(' ') + '\n' + users.join(' ') + '\n\n*' + lang.overview.inaccurate + '*';
			}
			
			msg.sendChannel( spoiler + text + spoiler, embed );
		}
		else {
			console.log( '- This site isn\'t listed: ' + wiki )
			msg.replyMsg( lang.overview.missing );
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
						console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the issue: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the issue' + ( error ? ': ' + error : ( body ? ': ' + body.message : '.' ) ) );
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
		var jql = encodeURIComponent( 'fixVersion="' + args.join(' ') + '" order by key' );
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
						console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the issues: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while getting the issues' + ( error ? ': ' + error : ( body ? ': ' + body.message : '.' ) ) );
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
	var aliasCmd = ( ( befehl in minecraft.cmd.aliase ) ? minecraft.cmd.aliase[befehl] : befehl ).toLowerCase();
	
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
		if ( args[0].startsWith('/') ) cmd_befehl(lang, mclang, msg, args[0].substring(1), args.slice(1), title, cmd, querystring, fragment, reaction, spoiler);
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
				var embed = new Discord.RichEmbed().addField( guildname[0], guildname[1] ).addField( guildowner[0], guildowner[1] ).addField( guildsize[0], guildsize[1] ).addField( guildpermissions[0], guildpermissions[1] ).addField( guildsettings[0], guildsettings[1] );
			}
			else {
				var embed = {};
				var text = guildname.join(' ') + '\n' + guildowner.join(' ') + '\n' + guildsize.join(' ') + '\n' + guildpermissions.join(' ') + '\n' + guildsettings.join(' ');
			}
			msg.sendChannel( text, embed, true );
		} else if ( client.guilds.some( guild => guild.members.has(id) ) ) {
			var username = [];
			var guildlist = ['Guilds:'];
			var guilds = client.guilds.filter( guild => guild.members.has(id) )
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
			var channelwiki = ['Default Wiki:', ( channel.guild.id in settings ? ( settings[channel.guild.id].channels && channel.id in settings[channel.guild.id].channels ? settings[channel.guild.id].channels[channel.id] : settings[channel.guild.id].wiki ) : settings['default'].wiki )];
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

String.prototype.toLink = function() {
	if ( this.endsWith( '.org/w/' ) ) return this.substring(0, this.length - 2) + 'wiki/';
	else return this;
};

String.prototype.isMention = function(guild) {
	var text = this.trim();
	if ( text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.me.displayName ) ) return true;
	else return false;
};

Discord.Message.prototype.isAdmin = function() {
	if ( this.channel.type === 'text' && this.member && this.member.permissions.has('MANAGE_GUILD') ) return true;
	else return false;
};

Discord.Message.prototype.isOwner = function() {
	if ( this.author.id === process.env.owner ) return true;
	else return false;
};

Discord.Message.prototype.showEmbed = function() {
	if ( this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('EMBED_LINKS') ) return true;
	else return false;
};

Discord.Message.prototype.uploadFiles = function() {
	if ( this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('ATTACH_FILES') ) return true;
	else return false;
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
	return this.replace( /(`|_|\*|~|<|>|{|}|@|\||\/\/)/g, '\\$1' );
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
			msg.allowDelete(this.author.id);
			return msg;
		}, log_error );
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

Discord.Message.prototype.sendChannelError = function(content, options) {
	return this.channel.send(content, options).then( msg => {
		msg.reactEmoji('error');
		msg.allowDelete(this.author.id);
		return msg;
	}, log_error );
};

Discord.Message.prototype.replyMsg = function(content, options, ignorePause = false) {
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		return this.reply(content, options).then( msg => {
			msg.allowDelete(this.author.id);
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
	return this.awaitReactions( (reaction, user) => reaction.emoji.name === '🗑' && user.id === author, {max:1,time:30000} ).then( reaction => {
		if ( reaction.size ) {
			this.deleteMsg();
		}
	} );
};

String.prototype.hasPrefix = function(flags = '') {
	if ( RegExp( '^' + process.env.prefix + '(?: |$)', flags ).test(this.toLowerCase()) ) return true;
	else return false;
};

client.on( 'message', msg => {
	if ( stop || !msg.content.hasPrefix('m') || msg.webhookID || msg.author.id === client.user.id ) return;
	
	var cont = msg.content;
	var author = msg.author;
	var channel = msg.channel;
	if ( channel.type === 'text' ) var permissions = channel.permissionsFor(client.user);
	
	if ( !ready.settings && settings === defaultSettings ) getSettings();
	if ( !ready.allSites && !allSites.length ) getAllSites();
	var setting = Object.assign({}, settings['default']);
	if ( settings === defaultSettings ) {
		msg.sendChannel( '⚠ **Limited Functionality** ⚠\nNo settings found, please contact the bot owner!\n' + process.env.invite, {}, true );
	} else if ( channel.type === 'text' && msg.guild.id in settings ) setting = Object.assign({}, settings[msg.guild.id]);
	var lang = Object.assign({}, i18n[setting.lang]);
	lang.link = setting.wiki;
	if ( setting.channels && channel.id in setting.channels ) lang.link = setting.channels[channel.id];
	
	if ( channel.type !== 'text' || permissions.has(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']) ) {
		var invoke = cont.split(' ')[1] ? cont.split(' ')[1].split('\n')[0].toLowerCase() : '';
		var aliasInvoke = ( invoke in lang.aliase ) ? lang.aliase[invoke] : invoke;
		var ownercmd = msg.isOwner() && aliasInvoke in ownercmdmap;
		if ( cont.hasPrefix() && ( ( msg.isAdmin() && aliasInvoke in multilinecmdmap ) || ownercmd ) ) {
			if ( ownercmd || permissions.has('MANAGE_MESSAGES') ) {
				var args = cont.split(' ').slice(2);
				if ( cont.split(' ')[1].split('\n')[1] ) args.unshift( '', cont.split(' ')[1].split('\n')[1] );
				if ( !( ownercmd || aliasInvoke in pausecmdmap ) && pause[msg.guild.id] ) console.log( msg.guild.name + ': Paused' );
				else console.log( ( msg.guild ? msg.guild.name : '@' + author.username ) + ': ' + cont.replace( /\n/g, '\n\u200b' ) );
				if ( ownercmd ) ownercmdmap[aliasInvoke](lang, msg, args, cont);
				else if ( !pause[msg.guild.id] || aliasInvoke in pausecmdmap ) multilinecmdmap[aliasInvoke](lang, msg, args, cont);
			} else {
				console.log( msg.guild.name + ': Missing permissions - MANAGE_MESSAGES' );
				msg.replyMsg( lang.missingperm + ' `MANAGE_MESSAGES`' );
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
					msg.sendChannelError( lang.limit.replaceSave( '%s', author.toString() ) );
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
		var lang = i18n[settings[( oldm.guild.id in settings ? oldm.guild.id : 'default' )].lang].voice;
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
		Object.keys(temp_settings).forEach( function(guild) {
			if ( !client.guilds.has(guild) && guild !== 'default' ) delete temp_settings[guild];
		} );
		request.post( {
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
				console.log( '- ' + ( response ? response.statusCode + ': ' : '' ) + 'Error while removing the settings' + ( error ? ': ' + error : ( body ? ( body.message ? ': ' + body.message : ( body.error ? ': ' + body.error : '.' ) ) : '.' ) ) );
			}
			else {
				settings = JSON.parse(JSON.stringify(temp_settings));
				console.log( '- Settings successfully removed.' );
			}
		} );
	}
} );


client.login(process.env.token).catch( error => log_error(error, true, 'LOGIN-') );


client.on( 'error', error => log_error(error, true) );
client.on( 'warn', warning => log_warn(warning, false) );

if ( isDebug ) client.on( 'debug', debug => console.log( '- Debug: ' + debug ) );


function log_error(error, isBig = false, type = '') {
	var time = new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
	if ( isDebug ) {
		console.error( '--- ' + type + 'ERROR START ' + time + ' ---\n\u200b' + util.inspect( error ).replace( /\n/g, '\n\u200b' ) + '\n--- ' + type + 'ERROR END ' + time + ' ---' );
	} else {
		if ( isBig ) console.log( '--- ' + type + 'ERROR: ' + time + ' ---\n- ' + error.name + ': ' + error.message );
		else console.log( '- ' + error.name + ': ' + error.message );
	}
}

function log_warn(warning, api = true) {
	if ( isDebug ) {
		console.warn( '--- Warning start ---\n\u200b' + util.inspect( warning ).replace( /\n/g, '\n\u200b' ) + '\n--- Warning end ---' );
	} else {
		if ( api ) console.warn( '- Warning: ' + Object.keys(warning).join(', ') );
		else console.warn( '--- Warning ---\n\u200b' + util.inspect( warning ).replace( /\n/g, '\n\u200b' ) );
	}
}

async function graceful(code = 1) {
	stop = true;
	console.log( '- SIGTERM: Preparing to close...' );
	setTimeout( async () => {
		console.log( '- SIGTERM: Destroying client...' );
		await client.destroy();
		setTimeout( async () => {
			console.log( '- SIGTERM: Closing takes too long, terminating!' );
			process.exit(code);
		}, 1000 ).unref();
	}, 5000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

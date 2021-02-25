const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

global.isDebug = ( process.argv[2] === 'debug' );
global.shardId = null;
process.on( 'message', message => {
	if ( !message.shard ) return;
	shardId = message.shard.id;
} );

global.got = require('got').extend( {
	throwHttpErrors: false,
	timeout: 5000,
	headers: {
		'User-Agent': 'Wiki-Bot/' + ( isDebug ? 'testing' : process.env.npm_package_version ) + ' (Discord; ' + process.env.npm_package_name + ')'
	},
	responseType: 'json'
} );

const Lang = require('./util/i18n.js');
const Wiki = require('./util/wiki.js');
const newMessage = require('./util/newMessage.js');
const {allowDelete} = require('./util/functions.js');
global.patreons = {};
global.voice = {};
const db = require('./util/database.js');

const Discord = require('discord.js');
const client = new Discord.Client( {
	messageEditHistoryMaxSize: 1,
	messageCacheLifetime: 300,
	messageSweepInterval: 300,
	allowedMentions: {
		parse: []
	},
	presence: ( process.env.READONLY ? {
		status: 'dnd',
		activity: {
			type: 'PLAYING',
			name: 'READONLY: ' + process.env.prefix + 'test'
		}
	} : {
		status: 'online',
		activity: {
			type: 'STREAMING',
			name: process.env.prefix + 'help',
			url: 'https://www.twitch.tv/wikibot'
		}
	} ),
	ws: {
		large_threshold: 1000,
		intents: [
			'GUILDS',
			'GUILD_MESSAGES',
			'GUILD_MESSAGE_REACTIONS',
			'GUILD_VOICE_STATES',
			'GUILD_INTEGRATIONS',
			'DIRECT_MESSAGES',
			'DIRECT_MESSAGE_REACTIONS'
		]
	}
} );

global.pause = {};
var isStop = false;
client.on( 'ready', () => {
	console.log( '\n- ' + shardId + ': Successfully logged in as ' + client.user.username + '!\n' );
	Object.keys(voice).forEach( guild => {
		if ( !client.guilds.cache.has(guild) ) delete voice[guild];
	} );
} );


String.prototype.isMention = function(guild) {
	var text = this.trim();
	return text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.me.displayName );
};

Discord.Channel.prototype.isGuild = function() {
	return ['text', 'news'].includes( this.type );
}

Discord.Message.prototype.isAdmin = function() {
	return this.channel.isGuild() && this.member && ( this.member.permissions.has('MANAGE_GUILD') || ( this.isOwner() && this.evalUsed ) );
};

Discord.Message.prototype.isOwner = function() {
	return process.env.owner.split('|').includes( this.author.id );
};

Discord.Message.prototype.showEmbed = function() {
	return !this.channel.isGuild() || this.channel.permissionsFor(client.user).has('EMBED_LINKS');
};

Discord.Message.prototype.uploadFiles = function() {
	return !this.channel.isGuild() || this.channel.permissionsFor(client.user).has('ATTACH_FILES');
};

String.prototype.escapeFormatting = function(isMarkdown) {
	var text = this;
	if ( !isMarkdown ) text = text.replace( /[\(\)\\]/g, '\\$&' );
	return text.replace( /[`_\*~:<>{}@\|]|\/\//g, '\\$&' );
};

String.prototype.replaceSave = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replace( /\$/g, '$$$$' ) : replacement ) );
};

Discord.Message.prototype.reactEmoji = function(name, ignorePause = false) {
	if ( !this.channel.isGuild() || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		var emoji = ':error:440871715938238494';
		switch ( name ) {
			case 'nowiki':
				emoji = ':unknown_wiki:505884572001763348';
				break;
			case 'error':
				emoji = ':error:440871715938238494';
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
	return this.users.remove().catch(log_error);
};

Discord.Message.prototype.sendChannel = function(content, options = {}, ignorePause = false) {
	if ( !this.channel.isGuild() || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		if ( !options.allowedMentions ) options.allowedMentions = {users:[this.author.id]};
		return this.channel.send(content, options).then( msg => {
			if ( msg.length ) msg.forEach( message => allowDelete(message, this.author.id) );
			else allowDelete(msg, this.author.id);
			return msg;
		}, error => {
			log_error(error);
			this.reactEmoji('error');
		} );
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

Discord.Message.prototype.sendChannelError = function(content, options = {}) {
	if ( !options.allowedMentions ) options.allowedMentions = {users:[this.author.id]};
	return this.channel.send(content, options).then( msg => {
		if ( msg.length ) msg.forEach( message => {
			message.reactEmoji('error');
			allowDelete(message, this.author.id);
		} );
		else {
			msg.reactEmoji('error');
			allowDelete(msg, this.author.id);
		}
		return msg;
	}, error => {
		log_error(error);
		this.reactEmoji('error');
	} );
};

Discord.Message.prototype.replyMsg = function(content, options = {}, ignorePause = false, letDelete = true) {
	if ( !this.channel.isGuild() || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		if ( !options.allowedMentions ) options.allowedMentions = {users:[this.author.id]};
		return this.reply(content, options).then( msg => {
			if ( letDelete ) {
				if ( msg.length ) msg.forEach( message => allowDelete(message, this.author.id) );
				else allowDelete(msg, this.author.id);
			}
			return msg;
		}, error => {
			log_error(error);
			this.reactEmoji('error');
		} );
	} else {
		console.log( '- Aborted, paused.' );
		return Promise.resolve();
	}
};

String.prototype.hasPrefix = function(prefix, flags = '') {
	var suffix = '';
	if ( prefix.endsWith( ' ' ) ) {
		prefix = prefix.trim();
		suffix = '(?: |$)';
	}
	var regex = new RegExp( '^' + prefix.replace( /\W/g, '\\$&' ) + suffix, flags );
	return regex.test(this.replace( /\u200b/g, '' ).toLowerCase());
};

const fs = require('fs');
var slash = {};
fs.readdir( './interactions', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('./interactions/' + file);
		slash[command.name] = command.run;
	} );
} );
/*
!test eval got.post(`https://discord.com/api/v8/applications/${msg.client.user.id}/commands`, {
	headers:{Authorization: `Bot ${process.env.token}`},
	json: require('../interactions/commands.json')[0]
}).then(response=>console.log(response.statusCode,response.body))
*/
client.on( 'raw', rawEvent => {
	if ( rawEvent.t !== 'INTERACTION_CREATE' ) return;
	var interaction = rawEvent.d;
	if ( interaction.version !== 1 || interaction.type !== 2 ) return;
	interaction.application_id = client.user.id;
	if ( !slash.hasOwnProperty(interaction.data.name) ) {
		consol.log( '- Slash: Unknown command: ' + interaction.data.name );
		return got.post( `https://discord.com/api/v8/interactions/${interaction.id}/${interaction.token}/callback`, {
			json: {
				//type: 4,
				type: 3,
				data: {
					content: '[<:error:440871715938238494> Unknown Command! <:error:440871715938238494>](<' + process.env.invite + '>)',
					allowed_mentions: {
						parse: []
					},
					flags: 64
				}
			}
		} ).then( response => {
			if ( response.statusCode !== 204 ) {
				console.log( '- Slash: ' + response.statusCode + ': Error while sending the response: ' + response.body?.message );
			}
		}, log_error );
	}
	var channel = client.channels.cache.get(interaction.channel_id);
	if ( !interaction.guild_id ) {
		if ( global.shardId !== 0 ) return;
		return slash[interaction.data.name](interaction, new Lang(), new Wiki(), channel);
	}
	db.get( 'SELECT wiki, lang, role FROM discord WHERE guild = ? AND (channel = ? OR channel = ? OR channel IS NULL) ORDER BY channel DESC', [interaction.guild_id, interaction.channel_id, '#' + channel?.parentID], (dberror, row) => {
		if ( dberror ) {
			console.log( '- Error while getting the wiki: ' + dberror );
			return got.post( `https://discord.com/api/v8/interactions/${interaction.id}/${interaction.token}/callback`, {
				json: {
					//type: 4,
					type: 3,
					data: {
						content: '[<:error:440871715938238494> Error! <:error:440871715938238494>](<' + process.env.invite + '>)',
						allowed_mentions: {
							parse: []
						},
						flags: 64
					}
				}
			} ).then( response => {
				if ( response.statusCode !== 204 ) {
					console.log( '- Slash: ' + response.statusCode + ': Error while sending the response: ' + response.body?.message );
				}
			}, log_error );
		}
		var lang = new Lang(( row?.lang || channel?.guild?.preferredLocale ));
		if ( row?.role && !interaction.member.roles.includes( row.role ) && channel?.guild?.roles.cache.has(row.role) && ( !interaction.member.roles.length || !interaction.member.roles.some( role => channel.guild.roles.cache.get(role)?.comparePositionTo(row.role) >= 0 ) ) ) {
			return got.post( `https://discord.com/api/v8/interactions/${interaction.id}/${interaction.token}/callback`, {
				json: {
					//type: 4,
					type: 3,
					data: {
						content: lang.get('interaction.missingrole', '<@&' + row.role + '>'),
						allowed_mentions: {
							parse: []
						},
						flags: 64
					}
				}
			} ).then( response => {
				if ( response.statusCode !== 204 ) {
					console.log( '- Slash: ' + response.statusCode + ': Error while sending the response: ' + response.body?.message );
				}
			}, log_error );
		}
		var wiki = new Wiki(row?.wiki);
		return slash[interaction.data.name](interaction, lang, wiki, channel);
	} );
} );

client.on( 'message', msg => {
	if ( isStop || msg.type !== 'DEFAULT' || msg.system || msg.webhookID || msg.author.bot || msg.author.id === msg.client.user.id ) return;
	if ( !msg.content.hasPrefix(( msg.channel.isGuild() && patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
		if ( msg.content === process.env.prefix + 'help' && ( msg.isAdmin() || msg.isOwner() ) ) {
			if ( msg.channel.permissionsFor(msg.client.user).has('SEND_MESSAGES') ) {
				console.log( msg.guild.name + ': ' + msg.content );
				db.get( 'SELECT lang FROM discord WHERE guild = ? AND (channel = ? OR channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID], (dberror, row) => {
					if ( dberror ) console.log( '- Error while getting the lang: ' + dberror );
					msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('prefix', patreons[msg.guild.id]), {}, true );
				} );
			}
		}
		if ( !( msg.content.includes( '[[' ) && msg.content.includes( ']]' ) ) && !( msg.content.includes( '{{' ) && msg.content.includes( '}}' ) ) ) return;
	}
	if ( msg.channel.isGuild() ) {
		var permissions = msg.channel.permissionsFor(msg.client.user);
		var missing = permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']);
		if ( missing.length ) {
			if ( msg.isAdmin() || msg.isOwner() ) {
				console.log( msg.guild.id + ': Missing permissions - ' + missing.join(', ') );
				if ( !missing.includes( 'SEND_MESSAGES' ) ) {
					db.get( 'SELECT lang FROM discord WHERE guild = ? AND (channel = ? OR channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID], (dberror, row) => {
						if ( dberror ) console.log( '- Error while getting the lang: ' + dberror );
						if ( msg.content.hasPrefix(( patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
							msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('missingperm') + ' `' + missing.join('`, `') + '`', {}, true );
						}
					} );
				}
			}
			return;
		}
		db.get( 'SELECT wiki, lang, role, inline FROM discord WHERE guild = ? AND (channel = ? OR channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID], (dberror, row) => {
			if ( dberror ) {
				console.log( '- Error while getting the wiki: ' + dberror );
				if ( permissions.has('SEND_MESSAGES') ) {
					msg.sendChannel( '⚠️ **Limited Functionality** ⚠️\nNo settings found, please contact the bot owner!\n' + process.env.invite, {}, true );
					newMessage(msg, new Lang(msg.guild.preferredLocale));
				}
				return dberror;
			}
			if ( row ) {
				if ( msg.guild.roles.cache.has(row.role) && msg.guild.roles.cache.get(row.role).comparePositionTo(msg.member.roles.highest) > 0 && !msg.isAdmin() ) {
					msg.onlyVerifyCommand = true;
				}
				newMessage(msg, new Lang(row.lang), row.wiki, patreons[msg.guild.id], row.inline);
			}
			else {
				msg.defaultSettings = true;
				newMessage(msg, new Lang(msg.guild.preferredLocale));
			}
		} );
	}
	else newMessage(msg, new Lang());
} );


client.on( 'voiceStateUpdate', (olds, news) => {
	if ( isStop || !( voice.hasOwnProperty(olds.guild.id) ) || !olds.guild.me.permissions.has('MANAGE_ROLES') || olds.channelID === news.channelID ) return;
	var lang = new Lang(voice[olds.guild.id], 'voice');
	if ( olds.member && olds.channel ) {
		var oldrole = olds.member.roles.cache.find( role => role.name === lang.get('channel') + ' – ' + olds.channel.name );
		if ( oldrole && oldrole.comparePositionTo(olds.guild.me.roles.highest) < 0 ) {
			console.log( olds.guild.id + ': ' + olds.member.id + ' left the voice channel "' + olds.channel.id + '".' );
			olds.member.roles.remove( oldrole, lang.get('left', olds.member.displayName, olds.channel.name) ).catch(log_error);
		}
	}
	if ( news.member && news.channel ) {
		var newrole = news.guild.roles.cache.find( role => role.name === lang.get('channel') + ' – ' + news.channel.name );
		if ( newrole && newrole.comparePositionTo(news.guild.me.roles.highest) < 0 ) {
			console.log( news.guild.id + ': ' + news.member.id + ' joined the voice channel "' + news.channel.id + '".' );
			news.member.roles.add( newrole, lang.get('join', news.member.displayName, news.channel.name) ).catch(log_error);
		}
	}
} );


client.on( 'guildCreate', guild => {
	console.log( '- I\'ve been added to a server.' );
} );

client.on( 'guildDelete', guild => {
	if ( !guild.available ) {
		console.log( '- ' + guild.id + ': This server isn\'t responding.' );
		return;
	}
	console.log( '- I\'ve been removed from a server.' );
	db.run( 'DELETE FROM discord WHERE main = ?', [guild.id], function (dberror) {
		if ( dberror ) {
			console.log( '- Error while removing the settings: ' + dberror );
			return dberror;
		}
		if ( patreons.hasOwnProperty(guild.id) ) client.shard.broadcastEval( `delete global.patreons['${guild.id}']` );
		if ( voice.hasOwnProperty(guild.id) ) delete voice[guild.id];
		if ( this.changes ) console.log( '- Settings successfully removed.' );
	} );
} );


client.on( 'error', error => log_error(error, true) );
client.on( 'warn', warning => log_warn(warning, false) );

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

if ( isDebug ) client.on( 'debug', debug => {
	if ( isDebug ) console.log( '- ' + shardId + ': Debug: ' + debug );
} );


global.log_error = function(error, isBig = false, type = '') {
	var time = new Date(Date.now()).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
	if ( isDebug ) {
		console.error( '--- ' + type + 'ERROR START ' + time + ' ---\n', error, '\n--- ' + type + 'ERROR END ' + time + ' ---' );
	} else {
		if ( isBig ) console.log( '--- ' + type + 'ERROR: ' + time + ' ---\n-', error );
		else console.log( '- ' + error.name + ': ' + error.message );
	}
}

const common_warnings = {
	main: [
		'Unrecognized parameters: piprop, explaintext, exsectionformat, exlimit.',
		'Unrecognized parameters: explaintext, exsectionformat, exlimit.',
		'Unrecognized parameter: piprop.'
	],
	query: [
		'Unrecognized values for parameter "prop": pageimages, extracts.',
		'Unrecognized values for parameter "prop": pageimages, extracts',
		'Unrecognized value for parameter "prop": extracts.',
		'Unrecognized value for parameter "prop": pageimages.'
	]
}

global.log_warn = function(warning, api = true) {
	if ( isDebug ) {
		console.warn( '--- Warning start ---\n' + util.inspect( warning ) + '\n--- Warning end ---' );
	}
	else if ( api ) {
		if ( common_warnings.main.includes( warning?.main?.['*'] ) ) delete warning.main;
		if ( common_warnings.query.includes( warning?.query?.['*'] ) ) delete warning.query;
		var warningKeys = Object.keys(warning);
		if ( warningKeys.length ) console.warn( '- Warning: ' + warningKeys.join(', ') );
	}
	else console.warn( '--- Warning ---\n' + util.inspect( warning ) );
}

/**
 * End the process gracefully.
 * @param {NodeJS.Signals} signal - The signal received.
 */
function graceful(signal) {
	isStop = true;
	console.log( '- ' + shardId + ': ' + signal + ': Preparing to close...' );
	setTimeout( () => {
		console.log( '- ' + shardId + ': ' + signal + ': Destroying client...' );
		client.destroy();
		db.close( dberror => {
			if ( dberror ) {
				console.log( '- ' + shardId + ': ' + signal + ': Error while closing the database connection: ' + dberror );
				return dberror;
			}
			console.log( '- ' + shardId + ': ' + signal + ': Closed the database connection.' );
			process.exit(0);
		} );
	}, 1000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
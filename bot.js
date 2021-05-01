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

client.api.applications(process.env.bot).commands.get().then( response => {
	console.log( '- ' + shardId + ': Slash commands successfully loaded.' );
	const slashCommands = require('./interactions/commands.json');
	response.forEach( command => {
		var slashCommand = slashCommands.find( slashCommand => slashCommand.name === command.name );
		if ( slashCommand ) {
			slashCommand.id = command.id;
			slashCommand.application_id = command.application_id;
		}
		else slashCommands.push(slashCommand);
	} );
}, error => {
	console.log( '- ' + shardId + ': Error while getting the global slash commands: ' + error );
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
!test eval msg.client.api.applications(msg.client.user.id).commands.post( {
	data: require('../interactions/commands.json')[0]
} )
*/
client.ws.on( 'INTERACTION_CREATE', interaction => {
	if ( interaction.version !== 1 || interaction.type !== 2 ) return;
	if ( !slash.hasOwnProperty(interaction.data.name) ) {
		console.log( '- Slash: Unknown command: ' + interaction.data.name );
		return client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: '<:error:440871715938238494> [Unknown Command!](<' + process.env.invite + '>) <:error:440871715938238494>',
					allowed_mentions: {
						parse: []
					},
					flags: 64
				}
			}
		} ).catch(log_error);
	}
	interaction.client = client;
	var channel = client.channels.cache.get(interaction.channel_id);
	if ( !interaction.guild_id ) {
		return slash[interaction.data.name](interaction, new Lang(), new Wiki(), channel);
	}
	interaction.user = interaction.member.user;
	interaction.member.permissions = new Discord.Permissions(+interaction.member.permissions);
	db.query( 'SELECT wiki, lang, role FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', [interaction.guild_id, interaction.channel_id, '#' + channel?.parentID] ).then( ({rows:[row]}) => {
		var lang = new Lang(( row?.lang || channel?.guild?.preferredLocale ));
		if ( row?.role && !interaction.member.roles.includes( row.role ) && !interaction.member.permissions.has('MANAGE_GUILD') && channel?.guild?.roles.cache.has(row.role) && ( !interaction.member.roles.length || !interaction.member.roles.some( role => channel.guild.roles.cache.get(role)?.comparePositionTo(row.role) >= 0 ) ) ) {
			return client.api.interactions(interaction.id, interaction.token).callback.post( {
				data: {
					type: 4,
					data: {
						content: lang.get('interaction.missingrole', '<@&' + row.role + '>'),
						allowed_mentions: {
							parse: []
						},
						flags: 64
					}
				}
			} ).catch(log_error);
		}
		var wiki = new Wiki(row?.wiki);
		return slash[interaction.data.name](interaction, lang, wiki, channel);
	}, dberror => {
		console.log( '- Slash: Error while getting the wiki: ' + dberror );
		return client.api.interactions(interaction.id, interaction.token).callback.post( {
			data: {
				type: 4,
				data: {
					content: '<:error:440871715938238494> [Error!](<' + process.env.invite + '>) <:error:440871715938238494>',
					allowed_mentions: {
						parse: []
					},
					flags: 64
				}
			}
		} ).catch(log_error);
	} );
} );

client.on( 'message', msg => {
	if ( isStop || msg.type !== 'DEFAULT' || msg.system || msg.webhookID || msg.author.bot || msg.author.id === msg.client.user.id ) return;
	if ( !msg.content.hasPrefix(( msg.channel.isGuild() && patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
		if ( msg.content === process.env.prefix + 'help' && ( msg.isAdmin() || msg.isOwner() ) ) {
			if ( msg.channel.permissionsFor(msg.client.user).has('SEND_MESSAGES') ) {
				console.log( msg.guild.name + ': ' + msg.content );
				db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID] ).then( ({rows:[row]}) => {
					msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('prefix', patreons[msg.guild.id]), {}, true );
				}, dberror => {
					console.log( '- Error while getting the lang: ' + dberror );
					msg.replyMsg( new Lang(msg.guild.preferredLocale, 'general').get('prefix', patreons[msg.guild.id]), {}, true );
				} );
			}
			return;
		}
		if ( !( msg.content.includes( '[[' ) && msg.content.includes( ']]' ) ) && !( msg.content.includes( '{{' ) && msg.content.includes( '}}' ) ) ) return;
	}
	if ( msg.channel.isGuild() ) {
		var permissions = msg.channel.permissionsFor(msg.client.user);
		var missing = permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']);
		if ( missing.length ) {
			if ( ( msg.isAdmin() || msg.isOwner() ) && msg.content.hasPrefix(( patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
				console.log( msg.guild.id + ': Missing permissions - ' + missing.join(', ') );
				if ( !missing.includes( 'SEND_MESSAGES' ) ) {
					db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID] ).then( ({rows:[row]}) => {
						msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('missingperm') + ' `' + missing.join('`, `') + '`', {}, true );
					}, dberror => {
						console.log( '- Error while getting the lang: ' + dberror );
						msg.replyMsg( new Lang(msg.guild.preferredLocale, 'general').get('missingperm') + ' `' + missing.join('`, `') + '`', {}, true );
					} );
				}
			}
			return;
		}
		db.query( 'SELECT wiki, lang, role, inline FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', [msg.guild.id, msg.channel.id, '#' + msg.channel.parentID] ).then( ({rows:[row]}) => {
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
		}, dberror => {
			console.log( '- Error while getting the wiki: ' + dberror );
			msg.sendChannel( new Lang(msg.guild.preferredLocale, 'general').get('database') + '\n' + process.env.invite, {}, true );
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


const leftGuilds = new Map();

client.on( 'guildCreate', guild => {
	console.log( '- ' + guild.id + ': I\'ve been added to a server.' );
	if ( leftGuilds.has(guild.id) ) {
		client.clearTimeout(leftGuilds.get(guild.id));
		leftGuilds.delete(guild.id);
	}
} );

client.on( 'guildDelete', guild => {
	if ( !guild.available ) {
		console.log( '- ' + guild.id + ': This server isn\'t responding.' );
		return;
	}
	console.log( '- ' + guild.id + ': I\'ve been removed from a server.' );
	leftGuilds.set(guild.id, client.setTimeout(removeSettings, 300000, guild.id));
} );

function removeSettings(guild) {
	leftGuilds.delete(guild);
	if ( client.guilds.cache.has(guild) ) return;
	db.query( 'DELETE FROM discord WHERE main = $1', [guild] ).then( ({rowCount}) => {
		if ( patreons.hasOwnProperty(guild) ) client.shard.broadcastEval( `delete global.patreons['${guild}']` );
		if ( voice.hasOwnProperty(guild) ) delete voice[guild];
		if ( rowCount ) console.log( '- ' + guild + ': Settings successfully removed.' );
	}, dberror => {
		console.log( '- ' + guild + ': Error while removing the settings: ' + dberror );
	} );
}


client.on( 'error', error => log_error(error, true) );
client.on( 'warn', warning => log_warn(warning, false) );

client.login(process.env.token).catch( error => {
	log_error(error, true, 'LOGIN-');
	return client.login(process.env.token).catch( error => {
		log_error(error, true, 'LOGIN-');
		return client.login(process.env.token).catch( error => {
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
		db.end().then( () => {
			console.log( '- ' + shardId + ': ' + signal + ': Closed the database connection.' );
			process.exit(0);
		}, dberror => {
			console.log( '- ' + shardId + ': ' + signal + ': Error while closing the database connection: ' + dberror );
		} );
	}, 1000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );
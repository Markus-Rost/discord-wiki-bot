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

const {defaultSettings, wikiProjects} = require('./util/default.json');
const Lang = require('./util/i18n.js');
const newMessage = require('./util/newMessage.js');
global.patreons = {};
global.voice = {};
const db = require('./util/database.js');

const Discord = require('discord.js');
const client = new Discord.Client( {
	messageCacheLifetime: 300,
	messageSweepInterval: 300,
	allowedMentions: {
		parse: []
	},
	presence: {
		status: 'online',
		activity: {
			type: 'STREAMING',
			name: process.env.prefix + 'help',
			url: 'https://www.twitch.tv/wikibot'
		}
	},
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

Discord.Message.prototype.isAdmin = function() {
	return this.channel.type === 'text' && this.member && ( this.member.permissions.has('MANAGE_GUILD') || ( this.isOwner() && this.evalUsed ) );
};

Discord.Message.prototype.isOwner = function() {
	return process.env.owner.split('|').includes( this.author.id );
};

Discord.Message.prototype.showEmbed = function() {
	return this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('EMBED_LINKS');
};

Discord.Message.prototype.uploadFiles = function() {
	return this.channel.type !== 'text' || this.channel.permissionsFor(client.user).has('ATTACH_FILES');
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
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
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
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
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

Discord.Message.prototype.replyMsg = function(content, options = {}, ignorePause = false, allowDelete = true) {
	if ( this.channel.type !== 'text' || !pause[this.guild.id] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		if ( !options.allowedMentions ) options.allowedMentions = {users:[this.author.id]};
		return this.reply(content, options).then( msg => {
			if ( allowDelete ) {
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

/**
 * All users to delete their command responses.
 * @param {Discord.Message} msg - The response.
 * @param {String} author - The user.
 */
function allowDelete(msg, author) {
	msg.awaitReactions( (reaction, user) => reaction.emoji.name === '🗑️' && user.id === author, {max:1,time:120000} ).then( reaction => {
		if ( reaction.size ) {
			msg.delete().catch(log_error);
		}
	} );
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

client.on( 'message', msg => {
	if ( isStop || msg.type !== 'DEFAULT' || msg.system || msg.webhookID || msg.author.bot || msg.author.id === msg.client.user.id ) return;
	if ( !msg.content.hasPrefix(( msg.channel.type === 'text' && patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
		if ( msg.content === process.env.prefix + 'help' && ( msg.isAdmin() || msg.isOwner() ) ) {
			if ( msg.channel.permissionsFor(msg.client.user).has('SEND_MESSAGES') ) {
				console.log( msg.guild.name + ': ' + msg.content );
				db.get( 'SELECT lang FROM discord WHERE guild = ? AND (channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id], (dberror, row) => {
					if ( dberror ) console.log( '- Error while getting the lang: ' + dberror );
					msg.replyMsg( new Lang(( row || defaultSettings ).lang).get('general.prefix', patreons[msg.guild.id]), {}, true );
				} );
			}
		}
		if ( !( msg.content.includes( '[[' ) && msg.content.includes( ']]' ) ) && !( msg.content.includes( '{{' ) && msg.content.includes( '}}' ) ) ) return;
	}
	if ( msg.channel.type === 'text' ) {
		var permissions = msg.channel.permissionsFor(msg.client.user);
		var missing = permissions.missing(['SEND_MESSAGES','ADD_REACTIONS','USE_EXTERNAL_EMOJIS','READ_MESSAGE_HISTORY']);
		if ( missing.length ) {
			if ( msg.isAdmin() || msg.isOwner() ) {
				console.log( msg.guild.id + ': Missing permissions - ' + missing.join(', ') );
				if ( !missing.includes( 'SEND_MESSAGES' ) ) {
					db.get( 'SELECT lang FROM discord WHERE guild = ? AND (channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id], (dberror, row) => {
						if ( dberror ) console.log( '- Error while getting the lang: ' + dberror );
						if ( msg.content.hasPrefix(( patreons[msg.guild.id] || process.env.prefix ), 'm') ) {
							msg.replyMsg( new Lang(( row || defaultSettings ).lang).get('general.missingperm') + ' `' + missing.join('`, `') + '`', {}, true );
						}
					} );
				}
			}
			return;
		}
		db.get( 'SELECT wiki, lang, inline FROM discord WHERE guild = ? AND (channel = ? OR channel IS NULL) ORDER BY channel DESC', [msg.guild.id, msg.channel.id], (dberror, row) => {
			if ( dberror ) {
				console.log( '- Error while getting the wiki: ' + dberror );
				if ( permissions.has('SEND_MESSAGES') ) {
					msg.sendChannel( '⚠️ **Limited Functionality** ⚠️\nNo settings found, please contact the bot owner!\n' + process.env.invite, {}, true );
					newMessage(msg, new Lang());
				}
				return dberror;
			}
			if ( row ) newMessage(msg, new Lang(row.lang), row.wiki, patreons[msg.guild.id], row.inline);
			else {
				msg.defaultSettings = true;
				newMessage(msg, new Lang());
			}
		} );
	}
	else newMessage(msg, new Lang());
} );


client.on( 'voiceStateUpdate', (olds, news) => {
	if ( isStop || !( olds.guild.id in voice ) || !olds.guild.me.permissions.has('MANAGE_ROLES') || olds.channelID === news.channelID ) return;
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
	db.run( 'DELETE FROM discord WHERE guild = ?', [guild.id], function (dberror) {
		if ( dberror ) {
			console.log( '- Error while removing the settings: ' + dberror );
			return dberror;
		}
		if ( guild.id in patreons ) client.shard.broadcastEval( `delete global.patreons['${guild.id}']` );
		if ( guild.id in voice ) delete voice[guild.id];
		if ( this.changes ) console.log( '- Settings successfully removed.' );
	} );
	db.run( 'DELETE FROM verification WHERE guild = ?', [guild.id], function (dberror) {
		if ( dberror ) {
			console.log( '- Error while removing the verifications: ' + dberror );
			return dberror;
		}
		if ( this.changes ) console.log( '- Verifications successfully removed.' );
	} );
	db.run( 'DELETE FROM rcgcdw WHERE guild = ?', [guild.id], function (dberror) {
		if ( dberror ) {
			console.log( '- Error while removing the RcGcDw: ' + dberror );
			return dberror;
		}
		if ( this.changes ) console.log( '- RcGcDw successfully removed.' );
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

global.log_warn = function(warning, api = true) {
	if ( isDebug ) {
		console.warn( '--- Warning start ---\n' + util.inspect( warning ) + '\n--- Warning end ---' );
	} else {
		if ( api ) console.warn( '- Warning: ' + Object.keys(warning).join(', ') );
		else console.warn( '--- Warning ---\n' + util.inspect( warning ) );
	}
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
const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

global.isDebug = ( process.argv[2] === 'debug' );

const Lang = require('./util/i18n.js');
const Wiki = require('./util/wiki.js');
const newMessage = require('./util/newMessage.js');
const {allowDelete} = require('./util/functions.js');
global.patreons = {};
global.voice = {};
const db = require('./util/database.js');

const Discord = require('discord.js');
if ( !Discord.Permissions.FLAGS.SEND_MESSAGES_IN_THREADS ) Discord.Permissions.FLAGS.SEND_MESSAGES_IN_THREADS = Discord.Permissions.FLAGS.SEND_MESSAGES;
const client = new Discord.Client( {
	makeCache: Discord.Options.cacheWithLimits( {
		MessageManager: {
			maxSize: 100,
			sweepInterval: 300,
			sweepFilter: Discord.LimitedCollection.filterByLifetime( {
				lifetime: 300,
			} )
		},
		PresenceManager: 0
	} ),
	allowedMentions: {
		parse: [],
		repliedUser: true
	},
	failIfNotExists: false,
	presence: ( process.env.READONLY ? {
		status: 'dnd',
		activities: [{
			type: 'PLAYING',
			name: 'READONLY: ' + process.env.prefix + 'test' + ( process.env.SHARD_COUNT > 1 ? ' • Shard: ' + process.env.SHARDS : '' ),
		}],
		shardId: process.env.SHARDS
	} : {
		status: 'online',
		activities: [{
			type: 'STREAMING',
			name: process.env.prefix + 'help' + ( process.env.SHARD_COUNT > 1 ? ' • Shard: ' + process.env.SHARDS : '' ),
			url: 'https://www.twitch.tv/wikibot'
		}],
		shardId: process.env.SHARDS
	} ),
	intents: [
		Discord.Intents.FLAGS.GUILDS,
		Discord.Intents.FLAGS.GUILD_MESSAGES,
		Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
		Discord.Intents.FLAGS.GUILD_VOICE_STATES,
		Discord.Intents.FLAGS.GUILD_INTEGRATIONS,
		Discord.Intents.FLAGS.DIRECT_MESSAGES,
		Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS
	],
	partials: [
		'CHANNEL'
	]
} );

global.pause = {};
var isStop = false;
client.on( 'ready', () => {
	console.log( '\n- ' + process.env.SHARDS + ': Successfully logged in as ' + client.user.username + '!\n' );
	Object.keys(voice).forEach( guild => {
		if ( !client.guilds.cache.has(guild) ) delete voice[guild];
	} );
	client.application.commands.fetch();
} );


String.prototype.isMention = function(guild) {
	var text = this.trim();
	return text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.me.displayName );
};

Discord.Channel.prototype.isGuild = function(includeThreads = true) {
	return this.isText() && this.type.startsWith( 'GUILD_' ) && ( includeThreads || !this.isThread() );
}

Discord.Message.prototype.isAdmin = function() {
	return this.channel.isGuild() && this.member && ( this.member.permissions.has(Discord.Permissions.FLAGS.MANAGE_GUILD) || ( this.isOwner() && this.evalUsed ) );
};

Discord.Message.prototype.isOwner = function() {
	return process.env.owner.split('|').includes( this.author.id );
};

Discord.Message.prototype.showEmbed = function() {
	return !this.channel.isGuild() || this.channel.permissionsFor(client.user).has(Discord.Permissions.FLAGS.EMBED_LINKS);
};

Discord.Message.prototype.uploadFiles = function() {
	return !this.channel.isGuild() || this.channel.permissionsFor(client.user).has(Discord.Permissions.FLAGS.ATTACH_FILES);
};

String.prototype.replaceSave = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replace( /\$/g, '$$$$' ) : replacement ) );
};

Discord.Message.prototype.reactEmoji = function(name, ignorePause = false) {
	if ( !this.channel.isGuild() || !pause[this.guildId] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		var emoji = '<:error:440871715938238494>';
		switch ( name ) {
			case 'nowiki':
				emoji = '<:unknown_wiki:505884572001763348>';
				break;
			case 'error':
				emoji = '<:error:440871715938238494>';
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

Discord.Message.prototype.sendChannel = function(message, ignorePause = false) {
	if ( !this.channel.isGuild() || !pause[this.guildId] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
		return this.channel.send( message ).then( msg => {
			allowDelete(msg, this.author.id);
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

Discord.Message.prototype.sendChannelError = function(message) {
	if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
	return this.channel.send( message ).then( msg => {
		msg.reactEmoji('error');
		allowDelete(msg, this.author.id);
		return msg;
	}, error => {
		log_error(error);
		this.reactEmoji('error');
	} );
};

Discord.Message.prototype.replyMsg = function(message, ignorePause = false, letDelete = true) {
	if ( !this.channel.isGuild() || !pause[this.guildId] || ( ignorePause && ( this.isAdmin() || this.isOwner() ) ) ) {
		if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
		return this.reply( message ).then( msg => {
			if ( letDelete ) allowDelete(msg, this.author.id);
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
var buttons = {};
var buttonsMap = {
	verify_again: 'verify'
};
fs.readdir( './interactions', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		var command = require('./interactions/' + file);
		if ( command.hasOwnProperty('run') ) slash[command.name] = command.run;
		if ( command.hasOwnProperty('button') ) buttons[command.name] = command.button;
	} );
} );
/*
!test eval msg.client.api.applications(msg.client.user.id).commands.post( {
	data: require('../interactions/commands.json')[0]
} )
*/

client.on( 'interactionCreate', interaction => {
	if ( interaction.inGuild() && typeof interaction.member.permissions === 'string' ) {
		interaction.member.permissions = new Discord.Permissions(interaction.member.permissions);
	}
	if ( interaction.channel?.partial ) return interaction.channel.fetch().then( () => {
		if ( interaction.isCommand() ) return slash_command(interaction);
		if ( interaction.isButton() ) return message_button(interaction);
	}, log_error );
	if ( interaction.isCommand() ) return slash_command(interaction);
	if ( interaction.isButton() ) return message_button(interaction);
} );

/**
 * Handle slash commands.
 * @param {Discord.CommandInteraction} interaction - The interaction.
 */
function slash_command(interaction) {
	if ( interaction.commandName === 'inline' ) console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: /' + interaction.commandName );
	else console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
		return option.name + ':' + option.value;
	} ).join(' ') );
	if ( !slash.hasOwnProperty(interaction.commandName) ) return;
	if ( !interaction.inGuild() ) {
		return slash[interaction.commandName](interaction, new Lang(), new Wiki());
	}
	let sqlargs = [interaction.guildId];
	if ( interaction.channel?.isThread() ) sqlargs.push(interaction.channel.parentId, '#' + interaction.channel.parent?.parentId);
	else sqlargs.push(interaction.channelId, '#' + interaction.channel?.parentId);
	db.query( 'SELECT wiki, lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
		return slash[interaction.commandName](interaction, new Lang(( row?.lang || interaction.guild?.preferredLocale )), new Wiki(row?.wiki));
	}, dberror => {
		console.log( '- Slash: Error while getting the wiki: ' + dberror );
		return interaction.reply( {content: new Lang(interaction.guild?.preferredLocale, 'general').get('database') + '\n' + process.env.invite, ephemeral: true} ).catch(log_error);
	} );
}

/**
 * Handle message buttons.
 * @param {Discord.ButtonInteraction} interaction - The interaction.
 */
function message_button(interaction) {
	var cmd = ( buttonsMap.hasOwnProperty(interaction.customId) ? buttonsMap[interaction.customId] : interaction.customId );
	if ( !buttons.hasOwnProperty(cmd) ) return;
	if ( !interaction.inGuild() ) {
		return buttons[cmd](interaction, new Lang(), new Wiki());
	}
	let sqlargs = [interaction.guildId];
	if ( interaction.channel?.isThread() ) sqlargs.push(interaction.channel.parentId, '#' + interaction.channel.parent?.parentId);
	else sqlargs.push(interaction.channelId, '#' + interaction.channel?.parentId);
	db.query( 'SELECT wiki, lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
		return buttons[cmd](interaction, new Lang(( row?.lang || interaction.guild?.preferredLocale )), new Wiki(row?.wiki));
	}, dberror => {
		console.log( '- Button: Error while getting the wiki: ' + dberror );
		return interaction.reply( {content: new Lang(interaction.guild?.preferredLocale, 'general').get('database') + '\n' + process.env.invite, ephemeral: true} ).catch(log_error);
	} );
}

client.on( 'messageCreate', msg => {
	if ( msg.channel.partial ) return msg.channel.fetch().then( () => {
		return messageCreate(msg);
	}, log_error );
	return messageCreate(msg);
} );

/**
 * Handle new messages.
 * @param {Discord.Message} msg - The message.
 */
function messageCreate(msg) {
	if ( isStop || !msg.channel.isText() || msg.system || msg.webhookId || msg.author.bot || msg.author.id === msg.client.user.id ) return;
	if ( !msg.content.hasPrefix(( msg.channel.isGuild() && patreons[msg.guildId] || process.env.prefix ), 'm') ) {
		if ( msg.content === process.env.prefix + 'help' && ( msg.isAdmin() || msg.isOwner() ) ) {
			if ( msg.channel.permissionsFor(msg.client.user).has(( msg.channel.isThread() ? Discord.Permissions.FLAGS.SEND_MESSAGES_IN_THREADS : Discord.Permissions.FLAGS.SEND_MESSAGES )) ) {
				console.log( msg.guildId + ': ' + msg.content );
				let sqlargs = [msg.guildId];
				if ( msg.channel?.isThread() ) sqlargs.push(msg.channel.parentId, '#' + msg.channel.parent?.parentId);
				else sqlargs.push(msg.channelId, '#' + msg.channel.parentId);
				db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
					msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('prefix', patreons[msg.guildId]), true );
				}, dberror => {
					console.log( '- Error while getting the lang: ' + dberror );
					msg.replyMsg( new Lang(msg.guild.preferredLocale, 'general').get('prefix', patreons[msg.guildId]), true );
				} );
			}
			return;
		}
		if ( !( msg.content.includes( '[[' ) && msg.content.includes( ']]' ) ) && !( msg.content.includes( '{{' ) && msg.content.includes( '}}' ) ) ) return;
	}
	if ( msg.channel.isGuild() ) {
		let sqlargs = [msg.guildId];
		if ( msg.channel.isThread() ) sqlargs.push(msg.channel.parentId, '#' + msg.channel.parent?.parentId);
		else sqlargs.push(msg.channelId, '#' + msg.channel.parentId);
		var permissions = msg.channel.permissionsFor(msg.client.user);
		var missing = permissions.missing([
			( msg.channel.isThread() ? Discord.Permissions.FLAGS.SEND_MESSAGES_IN_THREADS : Discord.Permissions.FLAGS.SEND_MESSAGES ),
			Discord.Permissions.FLAGS.ADD_REACTIONS,
			Discord.Permissions.FLAGS.USE_EXTERNAL_EMOJIS,
			Discord.Permissions.FLAGS.READ_MESSAGE_HISTORY
		]);
		if ( missing.length ) {
			if ( ( msg.isAdmin() || msg.isOwner() ) && msg.content.hasPrefix(( patreons[msg.guildId] || process.env.prefix ), 'm') ) {
				console.log( msg.guildId + ': Missing permissions - ' + missing.join(', ') );
				if ( !missing.includes( 'SEND_MESSAGES' ) && !missing.includes( 'SEND_MESSAGES_IN_THREADS' ) ) {
					db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
						msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('missingperm') + ' `' + missing.join('`, `') + '`', true );
					}, dberror => {
						console.log( '- Error while getting the lang: ' + dberror );
						msg.replyMsg( new Lang(msg.guild.preferredLocale, 'general').get('missingperm') + ' `' + missing.join('`, `') + '`', true );
					} );
				}
			}
			return;
		}
		db.query( 'SELECT wiki, lang, role, inline FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
			if ( row ) {
				if ( msg.guild.roles.cache.has(row.role) && msg.guild.roles.cache.get(row.role).comparePositionTo(msg.member.roles.highest) > 0 && !msg.isAdmin() ) {
					msg.onlyVerifyCommand = true;
				}
				newMessage(msg, new Lang(row.lang), row.wiki, patreons[msg.guildId], row.inline);
			}
			else {
				msg.defaultSettings = true;
				newMessage(msg, new Lang(msg.guild.preferredLocale));
			}
		}, dberror => {
			console.log( '- Error while getting the wiki: ' + dberror );
			msg.sendChannel( new Lang(msg.guild.preferredLocale, 'general').get('database') + '\n' + process.env.invite, true );
		} );
	}
	else newMessage(msg, new Lang());
};


client.on( 'voiceStateUpdate', (olds, news) => {
	if ( isStop || !( voice.hasOwnProperty(olds.guild.id) ) || !olds.guild.me.permissions.has('MANAGE_ROLES') || olds.channelId === news.channelId ) return;
	var lang = new Lang(voice[olds.guild.id], 'voice');
	if ( olds.member && olds.channel ) {
		var oldrole = olds.member.roles.cache.find( role => role.name === lang.get('channel') + ' – ' + olds.channel.name );
		if ( oldrole && oldrole.comparePositionTo(olds.guild.me.roles.highest) < 0 ) {
			console.log( olds.guild.id + ': ' + olds.member.id + ' left the voice channel "' + olds.channelId + '".' );
			olds.member.roles.remove( oldrole, lang.get('left', olds.member.displayName, olds.channel.name) ).catch(log_error);
		}
	}
	if ( news.member && news.channel ) {
		var newrole = news.guild.roles.cache.find( role => role.name === lang.get('channel') + ' – ' + news.channel.name );
		if ( newrole && newrole.comparePositionTo(news.guild.me.roles.highest) < 0 ) {
			console.log( news.guild.id + ': ' + news.member.id + ' joined the voice channel "' + news.channelId + '".' );
			news.member.roles.add( newrole, lang.get('join', news.member.displayName, news.channel.name) ).catch(log_error);
		}
	}
} );


const leftGuilds = new Map();

client.on( 'guildCreate', guild => {
	console.log( '- ' + guild.id + ': I\'ve been added to a server.' );
	if ( leftGuilds.has(guild.id) ) {
		clearTimeout(leftGuilds.get(guild.id));
		leftGuilds.delete(guild.id);
	}
} );

client.on( 'guildDelete', guild => {
	if ( !guild.available ) {
		console.log( '- ' + guild.id + ': This server isn\'t responding.' );
		return;
	}
	console.log( '- ' + guild.id + ': I\'ve been removed from a server.' );
	leftGuilds.set(guild.id, setTimeout(removeSettings, 300000, guild.id).unref());
} );

function removeSettings(guild) {
	leftGuilds.delete(guild);
	if ( client.guilds.cache.has(guild) ) return;
	db.query( 'DELETE FROM discord WHERE main = $1', [guild] ).then( ({rowCount}) => {
		if ( patreons.hasOwnProperty(guild) ) client.shard.broadcastEval( (discordClient, evalData) => {
			delete global.patreons[evalData];
		}, {context: guild} );
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
	if ( isDebug ) console.log( '- ' + process.env.SHARDS + ': Debug: ' + debug );
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
		'Unrecognized value for parameter "prop": extracts',
		'Unrecognized value for parameter "prop": pageimages.',
		'Unrecognized value for parameter "prop": pageimages'
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
	console.log( '- ' + process.env.SHARDS + ': ' + signal + ': Preparing to close...' );
	setTimeout( () => {
		console.log( '- ' + process.env.SHARDS + ': ' + signal + ': Destroying client...' );
		client.destroy();
		db.end().then( () => {
			console.log( '- ' + process.env.SHARDS + ': ' + signal + ': Closed the database connection.' );
			process.exit(0);
		}, dberror => {
			console.log( '- ' + process.env.SHARDS + ': ' + signal + ': Error while closing the database connection: ' + dberror );
		} );
	}, 1000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

import './util/globals.js';
import { readdir } from 'node:fs';
import Discord from 'discord.js';
import db from './util/database.js';
import Lang from './util/i18n.js';
import Wiki from './util/wiki.js';
import newMessage from './util/newMessage.js';
import { breakOnTimeoutPause, allowDelete } from './util/functions.js';

const client = new Discord.Client( {
	makeCache: Discord.Options.cacheWithLimits( {
		MessageManager: 100,
		PresenceManager: 0
	} ),
	sweepers: {
		messages: {
			interval: 300,
			lifetime: 300
		}
	},
	allowedMentions: {
		parse: [],
		repliedUser: true
	},
	failIfNotExists: false,
	presence: ( process.env.READONLY ? {
		status: Discord.PresenceUpdateStatus.DoNotDisturb,
		activities: [{
			type: Discord.ActivityType.Watching,
			name: 'READONLY: ' + process.env.prefix + 'test' + ( process.env.SHARD_COUNT > 1 ? ' • Shard: ' + process.env.SHARDS : '' ),
		}],
		shardId: process.env.SHARDS
	} : {
		status: Discord.PresenceUpdateStatus.Online,
		activities: [{
			type: Discord.ActivityType.Streaming,
			name: process.env.prefix + 'help' + ( process.env.SHARD_COUNT > 1 ? ' • Shard: ' + process.env.SHARDS : '' ),
			url: 'https://www.twitch.tv/wikibot'
		}],
		shardId: process.env.SHARDS
	} ),
	intents: [
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMessages,
		Discord.GatewayIntentBits.GuildMessageReactions,
		//Discord.GatewayIntentBits.GuildIntegrations,
		Discord.GatewayIntentBits.DirectMessages,
		Discord.GatewayIntentBits.DirectMessageReactions,
		Discord.GatewayIntentBits.MessageContent
	],
	partials: [
		Discord.Partials.Channel
	]
} );

var isStop = false;
client.on( 'ready', () => {
	console.log( '\n- ' + process.env.SHARDS + ': Successfully logged in as ' + client.user.username + '!\n' );
	client.application.commands.fetch();
} );


String.prototype.isMention = function(guild) {
	var text = this.trim();
	return text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.members.me.displayName );
};

Discord.Message.prototype.isAdmin = function() {
	return this.inGuild() && this.member && ( this.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild) || ( this.isOwner() && this.evalUsed ) );
};

Discord.Message.prototype.isOwner = function() {
	return process.env.owner.split('|').includes( this.author.id );
};

Discord.Message.prototype.showEmbed = function() {
	return !this.inGuild() || this.channel.permissionsFor(client.user).has(Discord.PermissionFlagsBits.EmbedLinks);
};

Discord.Message.prototype.uploadFiles = function() {
	return !this.inGuild() || this.channel.permissionsFor(client.user).has(Discord.PermissionFlagsBits.AttachFiles);
};

String.prototype.replaceSave = function(pattern, replacement) {
	return this.replace( pattern, ( typeof replacement === 'string' ? replacement.replace( /\$/g, '$$$$' ) : replacement ) );
};

Discord.Message.prototype.reactEmoji = function(name, ignorePause = false) {
	if ( breakOnTimeoutPause(this, ignorePause) ) return Promise.resolve();
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
};

Discord.MessageReaction.prototype.removeEmoji = function() {
	return this.users.remove().catch(log_error);
};

Discord.Message.prototype.sendChannel = function(message, ignorePause = false) {
	if ( breakOnTimeoutPause(this, ignorePause) ) return Promise.resolve();
	if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
	return this.channel.send( message ).then( msg => {
		allowDelete(msg, this.author.id);
		return msg;
	}, error => {
		log_error(error);
		this.reactEmoji('error');
	} );
};

Discord.Message.prototype.sendChannelError = function(message) {
	if ( breakOnTimeoutPause(this) ) return Promise.resolve();
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
	if ( breakOnTimeoutPause(this, ignorePause) ) return Promise.resolve();
	if ( message?.embeds?.length && !message.embeds[0] ) message.embeds = [];
	return this.reply( message ).then( msg => {
		if ( letDelete ) allowDelete(msg, this.author.id);
		return msg;
	}, error => {
		log_error(error);
		this.reactEmoji('error');
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

var interaction_commands = {
	/** @type {{[x: string]: function(Interaction, Lang, Wiki)>}} */
	slash: {},
	/** @type {{[x: string]: function(Interaction, Lang, Wiki)>}} */
	modal: {},
	/** @type {{[x: string]: function(Interaction, Lang, Wiki)>}} */
	button: {}
};
readdir( './interactions', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		import('./interactions/' + file).then( ({default: command}) => {
			if ( command.hasOwnProperty('slash') ) interaction_commands.slash[command.name] = command.slash;
			if ( command.hasOwnProperty('modal') ) interaction_commands.modal[command.name] = command.modal;
			if ( command.hasOwnProperty('button') ) interaction_commands.button[command.name] = command.button;
		} );
	} );
} );
/*
!test eval msg.client.api.applications(msg.client.user.id).commands.post( {
	data: require('../interactions/commands/inline.json')
} )
*/

client.on( 'interactionCreate', interaction => {
	if ( interaction.inGuild() && typeof interaction.member.permissions === 'string' ) {
		interaction.member.permissions = new Discord.PermissionsBitField(interaction.member.permissions);
	}
	if ( interaction.channel?.partial ) return interaction.channel.fetch().then( () => {
		return interactionCreate(interaction);
	}, log_error );
	return interactionCreate(interaction);
} );

/**
 * Handle interactions.
 * @param {Discord.Interaction} interaction - The interaction.
 */
 function interactionCreate(interaction) {
	if ( breakOnTimeoutPause(interaction) ) return;
	var cmd = null;
	if ( interaction.type === Discord.InteractionType.ApplicationCommand ) {
		if ( interaction.commandName === 'inline' ) console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: /' + interaction.commandName );
		else console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Slash: /' + interaction.commandName + ' ' + interaction.options.data.map( option => {
			return option.name + ':' + option.value;
		} ).join(' ') );
		if ( !interaction_commands.slash.hasOwnProperty(interaction.commandName) ) return;
		cmd = interaction_commands.slash[interaction.commandName];
	}
	else if ( interaction.type === Discord.InteractionType.ModalSubmit ) {
		console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Modal: ' + interaction.customId + ' ' + interaction.fields.components.reduce( (prev, next) => {
			return prev.concat(next.components);
		}, [] ).map( option => {
			return option.customId + ':' + option.value;
		} ).join(' ') );
		if ( !interaction_commands.modal.hasOwnProperty(interaction.customId) ) return;
		cmd = interaction_commands.modal[interaction.customId];
	}
	else if ( interaction.isButton() ) {
		if ( interaction.customId !== 'verify_again' ) console.log( ( interaction.guildId || '@' + interaction.user.id ) + ': Button: ' + interaction.customId );
		if ( !interaction_commands.button.hasOwnProperty(interaction.customId) ) return;
		cmd = interaction_commands.button[interaction.customId];
	}
	else return;

	if ( !interaction.inGuild() ) {
		return cmd(interaction, new Lang(interaction.guildLocale), new Wiki());
	}
	let sqlargs = [interaction.guildId];
	if ( interaction.channel?.isThread() ) sqlargs.push(interaction.channel.parentId, '#' + interaction.channel.parent?.parentId);
	else sqlargs.push(interaction.channelId, '#' + interaction.channel?.parentId);
	db.query( 'SELECT wiki, lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
		return cmd(interaction, new Lang(( row?.lang || interaction.guildLocale )), new Wiki(row?.wiki));
	}, dberror => {
		console.log( '- Interaction: Error while getting the wiki: ' + dberror );
		return interaction.reply( {content: new Lang(( interaction.locale || interaction.guildLocale ), 'general').get('database') + '\n' + process.env.invite, ephemeral: true} ).catch(log_error);
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
	if ( isStop || !msg.channel.isTextBased() || msg.system || msg.webhookId || msg.author.bot || msg.author.id === msg.client.user.id ) return;
	if ( msg.member?.isCommunicationDisabled() || msg.guild?.members?.me?.isCommunicationDisabled() ) return;
	if ( !msg.content.hasPrefix(( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix ), 'm') ) {
		if ( msg.content === process.env.prefix + 'help' && ( msg.isAdmin() || msg.isOwner() ) ) {
			if ( msg.channel.permissionsFor(msg.client.user).has(( msg.channel.isThread() ? Discord.PermissionFlagsBits.SendMessagesInThreads : Discord.PermissionFlagsBits.SendMessages )) ) {
				console.log( msg.guildId + ': ' + msg.content );
				let sqlargs = [msg.guildId];
				if ( msg.channel?.isThread() ) sqlargs.push(msg.channel.parentId, '#' + msg.channel.parent?.parentId);
				else sqlargs.push(msg.channelId, '#' + msg.channel.parentId);
				db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
					msg.replyMsg( new Lang(( row?.lang || msg.guild.preferredLocale ), 'general').get('prefix', patreonGuildsPrefix.get(msg.guildId)), true );
				}, dberror => {
					console.log( '- Error while getting the lang: ' + dberror );
					msg.replyMsg( new Lang(msg.guild.preferredLocale, 'general').get('prefix', patreonGuildsPrefix.get(msg.guildId)), true );
				} );
			}
			return;
		}
		if ( !( msg.content.includes( '[[' ) && msg.content.includes( ']]' ) ) && !( msg.content.includes( '{{' ) && msg.content.includes( '}}' ) ) ) return;
	}
	if ( msg.inGuild() ) {
		let sqlargs = [msg.guildId];
		if ( msg.channel.isThread() ) sqlargs.push(msg.channel.parentId, '#' + msg.channel.parent?.parentId);
		else sqlargs.push(msg.channelId, '#' + msg.channel.parentId);
		var missing = new Discord.PermissionsBitField([
			( msg.channel.isThread() ? Discord.PermissionFlagsBits.SendMessagesInThreads : Discord.PermissionFlagsBits.SendMessages ),
			Discord.PermissionFlagsBits.AddReactions,
			Discord.PermissionFlagsBits.UseExternalEmojis,
			Discord.PermissionFlagsBits.ReadMessageHistory
		]).remove(msg.channel.permissionsFor(msg.client.user));
		if ( missing > 0n ) {
			if ( ( msg.isAdmin() || msg.isOwner() ) && msg.content.hasPrefix(( patreonGuildsPrefix.get(msg.guildId) ?? process.env.prefix ), 'm') ) {
				console.log( msg.guildId + ': Missing permissions - ' + missing.toArray().join(', ') );
				if ( !missing.has(Discord.PermissionFlagsBits.SendMessages) && !missing.has(Discord.PermissionFlagsBits.SendMessagesInThreads) ) {
					db.query( 'SELECT lang FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
						return row?.lang;
					}, dberror => {
						console.log( '- Error while getting the lang: ' + dberror );
					} ).then( lang => {
						msg.sendChannel( {
							content: new Lang(( lang || msg.guild.preferredLocale ), 'general').get('missingperm') + ' `' + missing.toArray().join('`, `') + '`',
							reply: ( missing.has(Discord.PermissionFlagsBits.ReadMessageHistory) ? undefined : {messageReference: msg.id} )
						}, true );
					} );
				}
			}
			return;
		}
		db.query( 'SELECT wiki, lang, role, inline, (SELECT array_agg(ARRAY[prefixchar, prefixwiki] ORDER BY prefixchar) FROM subprefix WHERE guild = $1) AS subprefixes FROM discord WHERE guild = $1 AND (channel = $2 OR channel = $3 OR channel IS NULL) ORDER BY channel DESC NULLS LAST LIMIT 1', sqlargs ).then( ({rows:[row]}) => {
			if ( row ) {
				if ( msg.guild.roles.cache.has(row.role) && msg.guild.roles.cache.get(row.role).comparePositionTo(msg.member.roles.highest) > 0 && !msg.isAdmin() ) {
					msg.onlyVerifyCommand = true;
				}
				let subprefixes = ( row.subprefixes?.length ? new Map(row.subprefixes) : undefined );
				newMessage(msg, new Lang(row.lang), row.wiki, patreonGuildsPrefix.get(msg.guildId), row.inline, subprefixes);
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
	leftGuilds.set(guild.id, setTimeout(removeSettings, 300_000, guild.id).unref());
} );

function removeSettings(guild) {
	leftGuilds.delete(guild);
	if ( client.guilds.cache.has(guild) ) return;
	db.query( 'DELETE FROM discord WHERE main = $1', [guild] ).then( ({rowCount}) => {
		if ( patreonGuildsPrefix.has(guild) ) client.shard.broadcastEval( (discordClient, evalData) => {
			patreonGuildsPrefix.delete(evalData);
		}, {context: guild} );
		if ( rowCount ) console.log( '- ' + guild + ': Settings successfully removed.' );
	}, dberror => {
		console.log( '- ' + guild + ': Error while removing the settings: ' + dberror );
	} );
}


client.on( 'error', error => log_error(error, true) );
client.on( 'warn', warning => log_warning(warning, false) );

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
	}, 1_000 ).unref();
}

process.once( 'SIGINT', graceful );
process.once( 'SIGTERM', graceful );

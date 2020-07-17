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
	}
} );

const {defaultSettings, wikiProjects} = require('./util/default.json');
const Lang = require('./util/i18n.js');
const newMessage = require('./util/newMessage.js');
global.patreons = {};
global.voice = {};
var db = require('./util/database.js');

const Discord = require('discord.js');
var client = new Discord.Client( {
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
	client.ready = true;
	console.log( '\n- ' + shardId + ': Successfully logged in as ' + client.user.username + '!\n' );
	Object.keys(voice).forEach( guild => {
		if ( !client.guilds.cache.has(guild) ) delete voice[guild];
	} );
} );
client.on( 'shardDisconnect', () => client.ready = false );


String.prototype.noWiki = function(href) {
	if ( !href ) return true;
	else if ( this.startsWith( 'https://www.' ) && ( this.endsWith( '.gamepedia.com/' ) || this.isFandom() ) ) return true;
	else if ( this.isFandom() ) return [
		this.replace( /^https:\/\/([a-z\d-]{1,50}\.(?:fandom\.com|wikia\.org))\/(?:[a-z-]{1,8}\/)?$/, 'https://community.fandom.com/wiki/Community_Central:Not_a_valid_community?from=$1' ),
		this + 'language-wikis'
	].includes( href.replace( /Unexpected token < in JSON at position 0 in "([^ ]+)"/, '$1' ) );
	else return false;
};

String.prototype.isFandom = function() {
	return /^https:\/\/[a-z\d-]{1,50}\.(?:fandom\.com|wikia\.org)\/(?:[a-z-]{1,8}\/)?$/.test(this);
};

String.prototype.isMention = function(guild) {
	var text = this.trim();
	return text === '@' + client.user.username || text.replace( /^<@!?(\d+)>$/, '$1' ) === client.user.id || ( guild && text === '@' + guild.me.displayName );
};

Discord.Message.prototype.isAdmin = function() {
	return this.channel.type === 'text' && this.member && ( this.member.permissions.has('MANAGE_GUILD') || ( this.isOwner() && this.evalUsed ) );
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

String.prototype.toLink = function(title = '', querystring = '', fragment = '', {server: serverURL, articlepath: articlePath}, isMarkdown = false) {
	var linksuffix = ( querystring ? '?' + querystring : '' ) + ( fragment ? '#' + fragment.toSection() : '' );
	if ( serverURL && articlePath ) return serverURL.replace( /^(?:https?:)?\/\//, 'https://' ) + articlePath.replaceSave( '$1', title.toTitle(isMarkdown, articlePath.includes( '?' )) ) + ( articlePath.includes( '?' ) && linksuffix.startsWith( '?' ) ? '&' + linksuffix.substring(1) : linksuffix );
	if ( this.endsWith( '.gamepedia.com/' ) ) return this + title.toTitle(isMarkdown) + linksuffix;
	if ( this.isFandom() ) return this + 'wiki/' + title.toTitle(isMarkdown) + linksuffix;
	let project = wikiProjects.find( project => this.split('/')[2].endsWith( project.name ) );
	if ( project ) {
		let regex = this.match( new RegExp( project.regex ) );
		if ( regex ) return 'https://' + regex[1] + project.articlePath + title.toTitle(isMarkdown, project.articlePath.includes( '?' )) + ( project.articlePath.includes( '?' ) && linksuffix.startsWith( '?' ) ? '&' + linksuffix.substring(1) : linksuffix );
	}
	return this + 'index.php?title=' + title.toTitle(isMarkdown, true) + ( linksuffix.startsWith( '?' ) ? '&' + linksuffix.substring(1) : linksuffix );
};

String.prototype.toDescLink = function(title = '') {
	return this + 'wiki/' + encodeURIComponent( title.replace( / /g, '_' ) );
};

String.prototype.toTitle = function(isMarkdown = false, inQuery = false) {
	var title = this.replace( / /g, '_' ).replace( /\%/g, '%25' ).replace( /\\/g, '%5C' ).replace( /\?/g, '%3F' ).replace( /@(here|everyone)/g, '%40$1' );
	if ( inQuery ) title = title.replace( /\&/g, '%26' );
	if ( isMarkdown ) title = title.replace( /([\(\)])/g, '\\$1' );
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

String.prototype.toMarkdown = function(wiki, path, title = '') {
	var text = this.replace( /[\(\)\\]/g, '\\$&' );
	var link = null;
	var regex = /\[\[(?:([^\|\]]+)\|)?([^\]]+)\]\]([a-z]*)/g;
	while ( ( link = regex.exec(text) ) !== null ) {
		var pagetitle = ( link[1] || link[2] );
		var page = wiki.toLink(( /^[#\/]/.test(pagetitle) ? title + ( pagetitle.startsWith( '/' ) ? pagetitle : '' ) : pagetitle ), '', ( pagetitle.startsWith( '#' ) ? pagetitle.substring(1) : '' ), path, true);
		text = text.replaceSave( link[0], '[' + link[2] + link[3] + '](' + page + ')' );
	}
	regex = /\/\*\s*([^\*]+?)\s*\*\/\s*(.)?/g;
	while ( title !== '' && ( link = regex.exec(text) ) !== null ) {
		text = text.replaceSave( link[0], '[→' + link[1] + '](' + wiki.toLink(title, '', link[1], path, true) + ')' + ( link[2] ? ': ' + link[2] : '' ) );
	}
	return text.escapeFormatting(true);
};

String.prototype.toPlaintext = function() {
	return this.replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, '$1' ).replace( /\/\*\s*([^\*]+?)\s*\*\//g, '→$1:' ).escapeFormatting();
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
		var emoji = '440871715938238494';
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
		if ( !options.allowedMentions ) options.allowedMentions = {parse:[]};
		return this.channel.send(content, options).then( msg => {
			if ( msg.length ) msg.forEach( message => message.allowDelete(this.author.id) );
			else msg.allowDelete(this.author.id);
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
	if ( !options.allowedMentions ) options.allowedMentions = {parse:[]};
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
				if ( msg.length ) msg.forEach( message => message.allowDelete(this.author.id) );
				else msg.allowDelete(this.author.id);
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

Discord.Message.prototype.deleteMsg = function(timeout = 0) {
	return this.delete({timeout}).catch(log_error);
};

Discord.Message.prototype.allowDelete = function(author) {
	return this.awaitReactions( (reaction, user) => reaction.emoji.name === '🗑️' && user.id === author, {max:1,time:120000} ).then( reaction => {
		if ( reaction.size ) {
			this.deleteMsg();
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
					msg.replyMsg( new Lang(( row || defaultSettings ).lang).get('prefix', patreons[msg.guild.id]), {}, true );
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
							msg.replyMsg( new Lang(( row || defaultSettings ).lang).get('missingperm') + ' `' + missing.join('`, `') + '`', {}, true );
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
		console.log( '- Settings successfully removed.' );
	} );
	db.run( 'DELETE FROM verification WHERE guild = ?', [guild.id], function (dberror) {
		if ( dberror ) {
			console.log( '- Error while removing the verifications: ' + dberror );
			return dberror;
		}
		console.log( '- Verifications successfully removed.' );
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

async function graceful(signal) {
	isStop = true;
	console.log( '- ' + shardId + ': ' + signal + ': Preparing to close...' );
	setTimeout( async () => {
		console.log( '- ' + shardId + ': ' + signal + ': Destroying client...' );
		await client.destroy();
		await db.close( dberror => {
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
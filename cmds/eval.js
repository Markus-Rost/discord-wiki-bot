const util = require('util');
util.inspect.defaultOptions = {compact:false,breakLength:Infinity};

const cheerio = require('cheerio');
const Discord = require('discord.js');
const {limit: {verification: verificationLimit, rcgcdw: rcgcdwLimit}} = require('../util/default.json');
const newMessage = require('../util/newMessage.js');
const Wiki = require('../util/wiki.js');
var db = require('../util/database.js');

/**
 * Processes the "eval" command.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {Discord.Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {Wiki} wiki - The wiki for the message.
 * @async
 */
async function cmd_eval(lang, msg, args, line, wiki) {
	try {
		var text = util.inspect( await eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.toString();
	}
	if ( isDebug ) console.log( '--- EVAL START ---\n' + text + '\n--- EVAL END ---' );
	if ( text.length > 2000 ) msg.reactEmoji('✅', true);
	else msg.sendChannel( '```js\n' + text + '\n```', {split:{prepend:'```js\n',append:'\n```'},allowedMentions:{}}, true );

	/**
	 * Runs a command with admin permissions.
	 * @param {String} cmdline - The message text.
	 */
	function backdoor(cmdline) {
		msg.evalUsed = true;
		newMessage(msg, lang, wiki, patreons[msg.guild.id], msg.noInline, cmdline);
		return cmdline;
	}
}

/**
 * Runs database queries.
 * @param {String} sql - The SQL command.
 * @param {String[]} [sqlargs] - The command arguments.
 */
function database(sql, sqlargs = []) {
	return new Promise( function (resolve, reject) {
		db.all( sql, sqlargs, (error, rows) => {
			if (error) reject(error);
			resolve(rows);
		} );
	} );
}

/**
 * Checks a wiki and it's recent changes webhooks.
 * @param {Wiki} wiki - The wiki to check.
 */
function checkWiki(wiki) {
	wiki = Wiki.fromInput(wiki);
	return got.get( wiki + 'api.php?&action=query&meta=siteinfo&siprop=general' + ( wiki.isFandom() ? '|variables' : '' ) + '&list=recentchanges&rcshow=!bot&rctype=edit|new|log|categorize&rcprop=ids&rclimit=1&format=json' ).then( response => {
		if ( response.statusCode === 404 && typeof response.body === 'string' ) {
			let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
			if ( api ) {
				wiki = new Wiki(api.split('api.php?')[0], wiki);
				return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general' + ( wiki.isFandom() ? '|variables' : '' ) + '&list=recentchanges&rcshow=!bot&rctype=edit|new|log|categorize&rcprop=ids&rclimit=1&format=json' );
			}
		}
		return response;
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body?.query?.recentchanges ) {
			return response.statusCode + ': Error while getting the recent changes: ' + body?.error?.info;
		}
		wiki.updateWiki(body.query.general);
		var result = {
			wiki: wiki.href,
			rcid: ( body.query.recentchanges[0]?.rcid || 0 ),
			wikiid: ( body.query.variables?.find?.( variable => variable?.id === 'wgCityId' )?.['*'] || null ),
			postid: null
		}
		return Promise.all([
			database('SELECT guild, lang, display, rcid, wikiid, postid FROM rcgcdw WHERE wiki = ?', [result.wiki]).then( rows => {
				result.rcgcdb = rows;
			}, error => {
				result.rcgcdb = error.toString();
			} ),
			( result.wikiid ? got.get( 'https://services.fandom.com/discussion/' + result.wikiid + '/posts?limit=1&format=json&cache=' + Date.now(), {
				headers: {
					Accept: 'application/hal+json'
				}
			} ).then( dsresponse => {
				var dsbody = dsresponse.body;
				if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
					if ( dsbody?.title !== 'site doesn\'t exists' ) result.postid = dsresponse.statusCode + ': Error while getting the discussions: ' + dsbody?.title;
				}
				else result.postid = ( dsbody._embedded?.['doc:posts']?.[0]?.id || 0 );
			}, error => {
				result.postid = 'Error while getting the discussions: ' + error;
			} ) : null )
		]).then( () => {
			return result;
		} );
	}, error => {
		return 'Error while getting the recent changes: ' + error;
	} );
}

/**
 * Update the list of all sites.
 * @returns {Promise<Object[]>}
 */
function updateAllSites() {
	return require('../util/allSites.js').update();
}

/**
 * Removes the patreon features for a guild.
 * @param {String} guild - The guild ID.
 * @param {Discord.Message} msg - The Discord message.
 */
function removePatreons(guild, msg) {
	try {
		if ( !( typeof guild === 'string' || msg instanceof Discord.Message ) ) {
			return 'removePatreons(guild, msg) – No guild or message provided!';
		}
		db.get( 'SELECT lang, inline FROM discord WHERE guild = ? AND channel IS NULL', [guild], (dberror, row) => {
			try {
				if ( dberror ) {
					console.log( '- Error while getting the guild: ' + dberror );
					msg.replyMsg( 'I got an error while searching for the guild!', {}, true );
					return dberror;
				}
				if ( !row ) {
					msg.replyMsg( 'that guild doesn\'t exist!', {}, true );
					return;
				}
				db.run( 'UPDATE discord SET lang = ?, inline = ?, prefix = ?, patreon = NULL WHERE guild = ?', [row.lang, row.inline, process.env.prefix, guild], function (error) {
					try {
						if ( error ) {
							console.log( '- Error while updating the guild: ' + error );
							msg.replyMsg( 'I got an error while updating the guild!', {}, true );
							return error;
						}
						console.log( '- Guild successfully updated.' );
						msg.client.shard.broadcastEval( `delete global.patreons['${guild}']`);
						msg.replyMsg( 'the patreon features are now disabled on that guild.', {}, true );
					}
					catch ( tryerror ) {
						console.log( '- Error while removing the patreon features: ' + tryerror );
					}
				} );
			}
			catch ( tryerror ) {
				console.log( '- Error while removing the patreon features: ' + tryerror );
			}
		} );
		db.all( 'SELECT configid FROM verification WHERE guild = ? ORDER BY configid ASC', [guild], (dberror, rows) => {
			if ( dberror ) {
				console.log( '- Error while getting the verifications: ' + dberror );
				return dberror;
			}
			var ids = rows.slice(verificationLimit.default).map( row => row.configid );
			if ( ids.length ) db.run( 'DELETE FROM verification WHERE guild = ? AND configid IN (' + ids.map( configid => '?' ).join(', ') + ')', [guild, ...ids], function (error) {
				if ( error ) {
					console.log( '- Error while deleting the verifications: ' + error );
					return error;
				}
				console.log( '- Verifications successfully deleted.' );
			} );
		} );
		db.all( 'SELECT webhook FROM rcgcdw WHERE guild = ? ORDER BY configid ASC', [guild], (dberror, rows) => {
			if ( dberror ) {
				console.log( '- Error while getting the RcGcDw: ' + dberror );
				return dberror;
			}
			var webhooks = rows.slice(rcgcdwLimit.default).map( row => row.webhook );
			if ( webhooks.length ) db.run( 'DELETE FROM rcgcdw WHERE webhook IN (' + webhooks.map( webhook => '?' ).join(', ') + ')', webhooks, function (error) {
				if ( error ) {
					console.log( '- Error while deleting the RcGcDw: ' + error );
					return error;
				}
				console.log( '- RcGcDw successfully deleted.' );
				webhooks.forEach( hook => guild.client.fetchWebhook(...hook.split('/')).then( webhook => {
					webhook.delete('Removed extra recent changes webhook').catch(log_error);
				}, log_error ) );
			} );
		} );
		db.run( 'UPDATE rcgcdw SET display = ? WHERE guild = ? AND display > ?', [rcgcdwLimit.display, guild, rcgcdwLimit.display], function (dberror) {
			if ( dberror ) {
				console.log( '- Error while updating the RcGcDw: ' + dberror );
				return dberror;
			}
			console.log( '- RcGcDw successfully updated.' );
		} );
	}
	catch ( tryerror ) {
		console.log( '- Error while removing the patreon features: ' + tryerror );
		return 'removePatreons(guild, msg) – Error while removing the patreon features: ' + tryerror;
	}
}

/**
 * Removes the settings for deleted guilds and channels.
 * @param {Discord.Message} msg - The Discord message.
 */
function removeSettings(msg) {
	if ( !msg ) return 'removeSettings(msg) – No message provided!';
	try {
		msg.client.shard.broadcastEval( `[[...this.guilds.cache.keys()], [...this.channels.cache.filter( channel => channel.isGuild() ).keys()]]` ).then( results => {
			var all_guilds = results.map( result => result[0] ).reduce( (acc, val) => acc.concat(val), [] );
			var all_channels = results.map( result => result[1] ).reduce( (acc, val) => acc.concat(val), [] );
			var guilds = [];
			var channels = [];
			db.each( 'SELECT guild, channel FROM discord', [], (dberror, row) => {
				if ( dberror ) {
					console.log( '- Error while getting the setting: ' + dberror );
					return dberror;
				}
				if ( !row.channel && !all_guilds.includes(row.guild) ) {
					if ( row.guild in patreons ) msg.client.shard.broadcastEval( `delete global.patreons['${row.guild}']` );
					if ( row.guild in voice ) delete voice[row.guild];
					return guilds.push(row.guild);
				}
				if ( row.channel && all_guilds.includes(row.guild) && !all_channels.includes(row.channel) ) return channels.push(row.channel);
			}, (error) => {
				if ( error ) {
					console.log( '- Error while getting the settings: ' + error );
					msg.replyMsg( 'I got an error while getting the settings!', {}, true );
					return error;
				}
				if ( guilds.length ) {
					db.run( 'DELETE FROM discord WHERE guild IN (' + guilds.map( guild => '?' ).join(', ') + ')', guilds, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while removing the guilds: ' + dberror );
							msg.replyMsg( 'I got an error while removing the guilds!', {}, true );
							return dberror;
						}
						console.log( '- Guilds successfully removed.' );
					} );
					db.run( 'DELETE FROM verification WHERE guild IN (' + guilds.map( guild => '?' ).join(', ') + ')', guilds, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while removing the verifications: ' + dberror );
							msg.replyMsg( 'I got an error while removing the verifications!', {}, true );
							return dberror;
						}
						console.log( '- Verifications successfully removed.' );
					} );
					db.run( 'DELETE FROM rcgcdw WHERE guild IN (' + guilds.map( guild => '?' ).join(', ') + ')', guilds, function (dberror) {
						if ( dberror ) {
							console.log( '- Error while removing the RcGcDw: ' + dberror );
							msg.replyMsg( 'I got an error while removing the RcGcDw!', {}, true );
							return dberror;
						}
						console.log( '- Verifications successfully removed.' );
					} );
				}
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( channel => '?' ).join(', ') + ')', channels, function (dberror) {
					if ( dberror ) {
						console.log( '- Error while removing the channels: ' + dberror );
						msg.replyMsg( 'I got an error while removing the channels!', {}, true );
						return dberror;
					}
					console.log( '- Channels successfully removed.' );
				} );
				if ( !guilds.length && !channels.length ) console.log( '- Settings successfully removed.' );
			} );
		} );
	}
	catch ( tryerror ) {
		console.log( '- Error while removing the settings: ' + tryerror );
		return 'removeSettings(msg) – Error while removing the settings: ' + tryerror;
	}
}

module.exports = {
	name: 'eval',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_eval
};

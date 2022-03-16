import { inspect } from 'util';
import cheerio from 'cheerio';
import Discord from 'discord.js';
import { got } from '../util/functions.js';
import newMessage from '../util/newMessage.js';
import Wiki from '../util/wiki.js';
import db from '../util/database.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {limit: {verification: verificationLimit, rcgcdw: rcgcdwLimit}} = require('../util/default.json');

inspect.defaultOptions = {compact: false, breakLength: Infinity};

/**
 * Processes the "eval" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {Discord.Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {Wiki} wiki - The wiki for the message.
 * @async
 */
async function cmd_eval(lang, msg, args, line, wiki) {
	try {
		var text = inspect( await eval( args.join(' ') ) );
	} catch ( error ) {
		var text = error.toString();
	}
	if ( isDebug ) console.log( '--- EVAL START ---\n' + text + '\n--- EVAL END ---' );
	if ( text.length > 1990 ) msg.reactEmoji('✅', true);
	else msg.sendChannel( '```js\n' + text + '\n```', true );

	/**
	 * Runs a command with admin permissions.
	 * @param {String} cmdline - The message text.
	 */
	function backdoor(cmdline) {
		msg.evalUsed = true;
		msg.onlyVerifyCommand = false;
		newMessage(msg, lang, wiki, patreonGuildsPrefix.get(msg.guildId), msg.noInline, cmdline);
		return cmdline;
	}
}

/**
 * Runs database queries.
 * @param {String} sql - The SQL command.
 * @param {String[]} [sqlargs] - The command arguments.
 */
function database(sql, sqlargs = []) {
	return db.query( sql, sqlargs ).then( ({rows}) => {
		return rows;
	} );
}

/**
 * Checks a wiki and it's recent changes webhooks.
 * @param {Wiki} wiki - The wiki to check.
 */
function checkWiki(wiki) {
	wiki = Wiki.fromInput(wiki);
	if ( !wiki ) return `Couldn't resolve "${wiki}" into a valid url.`;
	return got.get( wiki + 'api.php?&action=query&meta=siteinfo&siprop=general&list=recentchanges&rcshow=!bot&rctype=edit|new|log|categorize&rcprop=ids|timestamp&rclimit=100&format=json' ).then( response => {
		if ( response.statusCode === 404 && typeof response.body === 'string' ) {
			let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
			if ( api ) {
				wiki = new Wiki(api.split('api.php?')[0], wiki);
				return got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&list=recentchanges&rcshow=!bot&rctype=edit|new|log|categorize&rcprop=ids|timestamp&rclimit=100&format=json' );
			}
		}
		return response;
	} ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || body?.batchcomplete === undefined || !body?.query?.recentchanges ) {
			return response.statusCode + ': Error while checking the wiki: ' + body?.error?.info;
		}
		wiki.updateWiki(body.query.general);
		var result = {
			wiki: wiki.href,
			activity: [],
			rcid: 0,
			postid: '-1'
		}
		var rc = body.query.recentchanges;
		if ( rc.length ) {
			result.rcid = rc[0].rcid;
			let text = '';
			let len = ( Date.parse(rc[0].timestamp) - Date.parse(rc[rc.length - 1].timestamp) ) / 60_000;
			len = Math.round(len);
			let rdays = ( len / 1440 );
			let days = Math.floor(rdays);
			if ( days > 0 ) {
				if ( days === 1 ) text += ` ${days} day`;
				else text += ` ${days} days`;
			}
			let rhours = ( rdays - days ) * 24;
			let hours = Math.floor(rhours);
			if ( hours > 0 ) {
				if ( text.length ) text += ' and';
				if ( hours === 1 ) text += ` ${hours} hour`;
				else text += ` ${hours} hours`;
			}
			let rminutes = ( rhours - hours ) * 60;
			let minutes = Math.round(rminutes);
			if ( minutes > 0 ) {
				if ( text.length ) text += ' and';
				if ( minutes === 1 ) text += ` ${minutes} minute`;
				else text += ` ${minutes} minutes`;
			}
			result.activity.push(`${rc.length} edits in${text}`);
		}
		return Promise.all([
			db.query( 'SELECT guild, lang, display, rcid, postid FROM rcgcdw WHERE wiki = $1', [result.wiki] ).then( ({rows}) => {
				result.rcgcdb = rows;
			}, dberror => {
				result.rcgcdb = dberror.toString();
			} ),
			( wiki.isFandom() ? got.get( wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&sortDirection=descending&sortKey=creation_date&limit=100&format=json&cache=' + Date.now(), {
				headers: {
					Accept: 'application/hal+json'
				}
			} ).then( dsresponse => {
				var dsbody = dsresponse.body;
				if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.status === 404 ) {
					if ( dsbody?.status !== 404 ) result.postid = dsresponse.statusCode + ': Error while checking discussions: ' + dsbody?.title;
					return;
				}
				var posts = dsbody._embedded?.['doc:posts'];
				result.postid = ( posts[0]?.id || '0' );
				if ( posts?.length ) {
					let text = '';
					let len = ( posts[0].creationDate.epochSecond - posts[posts.length - 1].creationDate.epochSecond ) / 60;
					len = Math.round(len);
					let rdays = ( len / 1440 );
					let days = Math.floor(rdays);
					if ( days > 0 ) {
						if ( days === 1 ) text += ` ${days} day`;
						else text += ` ${days} days`;
					}
					let rhours = ( rdays - days ) * 24;
					let hours = Math.floor(rhours);
					if ( hours > 0 ) {
						if ( text.length ) text += ' and';
						if ( hours === 1 ) text += ` ${hours} hour`;
						else text += ` ${hours} hours`;
					}
					let rminutes = ( rhours - hours ) * 60;
					let minutes = Math.round(rminutes);
					if ( minutes > 0 ) {
						if ( text.length ) text += ' and';
						if ( minutes === 1 ) text += ` ${minutes} minute`;
						else text += ` ${minutes} minutes`;
					}
					result.activity.push(`${posts.length} posts in${text}`);
				}
			}, error => {
				result.postid = 'Error while checking discussions: ' + error;
			} ) : null )
		]).then( () => {
			return result;
		} );
	}, error => {
		return 'Error while checking the wiki: ' + error;
	} );
}

/**
 * Removes the patreon features for a guild.
 * @param {String} guild - The guild ID.
 * @param {Discord.Message} msg - The Discord message.
 */
function removePatreons(guild, msg) {
	if ( !( typeof guild === 'string' || msg instanceof Discord.Message ) ) {
		return 'removePatreons(guild, msg) – No guild or message provided!';
	}
	return db.connect().then( client => {
		var messages = [];
		return client.query( 'SELECT lang, role, inline FROM discord WHERE guild = $1 AND channel IS NULL', [guild] ).then( ({rows:[row]}) => {
			if ( !row ) {
				messages.push('The guild doesn\'t exist!');
				return Promise.reject();
			}
			return client.query( 'UPDATE discord SET lang = $1, role = $2, inline = $3, prefix = $4, patreon = NULL WHERE guild = $5', [row.lang, row.role, row.inline, process.env.prefix, guild] ).then( ({rowCount}) => {
				if ( rowCount ) {
					console.log( '- Guild successfully updated.' );
					messages.push('Guild successfully updated.');
				}
				msg.client.shard.broadcastEval( (discordClient, evalData) => {
					patreonGuildsPrefix.delete(evalData);
				}, {context: guild} );
			}, dberror => {
				console.log( '- Error while updating the guild: ' + dberror );
				messages.push('Error while updating the guild: ' + dberror);
				return Promise.reject();
			} ).then( () => {
				return client.query( 'DELETE FROM discord WHERE guild = $1 AND channel LIKE $2 RETURNING channel, wiki', [guild, '#%'] ).then( ({rows}) => {
					if ( rows.length ) {
						console.log( '- Channel categories successfully deleted.' );
						messages.push('Channel categories successfully deleted.');
						return msg.client.shard.broadcastEval( (discordClient, evalData) => {
							if ( discordClient.guilds.cache.has(evalData.guild) ) {
								let rows = evalData.rows;
								return discordClient.guilds.cache.get(evalData.guild).channels.cache.filter( channel => {
									return ( ( channel.isText() && !channel.isThread() ) && rows.some( row => {
										return ( row.channel === '#' + channel.parentId );
									} ) );
								} ).map( channel => {
									return {
										id: channel.id,
										wiki: rows.find( row => {
											return ( row.channel === '#' + channel.parentId );
										} ).wiki
									};
								} );
							}
						}, {
							context: {guild, rows},
							shard: Discord.ShardClientUtil.shardIdForGuildId(guild, msg.client.shard.count)
						} ).then( channels => {
							if ( channels.length ) return Promise.all(channels.map( channel => {
								return client.query( 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES($1, $2, $3, $4, $5, $6, $7)', [channel.wiki, guild, channel.id, row.lang, row.role, row.inline, process.env.prefix] ).catch( dberror => {
									if ( dberror.message !== 'duplicate key value violates unique constraint "discord_guild_channel_key"' ) {
										console.log( '- Error while adding category settings to channels: ' + dberror );
									}
								} );
							} ));
						}, error => {
							console.log( '- Error while getting the channels in categories: ' + error );
							messages.push('Error while getting the channels in categories: ' + error);
						} );
					}
				}, dberror => {
					console.log( '- Error while deleting the channel categories: ' + dberror );
					messages.push('Error while deleting the channel categories: ' + dberror);
					return Promise.reject();
				} );
			} );
		}, dberror => {
			console.log( '- Error while getting the guild: ' + dberror );
			messages.push('Error while getting the guild: ' + dberror);
			return Promise.reject();
		} ).then( () => {
			return client.query( 'SELECT configid FROM verification WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [guild, verificationLimit.default] ).then( ({rows}) => {
				if ( rows.length ) {
					return client.query( 'DELETE FROM verification WHERE guild = $1 AND configid IN (' + rows.map( (row, i) => '$' + ( i + 2 ) ).join(', ') + ')', [guild, ...rows.map( row => row.configid )] ).then( () => {
						console.log( '- Verifications successfully deleted.' );
						messages.push('Verifications successfully deleted.');
					}, dberror => {
						console.log( '- Error while deleting the verifications: ' + dberror );
						messages.push('Error while deleting the verifications: ' + dberror);
					} );
				}
			}, dberror => {
				console.log( '- Error while getting the verifications: ' + dberror );
				messages.push('Error while getting the verifications: ' + dberror);
			} );
		} ).then( () => {
			return client.query( 'SELECT webhook FROM rcgcdw WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [guild, rcgcdwLimit.default] ).then( ({rows}) => {
				if ( rows.length ) {
					return client.query( 'DELETE FROM rcgcdw WHERE webhook IN (' + rows.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', rows.map( row => row.webhook ) ).then( () => {
						console.log( '- RcGcDw successfully deleted.' );
						messages.push('RcGcDw successfully deleted.');
						rows.forEach( row => msg.client.fetchWebhook(...row.webhook.split('/')).then( webhook => {
							webhook.delete('Removed extra recent changes webhook').catch(log_error);
						}, log_error ) );
					}, dberror => {
						console.log( '- Error while deleting the RcGcDw: ' + dberror );
						messages.push('Error while deleting the RcGcDw: ' + dberror);
					} );
				}
			}, dberror => {
				console.log( '- Error while getting the RcGcDw: ' + dberror );
				messages.push('Error while getting the RcGcDw: ' + dberror);
			} );
		} ).then( () => {
			return client.query( 'UPDATE rcgcdw SET display = $1 WHERE guild = $2 AND display > $1', [rcgcdwLimit.display, guild] ).then( () => {
				console.log( '- RcGcDw successfully updated.' );
				messages.push('RcGcDw successfully updated.');
			}, dberror => {
				console.log( '- Error while updating the RcGcDw: ' + dberror );
				messages.push('Error while updating the RcGcDw: ' + dberror);
			} );
		} ).then( () => {
			if ( !messages.length ) messages.push('No settings found that had to be removed.');
			return messages;
		}, error => {
			if ( error ) {
				console.log( '- Error while removing the patreon features: ' + error );
				messages.push('Error while removing the patreon features: ' + error);
			}
			if ( !messages.length ) messages.push('No settings found that had to be removed.');
			return messages;
		} ).finally( () => {
			client.release();
		} );
	}, dberror => {
		console.log( '- Error while connecting to the database client: ' + dberror );
		return 'Error while connecting to the database client: ' + dberror;
	} );
}

/**
 * Removes the settings for deleted guilds and channels.
 * @param {Discord.Message} msg - The Discord message.
 */
function removeSettings(msg) {
	if ( !( msg instanceof Discord.Message ) ) return 'removeSettings(msg) – No message provided!';
	return db.connect().then( client => {
		var messages = [];
		return msg.client.shard.broadcastEval( discordClient => {
			return [
				[...discordClient.guilds.cache.keys()],
				discordClient.channels.cache.filter( channel => {
					return ( ( channel.isText() && channel.guildId ) || ( channel.type === 'GUILD_CATEGORY' && patreonGuildsPrefix.has(channel.guildId) ) );
				} ).map( channel => ( channel.type === 'GUILD_CATEGORY' ? '#' : '' ) + channel.id )
			];
		} ).then( results => {
			var all_guilds = results.map( result => result[0] ).reduce( (acc, val) => acc.concat(val), [] );
			var all_channels = results.map( result => result[1] ).reduce( (acc, val) => acc.concat(val), [] );
			var guilds = [];
			var channels = [];
			return client.query( 'SELECT guild, channel FROM discord' ).then( ({rows}) => {
				return rows.forEach( row => {
					if ( !all_guilds.includes(row.guild) ) {
						if ( !row.channel ) {
							if ( patreonGuildsPrefix.has(row.guild) || voiceGuildsLang.has(row.guild) ) {
								msg.client.shard.broadcastEval( (discordClient, evalData) => {
									patreonGuildsPrefix.delete(evalData);
									voiceGuildsLang.delete(evalData);
								}, {context: row.guild} );
							}
							return guilds.push(row.guild);
						}
					}
					else if ( row.channel && !all_channels.includes(row.channel) ) {
						return channels.push(row.channel);
					}
				} );
			}, dberror => {
				console.log( '- Error while getting the settings: ' + dberror );
				messages.push('Error while getting the settings: ' + dberror);
			} ).then( () => {
				if ( guilds.length ) {
					return client.query( 'DELETE FROM discord WHERE main IN (' + guilds.map( (guild, i) => '$' + ( i + 1 ) ).join(', ') + ')', guilds ).then( ({rowCount}) => {
						console.log( '- Guilds successfully removed: ' + rowCount );
						messages.push('Guilds successfully removed: ' + rowCount);
					}, dberror => {
						console.log( '- Error while removing the guilds: ' + dberror );
						messages.push('Error while removing the guilds: ' + dberror);
					} );
				}
			} ).then( () => {
				if ( channels.length ) {
					return client.query( 'DELETE FROM discord WHERE channel IN (' + channels.map( (channel, i) => '$' + ( i + 1 ) ).join(', ') + ')', channels ).then( ({rowCount}) => {
						console.log( '- Channels successfully removed: ' + rowCount );
						messages.push('Channels successfully removed: ' + rowCount);
					}, dberror => {
						console.log( '- Error while removing the channels: ' + dberror );
						messages.push('Error while removing the channels: ' + dberror);
					} );
				}
			} );
		} ).then( () => {
			if ( !messages.length ) messages.push('No settings found that had to be removed.');
			return messages;
		}, error => {
			if ( error ) {
				console.log( '- Error while removing the settings: ' + error );
				messages.push('Error while removing the settings: ' + error);
			}
			if ( !messages.length ) messages.push('No settings found that had to be removed.');
			return messages;
		} ).finally( () => {
			client.release();
		} );
	}, dberror => {
		console.log( '- Error while connecting to the database client: ' + dberror );
		return 'Error while connecting to the database client: ' + dberror;
	} );
}

export default {
	name: 'eval',
	everyone: false,
	pause: false,
	owner: true,
	run: cmd_eval
};

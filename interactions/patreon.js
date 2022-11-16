import { ShardClientUtil, OAuth2Scopes, ChannelType } from 'discord.js';
import db from '../util/database.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultPermissions, limit: {verification: verificationLimit, rcgcdw: rcgcdwLimit}} = require('../util/default.json');
const {shardIdForGuildId} = ShardClientUtil;

/** @type {Map<String, {id: String, name: String, patreon: Boolean}[]>} */
const guildCache = new Map();

/**
 * Check or change servers with patreon features enabled.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function slash_patreon(interaction, lang, wiki) {
	var subcommand = interaction.options.getSubcommand();
	guildCache.delete(interaction.user.id);

	if ( subcommand === 'check' ) return db.query( 'SELECT count, ARRAY_REMOVE(ARRAY_AGG(guild), NULL) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [interaction.user.id] ).then( ({rows:[row]}) => {
		if ( !row ) return interaction.reply( {
			content: 'You can\'t have any servers.',//lang.uselang(interaction.locale).get('interaction.interwiki'),
			ephemeral: true
		} ).catch(log_error);
		var text = 'You can have up to ' + row.count + ' servers.\n\n';
		if ( row.guilds.length ) {
			return interaction.client.shard.broadcastEval( (discordClient, evalData) => {
				return evalData.map( guild => discordClient.guilds.cache.get(guild)?.name );
			}, {context: row.guilds} ).then( results => {
				var guilds = row.guilds.map( (guild, i) => '`' + guild + '` ' + ( results.find( result => result[i] !== null )?.[i] || '' ) );
				text += 'Currently you have ' + guilds.length + ' servers:\n' + guilds.join('\n');
				if ( row.count < guilds.length ) text += '\n\n**You are above your server limit!**';
				return interaction.reply( {
					content: text,
					ephemeral: true
				} ).catch(log_error);
			} );
		}
		text += '*You don\'t have any servers yet.*';
		return interaction.reply( {
			content: text,
			ephemeral: true
		} ).catch(log_error);
	}, dberror => {
		console.log( '- Error while getting the patreon: ' + dberror );
		return interaction.reply( {
			ephemeral: true
		} ).catch(log_error);
	} );
	
	if ( process.env.READONLY ) return interaction.reply( {
		content: lang.uselang(interaction.locale).get('general.readonly') + '\n' + process.env.invite,
		ephemeral: true
	} ).catch(log_error);

	var guildId = interaction.options.getString('guild') ?? '';
	if ( !/^\d{17,20}$/.test(guildId) ) return interaction.reply( {
		content: 'Please provide a valid guild id.',
		ephemeral: true
	} ).catch(log_error);
	
	if ( subcommand === 'enable' ) return interaction.client.shard.broadcastEval( (discordClient, evalData) => {
		return discordClient.guilds.cache.get(evalData)?.name;
	}, {
		context: guildId,
		shard: shardIdForGuildId(guildId, interaction.client.shard.count)
	} ).then( guild => {
		if ( !guild ) {
			let invite = interaction.client.generateInvite({
				scopes: [
					OAuth2Scopes.Bot,
					OAuth2Scopes.ApplicationsCommands
				],
				permissions: defaultPermissions,
				guild: guildId,
				disableGuildSelect: true
			});
			return interaction.reply( {
				content: 'I\'m not on a server with the id `' + guildId + '`.\n<' + invite + '>',
				ephemeral: true
			} ).catch(log_error);
		}
		if ( patreonGuildsPrefix.has(guildId) ) return interaction.reply( {
			content: '"' + guild + '" has the patreon features already enabled.',
			ephemeral: true
		} ).catch(log_error);
		return db.query( 'SELECT count, COUNT(guild) guilds FROM patreons LEFT JOIN discord ON discord.patreon = patreons.patreon WHERE patreons.patreon = $1 GROUP BY patreons.patreon', [interaction.user.id] ).then( ({rows:[row]}) => {
			if ( !row ) return interaction.reply( {
				content: 'You can\'t have any servers.',
				ephemeral: true
			} ).catch(log_error);
			if ( row.count <= row.guilds ) return interaction.reply( {
				content: 'You already reached your maximal server count.',
				ephemeral: true
			} ).catch(log_error);
			return db.query( 'UPDATE discord SET patreon = $1 WHERE guild = $2 AND channel IS NULL', [interaction.user.id, guildId] ).then( ({rowCount}) => {
				if ( !rowCount ) return db.query( 'INSERT INTO discord(main, guild, patreon) VALUES ($1, $1, $2)', [guildId, interaction.user.id] ).then( () => {
					console.log( '- Guild successfully added.' );
					interaction.client.shard.broadcastEval( (discordClient, evalData) => {
						globalThis.patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
					}, {context: {guild: guildId, prefix: process.env.prefix}} );
					return interaction.reply( {
						content: 'The patreon features are now enabled on "' + guild + '".',
						ephemeral: true
					} ).catch(log_error);
				}, dberror => {
					console.log( '- Error while adding the guild: ' + dberror );
					return interaction.reply( {
						content: 'I got an error while updating the server, please try again later.',
						ephemeral: true
					} ).catch(log_error);
				} );
				console.log( '- Guild successfully updated.' );
				interaction.client.shard.broadcastEval( (discordClient, evalData) => {
					globalThis.patreonGuildsPrefix.set(evalData.guild, evalData.prefix);
				}, {context: {guild: guildId, prefix: process.env.prefix}} );
				return interaction.reply( {
					content: 'The patreon features are now enabled on "' + guild + '".',
					ephemeral: true
				} ).catch(log_error);
			}, dberror => {
				console.log( '- Error while updating the guild: ' + dberror );
				return interaction.reply( {
					content: 'I got an error while updating the server, please try again later.',
					ephemeral: true
				} ).catch(log_error);
			} );
		}, dberror => {
			console.log( '- Error while getting the patreon: ' + dberror );
			return interaction.reply( {
				content: 'I got an error while searching for you, please try again later.',
				ephemeral: true
			} ).catch(log_error);
		} );
	} );
	
	if ( subcommand === 'disable' ) return interaction.client.shard.broadcastEval( (discordClient, evalData) => {
		return discordClient.guilds.cache.get(evalData)?.name;
	}, {
		context: guildId,
		shard: shardIdForGuildId(guildId, interaction.client.shard.count)
	} ).then( guild => {
		if ( !guild ) return interaction.reply( {
			content: 'I\'m not on a server with the id `' + guildId + '`.',
			ephemeral: true
		} ).catch(log_error);
		if ( !patreonGuildsPrefix.has(guildId) ) return interaction.reply( {
			content: '"' + guild + '" doesn\'t have the patreon features enabled.',
			ephemeral: true
		} ).catch(log_error);
		return db.connect().then( client => {
			return client.query( 'SELECT lang, role, inline, desclength, fieldcount, fieldlength, sectionlength, sectiondesclength FROM discord WHERE guild = $1 AND patreon = $2', [guildId, interaction.user.id] ).then( ({rows:[row]}) => {
				if ( !row ) return interaction.reply( {
					content: 'You didn\'t enable the patreon features for "' + guild + '"!',
					ephemeral: true
				} ).catch(log_error);
				return client.query( 'UPDATE discord SET lang = $1, role = $2, inline = $3, desclength = $4, fieldcount = $5, fieldlength = $6, sectionlength = $7, sectiondesclength = $8, prefix = $9, patreon = NULL WHERE guild = $10', [row.lang, row.role, row.inline, row.desclength, row.fieldcount, row.fieldlength, row.sectionlength, row.sectiondesclength, process.env.prefix, guildId] ).then( () => {
					console.log( '- Guild successfully updated.' );
					interaction.client.shard.broadcastEval( (discordClient, evalData) => {
						globalThis.patreonGuildsPrefix.delete(evalData);
					}, {context: guildId} );
					return Promise.all([
						client.query( 'DELETE FROM discord WHERE guild = $1 AND channel LIKE $2 RETURNING channel, wiki', [guildId, '#%'] ).then( ({rows}) => {
							if ( rows.length ) {
								console.log( '- Channel categories successfully deleted.' );
								return interaction.client.shard.broadcastEval( (discordClient, evalData) => {
									if ( discordClient.guilds.cache.has(evalData.guild) ) {
										return discordClient.guilds.cache.get(evalData.guild).channels.cache.filter( channel => {
											return ( ( ( channel.isTextBased() && !channel.isThread() ) || channel.type === ChannelType.GuildForum ) && evalData.rows.some( row => {
												return ( row.channel === '#' + channel.parentId );
											} ) );
										} ).map( channel => {
											return {
												id: channel.id,
												wiki: evalData.rows.find( row => {
													return ( row.channel === '#' + channel.parentId );
												} ).wiki
											};
										} );
									}
								}, {
									context: {guild: guildId, rows},
									shard: shardIdForGuildId(guildId, interaction.client.shard.count)
								} ).then( channels => {
									if ( channels.length ) return Promise.all(channels.map( channel => {
										return client.query( 'INSERT INTO discord(wiki, guild, channel, lang, role, inline, prefix) VALUES ($1, $2, $3, $4, $5, $6, $7)', [channel.wiki, guildId, channel.id, row.lang, row.role, row.inline, process.env.prefix] ).catch( dberror => {
											if ( dberror.message !== 'duplicate key value violates unique constraint "discord_guild_channel_key"' ) {
												console.log( '- Error while adding category settings to channels: ' + dberror );
											}
										} );
									} ));
								}, error => {
									console.log( '- Error while getting the channels in categories: ' + error );
								} );
							}
						}, dberror => {
							console.log( '- Error while deleting the channel categories: ' + dberror );
							return Promise.reject();
						} ),
						client.query( 'SELECT configid FROM verification WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [guildId, verificationLimit.default] ).then( ({rows}) => {
							if ( rows.length ) {
								return client.query( 'DELETE FROM verification WHERE guild = $1 AND configid IN (' + rows.map( (row, i) => '$' + ( i + 2 ) ).join(', ') + ')', [guildId, ...rows.map( row => row.configid )] ).then( () => {
									console.log( '- Verifications successfully deleted.' );
								}, dberror => {
									console.log( '- Error while deleting the verifications: ' + dberror );
									return Promise.reject();
								} );
							}
						}, dberror => {
							console.log( '- Error while getting the verifications: ' + dberror );
							return Promise.reject();
						} ),
						client.query( 'SELECT webhook FROM rcgcdw WHERE guild = $1 ORDER BY configid ASC OFFSET $2', [guildId, rcgcdwLimit.default] ).then( ({rows}) => {
							if ( rows.length ) {
								return client.query( 'DELETE FROM rcgcdw WHERE webhook IN (' + rows.map( (row, i) => '$' + ( i + 1 ) ).join(', ') + ')', rows.map( row => row.webhook ) ).then( () => {
									console.log( '- RcGcDw successfully deleted.' );
									rows.forEach( row => interaction.client.fetchWebhook(...row.webhook.split('/')).then( webhook => {
										webhook.delete('Removed extra recent changes webhook').catch(log_error);
									}, log_error ) );
								}, dberror => {
									console.log( '- Error while deleting the RcGcDw: ' + dberror );
									return Promise.reject();
								} );
							}
						}, dberror => {
							console.log( '- Error while getting the RcGcDw: ' + dberror );
							return Promise.reject();
						} ),
						client.query( 'UPDATE rcgcdw SET display = $1 WHERE guild = $2 AND display > $1', [rcgcdwLimit.display, guildId] ).then( () => {
							console.log( '- RcGcDw successfully updated.' );
						}, dberror => {
							console.log( '- Error while updating the RcGcDw: ' + dberror );
							return Promise.reject();
						} )
					]).then( () => {
						return interaction.reply( {
							content: 'The patreon features are now disabled on "' + guild + '".',
							ephemeral: true
						} ).catch(log_error);
					}, error => {
						if ( error ) console.log( '- Error while removing the patreon features: ' + error );
						return interaction.reply( {
							content: 'The patreon features are now only partially disabled on "' + guild + '".'
						} ).catch(log_error);
					} );
				}, dberror => {
					console.log( '- Error while updating the guild: ' + dberror );
					return interaction.reply( {
						content: 'I got an error while disabling the patreon features, please try again later.',
						ephemeral: true
					} ).catch(log_error);
				} );
			}, dberror => {
				console.log( '- Error while getting the guild: ' + dberror );
				return interaction.reply( {
					content: 'I got an error while searching for the server, please try again later.',
					ephemeral: true
				} ).catch(log_error);
			} ).finally( () => {
				client.release();
			} );
		}, dberror => {
			console.log( '- Error while connecting to the database client: ' + dberror );
			return interaction.reply( {
				content: 'I got an error while searching for the server, please try again later.',
				ephemeral: true
			} ).catch(log_error);
		} );
	} );
}

/**
 * Autocomplete a guild.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The interaction.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the interaction.
 */
function autocomplete_patreon(interaction, lang, wiki) {
	lang = lang.uselang(interaction.locale);
	const guildId = interaction.options.getFocused();
	var subcommand = interaction.options.getSubcommand();
	if ( guildCache.has(interaction.user.id) ) {
		let guilds = ( guildCache.get(interaction.user.id) ?? [] ).filter( guild => ( subcommand === 'disable' ? guild.patreon : !guild.patreon ) );
		return interaction.respond( [...new Set([
			...guilds.filter( guild => {
				return guild.id.startsWith(guildId);
			} ),
			...guilds.filter( guild => {
				return guild.name.toLowerCase().startsWith(guildId.toLowerCase());
			} ),
			...guilds.filter( guild => {
				return guild.name.toLowerCase().includes(guildId.toLowerCase());
			} )
		])].map( guild => {
			return {
				name: ( guild.id + ' – ' + guild.name ).substring(0, 100),
				value: guild.id
			};
		} ).slice(0, 25) ).catch(log_error);
	}
	return db.query( 'SELECT guild FROM discord WHERE patreon = $1', [interaction.user.id] ).then( ({rows}) => {
		return rows.map( row => row.guild );
	}, dberror => {
		console.log( '- Autocomplete: Error while getting the patreon servers: ' + dberror );
		return [];
	} ).then( rows => {
		return interaction.client.shard.broadcastEval( (discordClient, evalData) => {
			return discordClient.guilds.cache.filter( guild => evalData.guilds.includes(guild.id) || guild.members.cache.has(evalData.user) ).map( guild => {
				return {
					id: guild.id, name: guild.name,
					patreon: globalThis.patreonGuildsPrefix.has(guild.id)
				};
			} );
		}, {context: {user: interaction.user.id, guilds: rows}} ).then( results => {
			let guilds = results.flat();
			guildCache.set(interaction.user.id, guilds);
			guilds = guilds.filter( guild => ( subcommand === 'disable' ? guild.patreon : !guild.patreon ) );
			return interaction.respond( [...new Set([
				...guilds.filter( guild => {
					return guild.id.startsWith(guildId);
				} ),
				...guilds.filter( guild => {
					return guild.name.toLowerCase().startsWith(guildId.toLowerCase());
				} ),
				...guilds.filter( guild => {
					return guild.name.toLowerCase().includes(guildId.toLowerCase());
				} )
			])].map( guild => {
				return {
					name: ( guild.id + ' – ' + guild.name ).substring(0, 100),
					value: guild.id
				};
			} ).slice(0, 25) ).catch(log_error);
		} );
	} );
}

export default {
	name: 'patreon',
	slash: slash_patreon,
	autocomplete: autocomplete_patreon,
	allowDelete: false
};
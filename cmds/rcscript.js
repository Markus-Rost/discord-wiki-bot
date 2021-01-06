const cheerio = require('cheerio');
const help_setup = require('../functions/helpsetup.js');
const {limit: {rcgcdw: rcgcdwLimit}, defaultSettings} = require('../util/default.json');
const Lang = require('../util/i18n.js');
const allLangs = Lang.allLangs(true);
const Wiki = require('../util/wiki.js');
var db = require('../util/database.js');

const fs = require('fs');
const rcscriptExists = fs.existsSync('./RcGcDb/start.py');

const display_types = [
	'compact',
	'embed',
	'image',
	'diff'
];

/**
 * Processes the "rcscript" command.
 * @param {Lang} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {Wiki} wiki - The wiki for the message.
 */
function cmd_rcscript(lang, msg, args, line, wiki) {
	if ( args[0] === 'block' && msg.isOwner() ) return blocklist(msg, args.slice(1));
	if ( !msg.isAdmin() ) return msg.reactEmoji('❌');
	if ( msg.defaultSettings ) return help_setup(lang, msg);
	
	db.all( 'SELECT configid, webhook, wiki, lang, display, rcid, postid FROM rcgcdw WHERE guild = ? ORDER BY configid ASC', [msg.guild.id], (dberror, rows) => {
		if ( dberror || !rows ) {
			console.log( '- Error while getting the RcGcDw: ' + dberror );
			msg.reactEmoji('error', true);
			return dberror;
		}

		var prefix = process.env.prefix;
		var limit = rcgcdwLimit.default;
		var display = display_types.slice(0, rcgcdwLimit.display + 1);
		if ( patreons[msg.guild.id] ) {
			prefix = patreons[msg.guild.id];
			limit = rcgcdwLimit.patreon;
			display = display_types.slice();
		}

		if ( args[0] === 'add' ) {
			if ( !msg.channel.permissionsFor(msg.client.user).has('MANAGE_WEBHOOKS') ) {
				console.log( msg.guild.id + ': Missing permissions - MANAGE_WEBHOOKS' );
				return msg.replyMsg( lang.get('general.missingperm') + ' `MANAGE_WEBHOOKS`' );
			}
			if ( !( msg.channel.permissionsFor(msg.member).has('MANAGE_WEBHOOKS') || ( msg.isOwner() && msg.evalUsed ) ) ) {
				return msg.replyMsg( lang.get('rcscript.noadmin') );
			}
			if ( rows.length >= limit ) return msg.replyMsg( lang.get('rcscript.max_entries'), {}, true );
			if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );

			var wikiinvalid = lang.get('settings.wikiinvalid') + '\n`' + prefix + 'rcscript add ' + lang.get('rcscript.new_wiki') + '`\n' + lang.get('rcscript.help_wiki');
			var input = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*?)\s*>$/, '$1' );
			var wikinew = new Wiki(wiki);
			if ( input ) {
				wikinew = Wiki.fromInput(input);
				if ( !wikinew ) return msg.replyMsg( wikiinvalid, {}, true );
			}
			return msg.reactEmoji('⏳', true).then( reaction => got.get( wikinew + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw|recentchanges&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json' ).then( response => {
				if ( response.statusCode === 404 && typeof response.body === 'string' ) {
					let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
					if ( api ) {
						wikinew = new Wiki(api.split('api.php?')[0], wikinew);
						return got.get( wikinew + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw|recentchanges&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json' );
					}
				}
				return response;
			} ).then( response => {
				var body = response.body;
				if ( response.statusCode !== 200 || !body?.query?.allmessages || !body?.query?.general || !body?.query?.pages?.['-1'] ) {
					console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
					if ( reaction ) reaction.removeEmoji();
					msg.reactEmoji('nowiki', true);
					return msg.replyMsg( wikiinvalid, {}, true );
				}
				wikinew.updateWiki(body.query.general);
				if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
					if ( reaction ) reaction.removeEmoji();
					return msg.replyMsg( lang.get('test.MediaWiki', 'MediaWiki 1.30', body.query.general.generator) + '\nhttps://www.mediawiki.org/wiki/MediaWiki_1.30', {}, true );
				}
				if ( body.query.allmessages[0]['*'] !== msg.guild.id ) {
					if ( reaction ) reaction.removeEmoji();
					return msg.replyMsg( lang.get('rcscript.sysmessage', 'MediaWiki:Custom-RcGcDw', msg.guild.id) + '\n<' + wikinew.toLink('MediaWiki:Custom-RcGcDw', 'action=edit') + '>', {}, true );
				}
				return db.get( 'SELECT reason FROM blocklist WHERE wiki = ?', [wikinew.href], (blerror, block) => {
					if ( blerror ) {
						console.log( '- Error while getting the blocklist: ' + blerror );
						if ( reaction ) reaction.removeEmoji();
						msg.reactEmoji('error', true);
						return blerror;
					}
					if ( block ) {
						console.log( '- This wiki is blocked: ' + block.reason );
						if ( reaction ) reaction.removeEmoji();
						return msg.replyMsg( ( block.reason ? lang.get('rcscript.blocked_reason', block.reason) : lang.get('rcscript.blocked') ), {}, true );
					}
					if ( wikinew.isFandom(false) ) return got.get( wikinew + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=1&format=json&cache=' + Date.now(), {
						headers: {
							Accept: 'application/hal+json'
						}
					} ).then( dsresponse => {
						var dsbody = dsresponse.body;
						if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
							if ( dsbody?.title !== 'site doesn\'t exists' ) console.log( '- ' + dsresponse.statusCode + ': Error while checking for discussions: ' + dsbody?.title );
							return createWebhook();
						}
						return createWebhook(true);
					}, error => {
						console.log( '- Error while checking for discussions: ' + error );
						return createWebhook();
					} );
					return createWebhook();

					/**
					 * Creates the webhook.
					 * @param {Boolean} enableFeeds - If feeds based changes should be enabled.
					 */
					function createWebhook(enableFeeds = false) {
						msg.channel.createWebhook( ( body.query.allmessages[1]['*'] || 'Recent changes' ), {
							avatar: msg.client.user.displayAvatarURL({format:'png',size:4096}),
							reason: lang.get('rcscript.audit_reason', wikinew.href)
						} ).then( webhook => {
							console.log( '- Webhook successfully created.' );
							var webhook_lang = new Lang(( allLangs.map[lang.lang] || allLangs.map[body.query.general.lang] || defaultSettings.lang ), 'rcscript.webhook');
							webhook.send( webhook_lang.get('created', body.query.general.sitename) + '\n<' + wikinew.toLink(body.query.pages['-1'].title) + ( enableFeeds ? '>\n<' + wikinew + 'f' : '' ) + '>' ).catch(log_error);
							var new_configid = 1;
							for ( let i of rows.map( row => row.configid ) ) {
								if ( new_configid === i ) new_configid++;
								else break;
							}
							db.run( 'INSERT INTO rcgcdw(guild, configid, webhook, wiki, lang, display, postid) VALUES(?, ?, ?, ?, ?, ?, ?)', [msg.guild.id, new_configid, webhook.id + '/' + webhook.token, wikinew.href, webhook_lang.lang, ( msg.showEmbed() ? 1 : 0 ), ( enableFeeds ? null : '-1' )], function (error) {
								if ( error ) {
									console.log( '- Error while adding the RcGcDw: ' + error );
									if ( reaction ) reaction.removeEmoji();
									msg.replyMsg( lang.get('settings.save_failed'), {}, true );
									return error;
								}
								console.log( '- RcGcDw successfully added.' );
								if ( reaction ) reaction.removeEmoji();
								msg.replyMsg( lang.get('rcscript.added') + ' <' + wikinew + '>\n`' + prefix + 'rcscript' + ( rows.length ? ' ' + new_configid : '' ) + '`', {}, true );
							} );
						}, error => {
							console.log( '- Error while creating the webhook: ' + error );
							if ( reaction ) reaction.removeEmoji();
							msg.replyMsg( lang.get('rcscript.webhook_failed'), {}, true );
						} );
					}
				} );
			}, error => {
				console.log( '- Error while testing the wiki: ' + error );
				if ( reaction ) reaction.removeEmoji();
				msg.reactEmoji('nowiki', true);
				return msg.replyMsg( wikiinvalid, {}, true );
			} ) );
		}

		var selected_row = rows.find( row => row.configid.toString() === args[0] );
		if ( selected_row ) {
			args[0] = args[1];
			args[1] = args.slice(2).join(' ').toLowerCase().trim().replace( /^<\s*(.*)\s*>$/, '$1' );
		}
		else {
			args[1] = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*)\s*>$/, '$1' );
			if ( rows.length === 1 ) selected_row = rows[0];
		}
		if ( args[0] ) args[0] = args[0].toLowerCase();

		if ( selected_row ) {
			let webhook_lang = new Lang(selected_row.lang, 'rcscript.webhook');
			let cmd = prefix + 'rcscript' + ( rows.length === 1 ? '' : ' ' + selected_row.configid );

			if ( args[0] === 'delete' && !args[1] ) {
				if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
				return msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
					var channel = msg.guild.channels.cache.get(webhook.channelID);
					if ( !channel || !channel.permissionsFor(msg.member).has('MANAGE_WEBHOOKS') ) {
						return msg.replyMsg( lang.get('rcscript.noadmin') );
					}
					db.run( 'DELETE FROM rcgcdw WHERE webhook = ?', [selected_row.webhook], function (delerror) {
						if ( delerror ) {
							console.log( '- Error while removing the RcGcDw: ' + delerror );
							msg.replyMsg( lang.get('settings.save_failed'), {}, true );
							return delerror;
						}
						console.log( '- RcGcDw successfully removed.' );
						webhook.send( webhook_lang.get('deleted') ).catch(log_error).finally( () => {
							webhook.delete(lang.get('rcscript.audit_reason_delete')).catch(log_error);
						} );
						msg.replyMsg( lang.get('rcscript.deleted'), {}, true );
					} );
				}, error => {
					log_error(error);
					if ( error.name === 'DiscordAPIError' && ['Unknown Webhook', 'Invalid Webhook Token'].includes( error.message ) ) {
						return msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					}
					db.run( 'DELETE FROM rcgcdw WHERE webhook = ?', [selected_row.webhook], function (delerror) {
						if ( delerror ) {
							console.log( '- Error while removing the RcGcDw: ' + delerror );
							msg.replyMsg( lang.get('settings.save_failed'), {}, true );
							return delerror;
						}
						console.log( '- RcGcDw successfully removed.' );
						msg.replyMsg( lang.get('rcscript.deleted'), {}, true );
					} );
				} );
			}
			if ( args[0] === 'wiki' ) {
				if ( !args[1] ) {
					return msg.replyMsg( lang.get('rcscript.current_wiki') + ' <' + selected_row.wiki + '>\n`' + cmd + ' wiki ' + lang.get('rcscript.new_wiki') + '`\n' + lang.get('rcscript.help_wiki'), {}, true );
				}
				if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );

				var wikiinvalid = lang.get('settings.wikiinvalid') + '\n`' + cmd + ' wiki ' + lang.get('rcscript.new_wiki') + '`\n' + lang.get('rcscript.help_wiki');
				var wikinew = Wiki.fromInput(args[1]);
				if ( !wikinew ) return msg.replyMsg( wikiinvalid, {}, true );
				return msg.reactEmoji('⏳', true).then( reaction => got.get( wikinew + 'api.php?&action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json' ).then( response => {
					if ( response.statusCode === 404 && typeof response.body === 'string' ) {
						let api = cheerio.load(response.body)('head link[rel="EditURI"]').prop('href');
						if ( api ) {
							wikinew = new Wiki(api.split('api.php?')[0], wikinew);
							return got.get( wikinew + 'api.php?action=query&meta=allmessages|siteinfo&ammessages=custom-RcGcDw&amenableparser=true&siprop=general&titles=Special:RecentChanges&format=json' );
						}
					}
					return response;
				} ).then( response => {
					var body = response.body;
					if ( response.statusCode !== 200 || !body?.query?.allmessages || !body?.query?.general || !body?.query?.pages?.['-1'] ) {
						console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + body?.error?.info );
						if ( reaction ) reaction.removeEmoji();
						msg.reactEmoji('nowiki', true);
						return msg.replyMsg( wikiinvalid, {}, true );
					}
					wikinew.updateWiki(body.query.general);
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) <= 30 ) {
						console.log( '- This wiki is using ' + body.query.general.generator + '.' );
						if ( reaction ) reaction.removeEmoji();
						return msg.replyMsg( lang.get('test.MediaWiki', 'MediaWiki 1.30', body.query.general.generator) + '\nhttps://www.mediawiki.org/wiki/MediaWiki_1.30', {}, true );
					}
					if ( body.query.allmessages[0]['*'] !== msg.guild.id ) {
						if ( reaction ) reaction.removeEmoji();
						return msg.replyMsg( lang.get('rcscript.sysmessage', 'MediaWiki:Custom-RcGcDw', msg.guild.id) + '\n<' + wikinew.toLink('MediaWiki:Custom-RcGcDw', 'action=edit') + '>', {}, true );
					}
					return db.get( 'SELECT reason FROM blocklist WHERE wiki = ?', [wikinew.href], (blerror, block) => {
						if ( blerror ) {
							console.log( '- Error while getting the blocklist: ' + blerror );
							if ( reaction ) reaction.removeEmoji();
							msg.reactEmoji('error', true);
							return blerror;
						}
						if ( block ) {
							console.log( '- This wiki is blocked: ' + block.reason );
							if ( reaction ) reaction.removeEmoji();
							return msg.replyMsg( ( block.reason ? lang.get('rcscript.blocked_reason', block.reason) : lang.get('rcscript.blocked') ), {}, true );
						}
						if ( wikinew.isFandom(false) ) return got.get( wikinew + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=1&format=json&cache=' + Date.now(), {
							headers: {
								Accept: 'application/hal+json'
							}
						} ).then( dsresponse => {
							var dsbody = dsresponse.body;
							if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
								if ( dsbody?.title !== 'site doesn\'t exists' ) console.log( '- ' + dsresponse.statusCode + ': Error while checking for discussions: ' + dsbody?.title );
								return updateWiki();
							}
							return updateWiki(true);
						}, error => {
							console.log( '- Error while checking for discussions: ' + error );
							return updateWiki();
						} );
						return updateWiki();

						/**
						 * Changes the wiki.
						 * @param {Boolean} enableFeeds - If feeds based changes should be enabled.
						 */
						function updateWiki(enableFeeds = false) {
							msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
								webhook.send( webhook_lang.get('updated_wiki', body.query.general.sitename) + '\n<' + wikinew.toLink(body.query.pages['-1'].title) + ( enableFeeds ? '>\n<' + wikinew + 'f' : '' ) + '>' ).catch(log_error);
							}, log_error );
							db.run( 'UPDATE rcgcdw SET wiki = ?, rcid = ?, postid = ? WHERE webhook = ?', [wikinew.href, null, ( enableFeeds ? null : '-1' ), selected_row.webhook], function (error) {
								if ( error ) {
									console.log( '- Error while updating the RcGcDw: ' + error );
									if ( reaction ) reaction.removeEmoji();
									msg.replyMsg( lang.get('settings.save_failed'), {}, true );
									return error;
								}
								console.log( '- RcGcDw successfully updated.' );
								if ( reaction ) reaction.removeEmoji();
								msg.replyMsg( lang.get('rcscript.updated_wiki') + ' <' + wikinew + '>\n`' + cmd + '`', {}, true );
							} );
						}
					} );
				}, error => {
					console.log( '- Error while testing the wiki: ' + error );
					if ( reaction ) reaction.removeEmoji();
					msg.reactEmoji('nowiki', true);
					return msg.replyMsg( wikiinvalid, {}, true );
				} ) );
			}
			if ( args[0] === 'lang' ) {
				if ( !args[1] ) {
					return msg.replyMsg( lang.get('rcscript.current_lang') + ' `' + allLangs.names[selected_row.lang] + '`\n`' + cmd + ' lang ' + lang.get('rcscript.new_lang') + '`\n' + lang.get('rcscript.help_lang') + ' `' + Object.values(allLangs.names).join('`, `') + '`', {files:( msg.uploadFiles() ? [`./RcGcDb/locale/widgets/${selected_row.lang}.png`] : [] )}, true );
				}
				if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
				if ( !allLangs.map.hasOwnProperty(args[1]) ) {
					return msg.replyMsg( lang.get('settings.langinvalid') + '\n`' + cmd + ' lang ' + lang.get('rcscript.new_lang') + '`\n' + lang.get('rcscript.help_lang') + ' `' + Object.values(allLangs.names).join('`, `') + '`', {}, true );
				}

				msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
					webhook.send( new Lang(allLangs.map[args[1]], 'rcscript.webhook').get('updated_lang', allLangs.names[allLangs.map[args[1]]]), {files:[`./RcGcDb/locale/widgets/${allLangs.map[args[1]]}.png`]} ).catch(log_error);
				}, log_error );
				return db.run( 'UPDATE rcgcdw SET lang = ? WHERE webhook = ?', [allLangs.map[args[1]], selected_row.webhook], function (error) {
					if ( error ) {
						console.log( '- Error while updating the RcGcDw: ' + error );
						msg.replyMsg( lang.get('settings.save_failed'), {}, true );
						return error;
					}
					console.log( '- RcGcDw successfully updated.' );
					msg.replyMsg( lang.get('rcscript.updated_lang') + ' `' + allLangs.names[allLangs.map[args[1]]] + '`\n`' + cmd + '`', {files:( msg.uploadFiles() ? [`./RcGcDb/locale/widgets/${allLangs.map[args[1]]}.png`] : [] )}, true );
				} );
			}
			if ( args[0] === 'display' ) {
				if ( !args[1] || !display_types.includes( args[1] ) ) {
					return msg.replyMsg( lang.get('rcscript.current_display') + ' `' + display_types[selected_row.display] + '`\n`' + cmd + ' display (' + display.join('|') + ')`\n' + display.map( display_type => '`' + display_type + '`: ' + lang.get('rcscript.help_display_' + display_type) ).join('\n'), {}, true );
				}
				if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
				if ( !display.includes( args[1] ) ) {
					return msg.replyMsg( lang.get('general.patreon') + '\n<' + process.env.patreon + '>', {}, true );
				}

				msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
					webhook.send( webhook_lang.get('updated_display_' + args[1]) ).catch(log_error);
				}, log_error );
				return db.run( 'UPDATE rcgcdw SET display = ? WHERE webhook = ?', [display_types.indexOf(args[1]), selected_row.webhook], function (error) {
					if ( error ) {
						console.log( '- Error while updating the RcGcDw: ' + error );
						msg.replyMsg( lang.get('settings.save_failed'), {}, true );
						return error;
					}
					console.log( '- RcGcDw successfully updated.' );
					msg.replyMsg( lang.get('rcscript.updated_display') + ' `' + args[1] + '`\n`' + cmd + '`', {}, true );
				} );
			}
			if ( new Wiki(selected_row.wiki).isFandom(false) && args[0] === 'feeds' ) {
				if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
				if ( args[1] === 'only' ) {
					if ( selected_row.rcid === -1 ) {
						msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
							webhook.send( webhook_lang.get('enabled_rc') ).catch(log_error);
						}, log_error );
						return db.run( 'UPDATE rcgcdw SET rcid = ? WHERE webhook = ?', [null, selected_row.webhook], function (error) {
							if ( error ) {
								console.log( '- Error while updating the RcGcDw: ' + error );
								msg.replyMsg( lang.get('settings.save_failed'), {}, true );
								return error;
							}
							console.log( '- RcGcDw successfully updated.' );
							msg.replyMsg( lang.get('rcscript.enabled_rc') + '\n`' + cmd + '`', {}, true );
						} );
					}

					if ( selected_row.postid === '-1' ) {
						return msg.replyMsg( lang.get('rcscript.all_inactive') + '\n\n' + lang.get('rcscript.delete') + '\n`' + cmd + ' delete`', {}, true );
					}
					msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
						webhook.send( webhook_lang.get('disabled_rc') ).catch(log_error);
					}, log_error );
					return db.run( 'UPDATE rcgcdw SET rcid = ? WHERE webhook = ?', [-1, selected_row.webhook], function (error) {
						if ( error ) {
							console.log( '- Error while updating the RcGcDw: ' + error );
							msg.replyMsg( lang.get('settings.save_failed'), {}, true );
							return error;
						}
						console.log( '- RcGcDw successfully updated.' );
						msg.replyMsg( lang.get('rcscript.disabled_rc') + '\n`' + cmd + '`', {}, true );
					} );
				}

				if ( selected_row.postid !== '-1' ) {
					if ( selected_row.rcid === -1 ) {
						return msg.replyMsg( lang.get('rcscript.all_inactive') + '\n\n' + lang.get('rcscript.delete') + '\n`' + cmd + ' delete`', {}, true );
					}
					msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
						webhook.send( webhook_lang.get('disabled_feeds') ).catch(log_error);
					}, log_error );
					return db.run( 'UPDATE rcgcdw SET postid = ? WHERE webhook = ?', ['-1', selected_row.webhook], function (error) {
						if ( error ) {
							console.log( '- Error while updating the RcGcDw: ' + error );
							msg.replyMsg( lang.get('settings.save_failed'), {}, true );
							return error;
						}
						console.log( '- RcGcDw successfully updated.' );
						msg.replyMsg( lang.get('rcscript.disabled_feeds') + '\n`' + cmd + '`', {}, true );
					} );
				}

				return msg.reactEmoji('⏳', true).then( reaction => got.get( selected_row.wiki + 'wikia.php?controller=DiscussionPost&method=getPosts&includeCounters=false&limit=1&format=json&cache=' + Date.now(), {
					headers: {
						Accept: 'application/hal+json'
					}
				} ).then( dsresponse => {
					var dsbody = dsresponse.body;
					if ( dsresponse.statusCode !== 200 || !dsbody || dsbody.title ) {
						if ( dsbody?.title !== 'site doesn\'t exists' ) console.log( '- ' + dsresponse.statusCode + ': Error while checking for discussions: ' + dsbody?.title );
						if ( reaction ) reaction.removeEmoji();
						return msg.replyMsg( lang.get('rcscript.no_feeds'), {}, true );
					}
					msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
						webhook.send( webhook_lang.get('enabled_feeds', body.query.general.sitename) + '\n<' + selected_row.wiki + 'f>' ).catch(log_error);
					}, log_error );
					db.run( 'UPDATE rcgcdw SET postid = ? WHERE webhook = ?', [null, selected_row.webhook], function (error) {
						if ( error ) {
							console.log( '- Error while updating the RcGcDw: ' + error );
							if ( reaction ) reaction.removeEmoji();
							msg.replyMsg( lang.get('settings.save_failed'), {}, true );
							return error;
						}
						console.log( '- RcGcDw successfully updated.' );
						if ( reaction ) reaction.removeEmoji();
						msg.replyMsg( lang.get('rcscript.enabled_feeds') + '\n`' + cmd + '`', {}, true );
					} );
				}, error => {
					console.log( '- Error while checking for discussions: ' + error );
					if ( reaction ) reaction.removeEmoji();
					return msg.replyMsg( lang.get('rcscript.no_feeds'), {}, true );
				} ) );
			}

			if ( rows.length > 1 ) return msg.client.fetchWebhook(...selected_row.webhook.split('/')).then( webhook => {
				return webhook.channelID;
			}, error => {
				log_error(error);
				if ( error.name === 'DiscordAPIError' && ['Unknown Webhook', 'Invalid Webhook Token'].includes( error.message ) ) {
					db.run( 'DELETE FROM rcgcdw WHERE webhook = ?', [selected_row.webhook], function (delerror) {
						if ( delerror ) {
							console.log( '- Error while removing the RcGcDw: ' + delerror );
							return delerror;
						}
						console.log( '- RcGcDw successfully removed.' );
					} );
					Promise.reject();
				}
				return;
			} ).then( channel => {
				var text = lang.get('rcscript.current_selected', selected_row.configid);
				text += `\n<${new URL(`/guild/${msg.guild.id}/rcscript/${selected_row.configid}`, process.env.dashboard).href}>\n`;
				text += '\n' + lang.get('rcscript.channel') + ' <#' + channel + '>\n';
				text += '\n' + lang.get('rcscript.wiki') + ' <' + selected_row.wiki + '>';
				text += '\n`' + cmd + ' wiki ' + lang.get('rcscript.new_wiki') + '`\n';
				text += '\n' + lang.get('rcscript.lang') + ' `' + allLangs.names[selected_row.lang] + '`';
				text += '\n`' + cmd + ' lang ' + lang.get('rcscript.new_lang') + '`\n';
				text += '\n' + lang.get('rcscript.display') + ' `' + display_types[selected_row.display] + '`';
				text += '\n`' + cmd + ' display (' + display.join('|') + ')`\n';
				if ( selected_row.rcid === -1 ) {
					text += '\n' + lang.get('rcscript.rc') + ' *`' + lang.get('rcscript.disabled') + '`*';
					text += '\n`' + cmd + ' feeds only` ' + lang.get('rcscript.toggle') + '\n';
				}
				if ( new Wiki(selected_row.wiki).isFandom(false) ) {
					text += '\n' + lang.get('rcscript.feeds') + ' *`' + lang.get('rcscript.' + ( selected_row.postid === '-1' ? 'disabled' : 'enabled' )) + '`*';
					text += '\n' + lang.get('rcscript.help_feeds') + '\n`' + cmd + ' feeds` ' + lang.get('rcscript.toggle') + '\n';
				}
				text += '\n' + lang.get('rcscript.delete') + '\n`' + cmd + ' delete`\n';
				msg.replyMsg( text, {}, true );
			}, () => msg.replyMsg( lang.get('rcscript.deleted'), {}, true ) );
		}

		Promise.all(rows.map( row => msg.client.fetchWebhook(...row.webhook.split('/')).then( webhook => {
			return webhook.channelID;
		}, error => {
			log_error(error);
			if ( error.name === 'DiscordAPIError' && ['Unknown Webhook', 'Invalid Webhook Token'].includes( error.message ) ) {
				db.run( 'DELETE FROM rcgcdw WHERE webhook = ?', [row.webhook], function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the RcGcDw: ' + delerror );
						return delerror;
					}
					console.log( '- RcGcDw successfully removed.' );
				} );
				return;
			}
			return 'undefined';
		} ) )).then( webhooks => {
			rows.forEach( (row, i) => {
				if ( webhooks[i] ) row.channel = webhooks[i];
			} );
			rows = rows.filter( row => row.channel );
			var only = ( rows.length === 1 );
			var text = '';
			if ( rows.length ) {
				text += lang.get('rcscript.current');
				text += `\n<${new URL(`/guild/${msg.guild.id}/rcscript`, process.env.dashboard).href}>`;
				text += rows.map( row => {
					var cmd = prefix + 'rcscript' + ( only ? '' : ' ' + row.configid );
					var row_text = '\n';
					if ( !only ) row_text += '\n`' + cmd + '`';
					row_text += '\n' + lang.get('rcscript.channel') + ' <#' + row.channel + '>';
					if ( only ) row_text += '\n';
					row_text += '\n' + lang.get('rcscript.wiki') + ' <' + row.wiki + '>';
					if ( only ) row_text += '\n`' + cmd + ' wiki ' + lang.get('rcscript.new_wiki') + '`\n';
					row_text += '\n' + lang.get('rcscript.lang') + ' `' + allLangs.names[row.lang] + '`';
					if ( only ) row_text += '\n`' + cmd + ' lang ' + lang.get('rcscript.new_lang') + '`\n';
					row_text += '\n' + lang.get('rcscript.display') + ' `' + display_types[row.display] + '`';
					if ( only ) row_text += '\n`' + cmd + ' display (' + display.join('|') + ')`\n';
					if ( row.rcid === -1 ) {
						row_text += '\n' + lang.get('rcscript.rc') + ' *`' + lang.get('rcscript.disabled' ) + '`*';
						if ( only ) row_text += '\n`' + cmd + ' feeds only` ' + lang.get('rcscript.toggle') + '\n';
					}
					if ( new Wiki(row.wiki).isFandom(false) ) {
						row_text += '\n' + lang.get('rcscript.feeds') + ' *`' + lang.get('rcscript.' + ( row.postid === '-1' ? 'disabled' : 'enabled' )) + '`*';
						if ( only ) row_text += '\n' + lang.get('rcscript.help_feeds') + '\n`' + cmd + ' feeds` ' + lang.get('rcscript.toggle') + '\n';
					}
					if ( only ) row_text += '\n' + lang.get('rcscript.delete') + '\n`' + cmd + ' delete`\n';
					return row_text;
				} ).join('');
			}
			else {
				text += lang.get('rcscript.missing');
				text += `\n<${new URL(`/guild/${msg.guild.id}/rcscript`, process.env.dashboard).href}>`;
			}
			if ( rows.length < limit ) text += '\n\n' + lang.get('rcscript.add_more') + '\n`' + prefix + 'rcscript add ' + lang.get('rcscript.new_wiki') + '`';
			msg.replyMsg( text, {split:true}, true );
		} );
	} );
}

/**
 * Processes the blocklist.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 */
function blocklist(msg, args) {
	var prefix = ( patreons[msg?.guild?.id] || process.env.prefix );
	if ( args[0] === 'add' ) {
		if ( !args[1] ) return msg.replyMsg( '`' + prefix + 'rcscript block add <wiki> [<reason>]`', {}, true );
		if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
		let input = args[1].toLowerCase().replace( /^<(.*?)>$/, '$1' );
		let wiki = Wiki.fromInput(input);
		if ( !wiki ) return msg.replyMsg( '`' + prefix + 'rcscript block add <wiki> [<reason>]`', {}, true );
		let reason = ( args.slice(2).join(' ').trim() || null );
		return db.run( 'INSERT INTO blocklist(wiki, reason) VALUES(?, ?)', [wiki.href, reason], function (error) {
			if ( error ) {
				if ( error.message === 'SQLITE_CONSTRAINT: UNIQUE constraint failed: blocklist.wiki' ) {
					return msg.replyMsg( '`' + wiki + '` is already on the blocklist.\n`' + prefix + 'rcscript block <' + wiki + '>`', {}, true );
				}
				console.log( '- Error while adding to the blocklist: ' + error );
				msg.replyMsg( 'I got an error while adding to the blocklist: ' + error, {}, true );
				return error;
			}
			console.log( '- Successfully added to the blocklist.' );
			db.each( 'SELECT webhook, lang FROM rcgcdw WHERE wiki = ?', [wiki.href], (dberror, row) => {
				if ( dberror ) return dberror;
				msg.client.fetchWebhook(...row.webhook.split('/')).then( webhook => {
					var lang = new Lang(row.lang, 'rcscript.webhook');
					webhook.send( '**' + ( reason ? lang.get('blocked_reason', reason) : lang.get('blocked') ) + '**\n' + lang.get('blocked_help', `<${process.env.invite}>`) ).catch(log_error).finally( () => {
						webhook.delete().catch(log_error);
					} );
				}, log_error );
			}, (dberror, count) => {
				if ( dberror ) console.log( '- Error while deleting the webhooks: ' + dberror );
				db.run( 'DELETE FROM rcgcdw WHERE wiki = ?', [wiki.href], function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the webhooks: ' + delerror );
						msg.replyMsg( 'I added `' + wiki + '` to the blocklist for `' + reason + '` but got an error while removing the webhooks: ' + delerror, {}, true );
						return delerror;
					}
					console.log( '- Successfully removed ' + count + ' webhooks.' );
					msg.replyMsg( 'I added `' + wiki + '` to the blocklist for `' + reason + '` and removed ' + count + ' webhooks.', {}, true );
				} );
			} );
		} );
	}
	if ( args[0] === 'remove' ) {
		let input = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*?)\s*>$/, '$1' );
		let wiki = Wiki.fromInput(input);
		if ( !wiki ) return msg.replyMsg( '`' + prefix + 'rcscript block remove <wiki>`', {}, true );
		if ( process.env.READONLY ) return msg.replyMsg( lang.get('general.readonly') + '\n' + process.env.invite, {}, true );
		return db.run( 'DELETE FROM blocklist WHERE wiki = ?', [wiki.href], function (error) {
			if ( error ) {
				console.log( '- Error while removing from the blocklist: ' + error );
				msg.replyMsg( 'I got an error while removing from the blocklist: ' + error, {}, true );
				return error;
			}
			console.log( '- Successfully removed from the blocklist.' );
			msg.replyMsg( 'I removed `' + wiki + '` from the blocklist.', {}, true );
		} );
	}
	if ( args.length ) {
		let input = args.join(' ').toLowerCase().trim().replace( /^<\s*(.*?)\s*>$/, '$1' );
		let wiki = Wiki.fromInput(input);
		if ( !wiki ) return msg.replyMsg( '`' + prefix + 'rcscript block <wiki>`\n`' + prefix + 'rcscript block add <wiki> [<reason>]`\n`' + prefix + 'rcscript block remove <wiki>`', {}, true );
		return db.get( 'SELECT reason FROM blocklist WHERE wiki = ?', [wiki.href], function (error, row) {
			if ( error ) {
				console.log( '- Error while checking the blocklist: ' + error );
				msg.replyMsg( 'I got an error while checking the blocklist: ' + error, {}, true );
				return error;
			}
			if ( !row ) return msg.replyMsg( '`' + wiki + '` is currently not on the blocklist.\n`' + prefix + 'rcscript block add <' + wiki + '> [<reason>]`', {}, true );
			msg.replyMsg( '`' + wiki + '` is currently on the blocklist ' + ( row.reason ? 'for `' + row.reason + '`' : 'with no reason provided' ) + '.\n`' + prefix + 'rcscript block remove <' + wiki + '>`', {}, true );
		} );
	}
	db.all( 'SELECT wiki, reason FROM blocklist', [], function (error, rows) {
		if ( error ) {
			console.log( '- Error while checking the blocklist: ' + error );
			msg.replyMsg( 'I got an error while checking the blocklist: ' + error, {}, true );
			return error;
		}
		if ( !rows.length ) return msg.replyMsg( 'there are currently no wikis on the blocklist.\n`' + prefix + 'rcscript block add <wiki> [<reason>]`', {}, true );
		msg.replyMsg( 'there are currently ' + row.length + ' wikis the blocklist:\n' + rows.map( row => '`' + row.wiki + '` – ' + ( row.reason ? '`' + row.reason + '`' : 'No reason provided.' ) ).join('\n') + '\n`' + prefix + 'rcscript block remove <wiki>`', {split:true}, true );
	} );
}

module.exports = {
	name: 'rcscript',
	everyone: rcscriptExists,
	pause: rcscriptExists,
	owner: false,
	run: cmd_rcscript
};
import { MessageEmbed } from 'discord.js';
import help_setup from '../functions/helpsetup.js';
import { got } from '../util/functions.js';
import logging from '../util/logging.js';

const wsStatus = [
	'READY',
	'CONNECTING',
	'RECONNECTING',
	'IDLE',
	'NEARLY',
	'DISCONNECTED',
	'WAITING_FOR_GUILDS',
	'IDENTIFYING',
	'RESUMING'
];

/**
 * Processes the "test" command.
 * @param {import('../util/i18n.js').default} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js').default} wiki - The wiki for the message.
 */
function cmd_test(lang, msg, args, line, wiki) {
	if ( args.join('') ) {
		if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) this.LINK(lang, msg, line, wiki);
	}
	else if ( !msg.inGuild() || !pausedGuilds.has(msg.guildId) ) {
		if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
		let textList = lang.get('test.text').filter( text => text.trim() );
		var text = ( textList[Math.floor(Math.random() * ( textList.length * 5 ))] || lang.get('test.text.0') );
		if ( process.env.READONLY ) text = lang.get('general.readonly') + '\n' + process.env.invite;
		console.log( '- Test[' + process.env.SHARDS + ']: Fully functioning!' );
		msg.replyMsg( text ).then( message => {
			if ( !message ) return;
			var discordPing = message.createdTimestamp - msg.createdTimestamp;
			if ( discordPing > 1_000 ) text = lang.get('test.slow') + ' 🐌\n' + process.env.invite;
			var embed = new MessageEmbed().setTitle( lang.get('test.time') ).setFooter( {text: 'Shard: ' + process.env.SHARDS} ).addField( 'Discord', discordPing.toLocaleString(lang.get('dateformat')) + 'ms' );
			var now = Date.now();
			got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general&format=json', {
				timeout: {
					request: 10_000
				}
			} ).then( response => {
				var then = Date.now();
				var body = response.body;
				if ( body && body.warnings ) log_warning(body.warnings);
				var ping = ( then - now ).toLocaleString(lang.get('dateformat')) + 'ms';
				if ( body?.query?.general ) wiki.updateWiki(body.query.general);
				embed.addField( wiki.toLink(), ping );
				var notice = [];
				if ( response.statusCode !== 200 || !body?.query?.general ) {
					if ( wiki.noWiki(response.url, response.statusCode) ) {
						console.log( '- This wiki doesn\'t exist!' );
						ping += ' <:unknown_wiki:505887262077353984>';
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while reaching the wiki: ' + ( body && body.error && body.error.info ) );
						ping += ' <:error:505887261200613376>';
					}
				}
				else if ( ( msg.isAdmin() || msg.isOwner() ) && !wiki.isFandom() ) {
					logging(wiki, msg.guildId, 'test');
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) < 30 ) {
						console.log( '- This wiki is using ' + body.query.general.generator + '.' );
						notice.push(lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', body.query.general.generator));
					}
				}
				else logging(wiki, msg.guildId, 'test');
				if ( notice.length ) embed.addField( lang.get('test.notice'), notice.join('\n') );
			}, error => {
				var then = Date.now();
				var ping = ( then - now ).toLocaleString(lang.get('dateformat')) + 'ms';
				if ( wiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					ping += ' <:unknown_wiki:505887262077353984>';
				}
				else {
					console.log( '- Error while reaching the wiki: ' + error );
					ping += ' <:error:505887261200613376>';
				}
				embed.addField( wiki.toLink(), ping );
			} ).finally( () => {
				if ( msg.isOwner() ) return msg.client.shard.fetchClientValues('ws.status').then( values => {
					return '```less\n' + values.map( (status, id) => '[' + id + ']: ' + ( wsStatus[status] || status ) ).join('\n') + '\n```';
				}, error => {
					return '```js\n' + error + '\n```';
				} ).then( shards => {
					embed.addField( 'Shards', shards );
					message.edit( {content: text, embeds: [embed]} ).catch(log_error);
				} );
				message.edit( {content: text, embeds: [embed]} ).catch(log_error);
			} );
		} );
	}
	else {
		console.log( '- Test: Paused!' );
		msg.replyMsg( lang.get('test.pause'), true );
	}
}

export default {
	name: 'test',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_test
};
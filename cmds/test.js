const {MessageEmbed} = require('discord.js');
const help_setup = require('../functions/helpsetup.js');

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
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} line - The command as plain text.
 * @param {import('../util/wiki.js')} wiki - The wiki for the message.
 */
function cmd_test(lang, msg, args, line, wiki) {
	if ( args.join('') ) {
		if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) this.LINK(lang, msg, line, wiki);
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
		let textList = lang.get('test.text').filter( text => text.trim() );
		var text = textList[Math.floor(Math.random() * ( textList.length * 5 ))] || lang.get('test.text.0');
		console.log( '- Test: Fully functioning!' );
		var now = Date.now();
		msg.replyMsg( text ).then( message => {
			if ( !message ) return;
			var then = Date.now();
			var embed = new MessageEmbed().setTitle( lang.get('test.time') ).addField( 'Discord', ( then - now ) + 'ms' );
			now = Date.now();
			got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general|extensions&format=json' ).then( response => {
				then = Date.now();
				var body = response.body;
				if ( body && body.warnings ) log_warn(body.warnings);
				if ( body?.query?.general ) wiki.updateWiki(body.query.general);
				var ping = ( then - now ) + 'ms';
				var notice = [];
				if ( response.statusCode !== 200 || !body?.query?.general || !body?.query?.extensions ) {
					if ( wiki.noWiki(response.url) || response.statusCode === 410 ) {
						console.log( '- This wiki doesn\'t exist!' );
						ping += ' <:unknown_wiki:505887262077353984>';
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while reaching the wiki: ' + ( body && body.error && body.error.info ) );
						ping += ' <:error:505887261200613376>';
					}
				}
				else if ( ( msg.isAdmin() || msg.isOwner() ) && !wiki.isFandom() && !wiki.isGamepedia() ) {
					if ( body.query.general.generator.replace( /^MediaWiki 1\.(\d\d).*$/, '$1' ) <= 30 ) {
						console.log( '- This wiki is using ' + body.query.general.generator + '.' );
						notice.push(lang.get('test.MediaWiki', '[MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30)', body.query.general.generator));
					}
					if ( !body.query.extensions.some( extension => extension.name === 'TextExtracts' ) ) {
						console.log( '- This wiki is missing Extension:TextExtracts.' );
						notice.push(lang.get('test.TextExtracts', '[TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts)'));
					}
					if ( !body.query.extensions.some( extension => extension.name === 'PageImages' ) ) {
						console.log( '- This wiki is missing Extension:PageImages.' );
						notice.push(lang.get('test.PageImages', '[PageImages](https://www.mediawiki.org/wiki/Extension:PageImages)'));
					}
				}
				embed.addField( wiki, ping );
				if ( notice.length ) embed.addField( lang.get('test.notice'), notice.join('\n') );
			}, error => {
				then = Date.now();
				var ping = ( then - now ) + 'ms';
				if ( wiki.noWiki(error.message) ) {
					console.log( '- This wiki doesn\'t exist!' );
					ping += ' <:unknown_wiki:505887262077353984>';
				}
				else {
					console.log( '- Error while reaching the wiki: ' + error );
					ping += ' <:error:505887261200613376>';
				}
				embed.addField( wiki, ping );
			} ).finally( () => {
				if ( msg.isOwner() ) return msg.client.shard.fetchClientValues('ws.status').then( values => {
					return '```css\n' + values.map( (status, id) => '[' + id + ']: ' + ( wsStatus[status] || status ) ).join('\n') + '\n```';
				}, error => {
					return '```js\n' + error + '\n```';
				} ).then( shards => {
					embed.addField( 'Shards', shards );
					message.edit( message.content, {embed,allowedMentions:{users:[msg.author.id]}} ).catch(log_error);
				} );
				message.edit( message.content, {embed,allowedMentions:{users:[msg.author.id]}} ).catch(log_error);
			} );
		} );
	} else {
		console.log( '- Test: Paused!' );
		msg.replyMsg( lang.get('test.pause'), {}, true );
	}
}

module.exports = {
	name: 'test',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_test
};
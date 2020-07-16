const {MessageEmbed} = require('discord.js');
const help_setup = require('../functions/helpsetup.js');

function cmd_test(lang, msg, args, line, wiki) {
	if ( args.join('') ) {
		if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) this.LINK(lang, msg, line, wiki);
	} else if ( msg.channel.type !== 'text' || !pause[msg.guild.id] ) {
		if ( msg.isAdmin() && msg.defaultSettings ) help_setup(lang, msg);
		var text = lang.get('test.text')[Math.floor(Math.random() * lang.get('test.random'))] || lang.get('test.default');
		console.log( '- Test: Fully functioning!' );
		var now = Date.now();
		msg.replyMsg( text ).then( message => {
			if ( !message ) return;
			var then = Date.now();
			var embed = new MessageEmbed().setTitle( lang.get('test.time') ).addField( 'Discord', ( then - now ) + 'ms' );
			now = Date.now();
			got.get( wiki + 'api.php?action=query&meta=siteinfo&siprop=general|extensions&format=json', {
				responseType: 'json'
			} ).then( response => {
				then = Date.now();
				var body = response.body;
				if ( body && body.warnings ) log_warn(body.warnings);
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
				else if ( ( msg.isAdmin() || msg.isOwner() ) && !wiki.isFandom() ) {
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
				embed.addField( wiki.toLink( '', '', '', body?.query?.general ), ping );
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
				if ( msg.isOwner() ) return msg.client.shard.fetchClientValues('ready').then( values => {
					return '```java\n' + values.map( (ready, id) => id + ': ' + ready ).join('\n') + '\n```';
				}, error => {
					return '```js\n' + error.name + ': ' + error.message + '\n```';
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
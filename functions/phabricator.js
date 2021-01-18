const {MessageEmbed} = require('discord.js');
const logging = require('../util/logging.js');

/**
 * Sends a Phabricator task.
 * @param {import('../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {import('../util/wiki.js')} wiki - The wiki.
 * @param {URL} link - The link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} [spoiler] - If the response is in a spoiler.
 */
function phabricator_task(lang, msg, wiki, link, reaction, spoiler = '') {
	var regex = /^(?:https?:)?\/\/phabricator\.(wikimedia|miraheze)\.org\/T(\d+)(?:#|$)/.exec(link.href);
	if ( !regex || !process.env['phabricator-' + regex[1]] ) {
		logging(wiki, msg.guild?.id, 'interwiki');
		msg.sendChannel( spoiler + ' ' + link + ' ' + spoiler );
		if ( reaction ) reaction.removeEmoji();
		return;
	}
	logging(link.origin, msg.guild?.id, 'phabricator', regex[1]);
	got.get( 'https://phabricator.' + regex[1] + '.org/api/maniphest.search?api.token=' + process.env['phabricator-' + regex[1]] + '&constraints[ids][0]=' + regex[2] ).then( response => {
		var body = response.body;
		if ( response.statusCode !== 200 || !body?.result?.data || body.error_code ) {
			console.log( '- ' + response.statusCode + ': Error while getting the Phabricator task: ' + body?.error_info );
			msg.sendChannelError( spoiler + ' ' + link + ' ' + spoiler );

			if ( reaction ) reaction.removeEmoji();
			return;
		}
		if ( !body.result.data.length ) {
			msg.sendChannel( spoiler + ' ' + link + ' ' + spoiler );

			if ( reaction ) reaction.removeEmoji();
			return;
		}
		var task = body.result.data[0];
		if ( !msg.showEmbed() ) {
			var status = '**' + task.fields.status.name + ':** ' + task.fields.name.escapeFormatting();
			msg.sendChannel( spoiler + status + '\n<' + link + '>' + spoiler );
			
			if ( reaction ) reaction.removeEmoji();
			return;
		}
		var embed = new MessageEmbed().setAuthor( 'Phabricator' ).setTitle( task.fields.name.escapeFormatting() ).setURL( link ).addField( 'Status', task.fields.status.name, true ).addField( 'Priority', task.fields.priority.name, true );
		if ( task.fields.subtype !== 'default' ) embed.addField( 'Subtype', task.fields.subtype, true );;
		var description = task.fields.description.raw.replace( /```lang=/g, '```' );
		if ( description.length > 2000 ) description = description.substring(0, 2000) + '\u2026';
		embed.setDescription( parse_links( description ) );

		if ( /^#\d+$/.test( link.hash ) ) return got.get( 'https://phabricator.' + regex[1] + '.org/api/transaction.search?api.token=' + process.env['phabricator-' + regex[1]] + '&objectIdentifier=' + task.phid ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body?.result?.data || body.error_code ) {
				console.log( '- ' + response.statusCode + ': Error while getting the task transactions: ' + body?.error_info );
				return;
			}
			var comment = body.result.data.find( transaction => '#' + transaction.id === link.hash );
			if ( comment.type === 'comment' ) {
				var content = comment.comments[0].content.raw;
				if ( content.length > 1000 ) content = content.substring(0, 1000) + '\u2026';
				embed.spliceFields( 0, 0, {name: 'Comment', value: parse_links( content )} );
			}
		}, error => {
			console.log( '- Error while getting the task transactions: ' + error );
		} ).finally( () => {
			msg.sendChannel( spoiler + '<' + link + '>' + spoiler, {embed} );
			
			if ( reaction ) reaction.removeEmoji();
		} );

		msg.sendChannel( spoiler + '<' + link + '>' + spoiler, {embed} );
		
		if ( reaction ) reaction.removeEmoji();
	}, error => {
		console.log( '- Error while getting the Phabricator task: ' + error );
		msg.sendChannelError( spoiler + ' ' + link + ' ' + spoiler );

		if ( reaction ) reaction.removeEmoji();
	} );
}

/**
 * Parse Phabricator links.
 * @param {String} text - The text to parse.
 * @returns {String}
 */
function parse_links(text) {
	text = text.replace( /\[\[ *(.+?) *\| *(.+?) *\]\]/g, '[$2]($1)' );
	return text;
}

module.exports = phabricator_task;
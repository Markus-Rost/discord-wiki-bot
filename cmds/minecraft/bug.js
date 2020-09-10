const {MessageEmbed} = require('discord.js');
const Wiki = require('../../util/wiki.js');

/**
 * Sends a Minecraft issue.
 * @param {import('../../util/i18n.js')} lang - The user language.
 * @param {import('discord.js').Message} msg - The Discord message.
 * @param {String[]} args - The command arguments.
 * @param {String} title - The page title.
 * @param {String} cmd - The command at this point.
 * @param {URLSearchParams} querystring - The querystring for the link.
 * @param {String} fragment - The section for the link.
 * @param {import('discord.js').MessageReaction} reaction - The reaction on the message.
 * @param {String} spoiler - If the response is in a spoiler.
 */
function minecraft_bug(lang, msg, args, title, cmd, querystring, fragment, reaction, spoiler) {
	var invoke = args[0];
	args = args.slice(1);
	if ( invoke && /\d+$/.test(invoke) && !args.length ) {
		if ( /^\d+$/.test(invoke) ) invoke = 'MC-' + invoke;
		var link = 'https://bugs.mojang.com/browse/';
		got.get( 'https://bugs.mojang.com/rest/api/2/issue/' + encodeURIComponent( invoke ) + '?fields=summary,issuelinks,fixVersions,resolution,status' ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'Issue Does Not Exist' ) ) {
						msg.reactEmoji('🤷');
					}
					else if ( body.errorMessages.includes( 'You do not have the permission to see the specified issue.' ) ) {
						msg.sendChannel( spoiler + lang.get('minecraft.private') + '\n<' + link + invoke + '>' + spoiler );
					}
					else {
						console.log( '- ' + ( response && response.statusCode ) + ': Error while getting the issue: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the issue: ' + ( body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + link + invoke + '>' + spoiler );
				}
			}
			else {
				if ( !body.fields ) {
					msg.reactEmoji('error');
				}
				else {
					var bugs = body.fields.issuelinks.filter( bug => bug.outwardIssue || ( bug.inwardIssue && bug.type.name != 'Duplicate' ) );
					if ( bugs.length ) {
						var embed = new MessageEmbed();
						var extrabugs = [];
						bugs.forEach( bug => {
							var ward = ( bug.outwardIssue ? 'outward' : 'inward' );
							var issue = bug[ward + 'Issue'];
							var name = bug.type[ward] + ' ' + issue.key;
							var value = issue.fields.status.name + ': [' + issue.fields.summary.escapeFormatting() + '](' + link + issue.key + ')';
							if ( embed.fields.length < 25 ) embed.addField( name, value );
							else extrabugs.push({name,value,inline:false});
						} );
						if ( extrabugs.length ) embed.setFooter( lang.get('minecraft.more').replaceSave( '%s', extrabugs.length ) );
					}
					var status = '**' + ( body.fields.resolution ? body.fields.resolution.name : body.fields.status.name ) + ':** ';
					var fixed = '';
					if ( body.fields.resolution && body.fields.fixVersions && body.fields.fixVersions.length ) {
						fixed = '\n' + lang.get('minecraft.fixed') + ' ' + body.fields.fixVersions.map( v => v.name ).join(', ');
					}
					msg.sendChannel( spoiler + status + body.fields.summary.escapeFormatting() + '\n<' + link + body.key + '>' + fixed + spoiler, {embed} );
				}
			}
		}, error => {
			console.log( '- Error while getting the issue: ' + error );
			msg.sendChannelError( spoiler + '<' + link + invoke + '>' + spoiler );
		} ).finally( () => {
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else if ( invoke && invoke.toLowerCase() === 'version' && args.length && args.join(' ').length < 100 ) {
		var jql = new URLSearchParams({
			jql: 'fixVersion="' + args.join(' ').replace( /["\\]/g, '\\$&' ) + '" order by key'
		});
		var link = 'https://bugs.mojang.com/issues/?' + jql;
		got.get( 'https://bugs.mojang.com/rest/api/2/search?fields=summary,resolution,status&' + jql + '&maxResults=25' ).then( response => {
			var body = response.body;
			if ( response.statusCode !== 200 || !body || body['status-code'] === 404 || body.errorMessages || body.errors ) {
				if ( body && body.errorMessages ) {
					if ( body.errorMessages.includes( 'The value \'' + args.join(' ') + '\' does not exist for the field \'fixVersion\'.' ) ) {
						msg.reactEmoji('🤷');
					}
					else {
						console.log( '- ' + response.statusCode + ': Error while getting the issues: ' + body.errorMessages.join(' - ') );
						msg.reactEmoji('error');
					}
				}
				else {
					console.log( '- ' + response.statusCode + ': Error while getting the issues: ' + ( body && body.message ) );
					if ( body && body['status-code'] === 404 ) msg.reactEmoji('error');
					else msg.sendChannelError( spoiler + '<' + link + '>' + spoiler );
				}
			}
			else {
				if ( !body.issues ) {
					msg.reactEmoji('error');
				}
				else {
					if ( body.total > 0 ) {
						var embed = new MessageEmbed();
						body.issues.forEach( bug => {
							var status = ( bug.fields.resolution ? bug.fields.resolution.name : bug.fields.status.name );
							var value = status + ': [' + bug.fields.summary.escapeFormatting() + '](https://bugs.mojang.com/browse/' + bug.key + ')';
							embed.addField( bug.key, value );
						} );
						if ( body.total > 25 ) embed.setFooter( lang.get('minecraft.more').replaceSave( '%s', body.total - 25 ) );
					}
					var total = '**' + args.join(' ') + ':** ' + lang.get('minecraft.total').replaceSave( '%s', body.total );
					msg.sendChannel( spoiler + total + '\n<' + link + '>' + spoiler, {embed} );
				}
			}
		}, error => {
			console.log( '- Error while getting the issues: ' + error );
			msg.sendChannelError( spoiler + '<' + link + '>' + spoiler );
		} ).finally( () => {
			if ( reaction ) reaction.removeEmoji();
		} );
	}
	else {
		msg.notMinecraft = true;
		this.WIKI.gamepedia(lang, msg, title, new Wiki(lang.get('minecraft.link')), cmd, reaction, spoiler, querystring, fragment);
	}
}

module.exports = {
	name: 'bug',
	run: minecraft_bug
};
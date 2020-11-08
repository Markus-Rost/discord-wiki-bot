const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');
const {settingsData, createNotice} = require('./util.js');

const forms = {
	settings: require('./settings.js').get,
	verification: require('./verification.js').get,
	rcscript: require('./rcscript.js').get
};

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const file = require('fs').readFileSync('./dashboard/index.html');

/**
 * Let a user view settings
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} state - The user state
 * @param {URL} reqURL - The used url
 * @param {String} [action] - The action the user made
 * @param {String[]} [actionArgs] - The arguments for the action
 */
function dashboard_guilds(res, state, reqURL, action, actionArgs) {
	reqURL.pathname = reqURL.pathname.replace( /^(\/(?:guild\/\d+(?:\/(?:settings|verification|rcscript)(?:\/(?:\d+|new))?)?)?)(?:\/.*)?$/, '$1' );
	var args = reqURL.pathname.split('/');
	args = reqURL.pathname.split('/');
	var settings = settingsData.get(state);
	var $ = cheerio.load(file);
	if ( process.env.READONLY ) createNotice($, 'readonly');
	if ( action ) createNotice($, action, actionArgs);
	$('head').append(
		$('<script>').text(`history.replaceState(null, null, '${reqURL.pathname}');`)
	);
	$('#logout img').attr('src', settings.user.avatar);
	$('#logout span').text(`${settings.user.username} #${settings.user.discriminator}`);
	$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot'],
		permissions: defaultPermissions, state
	} ));
	$('.guild#refresh a').attr('href', '/refresh?return=' + reqURL.pathname);
	if ( settings.guilds.isMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).insertBefore('.guild#last-separator');
		settings.guilds.isMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}/settings`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=64`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).insertBefore('.guild#last-separator');
		} );
	}
	if ( settings.guilds.notMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).insertBefore('.guild#last-separator');
		settings.guilds.notMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=64`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).insertBefore('.guild#last-separator');
		} );
	}

	if ( args[1] === 'guild' ) {
		let id = args[2];
		$(`.guild#${id}`).addClass('selected');
		if ( settings.guilds.isMember.has(id) ) {
			let guild = settings.guilds.isMember.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			$('<script>').text(`const isPatreon = ${guild.patreon};`).insertBefore('script#indexjs');
			$('.channel#settings').attr('href', `/guild/${guild.id}/settings`);
			$('.channel#verification').attr('href', `/guild/${guild.id}/verification`);
			$('.channel#rcscript').attr('href', `/guild/${guild.id}/rcscript`);
			if ( args[3] === 'settings' ) return forms.settings(res, $, guild, args);
			if ( args[3] === 'verification' ) return forms.verification(res, $, guild, args);
			if ( args[3] === 'rcscript' ) return forms.rcscript(res, $, guild, args);
			return forms.settings(res, $, guild, args);
		}
		else if ( settings.guilds.notMember.has(id) ) {
			let guild = settings.guilds.notMember.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${guild.id}/settings"; HttpOnly; Path=/`]);
			let url = oauth.generateAuthUrl( {
				scope: ['identify', 'guilds', 'bot'],
				permissions: defaultPermissions,
				guildId: guild.id, state
			} );
			$('<a>').attr('href', url).text(guild.name).appendTo('#text .description');
		}
		else {
			$('head title').text('Unknown Server – ' + $('head title').text());
			$('#text .description').text('You are missing the <code>MANAGE_GUILD</code> permission.');
		}
	}
	else {
		$('head title').text('Server Selector – ' + $('head title').text());
		$('#channellist').empty();
		$('#text .description').text('This is a list of all servers you can change settings on. Please select a server:');
		if ( settings.guilds.isMember.size ) {
			$('<h2 id="with-wikibot">').text('Server with Wiki-Bot').appendTo('#text');
			$('<a class="channel">').attr('href', '#with-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text('Server with Wiki-Bot')
			).appendTo('#channellist');
			$('<div class="server-selector" id="isMember">').appendTo('#text');
			settings.guilds.isMember.forEach( guild => {
				$('<a class="server">').attr('href', `/guild/${guild.id}/settings`).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=256`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) ),
					$('<div class="server-name description">').text(guild.name)
				).appendTo('.server-selector#isMember');
			} );
		}
		if ( settings.guilds.notMember.size ) {
			$('<h2 id="without-wikibot">').text('Server without Wiki-Bot').appendTo('#text');
			$('<a class="channel">').attr('href', '#without-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text('Server without Wiki-Bot')
			).appendTo('#channellist');
			$('<div class="server-selector" id="notMember">').appendTo('#text');
			settings.guilds.notMember.forEach( guild => {
				$('<a class="server">').attr('href', `/guild/${guild.id}`).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=256`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) ),
					$('<div class="server-name description">').text(guild.name)
				).appendTo('.server-selector#notMember');
			} );
		}
		if ( !settings.guilds.count ) {
			$('#text .description').text('You currently don\'t have the MANAGE_GUILD permission on any servers, are you logged into the correct account?');
			$('<a class="channel">').attr('href', oauth.generateAuthUrl( {
				scope: ['identify', 'guilds'],
				prompt: 'consent', state
			} )).append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text('Switch accounts')
			).appendTo('#channellist');
		}
	}
	let body = $.html();
	res.writeHead(200, {'Content-Length': body.length});
	res.write( body );
	return res.end();
}

module.exports = dashboard_guilds;
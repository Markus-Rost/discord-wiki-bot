const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');
const {db, settingsData, sendMsg, createNotice, hasPerm} = require('./util.js');

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2( {
	clientId: process.env.bot,
	clientSecret: process.env.secret,
	redirectUri: process.env.dashboard
} );

const file = require('fs').readFileSync('./dashboard/index.html');

/**
 * Let a user change settings
 * @param {import('http').ServerResponse} res - The server response
 * @param {String} state - The user state
 * @param {URL} reqURL - The used url
 */
function dashboard_guilds(res, state, reqURL) {
	var arguments = reqURL.pathname.split('/');
	var settings = settingsData.get(state);
	var $ = cheerio.load(file);
	let notice = '';
	if ( process.env.READONLY ) {
		notice = createNotice($, {
			title: 'Read-only database!',
			text: 'You can currently only view your settings but not change them.'
		});
	}
	$('replace#notice').replaceWith(notice);
	$('.navbar #logout img').attr('src', settings.user.avatar);
	$('.navbar #logout span').text(`${settings.user.username} #${settings.user.discriminator}`);
	$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot'],
		permissions: defaultPermissions, state
	} ));
	$('.guild#refresh a').attr('href', '/refresh?return=' + reqURL.pathname);
	let guilds = $('<div>');
	if ( settings.guilds.isMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).appendTo(guilds);
		settings.guilds.isMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar" width="48" height="48">').attr('src', guild.icon).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).appendTo(guilds);
		} );
	}
	if ( settings.guilds.notMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).appendTo(guilds);
		settings.guilds.notMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar" width="48" height="48">').attr('src', guild.icon).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).appendTo(guilds);
		} );
	}
	$('replace#guilds').replaceWith(guilds.children());

	if ( reqURL.pathname.startsWith( '/guild/' ) ) {
		let id = reqURL.pathname.replace( '/guild/', '' );
		if ( settings.guilds.isMember.has(id) ) {
			$(`.guild#${id}`).addClass('selected');
			let guild = settings.guilds.isMember.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${id}"; HttpOnly; Path=/`]);
			$('replace#text').replaceWith(`${guild.permissions}`);
		}
		if ( settings.guilds.notMember.has(id) ) {
			$(`.guild#${id}`).addClass('selected');
			let guild = settings.guilds.notMember.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${id}"; HttpOnly; Path=/`]);
			let url = oauth.generateAuthUrl( {
				scope: ['identify', 'guilds', 'bot'],
				permissions: defaultPermissions,
				guild_id: id, state
			} );
			$('replace#text').replaceWith($('<a>').attr('href', url).text(guild.permissions));
		}
		$('replace#text').replaceWith('You are missing the <code>MANAGE_GUILD</code> permission.');
	}

	$('replace#text').replaceWith('Keks');
	let body = $.html();
	res.writeHead(200, {'Content-Length': body.length});
	res.write( body );
	return res.end();
}

module.exports = dashboard_guilds;
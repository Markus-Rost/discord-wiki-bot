const cheerio = require('cheerio');
const {defaultPermissions} = require('../util/default.json');
const Lang = require('./i18n.js');
const allLangs = Lang.allLangs().names;
const {settingsData, addWidgets, createNotice} = require('./util.js');

const forms = {
	settings: require('./settings.js').get,
	verification: require('./verification.js').get,
	rcscript: require('./rcscript.js').get,
	slash: require('./slash.js').get
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
 * @param {import('./i18n.js')} dashboardLang - The user language.
 * @param {String} theme - The display theme
 * @param {String} state - The user state
 * @param {URL} reqURL - The used url
 * @param {String} [action] - The action the user made
 * @param {String[]} [actionArgs] - The arguments for the action
 */
function dashboard_guilds(res, dashboardLang, theme, state, reqURL, action, actionArgs) {
	reqURL.pathname = reqURL.pathname.replace( /^(\/(?:guild\/\d+(?:\/(?:settings|verification|rcscript|slash)(?:\/(?:\d+|new))?)?)?)(?:\/.*)?$/, '$1' );
	var args = reqURL.pathname.split('/');
	args = reqURL.pathname.split('/');
	var settings = settingsData.get(state);
	if ( reqURL.searchParams.get('owner') && process.env.owner.split('|').includes(settings.user.id) ) {
		args[0] = 'owner';
	}
	dashboardLang = new Lang(...dashboardLang.fromCookie, settings.user.locale, dashboardLang.lang);
	res.setHeader('Content-Language', [dashboardLang.lang]);
	var $ = cheerio.load(file);
	$('html').attr('lang', dashboardLang.lang);
	if ( theme === 'light' ) $('html').addClass('theme-light');
	$('<script>').text(`
		const selectLanguage = '${dashboardLang.get('general.language').replace( /'/g, '\\$&' )}';
		const allLangs = ${JSON.stringify(allLangs)};
	`).insertBefore('script#langjs');
	$('head title').text(dashboardLang.get('general.title'));
	$('.channel#settings div').text(dashboardLang.get('general.settings'));
	$('.channel#verification div').text(dashboardLang.get('general.verification'));
	$('.channel#rcscript div').text(dashboardLang.get('general.rcscript'));
	$('.channel#slash div').text(dashboardLang.get('general.slash'));
	$('.guild#invite a').attr('alt', dashboardLang.get('general.invite'));
	$('.guild#refresh a').attr('alt', dashboardLang.get('general.refresh'));
	$('.guild#theme-dark a').attr('alt', dashboardLang.get('general.theme-dark'));
	$('.guild#theme-light a').attr('alt', dashboardLang.get('general.theme-light'));
	$('#selector span').text(dashboardLang.get('general.selector'));
	$('#support span').text(dashboardLang.get('general.support'));
	$('#logout').attr('alt', dashboardLang.get('general.logout'));
	if ( process.env.READONLY ) createNotice($, 'readonly', dashboardLang);
	if ( action ) createNotice($, action, dashboardLang, actionArgs);
	$('head').append(
		$('<script>').text(`history.replaceState(null, null, '${reqURL.pathname}');`)
	);
	$('#logout img').attr('src', settings.user.avatar);
	$('#logout span').text(`${settings.user.username} #${settings.user.discriminator}`);
	$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
		scope: ['identify', 'guilds', 'bot', 'applications.commands'],
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

	let id = args[2];
	if ( id ) $(`.guild#${id}`).addClass('selected');
	if ( settings.guilds.isMember.has(id) ) {
		let guild = settings.guilds.isMember.get(id);
		$('head title').text(`${guild.name} – ` + $('head title').text());
		$('<script>').text(`
			const isPatreon = ${guild.patreon};
			const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
		`).insertBefore('script#indexjs');
		$('.channel#settings').attr('href', `/guild/${guild.id}/settings`);
		$('.channel#verification').attr('href', `/guild/${guild.id}/verification`);
		$('.channel#rcscript').attr('href', `/guild/${guild.id}/rcscript`);
		$('.channel#slash').attr('href', `/guild/${guild.id}/slash`);
		if ( args[3] === 'settings' ) return forms.settings(res, $, guild, args, dashboardLang);
		if ( args[3] === 'verification' ) return forms.verification(res, $, guild, args, dashboardLang);
		if ( args[3] === 'rcscript' ) return forms.rcscript(res, $, guild, args, dashboardLang);
		if ( args[3] === 'slash' ) return forms.slash(res, $, guild, args, dashboardLang);
		return forms.settings(res, $, guild, args, dashboardLang);
	}
	else if ( settings.guilds.notMember.has(id) ) {
		let guild = settings.guilds.notMember.get(id);
		$('head title').text(`${guild.name} – ` + $('head title').text());
		res.setHeader('Set-Cookie', [`guild="${guild.id}/settings"; HttpOnly; Path=/`]);
		let url = oauth.generateAuthUrl( {
			scope: ['identify', 'guilds', 'bot', 'applications.commands'],
			permissions: defaultPermissions,
			guildId: guild.id, state
		} );
		$('#channellist').empty();
		$('<a class="channel channel-header">').attr('href', url).append(
			$('<img>').attr('src', '/src/settings.svg'),
			$('<div>').text(dashboardLang.get('general.invite'))
		).appendTo('#channellist');
		$('#text .description').append(
			$('<p>').html(dashboardLang.get('selector.invite', true, $('<code>').text(guild.name), $('<a>').attr('href', url))),
			$('<a id="login-button">').attr('href', url).text(dashboardLang.get('general.invite')).prepend(
				$('<img alt="Discord">').attr('src', 'https://discord.com/assets/f8389ca1a741a115313bede9ac02e2c0.svg')
			)
		);
		addWidgets($, dashboardLang);
	}
	else if ( args[0] === 'owner' ) {
		let guild = {
			id, name: 'OWNER ACCESS',
			acronym: '', userPermissions: 1 << 3,
			patreon: true, botPermissions: 1 << 3,
			channels: [], roles: []
		};
		$('head title').text(`${guild.name} – ` + $('head title').text());
		$('<script>').text(`
			const isPatreon = ${guild.patreon};
			const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
		`).insertBefore('script#indexjs');
		$('.channel#settings').attr('href', `/guild/${guild.id}/settings?owner=true`);
		$('.channel#verification').attr('href', `/guild/${guild.id}/verification?owner=true`);
		$('.channel#rcscript').attr('href', `/guild/${guild.id}/rcscript?owner=true`);
		$('.channel#slash').attr('href', `/guild/${guild.id}/slash?owner=true`);
		if ( args[3] === 'settings' ) return forms.settings(res, $, guild, args, dashboardLang);
		if ( args[3] === 'verification' ) return forms.verification(res, $, guild, args, dashboardLang);
		if ( args[3] === 'rcscript' ) return forms.rcscript(res, $, guild, args, dashboardLang);
		if ( args[3] === 'slash' ) return forms.slash(res, $, guild, args, dashboardLang);
		return forms.settings(res, $, guild, args, dashboardLang);
	}
	else {
		$('head title').text(dashboardLang.get('selector.title') + ' – ' + $('head title').text());
		$('#channellist').empty();
		$('<p>').html(dashboardLang.get('selector.desc', true, $('<code>'))).appendTo('#text .description');
		if ( settings.guilds.isMember.size ) {
			$('<h2 id="with-wikibot">').text(dashboardLang.get('selector.with')).appendTo('#text');
			$('<a class="channel">').attr('href', '#with-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('selector.with'))
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
			$('<h2 id="without-wikibot">').text(dashboardLang.get('selector.without')).appendTo('#text');
			$('<a class="channel">').attr('href', '#without-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('selector.without'))
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
			let url = oauth.generateAuthUrl( {
				scope: ['identify', 'guilds'],
				prompt: 'consent', state
			} );
			$('<a class="channel channel-header">').attr('href', url).append(
				$('<img>').attr('src', '/src/settings.svg'),
				$('<div>').text(dashboardLang.get('selector.switch'))
			).appendTo('#channellist');
			$('#text .description').append(
				$('<p>').html(dashboardLang.get('selector.none', true, $('<code>'))),
				$('<a id="login-button">').attr('href', url).text(dashboardLang.get('selector.switch')).prepend(
					$('<img alt="Discord">').attr('src', 'https://discord.com/assets/f8389ca1a741a115313bede9ac02e2c0.svg')
				)
			);
		}
		addWidgets($, dashboardLang);
	}
	let body = $.html();
	res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
	res.write( body );
	return res.end();
}

module.exports = dashboard_guilds;
import { existsSync, readFileSync } from 'node:fs';
import { load as cheerioLoad } from 'cheerio';
import { defaultPermissions } from '../util/defaults.js';
import { forms, beta } from './functions.js';
import Lang from './i18n.js';
import { oauth, enabledOAuth2, settingsData, addWidgets, createNotice, OAuth2Scopes } from './util.js';

const allLangs = Lang.allLangs().names;

const rcscriptExists = ( isDebug || existsSync('./RcGcDb/start.py') );
const file = readFileSync('./dashboard/index.html');

/**
 * Let a user view settings
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('./i18n.js').default} dashboardLang - The user language.
 * @param {String} theme - The display theme
 * @param {import('./util.js').UserSession} userSession - The user session
 * @param {URL} reqURL - The used url
 * @param {String} [action] - The action the user made
 * @param {String[]} [actionArgs] - The arguments for the action
 */
export default function dashboard_guilds(res, dashboardLang, theme, userSession, reqURL, action, actionArgs) {
	reqURL.pathname = reqURL.pathname.replace( /^(\/(?:user|guild\/\d+(?:\/(?:settings|verification|rcscript)(?:\/(?:\d+|new|notice|button))?)?)?)(?:\/.*)?$/, '$1' );
	if ( !rcscriptExists && reqURL.pathname.split('/')[3] === 'rcscript' ) {
		reqURL.pathname = reqURL.pathname.split('/').slice(0, 3);
	}
	var args = reqURL.pathname.split('/');
	var settings = settingsData.get(userSession.user_id);
	if ( reqURL.searchParams.get('owner') && process.env.owner.split('|').includes(userSession.user_id) ) {
		args[0] = 'owner';
	}
	userSession.returnLocation = null;
	dashboardLang = new Lang(...dashboardLang.fromCookie, settings.user.locale, dashboardLang.lang);
	res.setHeader('Content-Language', [dashboardLang.lang]);
	var $ = cheerioLoad(file, {baseURI: reqURL});
	$('html').attr('lang', dashboardLang.lang);
	if ( theme === 'light' ) $('html').addClass('theme-light');
	$('<script>').text(`
		const selectLanguage = '${dashboardLang.get('general.language').replaceAll( '\'', '\\$&' )}';
		const allLangs = ${JSON.stringify(allLangs)};
	`).insertBefore('script#langjs');
	$('head title').text(dashboardLang.get('general.title'));
	$('.channel#settings div').text(dashboardLang.get('general.settings'));
	$('.channel#settings').attr('title', dashboardLang.get('general.settings'));
	$('.channel#verification div').text(dashboardLang.get('general.verification'));
	$('.channel#verification').attr('title', dashboardLang.get('general.verification'));
	if ( rcscriptExists ) {
		$('.channel#rcscript div').text(dashboardLang.get('general.rcscript'));
		$('.channel#rcscript').attr('title', dashboardLang.get('general.rcscript'));
	}
	else {
		$('.channel#rcscript').remove();
	}
	$('.guild#invite a').attr('alt', dashboardLang.get('general.invite'));
	$('.guild#refresh a').attr('alt', dashboardLang.get('general.refresh'));
	$('.guild#theme-dark a').attr('alt', dashboardLang.get('general.theme-dark'));
	$('.guild#theme-light a').attr('alt', dashboardLang.get('general.theme-light'));
	$('#selector span').text(dashboardLang.get('general.selector'));
	$('#support span').text(dashboardLang.get('general.support'));
	$('#user-invite').attr('alt', dashboardLang.get('general.userinvite'));
	$('#logout').attr('alt', dashboardLang.get('general.logout'));
	if ( process.env.READONLY ) createNotice($, 'readonly', dashboardLang);
	if ( action ) {
		if ( action === 'oauthother' && !actionArgs ) actionArgs = [
			oauth.generateAuthUrl( {
				scope: [
					OAuth2Scopes.Identify,
					OAuth2Scopes.Guilds
				],
				prompt: 'consent', state: userSession.state
			} )
		];
		createNotice($, action, dashboardLang, actionArgs);
	}
	$('head').append(
		$('<script id="replaceHistoryState">').text(`history.replaceState(null, null, '${reqURL.pathname}');`)
	);
	let userUrl = oauth.generateAuthUrl( {
		scope: [
			OAuth2Scopes.ApplicationsCommands
		],
		integrationType: 1, state: userSession.state
	} );
	if ( !userUrl.includes( 'integration_type' ) ) userUrl += '&integration_type=1';
	$('#user-invite').attr('href', userUrl);
	$('#logout img').attr('src', settings.user.avatar);
	$('#logout span').text(settings.user.global_name).append( $('<br>'),
		$('<small>').text(settings.user.username + ( settings.user.discriminator === '0' ? '' : ` #${settings.user.discriminator}` ))
	);
	$('.guild#invite a').attr('href', oauth.generateAuthUrl( {
		scope: [
			OAuth2Scopes.Bot,
			OAuth2Scopes.ApplicationsCommands
		],
		permissions: defaultPermissions, state: userSession.state
	} ));
	$('.guild#refresh a').attr('href', `/refresh?return=${reqURL.pathname}`);
	if ( settings.guilds.isMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).insertBefore('#fixed-guild');
		settings.guilds.isMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}/settings`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=64`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).insertBefore('#fixed-guild');
		} );
	}
	if ( settings.guilds.notMember.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).insertBefore('#fixed-guild');
		settings.guilds.notMember.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}/settings`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=64`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).insertBefore('#fixed-guild');
		} );
	}
	if ( settings.guilds.notAdmin.size ) {
		$('<div class="guild">').append(
			$('<div class="separator">')
		).insertBefore('#fixed-guild');
		settings.guilds.notAdmin.forEach( guild => {
			$('<div class="guild">').attr('id', guild.id).append(
				$('<div class="bar">'),
				$('<a>').attr('href', `/guild/${guild.id}/settings`).attr('alt', guild.name).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=64`).attr('alt', guild.name)
					 : $('<div class="avatar noicon">').text(guild.acronym) )
				)
			).insertBefore('#fixed-guild');
		} );
	}

	if ( args[1] === 'guild' ) {
		let id = args[2];
		if ( id ) $(`.guild#${id}`).addClass('selected');
		if ( settings.guilds.isMember.has(id) ) {
			let guild = settings.guilds.isMember.get(id);
			let suffix = ( args[0] === 'owner' ? '?owner=true' : '' );
			$('head title').text(`${guild.name} – ` + $('head title').text());
			$('<script>').text(`
				const isPatreon = ${guild.patreon};
				const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
			`).insertBefore('script#indexjs');
			$('.channel#settings').attr('href', `/guild/${guild.id}/settings${suffix}`);
			$('.channel#verification').attr('href', `/guild/${guild.id}/verification${suffix}`);
			$('.channel#rcscript').attr('href', `/guild/${guild.id}/rcscript${suffix}`);
			if ( suffix ) suffix = '&owner=true';
			beta.forEach( (betaFeatures, betaType) => betaFeatures.forEach( (betaFeature, betaName) => {
				if ( betaFeature.show === 'public' || ( betaFeature.show === 'patreon' && guild.patreon ) || args[0] === 'owner' ) {
					let clone = $(`.channel#${betaType}`).clone();
					clone.attr('id', `${betaType}-beta-${betaName}`).attr('href', `/guild/${guild.id}/${betaType}?beta=${betaName}${suffix}`);
					clone.find('div').prepend($('<div class="beta-name">').text(betaName).prepend(
						$('<small class="beta-flag">').text(dashboardLang.get('general.beta'))
					).attr('title', dashboardLang.get('general.betadesc')));
					clone.appendTo('#channellist');
				}
			} ) );
			if ( reqURL.searchParams.has('beta') ) {
				let betaName = reqURL.searchParams.get('beta');
				if ( beta.get(args[3])?.has(betaName) ) {
					let betaFeature = beta.get(args[3]).get(betaName);
					if ( betaFeature.access === 'public' || ( betaFeature.access === 'patreon' && guild.patreon ) || args[0] === 'owner' ) {
						createNotice($, 'beta', dashboardLang);
						$('head script#replaceHistoryState').text(`history.replaceState(null, null, '${reqURL.pathname}?beta=${betaName}');`);
						$('.guild#refresh a').attr('href', `/refresh?return=${reqURL.pathname}&beta=${betaName}`);
						if ( !$(`.channel#${args[3]}-beta-${betaName}`).length ) {
							let clone = $(`.channel#${args[3]}`).clone();
							clone.attr('id', `${args[3]}-beta-${betaName}`).attr('href', `/guild/${guild.id}/${args[3]}?beta=${betaName}${suffix}`);
							clone.find('div').prepend($('<div class="beta-name">').text(betaName).prepend(
								$('<small class="beta-flag">').text(dashboardLang.get('general.beta'))
							).attr('title', dashboardLang.get('general.betadesc')));
							clone.appendTo('#channellist');
						}
						return betaFeature.form(res, $, guild, args, dashboardLang, userSession.csrf_token);
					}
				}
			}
			if ( args[3] === 'settings' ) return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token);
			if ( args[3] === 'verification' ) return forms.verification(res, $, guild, args, dashboardLang, userSession.csrf_token);
			if ( args[3] === 'rcscript' ) return forms.rcscript(res, $, guild, args, dashboardLang, userSession.csrf_token);
			return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token);
		}
		if ( settings.guilds.notMember.has(id) ) {
			let guild = settings.guilds.notMember.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			res.setHeader('Set-Cookie', [`guild="${guild.id}/settings"; SameSite=Lax; Path=/`]);
			$('<script>').text(`
				const isPatreon = false;
				const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
			`).insertBefore('script#indexjs');
			$('.channel#settings').attr('href', `/guild/${guild.id}`);
			$('.channel#verification, .channel#rcscript').remove();
			let url = oauth.generateAuthUrl( {
				scope: [
					OAuth2Scopes.Bot,
					OAuth2Scopes.ApplicationsCommands
				],
				permissions: defaultPermissions, guildId: guild.id,
				disableGuildSelect: true, state: userSession.state
			} );
			$('<a class="channel channel-header">').attr('href', url).append(
				$('<img>').attr('src', '/src/settings.svg'),
				$('<div>').text(dashboardLang.get('general.invite'))
			).attr('title', dashboardLang.get('general.invite')).prependTo('#channellist');
			$('<a class="channel">').attr('href', userUrl).append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('general.userinvite'))
			).attr('title', dashboardLang.get('general.userinvite')).insertAfter('#settings');
			$('#text .description').append(
				$('<p>').html(dashboardLang.get('settings.invite', true, $('<code>').text(guild.name), $('<a>').attr('href', url), $('<a>').attr('href', userUrl))),
				$('<div class="big-buttons">').append(
					$('<a class="big-button" id="invite-button">').attr('href', url).text(dashboardLang.get('general.invite')).prepend(
						$('<img class="avatar" alt="Wiki-Bot">').attr('src', '/src/icon.png')
					),
					$('<a class="big-button" id="user-invite-button">').attr('href', userUrl).text(dashboardLang.get('general.userinvite')).prepend(
						$('<img class="avatar" alt="Wiki-Bot">').attr('src', '/src/icon.png')
					)
				)
			);
			return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token, settings.user);
		}
		if ( settings.guilds.notAdmin.has(id) ) {
			let guild = settings.guilds.notAdmin.get(id);
			$('head title').text(`${guild.name} – ` + $('head title').text());
			$('<script>').text(`
				const isPatreon = false;
				const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
			`).insertBefore('script#indexjs');
			$('.channel#settings').attr('href', `/guild/${guild.id}`);
			$('.channel#verification, .channel#rcscript').remove();
			$('<a class="channel">').attr('href', userUrl).append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('general.userinvite'))
			).attr('title', dashboardLang.get('general.userinvite')).insertAfter('#settings');
			$('#text .description').append(
				$('<p>').html(dashboardLang.get('settings.user', true, $('<code>').text(guild.name), $('<a>').attr('href', userUrl))),
				$('<div class="big-buttons">').append(
					$('<a class="big-button" id="user-invite-button">').attr('href', userUrl).text(dashboardLang.get('general.userinvite')).prepend(
						$('<img class="avatar" alt="Wiki-Bot">').attr('src', '/src/icon.png')
					)
				)
			);
			return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token, settings.user);
		}
		if ( args[0] === 'owner' ) {
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
			beta.forEach( (betaFeatures, betaType) => betaFeatures.forEach( (betaFeature, betaName) => {
				if ( betaFeature.show === 'public' || ( betaFeature.show === 'patreon' && guild.patreon ) ) {
					let clone = $(`.channel#${betaType}`).clone();
					clone.attr('id', `${betaType}-beta-${betaName}`).attr('href', `/guild/${guild.id}/${betaType}?beta=${betaName}&owner=true`);
					clone.find('div').prepend($('<div class="beta-name">').text(betaName).prepend(
						$('<small class="beta-flag">').text(dashboardLang.get('general.beta'))
					).attr('title', dashboardLang.get('general.betadesc')));
					clone.appendTo('#channellist');
				}
			} ) );
			if ( reqURL.searchParams.has('beta') ) {
				let betaName = reqURL.searchParams.get('beta');
				if ( beta.get(args[3])?.has(betaName) ) {
					let betaFeature = beta.get(args[3]).get(betaName);
					if ( betaFeature.access === 'public' || ( betaFeature.access === 'patreon' && guild.patreon ) ) {
						createNotice($, 'beta', dashboardLang);
						$('head script#replaceHistoryState').text(`history.replaceState(null, null, '${reqURL.pathname}?beta=${betaName}');`);
						$('.guild#refresh a').attr('href', `/refresh?return=${reqURL.pathname}&beta=${betaName}`);
						if ( !$(`.channel#${args[3]}-beta-${betaName}`).length ) {
							let clone = $(`.channel#${args[3]}`).clone();
							clone.attr('id', `${args[3]}-beta-${betaName}`).attr('href', `/guild/${guild.id}/${args[3]}?beta=${betaName}&owner=true`);
							clone.find('div').prepend($('<div class="beta-name">').text(betaName).prepend(
								$('<small class="beta-flag">').text(dashboardLang.get('general.beta'))
							).attr('title', dashboardLang.get('general.betadesc')));
							clone.appendTo('#channellist');
						}
						return betaFeature.form(res, $, guild, args, dashboardLang, userSession.csrf_token);
					}
				}
			}
			if ( args[3] === 'settings' ) return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token);
			if ( args[3] === 'verification' ) return forms.verification(res, $, guild, args, dashboardLang, userSession.csrf_token);
			if ( args[3] === 'rcscript' ) return forms.rcscript(res, $, guild, args, dashboardLang, userSession.csrf_token);
			return forms.settings(res, $, guild, args, dashboardLang, userSession.csrf_token);
		}
	}

	$('#channellist').empty();
	$('#channellist').append(
		$('<a class="channel channel-header">').attr('id', 'server-selector').attr('href', '/').append(
			$('<img alt="Settings">').attr('src', '/src/settings.svg'),
			$('<div>').text(dashboardLang.get('selector.title'))
		).attr('title', dashboardLang.get('selector.title')),
		$('<a class="channel channel-header">').attr('id', 'settings').attr('href', '/settings').append(
			$('<img alt="Settings">').attr('src', '/src/settings.svg'),
			$('<div>').text(dashboardLang.get('general.settings'))
		).attr('title', dashboardLang.get('general.settings'))
	);
	if ( enabledOAuth2.length ) {
		$('#channellist').append(
			$('<a class="channel channel-header">').attr('id', 'user-oauth').attr('href', '/user').append(
				$('<img alt="Settings">').attr('src', '/src/settings.svg'),
				$('<div>').text(dashboardLang.get('selector.user'))
			).attr('title', dashboardLang.get('selector.user'))
		);
		if ( args[1] === 'user' ) {
			$('head title').text(dashboardLang.get('selector.user') + ' – ' + $('head title').text());
			$('#channellist').append(
				...enabledOAuth2.map( oauthSite => {
					return $('<a class="channel">').attr('href', '#oauth-' + oauthSite.id).append(
						$('<img>').attr('src', '/src/channel.svg'),
						$('<div>').text(oauthSite.name)
					).attr('title', oauthSite.name);
				} )
			)
			return forms.user(res, $, settings.user, dashboardLang, userSession.csrf_token);
		}
	}
	if ( args[1] === 'settings' ) {
		$('head title').text(`${settings.user.global_name} – ` + $('head title').text());
		$('<script>').text(`
			const isPatreon = false;
			const i18n = ${JSON.stringify(dashboardLang.getWithFallback('indexjs'))};
		`).insertBefore('script#indexjs');
		$('<a class="channel">').attr('href', userUrl).append(
			$('<img>').attr('src', '/src/channel.svg'),
			$('<div>').text(dashboardLang.get('general.userinvite'))
		).attr('title', dashboardLang.get('general.userinvite')).insertAfter('#settings');
		$('#text .description').append(
			$('<p>').html(dashboardLang.get('settings.userdesc', true, $('<a>').attr('href', userUrl))),
			$('<div class="big-buttons">').append(
				$('<a class="big-button" id="user-invite-button">').attr('href', userUrl).text(dashboardLang.get('general.userinvite')).prepend(
					$('<img class="avatar" alt="Wiki-Bot">').attr('src', '/src/icon.png')
				)
			)
		);
		return forms.settings(res, $, null, args, dashboardLang, userSession.csrf_token, settings.user);
	}
	$('head title').text(dashboardLang.get('selector.title') + ' – ' + $('head title').text());
	$('.channel#server-selector').addClass('selected');
	if ( settings.guilds.count ) {
		$('<p>').html(dashboardLang.get('selector.desc', true, $('<code>'), $('<a>').attr('href', '/settings'), $('<a>').attr('href', userUrl))).appendTo('#text .description');
		if ( settings.guilds.isMember.size ) {
			$('<h2 id="with-wikibot">').text(dashboardLang.get('selector.with')).appendTo('#text');
			$('<a class="channel">').attr('href', '#with-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('selector.with'))
			).attr('title', dashboardLang.get('selector.with')).insertBefore('.channel#settings');
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
		if ( settings.guilds.notMember.size || settings.guilds.notAdmin.size ) {
			$('<h2 id="without-wikibot">').text(dashboardLang.get('selector.without')).appendTo('#text');
			$('<a class="channel">').attr('href', '#without-wikibot').append(
				$('<img>').attr('src', '/src/channel.svg'),
				$('<div>').text(dashboardLang.get('selector.without'))
			).attr('title', dashboardLang.get('selector.without')).insertBefore('.channel#settings');
			$('<div class="server-selector" id="notMember">').appendTo('#text');
			settings.guilds.notMember.forEach( guild => {
				$('<a class="server">').attr('href', `/guild/${guild.id}/settings`).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=256`).attr('alt', guild.name)
						: $('<div class="avatar noicon">').text(guild.acronym) ),
					$('<div class="server-name description">').text(guild.name)
				).appendTo('.server-selector#notMember');
			} );
			settings.guilds.notAdmin.forEach( guild => {
				$('<a class="server">').attr('href', `/guild/${guild.id}/settings`).append(
					( guild.icon ? 
						$('<img class="avatar">').attr('src', `${guild.icon}?size=256`).attr('alt', guild.name).attr('loading', 'lazy')
						: $('<div class="avatar noicon">').text(guild.acronym) ),
					$('<div class="server-name description">').text(guild.name)
				).appendTo('.server-selector#notMember');
			} );
		}
	}
	else {
		let url = oauth.generateAuthUrl( {
			scope: [
				OAuth2Scopes.Identify,
				OAuth2Scopes.Guilds
			],
			prompt: 'consent', state: userSession.state
		} );
		$('<a class="channel">').attr('href', url).append(
			$('<img>').attr('src', '/src/channel.svg'),
			$('<div>').text(dashboardLang.get('selector.switch'))
		).attr('title', dashboardLang.get('selector.switch')).appendTo('#server-selector');
		$('#text .description').append(
			$('<p>').html(dashboardLang.get('selector.none', true, $('<code>'), $('<a>').attr('href', '/settings'), $('<a>').attr('href', userUrl))),
			$('<div class="big-buttons">').append(
				$('<a class="big-button" id="login-button">').attr('href', url).text(dashboardLang.get('selector.switch')).prepend(
					$('<img alt="Discord">').attr('src', '/src/discord.svg')
				),
				$('<a class="big-button" id="user-invite-button">').attr('href', userUrl).text(dashboardLang.get('general.userinvite')).prepend(
					$('<img class="avatar" alt="Wiki-Bot">').attr('src', '/src/icon.png')
				)
			)
		);
	}
	addWidgets($, dashboardLang);
	let body = $.html();
	res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
	res.write( body );
	return res.end();
}
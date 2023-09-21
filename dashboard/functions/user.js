import { db, enabledOAuth2 } from '../util.js';

/**
 * Let a user change settings
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio').CheerioAPI} $ - The response body
 * @param {import('./util.js').User} user - The current user
 * @param {import('./i18n.js').default} dashboardLang - The user language
 */
function dashboard_user(res, $, user, dashboardLang) {
	db.query( 'SELECT site, token FROM oauthusers WHERE userid = $1', [user.id] ).then( ({rows}) => {
		$('<p>').text(dashboardLang.get('oauth.desc')).appendTo('#text .description');
		$('<form id="wb-settings" method="post" enctype="application/x-www-form-urlencoded">').append(
			$('<h2>').text(dashboardLang.get('oauth.form.default')),
			...enabledOAuth2.map( oauthSite => {
				let row = rows.find( row => row.site === oauthSite.id );
				let buttons = $('<div>');
				if ( row ) {
					if ( row.token === null ) buttons.append(
						$('<span>').append(
							$('<input type="submit">').addClass('wb-oauth-enabled').attr('name', 'oauth_enable_' + oauthSite.id).val(dashboardLang.get('oauth.form.enable'))
						),
						$('<span>').append(
							$('<input type="submit">').addClass('wb-oauth-connected').attr('name', 'oauth_connect_' + oauthSite.id).val(dashboardLang.get('oauth.form.connect'))
						)
					);
					else buttons.append(
						$('<span>').append(
							$('<input type="submit">').addClass('wb-oauth-disabled').attr('name', 'oauth_disable_' + oauthSite.id).val(dashboardLang.get('oauth.form.disable'))
						),
						$('<span>').append(
							$('<input type="submit">').addClass('wb-oauth-unconnected').attr('name', 'oauth_disconnect_' + oauthSite.id).val(dashboardLang.get('oauth.form.disconnect'))
						)
					);
				}
				else buttons.append(
					$('<span>').append(
						$('<input type="submit">').addClass('wb-oauth-disabled').attr('name', 'oauth_disable_' + oauthSite.id).val(dashboardLang.get('oauth.form.disable'))
					),
					$('<span>').append(
						$('<input type="submit">').addClass('wb-oauth-connected').attr('name', 'oauth_connect_' + oauthSite.id).val(dashboardLang.get('oauth.form.connect'))
					)
				);
				return $('<div>').addClass('wb-oauth-site').attr('id', 'oauth-' + oauthSite.id).append(
					$('<fieldset>').append(
						$('<legend>').append(
							$('<a target="_blank">').attr('href', oauthSite.manage).text(oauthSite.name)
						),
						$('<div>').append(
							$('<span>').text(dashboardLang.get('oauth.form.current')),
							( row ? ( row.token === null ?
								$('<span>').addClass('wb-oauth-disabled').text(dashboardLang.get('oauth.form.disabled'))
							:
								$('<span>').addClass('wb-oauth-connected').text(dashboardLang.get('oauth.form.connected'))
							) :
								$('<span>').addClass('wb-oauth-unconnected').text(dashboardLang.get('oauth.form.unconnected'))
							)
						),
						buttons
					)
				)
			} )
		).attr('action', '/user').appendTo('#text');
	}, dberror => {
		console.log( '- Dashboard: Error while getting the OAuth2 info: ' + dberror );
		createNotice($, 'error', dashboardLang);
		$('<p>').text(dashboardLang.get('oauth.failed')).appendTo('#text .description');
	} ).then( () => {
		let body = $.html();
		res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
		res.write( body );
		return res.end();
	} );
}

/**
 * Change settings
 * @param {Function} res - The server response
 * @param {String} user_id - The current user
 * @param {String} type - The setting to change
 * @param {String} oauth_id - The OAuth2 site to change
 */
function update_user(res, user_id, type, oauth_id) {
	if ( !['connect', 'disconnect', 'disable', 'enable'].includes( type ) || !enabledOAuth2.some( oauthSite => oauthSite.id === oauth_id ) ) {
		return res('/user', 'savefail');
	}
	if ( type === 'disconnect' || type === 'enable' ) return db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [user_id, oauth_id] ).then( () => {
		if ( type === 'disconnect' ) console.log( '- Dashboard: Successfully disconnected ' + user_id + ' from ' + oauth_id + '.' );
		else console.log( '- Dashboard: Successfully enabled ' + oauth_id + ' for ' + user_id + '.' );
		return res('/user', 'save');
	}, dberror => {
		if ( type === 'disconnect' ) console.log( '- Dashboard: Error while disconnecting ' + user_id + ' from ' + oauth_id + ': ' + dberror );
		else console.log( '- Dashboard: Error while enabling ' + oauth_id + ' for ' + user_id + ': ' + dberror );
		return res('/user', 'savefail');
	} );
	return db.query( 'SELECT FROM oauthusers WHERE userid = $1 AND site = $2', [user_id, oauth_id] ).then( ({rows:[row]}) => {
		if ( type === 'disable' ) {
			let sql = 'INSERT INTO oauthusers(userid, site, token) VALUES ($1, $2, $3)';
			if ( row ) sql = 'UPDATE oauthusers SET token = $3 WHERE userid = $1 AND site = $2';
			return db.query( sql, [user_id, oauth_id, null] ).then( () => {
				console.log( '- Dashboard: Successfully disabled ' + oauth_id + ' for ' + user_id + '.' );
				return res('/user', 'save');
			}, dberror => {
				console.log( '- Dashboard: Error while disabling ' + oauth_id + ' for ' + user_id + ': ' + dberror );
				return res('/user', 'savefail');
			} );
		}
		if ( type !== 'connect' ) return res('/user', 'savefail');
		var oauthSite = enabledOAuth2.find( oauthSite => oauthSite.id === oauth_id );
		if ( row ) db.query( 'DELETE FROM oauthusers WHERE userid = $1 AND site = $2', [user_id, oauth_id] ).then( () => {
			console.log( '- Dashboard: Successfully disconnected ' + user_id + ' from ' + oauth_id + ' for reconnection.' );
		}, dberror => {
			console.log( '- Dashboard: Error while disconnecting ' + user_id + ' from ' + oauth_id + ' for reconnection: ' + dberror );
		} );
		let oauthURL = oauthSite.url + 'rest.php/oauth2/authorize?' + new URLSearchParams({
			response_type: 'code', redirect_uri: new URL('/oauth/mw', process.env.dashboard).href,
			client_id: process.env['oauth_' + oauthSite.id], state: oauthSite.id
		}).toString();
		return res(oauthURL, 'REDIRECT');
	}, dberror => {
		console.log( '- Dashboard: Error while getting the OAuth2 info on ' + oauth_id + ' for ' + user_id + ': ' + dberror );
		return res('/user', 'savefail');
	} );
}

export {
	dashboard_user as get,
	update_user as post
};
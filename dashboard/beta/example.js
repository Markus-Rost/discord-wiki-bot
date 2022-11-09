/**
 * Let a user change something
 * @param {import('http').ServerResponse} res - The server response
 * @param {import('cheerio').CheerioAPI} $ - The response body
 * @param {import('../util.js').Guild} guild - The current guild
 * @param {String[]} args - The url parts
 * @param {import('../i18n.js').default} dashboardLang - The user language
 */
function dashboard_get(res, $, guild, args, dashboardLang) {
	let body = $.html();
	res.writeHead(200, {'Content-Length': Buffer.byteLength(body)});
	res.write( body );
	return res.end();
}

/**
 * Change something
 * @param {Function} res - The server response
 * @param {import('../util.js').Settings} userSettings - The settings of the user
 * @param {String} guild - The id of the guild
 * @param {String|Number} type - The setting to change
 * @param {Object} settings - The new settings
 */
function update_post(res, userSettings, guild, type, settings) {
	return res('/', 'savefail');
}

export default {
	type: null, // 'settings', 'verification', 'rcscript'
	name: 'example',
	data: {
		show: 'none', // 'none', 'patreon', 'public'
		access: 'none', // 'none', 'patreon', 'public'
		form: dashboard_get,
		post: update_post
	}
};

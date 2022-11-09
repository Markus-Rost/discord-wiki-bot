import { readdir } from 'node:fs';
import { get as rcscript_get, post as rcscript_post } from './functions/rcscript.js';
import { get as settings_get, post as settings_post } from './functions/settings.js';
import { get as user_get, post as user_post } from './functions/user.js';
import { get as verification_get, post as verification_post } from './functions/verification.js';

export const forms = {
	rcscript: rcscript_get,
	settings: settings_get,
	user: user_get,
	verification: verification_get
};
export const posts = {
	rcscript: rcscript_post,
	settings: settings_post,
	user: user_post,
	verification: verification_post
};

/**
 * @typedef PageData
 * @property {'public'|'patreon'|'none'} show
 * @property {'public'|'patreon'|'none'} access
 * @property {Function} form
 * @property {Function} post
 */

/** @type {Map<'settings'|'verification'|'rcscript', Map<String, PageData>>} */
export const beta = new Map([
	['settings', new Map()],
	['verification', new Map()],
	['rcscript', new Map()]
]);
readdir( './dashboard/beta', (error, files) => {
	if ( error ) return error;
	files.filter( file => file.endsWith('.js') ).forEach( file => {
		import('./beta/' + file).then( ({default: command}) => {
			beta.get(command.type)?.set(command.name, command.data);
		} );
	} );
} );
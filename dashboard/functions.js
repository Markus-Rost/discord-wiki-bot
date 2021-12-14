import {get as rcscript_get, post as rcscript_post} from './rcscript.js';
import {get as settings_get, post as settings_post} from './settings.js';
import {get as slash_get, post as slash_post} from './slash.js';
import {get as user_get, post as user_post} from './user.js';
import {get as verification_get, post as verification_post} from './verification.js';

export const forms = {
	rcscript: rcscript_get,
	settings: settings_get,
	slash: slash_get,
	user: user_get,
	verification: verification_get
};
export const posts = {
	rcscript: rcscript_post,
	settings: settings_post,
	slash: slash_post,
	user: user_post,
	verification: verification_post
};
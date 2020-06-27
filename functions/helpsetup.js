function help_setup(lang, msg) {
	msg.defaultSettings = false;
	msg.replyMsg( lang.get('settings.missing').replaceSave( '%1$s', '`' + process.env.prefix + 'settings lang`' ).replaceSave( '%2$s', '`' + process.env.prefix + 'settings wiki`' ) );
}

module.exports = help_setup;
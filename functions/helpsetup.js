function help_setup(lang, msg) {
	msg.defaultSettings = false;
	msg.replyMsg( lang.get('settings.missing', '`' + process.env.prefix + 'settings lang`', '`' + process.env.prefix + 'settings wiki`') );
}

module.exports = help_setup;
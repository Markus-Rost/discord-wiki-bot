const util = require('util');
const {defaultSettings, wikiProjects} = require('./default.json');

/**
 * A wiki.
 * @class Wiki
 */
class Wiki extends URL {
	/**
	 * Creates a new wiki.
	 * @param {String|URL|Wiki} [wiki] - The wiki script path.
	 * @param {String|URL|Wiki} [base] - The base for the wiki.
	 * @constructs Wiki
	 */
	constructor(wiki = defaultSettings.wiki, base = defaultSettings.wiki) {
		super(wiki, base);
		this.protocol = 'https';
		let articlepath = '/index.php?title=$1';
		if ( this.isFandom() ) articlepath = this.pathname + 'wiki/$1';
		if ( this.isGamepedia() ) articlepath = '/$1';
		let project = wikiProjects.find( project => this.hostname.endsWith( project.name ) );
		if ( project ) {
			let regex = ( this.host + this.pathname ).match( new RegExp( '^' + project.regex + project.scriptPath + '$' ) );
			if ( regex ) articlepath = 'https://' + regex[1] + project.articlePath + '$1';
		}
		this.articlepath = articlepath;
		this.mainpage = '';
	}

	/**
	 * @type {String}
	 */
	get articlepath() {
		return this.articleURL.pathname + this.articleURL.search;
	}
	set articlepath(path) {
		this.articleURL = new articleURL(path, this);
	}

	/**
	 * @type {String}
	 */
	get mainpage() {
		return this.articleURL.mainpage;
	}
	set mainpage(title) {
		this.articleURL.mainpage = title;
	}

	/**
	 * Updates the wiki url.
	 * @param {Object} siteinfo - Siteinfo from the wiki API.
	 * @param {String} siteinfo.server - Server of the wiki with protocol. (For legacy Fandom wikis)
	 * @param {String} siteinfo.servername - Hostname of the wiki.
	 * @param {String} siteinfo.scriptpath - Scriptpath of the wiki.
	 * @param {String} siteinfo.articlepath - Articlepath of the wiki.
	 * @param {String} siteinfo.mainpage - Main page of the wiki.
	 * @returns {Wiki}
	 */
	updateWiki({server, servername, scriptpath, articlepath, mainpage}) {
		if ( servername ) this.hostname = servername;
		else this.hostname = server.replace( /^(?:https?:)?\/\//, '' );
		this.pathname = scriptpath + '/';
		this.articlepath = articlepath;
		this.mainpage = mainpage;
		return this;
	}

	/**
	 * Check for a Fandom wiki.
	 * @returns {Boolean}
	 */
	isFandom() {
		return ( this.hostname.endsWith( '.fandom.com' ) || this.hostname.endsWith( '.wikia.org' ) );
	}

	/**
	 * Check for a Gamepedia wiki.
	 * @returns {Boolean}
	 */
	isGamepedia() {
		return this.hostname.endsWith( '.gamepedia.com' );
	}

	/**
	 * Check if a wiki is missing.
	 * @param {String} [message] - Error message or response url.
	 * @returns {Boolean}
	 */
	noWiki(message = '') {
		if ( !( this.isGamepedia() || this.isFandom() ) ) return false;
		if ( this.hostname.startsWith( 'www.' ) || message.startsWith( 'https://www.' ) ) return true;
		return [
			'https://community.fandom.com/wiki/Community_Central:Not_a_valid_community?from=' + this.hostname,
			this + 'language-wikis'
		].includes( message.replace( /Unexpected token < in JSON at position 0 in "([^ ]+)"/, '$1' ) );
	}

	/**
	 * Get an URI encoded link.
	 * @param {String} [title] - Name of the page.
	 * @returns {String}
	 */
	toDescLink(title = this.mainpage) {
		return this.articleURL.href.replace( '$1', encodeURIComponent( title.replace( / /g, '_' ) ) );
	}

	/**
	 * Get a page link.
	 * @param {String} [title] - Name of the page.
	 * @param {URLSearchParams} [querystring] - Query arguments of the page.
	 * @param {String} [fragment] - Fragment of the page.
	 * @param {Boolean} [isMarkdown] - Use the link in markdown.
	 * @returns {String}
	 */
	toLink(title = '', querystring = '', fragment = '', isMarkdown = false) {
		querystring = new URLSearchParams(querystring);
		if ( !querystring.toString().length ) title = ( title || this.mainpage );
		title = title.replace( / /g, '_' );
		let link = new URL(this.articleURL);
		link.pathname = link.pathname.replace( '$1', title.replace( /\\/g, '%5C' ) );
		link.searchParams.forEach( (value, name, searchParams) => {
			if ( value.includes( '$1' ) ) {
				if ( !title ) searchParams.delete(name);
				else searchParams.set(name, value.replace( '$1', title ));
			}
		} );
		querystring.forEach( (value, name) => {
			link.searchParams.append(name, value);
		} );
		let output = decodeURI( link ).replace( /\\/g, '%5C' ).replace( /@(here|everyone)/g, '%40$1' );
		if ( isMarkdown ) output = output.replace( /([\(\)])/g, '\\$1' );
		return output + Wiki.toSection(fragment);
	}

	/**
	 * Encode a page title.
	 * @param {String} [title] - Title of the page.
	 * @returns {String}
	 * @static
	 */
	static toTitle(title = '') {
		return title.replace( / /g, '_' ).replace( /[?&%\\]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replace( /@(here|everyone)/g, '%40$1' ).replace( /[()]/g, '\\$&' );
	};

	/**
	 * Encode a link section.
	 * @param {String} [fragment] - Fragment of the page.
	 * @returns {String}
	 * @static
	 */
	static toSection(fragment = '') {
		if ( !fragment ) return '';
		fragment = fragment.replace( / /g, '_' );
		if ( !/['"`^{}<>|\\]|@(everyone|here)/.test(fragment) ) return '#' + fragment;
		return '#' + encodeURIComponent( fragment ).replace( /[!'()*~]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replace( /%3A/g, ':' ).replace( /%/g, '.' );
	}

	[util.inspect.custom](depth, opts) {
		if ( typeof depth === 'number' && depth < 0 ) return this;
		const wiki = {
			href: this.href,
			origin: this.origin,
			protocol: this.protocol,
			username: this.username,
			password: this.password,
			host: this.host,
			hostname: this.hostname,
			port: this.port,
			pathname: this.pathname,
			search: this.search,
			searchParams: this.searchParams,
			hash: this.hash,
			articlepath: this.articlepath,
			articleURL: this.articleURL,
			mainpage: this.mainpage
		}
		return 'Wiki ' + util.inspect(wiki, opts);
	}
}

/**
 * An article URL.
 * @class articleURL
 */
class articleURL extends URL {
	/**
	 * Creates a new article URL.
	 * @param {String|URL|Wiki} [articlepath] - The article path.
	 * @param {String|URL|Wiki} [wiki] - The wiki.
	 * @constructs articleURL
	 */
	constructor(articlepath = '/index.php?title=$1', wiki) {
		super(articlepath, wiki);
		this.protocol = 'https';
		this.mainpage = '';
	}

	[util.inspect.custom](depth, opts) {
		if ( typeof depth === 'number' && depth < 0 ) return this;
		if ( typeof depth === 'number' && depth < 2 ) {
			var link = this.href;
			var mainpage = link.replace( '$1', ( this.mainpage || 'Main Page' ).replace( / /g, '_' ) );
			return 'articleURL { ' + util.inspect(link, opts) + ' => ' + util.inspect(mainpage, opts) + ' }';
		}
		return super[util.inspect.custom](depth, opts);
	}
}

module.exports = Wiki;
import { inspect } from 'node:util';
import { wikiProjects, frontendProxies, inputToWikiProject, inputToFrontendProxy } from 'mediawiki-projects-list';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {defaultSettings, defaultNamespaces} = require('./default.json');

/** @type {Map<String, String>} - Source wikis for global user pages. */
const globalUserPage = new Map([
	['wikimedia', 'https://meta.wikimedia.org/w/'],
	['miraheze', 'https://login.miraheze.org/w/'],
	['wikiforge', 'https://meta.wikiforge.net/w/'],
	['telepedia', 'https://meta.telepedia.net/']
]);

/** @type {String[]} - Sites that support verification using OAuth2. */
export const oauthSites = [];

/** @type {Map<String, Wiki>} - Cache of Wikis. */
const CACHE = new Map();

// Remove wikis with notes, add wikis to oauthSites
[...wikiProjects.values()].filter( project => {
	if ( project.note ) return true;
	if ( project.extensions.includes('OAuth') && !project.wikiFarm && project.fullScriptPath ) {
		oauthSites.push(project.fullScriptPath);
	}
	return false;
} ).forEach( project => {
	if ( isDebug ) console.log( '- ' + ( process.env.SHARDS ?? 'Dashboard' ) + ': Debug: Removing wiki: ' + project.name + ' - ' + project.note );
	wikiProjects.delete(project.name);
} );
[...frontendProxies.values()].filter( proxy => proxy.note ).forEach( proxy => {
	if ( isDebug ) console.log( '- ' + ( process.env.SHARDS ?? 'Dashboard' ) + ': Debug: Removing proxy: ' + proxy.name + ' - ' + proxy.note );
	frontendProxies.delete(proxy.name);
} );

/**
 * A MediaWiki namespace
 * @typedef {Object} mwNamespace
 * @property {Number} id
 * @property {String} name
 * @property {String[]} aliases
 * @property {Boolean} content
 */

/**
 * A MediaWiki namespace list
 * @typedef {Map<Number, mwNamespace> & {all: mwNamespace[], content: mwNamespace[]}} mwNamespaceList
 */

/**
 * A wiki.
 * @class Wiki
 */
export default class Wiki extends URL {
	/**
	 * Creates a new wiki.
	 * @param {String|URL|Wiki} [wiki] - The wiki script path.
	 * @param {String|URL|Wiki} [base] - The base for the wiki.
	 * @constructs Wiki
	 */
	constructor(wiki = defaultSettings.wiki, base = defaultSettings.wiki) {
		super(wiki, base);
		this.protocol = 'https';
		if ( Wiki._cache.has(this.name) ) {
			return Wiki._cache.get(this.name);
		}
		this.proxyName = null;
		let frontendProxy = inputToFrontendProxy(this.href);
		if ( frontendProxy ) {
			this.proxyName = frontendProxy.fullNamePath;
			this.href = frontendProxy.fullScriptPath;
			this.articlepath = frontendProxy.fullArticlePath;
		}
		let articlepath = this.pathname + 'index.php?title=$1';
		this.gamepedia = this.hostname.endsWith( '.gamepedia.com' );
		if ( this.isGamepedia() ) articlepath = '/$1';
		this.wikifarm = null;
		this.centralauth = false;
		this.spaceReplacement = '_';
		let project = inputToWikiProject(this.href);
		if ( project ) {
			articlepath = project.fullArticlePath;
			this.spaceReplacement = project.wikiProject.urlSpaceReplacement;
			this.wikifarm = project.wikiProject.wikiFarm;
			this.centralauth ||= project.wikiProject.extensions.includes('CentralAuth');
			this.oauth2 ||= project.wikiProject.extensions.includes('OAuth');
		}
		if ( !this.proxyName ) this.articlepath = articlepath;
		this.mainpage = '';
		this.mainpageisdomainroot = false;
		/** @type {mwNamespaceList} */
		this.namespaces = new Map(defaultNamespaces.map( namespace => [namespace.id, structuredClone(namespace)] ));
		Object.defineProperties( this.namespaces, {
			all: {
				get: function() {
					return [...this.values()];
				}
			},
			content: {
				get: function() {
					return this.all.filter( ns => ns.content );
				}
			}
		} );
		/** @type {{name: String, value: String}[]?} */
		this.commonSearches = null;
		this.oauth2 ||= Wiki.oauthSites.includes( this.href );
		Wiki._cache.set(this.name, this);
	}

	/**
	 * Proxy name or script path of the Wiki.
	 * @type {String}
	 */
	get name() {
		return this.proxyName || this.href;
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
	 * @type {Wiki?}
	 */
	#globalUserPage = null;
	/**
	 * @type {Wiki?}
	 */
	get globaluserpage() {
		if ( !globalUserPage.has(this.wikifarm) ) return null;
		if ( this.#globalUserPage ) return this.#globalUserPage;
		return this.#globalUserPage = new Wiki(globalUserPage.get(this.wikifarm));
	}

	/**
	 * Updates the wiki url.
	 * @param {Object} siteinfo - Siteinfo from the wiki API.
	 * @param {String} siteinfo.servername - Hostname of the wiki.
	 * @param {String} siteinfo.scriptpath - Scriptpath of the wiki.
	 * @param {String} siteinfo.articlepath - Articlepath of the wiki.
	 * @param {String} siteinfo.mainpage - Main page of the wiki.
	 * @param {String} siteinfo.centralidlookupprovider - Central auth of the wiki.
	 * @param {String} siteinfo.logo - Logo of the wiki.
	 * @param {String} [siteinfo.gamepedia] - If the wiki is a Gamepedia wiki.
	 * @param {{id: Number, canonical: String, content?: "", '*': String}[]} [namespaces] - Namespaces from the wiki API.
	 * @param {{id: Number, '*': String}[]} [namespacealiases] - Namespace aliases from the wiki API.
	 * @returns {Wiki}
	 */
	updateWiki({servername, scriptpath, articlepath, mainpage, mainpageisdomainroot, centralidlookupprovider, logo, gamepedia = 'false'}, namespaces, namespacealiases) {
		this.hostname = servername;
		this.pathname = scriptpath + '/';
		if ( !this.proxyName ) this.articlepath = articlepath;
		this.mainpage = mainpage;
		this.mainpageisdomainroot = ( mainpageisdomainroot !== undefined );
		this.centralauth = ( centralidlookupprovider === 'CentralAuth' );
		this.gamepedia = ( gamepedia === 'true' );
		this.oauth2 ||= Wiki.oauthSites.includes( this.href );
		let project = inputToWikiProject(this.href);
		if ( project ) {
			this.spaceReplacement = project.wikiProject.urlSpaceReplacement;
			this.wikifarm = project.wikiProject.wikiFarm;
			this.oauth2 ||= project.wikiProject.extensions.includes('OAuth');
		}
		if ( /^(?:https?:)?\/\/static\.miraheze\.org\//.test(logo) ) this.wikifarm = 'miraheze';
		if ( /^(?:https?:)?\/\/static\.wikiforge\.net\//.test(logo) ) this.wikifarm = 'wikiforge';
		if ( namespaces && namespacealiases ) namespaces.forEach( namespace => {
			/** @type {{id: Number, name: String, aliases: String[], content: Boolean}} */
			let ns = {
				id: +namespace.id,
				name: namespace['*'],
				aliases: [
					namespace.canonical ?? namespace['*'],
					...namespacealiases.filter( alias => +namespace.id === +alias.id ).map( alias => alias['*'] )
				],
				content: namespace.content !== undefined
			};
			this.namespaces.set(ns.id, ns);
		} );
		if ( this !== Wiki._cache.get(this.name) ) {
			if ( !Wiki._cache.has(this.name) ) Wiki._cache.set(this.name, this);
			else Wiki._cache.forEach( (wiki, href) => {
				if ( wiki.name === this.name && wiki !== this ) {
					Wiki._cache.set(href, this);
				}
			} );
		}
		return this;
	}

	/**
	 * Check for a Gamepedia wiki.
	 * @returns {Boolean}
	 */
	isGamepedia() {
		return this.gamepedia;
	}

	/**
	 * Check for CentralAuth.
	 * @returns {Boolean}
	 */
	hasCentralAuth() {
		return this.centralauth;
	}

	/**
	 * Check for OAuth2.
	 * @returns {Boolean}
	 */
	hasOAuth2() {
		return ( this.oauth2 || this.wikifarm === 'miraheze' || this.wikifarm === 'wikiforge' );
	}

	/**
	 * Check if a wiki is missing.
	 * @param {String} [message] - Error message or response url.
	 * @param {Number} [statusCode] - Status code of the response.
	 * @returns {Boolean}
	 */
	noWiki(message = '', statusCode = 0) {
		if ( statusCode === 410 || statusCode === 404 ) return true;
		if ( message === 'getaddrinfo ENOTFOUND ' + this.hostname ) return true;
		if ( this.wikifarm !== 'fandom' ) return false;
		if ( this.hostname.startsWith( 'www.' ) || message.startsWith( 'https://www.' ) ) return true;
		return [
			'https://community.fandom.com/wiki/Community_Central:Not_a_valid_community?from=' + this.hostname,
			this + 'language-wikis'
		].includes( message.replace( /Unexpected token < in JSON at position 0 in "([^ ]+)"/, '$1' ) );
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
		if ( !querystring.toString().length ) {
			title = ( title || this.mainpage );
			if ( this.mainpageisdomainroot && title === this.mainpage ) return this.origin + '/' + Wiki.toSection(fragment, this.spaceReplacement, true);
		}
		title = title.replaceAll( ' ', this.spaceReplacement ).replaceAll( '%', '%2525' );
		let link = new URL(this.articleURL);
		link.pathname = link.pathname.replaceSafe( '$1', title.replaceAll( '\\', '%5C' ) );
		link.searchParams.forEach( (value, name, searchParams) => {
			if ( value.includes( '$1' ) ) {
				if ( !title ) searchParams.delete(name);
				else searchParams.set(name, value.replaceSafe( '$1', title ));
			}
		} );
		querystring.forEach( (value, name) => {
			link.searchParams.append(name, value);
		} );
		let output = decodeURI( link ).replace( /%(?:3B|2F|3A|40|21|7E|27|28|29)/g, decodeURIComponent ).replace( /\\|<|>|@(?:here|everyone)|\xa0/g, encodeURIComponent ) + Wiki.toSection(fragment, this.spaceReplacement, true);
		if ( isMarkdown ) return output.replaceAll( '(', '%28' ).replaceAll( ')', '%29' );
		else return output;
	}

	/**
	 * Encode a page title.
	 * @param {String} [title] - Title of the page.
	 * @param {String} [spaceReplacement] - The url replacement for spaces.
	 * @returns {String}
	 * @static
	 */
	static toTitle(title = '', spaceReplacement = '_') {
		return title.replaceAll( ' ', spaceReplacement ).replace( /[?&%\\]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replace( /@(here|everyone)/g, '%40$1' ).replace( /[()]/g, '\\$&' );
	};

	/**
	 * Encode a link section.
	 * @param {String} [fragment] - Fragment of the page.
	 * @param {String} [spaceReplacement] - The url replacement for spaces.
	 * @param {Boolean} [simpleEncoding] - Don't fully encode the anchor.
	 * @returns {String}
	 * @static
	 */
	static toSection(fragment = '', spaceReplacement = '_', simpleEncoding = true) {
		if ( !fragment ) return '';
		fragment = fragment.replaceAll( ' ', spaceReplacement );
		if ( simpleEncoding && !/['"`^{}<>|\\]|@(everyone|here)/.test(fragment) ) return '#' + fragment;
		return '#' + encodeURIComponent( fragment ).replace( /[!'()*~]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replaceAll( '%3A', ':' ).replaceAll( '%', '.' );
	}

	/**
	 * Turn user input into a wiki.
	 * @param {String} input - The user input referring to a wiki.
	 * @returns {Wiki?}
	 * @static
	 */
	static fromInput(input = '') {
		try {
			if ( input instanceof URL ) return new Wiki(input);
			input = input.replace( /^(?:https?:)?\/\//, 'https://' );
			let project = inputToWikiProject(input);
			if ( project ) return new Wiki(project.fullScriptPath);
			let proxy = inputToFrontendProxy(input);
			if ( proxy ) return new Wiki(proxy.fullNamePath);
			if ( input.startsWith( 'https://' ) ) {
				if ( /^https:\/\/(?:www\.)?google\.(?:com?\.)?[a-z]{2,3}\/url\?/.test(input) ) {
					try {
						let googleUrl = new URL(input).searchParams.get('url');
						if ( /^(?:https?:)?\/\/(?!(?:www\.)?google\.)/.test(googleUrl) ) {
							return fromInput(googleUrl);
						}
						return null;
					}
					catch {
					}
				}
				let wiki = input.replace( /\/(?:index|api|load|rest)\.php(?:|[\?\/#].*)$/, '/' );
				if ( !wiki.endsWith( '/' ) ) wiki += '/';
				return new Wiki(wiki);
			}
			if ( /^(?:[a-z-]{2,12}\.)?[a-z\d-]{1,50}$/.test(input) ) {
				if ( !input.includes( '.' ) ) return new Wiki('https://' + input + '.fandom.com/');
				else return new Wiki('https://' + input.split('.')[1] + '.fandom.com/' + input.split('.')[0] + '/');
			}
			return null;
		}
		catch {
			return null;
		}
	}

	/**
	 * @type {String[]} - Sites that support verification using OAuth2.
	 */
	static get oauthSites() {
		return oauthSites;
	};

	/**
	 * @type {Map<String, Wiki>} - Cache of Wikis.
	 * @private
	 */
	static get _cache() {
		return CACHE;
	};

	[inspect.custom](depth, opts) {
		if ( typeof depth === 'number' && depth < 0 ) return this;
		const wiki = {
			href: this.href,
			name: this.name,
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
			proxyName: this.proxyName,
			articlepath: this.articlepath,
			articleURL: this.articleURL,
			spaceReplacement: this.spaceReplacement,
			mainpage: this.mainpage,
			mainpageisdomainroot: this.mainpageisdomainroot,
			namespaces: this.namespaces.size,
			centralauth: this.centralauth,
			oauth2: this.oauth2,
			wikifarm: this.wikifarm,
			gamepedia: this.gamepedia,
		}
		return 'Wiki ' + inspect(wiki, opts);
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
	 * @param {Wiki} [wiki] - The wiki.
	 * @constructs articleURL
	 */
	constructor(articlepath = '/index.php?title=$1', wiki) {
		super(articlepath, wiki);
		this.protocol = 'https';
		this.username = '';
		this.password = '';
		this.mainpage = '';
		this.spaceReplacement = ( wiki?.spaceReplacement || '_' );
	}

	[inspect.custom](depth, opts) {
		if ( typeof depth === 'number' && depth < 0 ) return this;
		if ( typeof depth === 'number' && depth < 2 ) {
			var link = this.href;
			var mainpage = link.replaceSafe( '$1', Wiki.toTitle(( this.mainpage || 'Main Page' ), this.spaceReplacement) );
			return 'articleURL { ' + inspect(link, opts) + ' => ' + inspect(mainpage, opts) + ' }';
		}
		return super[inspect.custom](depth, opts);
	}
}

export const toTitle = Wiki.toTitle;
export const toSection = Wiki.toSection;
export const fromInput = Wiki.fromInput;
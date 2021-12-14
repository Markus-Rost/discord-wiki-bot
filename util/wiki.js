import {inspect} from 'util';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const {defaultSettings, wikiProjects} = require('./default.json');

const wikimediaSites = [
	'wikipedia.org',
	'mediawiki.org',
	'wikimedia.org',
	'wiktionary.org',
	'wikibooks.org',
	'wikisource.org',
	'wikidata.org',
	'wikiversity.org',
	'wikiquote.org',
	'wikinews.org',
	'wikivoyage.org'
];

const urlSpaceReplacement = {
	'https://www.wikihow.com/': '-',
	'https://wikihow.com/': '-'
}

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
		let articlepath = this.pathname + 'index.php?title=$1';
		if ( this.isFandom() ) articlepath = this.pathname + 'wiki/$1';
		this.gamepedia = this.hostname.endsWith( '.gamepedia.com' );
		if ( this.isGamepedia() ) articlepath = '/$1';
		let project = wikiProjects.find( project => this.hostname.endsWith( project.name ) );
		if ( project ) {
			let regex = ( this.host + this.pathname ).match( new RegExp( '^' + project.regex + project.scriptPath + '$' ) );
			if ( regex ) articlepath = 'https://' + regex[1] + project.articlePath + '$1';
		}
		this.articlepath = articlepath;
		this.mainpage = '';
		this.miraheze = this.hostname.endsWith( '.miraheze.org' );
		this.wikimedia = wikimediaSites.includes( this.hostname.split('.').slice(-2).join('.') );
		this.centralauth = ( ( this.isWikimedia() || this.isMiraheze() ) ? 'CentralAuth' : 'local' );
		this.oauth2 = Wiki.oauthSites.includes( this.href );
		this.spaceReplacement = ( urlSpaceReplacement.hasOwnProperty(this.href) ? urlSpaceReplacement[this.href] : '_' );
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
	 * @param {String} siteinfo.servername - Hostname of the wiki.
	 * @param {String} siteinfo.scriptpath - Scriptpath of the wiki.
	 * @param {String} siteinfo.articlepath - Articlepath of the wiki.
	 * @param {String} siteinfo.mainpage - Main page of the wiki.
	 * @param {String} siteinfo.centralidlookupprovider - Central auth of the wiki.
	 * @param {String} siteinfo.logo - Logo of the wiki.
	 * @param {String} [siteinfo.gamepedia] - If the wiki is a Gamepedia wiki.
	 * @returns {Wiki}
	 */
	updateWiki({servername, scriptpath, articlepath, mainpage, centralidlookupprovider, logo, gamepedia = 'false'}) {
		this.hostname = servername;
		this.pathname = scriptpath + '/';
		this.articlepath = articlepath;
		this.mainpage = mainpage;
		this.centralauth = centralidlookupprovider;
		this.miraheze = /^(?:https?:)?\/\/static\.miraheze\.org\//.test(logo);
		this.gamepedia = ( gamepedia === 'true' ? true : this.hostname.endsWith( '.gamepedia.com' ) );
		this.wikimedia = wikimediaSites.includes( this.hostname.split('.').slice(-2).join('.') );
		this.oauth2 = Wiki.oauthSites.includes( this.href );
		this.spaceReplacement = ( urlSpaceReplacement.hasOwnProperty(this.href) ? urlSpaceReplacement[this.href] : this.spaceReplacement );
		return this;
	}

	/**
	 * Check for a Fandom wiki.
	 * @param {Boolean} [includeGP] - If Gamepedia wikis are included.
	 * @returns {Boolean}
	 */
	isFandom(includeGP = true) {
		return ( this.hostname.endsWith( '.fandom.com' ) || this.hostname.endsWith( '.wikia.org' )
		|| ( includeGP && this.isGamepedia() ) );
	}

	/**
	 * Check for a Gamepedia wiki.
	 * @returns {Boolean}
	 */
	isGamepedia() {
		return this.gamepedia;
	}

	/**
	 * Check for a Miraheze wiki.
	 * @returns {Boolean}
	 */
	isMiraheze() {
		return this.miraheze;
	}

	/**
	 * Check for a WikiMedia wiki.
	 * @returns {Boolean}
	 */
	isWikimedia() {
		return this.wikimedia;
	}

	/**
	 * Check for CentralAuth.
	 * @returns {Boolean}
	 */
	hasCentralAuth() {
		return this.centralauth === 'CentralAuth';
	}

	/**
	 * Check for OAuth2.
	 * @returns {Boolean}
	 */
	hasOAuth2() {
		return ( this.isWikimedia() || this.isMiraheze() || this.oauth2 );
	}

	/**
	 * Check if a wiki is missing.
	 * @param {String} [message] - Error message or response url.
	 * @param {Number} [statusCode] - Status code of the response.
	 * @returns {Boolean}
	 */
	noWiki(message = '', statusCode = 0) {
		if ( statusCode === 410 || statusCode === 404 ) return true;
		if ( !this.isFandom() ) return false;
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
		if ( !querystring.toString().length ) title = ( title || this.mainpage );
		title = title.replace( / /g, this.spaceReplacement ).replace( /%/g, '%2525' );
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
		let output = decodeURI( link ).replace( /\\/g, '%5C' ).replace( /@(here|everyone)/g, '%40$1' ) + Wiki.toSection(fragment, true, this.spaceReplacement);
		if ( isMarkdown ) return output.replace( /\(/g, '%28' ).replace( /\)/g, '%29' );
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
		return title.replace( / /g, spaceReplacement ).replace( /[?&%\\]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replace( /@(here|everyone)/g, '%40$1' ).replace( /[()]/g, '\\$&' );
	};

	/**
	 * Encode a link section.
	 * @param {String} [fragment] - Fragment of the page.
	 * @param {Boolean} [simpleEncoding] - Don't fully encode the anchor.
	 * @param {String} [spaceReplacement] - The url replacement for spaces.
	 * @returns {String}
	 * @static
	 */
	static toSection(fragment = '', simpleEncoding = true, spaceReplacement = '_') {
		if ( !fragment ) return '';
		fragment = fragment.replace( / /g, spaceReplacement );
		if ( simpleEncoding && !/['"`^{}<>|\\]|@(everyone|here)/.test(fragment) ) return '#' + fragment;
		return '#' + encodeURIComponent( fragment ).replace( /[!'()*~]/g, (match) => {
			return '%' + match.charCodeAt().toString(16).toUpperCase();
		} ).replace( /%3A/g, ':' ).replace( /%/g, '.' );
	}

	/**
	 * Turn user input into a wiki.
	 * @param {String} input - The user input referring to a wiki.
	 * @returns {Wiki}
	 * @static
	 */
	static fromInput(input = '') {
		if ( input instanceof URL ) return new Wiki(input);
		input = input.replace( /^(?:https?:)?\/\//, 'https://' );
		var regex = input.match( /^(?:https:\/\/)?([a-z\d-]{1,50}\.(?:gamepedia\.com|(?:fandom\.com|wikia\.org)(?:(?!\/(?:wiki|api)\/)\/[a-z-]{2,12})?))(?:\/|$)/ );
		if ( regex ) return new Wiki('https://' + regex[1] + '/');
		if ( input.startsWith( 'https://' ) ) {
			let project = wikiProjects.find( project => input.split('/')[2].endsWith( project.name ) );
			if ( project ) {
				regex = input.match( new RegExp( project.regex + `(?:${project.articlePath}|${project.scriptPath}|/?$)` ) );
				if ( regex ) return new Wiki('https://' + regex[1] + project.scriptPath);
			}
			let wiki = input.replace( /\/(?:index|api|load|rest)\.php(?:|[\?\/#].*)$/, '/' );
			if ( !wiki.endsWith( '/' ) ) wiki += '/';
			return new Wiki(wiki);
		}
		let project = wikiProjects.find( project => input.split('/')[0].endsWith( project.name ) );
		if ( project ) {
			regex = input.match( new RegExp( project.regex + `(?:${project.articlePath}|${project.scriptPath}|/?$)` ) );
			if ( regex ) return new Wiki('https://' + regex[1] + project.scriptPath);
		}
		if ( /^(?:[a-z-]{2,12}\.)?[a-z\d-]{1,50}$/.test(input) ) {
			if ( !input.includes( '.' ) ) return new Wiki('https://' + input + '.fandom.com/');
			else return new Wiki('https://' + input.split('.')[1] + '.fandom.com/' + input.split('.')[0] + '/');
		}
		return null;
	}

	/** @type {String[]} - Sites that support verification using OAuth2. */
	static oauthSites = [];

	[inspect.custom](depth, opts) {
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
			spaceReplacement: this.spaceReplacement,
			mainpage: this.mainpage
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
			var mainpage = link.replace( '$1', Wiki.toTitle(( this.mainpage || 'Main Page' ), this.spaceReplacement) );
			return 'articleURL { ' + inspect(link, opts) + ' => ' + inspect(mainpage, opts) + ' }';
		}
		return super[inspect.custom](depth, opts);
	}
}

export const toTitle = Wiki.toTitle;
export const toSection = Wiki.toSection;
export const fromInput = Wiki.fromInput;
export const oauthSites = Wiki.oauthSites;
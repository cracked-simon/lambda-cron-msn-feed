const cheerio = require('cheerio');

/**
 * MSN Feed Converter Utility
 * Converts normalized posts to MSN-compliant XML format
 */
class MSNConverter {
    /**
     * Format a Date as an RFC 2822 string in the given IANA timezone
     * @param {Date} date - Date to format
     * @param {string} timezone - IANA timezone (e.g. 'America/New_York')
     * @returns {string} RFC 2822 formatted date string
     */
    /**
     * Format a date string that is already in the target timezone as RFC 2822 with the offset.
     * Does not re-interpret through UTC — treats the date/time values as-is.
     * @param {string|Date} dateStr - Date string (e.g. "2026-04-13T09:00:00") already in the target timezone
     * @param {string} timezone - IANA timezone for the offset
     * @returns {string} RFC 2822 formatted date string
     */
    static formatLocalDateWithOffset(dateStr, timezone) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const d = new Date(dateStr);
        const offset = this.getTimezoneOffset(timezone, d);

        const year = d.getFullYear();
        const month = d.getMonth();
        const day = String(d.getDate()).padStart(2, '0');
        const dayName = days[d.getDay()];
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        const second = String(d.getSeconds()).padStart(2, '0');

        return `${dayName}, ${day} ${months[month]} ${year} ${hour}:${minute}:${second} ${offset}`;
    }

    /**
     * Get the UTC offset string (e.g. "-0400") for an IANA timezone at a given date
     */
    static getTimezoneOffset(timezone, date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'shortOffset'
        }).formatToParts(date);

        const tzName = (parts.find(p => p.type === 'timeZoneName')?.value) || '';
        const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
        if (!match) return '+0000';

        const sign = match[1];
        const hrs = match[2].padStart(2, '0');
        const mins = (match[3] || '00').padStart(2, '0');
        return `${sign}${hrs}${mins}`;
    }

    /**
     * Format a Date as an RFC 2822 string in the given IANA timezone
     */
    static formatDateInTimezone(date, timezone) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            weekday: 'short', hour12: false
        }).formatToParts(date);

        const get = (type) => parts.find(p => p.type === type)?.value;

        const day = get('day');
        const monthIdx = parseInt(get('month'), 10) - 1;
        const year = get('year');
        const hour = get('hour') === '24' ? '00' : get('hour');
        const minute = get('minute');
        const second = get('second');
        const offset = this.getTimezoneOffset(timezone, date);

        return `${get('weekday')}, ${day} ${months[monthIdx]} ${year} ${hour}:${minute}:${second} ${offset}`;
    }

    /**
     * Convert normalized posts to MSN-compliant XML format
     * @param {string} baseUrl - Base URL of the source site
     * @param {Array<Object>} posts - Array of normalized posts
     * @param {Object} config - Configuration for feed metadata
     * @returns {string} MSN-compliant XML
     */
    static convertToMSN(baseUrl, posts, config = {}) {
        const siteName = config.siteName || 'Content Feed';
        const siteDescription = config.siteDescription || 'Content converted to MSN format';
        const language = config.language || 'en-us';
        const copyright = config.copyright || '';
        const timezone = config.timezone || 'America/Los_Angeles';
        
        const pubDate = this.formatDateInTimezone(new Date(), timezone);
        
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom"
    xmlns:media="http://search.yahoo.com/mrss/"
    xmlns:mi="http://schemas.ingestion.microsoft.com/common/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:dcterms="http://purl.org/dc/terms/"
    version="2.0">

    <channel>
        <title>${siteName}</title>
        <link>${baseUrl}</link>
        <description><![CDATA[${siteDescription}]]></description>
        <language>${language}</language>
        <pubDate>${pubDate}</pubDate>
        ${copyright ? `<copyright>${copyright}</copyright>` : ''}
        
        ${posts.map(post => this.generatePostXML(post, timezone)).join('\n        ')}
    </channel>

</rss>`;
        
        return xml;
    }
    
    /**
     * Generate XML for a single post
     * @param {Object} post - Normalized post object
     * @returns {string} Post XML
     */
    static generatePostXML(post, timezone = 'America/Los_Angeles') {
        const pubDate = this.formatLocalDateWithOffset(post.pubDate, timezone);
        const isSlideShow = post.isSlideShow || false;

        let thumbnail = post.featuredImage;
        if (typeof post.featuredImage == 'object' && typeof post.thumbnail == 'object') {
            thumbnail = post.featuredImage.url || post.thumbnail.url;
        }

        // console.log(post.guid, thumbnail);
        
        let msnPost = `<item>
            <guid>${post.guid || post.link}</guid>
            
            <title><![CDATA[${post.title}]]></title>

            ${post.shortTitle ? `<mi:shortTitle><![CDATA[${post.shortTitle}]]></mi:shortTitle>` : ''}

            <pubDate>${pubDate}</pubDate>
            <link>${post.link}</link>
            
            ${post.categories.map(cat => `<category><![CDATA[${cat}]]></category>`).join('\n            ')}

            ${post.author ? `<dc:creator>${post.author}</dc:creator>` : ''}

            ${isSlideShow ? `<description><![CDATA[${this.cleanDescription(post.description)}]]></description>` : `<description><![CDATA[${this.cleanDescription(post.description)}]]></description>`}

            <media:content url="${this.escapeXmlUrl(thumbnail)}" type="image/jpeg" medium="image">
                <media:text><![CDATA[${post.title}]]></media:text>
            </media:content>`;

        if (!isSlideShow && post.content) {
            msnPost += `<content:encoded><![CDATA[
                <figure>
                    <img src="${thumbnail}" alt="${post.title}" />
                </figure>
                
                ${this.cleanHtml(post.content)}
            ]]></content:encoded>`;
        }

        if (isSlideShow && post.images) {
            msnPost += '<media:group>';

            msnPost += `<media:content url="${this.escapeXmlUrl(thumbnail)}" type="image/jpeg" medium="image">
                <media:title><![CDATA[${post.title}]]></media:title>
                ${post.description ? `<media:text><![CDATA[${post.description}]]></media:text>
                <media:description><![CDATA[${post.description}]]></media:description>` : ''}
            </media:content>`;

            post.images.map((image, index) => {
                msnPost += `<media:content url="${this.escapeXmlUrl(image.url)}" type="image/jpeg" medium="image">
                                <media:title><![CDATA[${image.title || post.title}]]></media:title>
                                ${image.text ? `<media:description><![CDATA[${image.text}]]></media:description>` : ''}
                                ${image.description ? `<media:text><![CDATA[${image.description}]]></media:text>` : ''}
                                ${image.attribution || image.caption ? `<media:credit><![CDATA[${(image.attribution || '') + ' ' + (image.caption || '')}]]></media:credit>` : '<media:credit><![CDATA[Image Provided by Source]]></media:credit>'}
                            </media:content>
                `;
            })

            msnPost += '</media:group>';
        }

        msnPost += '</item>';

        return msnPost;
    }
    
    /**
     * Escape ampersands in URLs for XML attributes
     * @param {string} url - URL to escape
     * @returns {string} XML-safe URL
     */
    static escapeXmlUrl(url) {
        if (!url) return '';
        return url.replace(/&/g, '&amp;');
    }
    
    /**
     * Clean HTML content by removing anchor tags and HTML wrapper tags
     * @param {string} html - HTML content to clean
     * @returns {string} Cleaned HTML
     */
    static cleanHtml(html) {
        if (!html) return '';
        html = html.replace(/<\/?html>/g, '')
                    .replace(/<\/?head>/g, '')
                    .replace(/<\/?body>/g, '');
        
        return html;
    }
    
    /**
     * Clean description by removing anchor tags and HTML wrapper tags
     * @param {string} description - Description to clean
     * @returns {string} Cleaned description
     */
    static cleanDescription(description) {
        if (!description) return '';
        description = this.stripTags(description);
        return description;
    }
    
    /**
     * Strip all HTML tags from text, leaving only plain text
     * @param {string} html - HTML content to strip tags from
     * @returns {string} Plain text without HTML tags
     */
    static stripTags(html) {
        if (!html) return '';
        
        const $ = cheerio.load(html);
        return $.text();
    }
    
}

module.exports = MSNConverter;

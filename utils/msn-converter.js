const cheerio = require('cheerio');

/**
 * MSN Feed Converter Utility
 * Converts normalized posts to MSN-compliant XML format
 */
class MSNConverter {
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
        
        const pubDate = new Date().toUTCString().replace('GMT', '+0000');
        
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
        
        ${posts.map(post => this.generatePostXML(post)).join('\n        ')}
    </channel>

</rss>`;
        
        return xml;
    }
    
    /**
     * Generate XML for a single post
     * @param {Object} post - Normalized post object
     * @returns {string} Post XML
     */
    static generatePostXML(post) {
        const pubDate = new Date(post.pubDate).toUTCString().replace('GMT', '+0000');
        const isSlideShow = post.isSlideShow || false;
        
        return `<item>
            <guid>${post.guid || post.link}</guid>
            
            <title><![CDATA[${post.title}]]></title>

            ${post.shortTitle ? `<mi:shortTitle><![CDATA[${post.shortTitle}]]></mi:shortTitle>` : ''}

            <pubDate>${pubDate}</pubDate>
            <link>${post.link}</link>
            
            ${post.categories.map(cat => `<category><![CDATA[${cat}]]></category>`).join('\n            ')}

            ${post.author ? `<dc:creator>${post.author}</dc:creator>` : ''}

            ${isSlideShow ? `<description><![CDATA[${this.cleanDescription(post.description)}]]></description>` : `<description><![CDATA[${this.cleanDescription(post.description)}]]></description>`}

            ${post.thumbnail ? `<media:content url="${post.thumbnail.url}" type="image/jpeg" medium="image">
                <media:text><![CDATA[${post.thumbnail.alt || post.title}]]></media:text>
                ${post.thumbnail.attribution ? `<media:description><![CDATA[${this.stripTags(post.thumbnail.attribution)}]]></media:description>` : ''}
            </media:content>` : ''}

            ${!isSlideShow && post.content ? `<content:encoded><![CDATA[
                ${post.featuredImage ? `<figure>
                    <img src="${post.featuredImage.url}" alt="${post.featuredImage.alt || post.title}" />
                    ${post.featuredImage.attribution ? `<figcaption>${post.featuredImage.attribution}</figcaption>` : ''}
                </figure>` : ''}
                
                ${this.cleanHtml(post.content)}
            ]]></content:encoded>` : ''}

            ${isSlideShow && post.images ? `<media:group>
                ${post.images.map((image, index) => `<media:content url="${image.url}" type="image/jpeg" medium="image">
                    <media:title><![CDATA[${image.title || post.title}]]></media:title>
                    ${image.text ? `<media:text><![CDATA[${image.text}]]></media:text>` : ''}
                    ${image.description ? `<media:description><![CDATA[${image.description}]]></media:description>` : ''}
                    ${image.attribution || image.caption ? `<media:credit><![CDATA[${(image.attribution || '') + ' ' + (image.caption || '')}]]></media:credit>` : '<media:credit><![CDATA[Image Provided by Source]]></media:credit>'}
                </media:content>`).join('\n                ')}
            </media:group>` : ''}
        </item>`;
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

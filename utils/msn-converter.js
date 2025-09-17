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
        <title>${this.escapeXml(siteName)}</title>
        <link>${this.escapeXml(baseUrl)}</link>
        <description><![CDATA[${this.escapeXml(siteDescription)}]]></description>
        <language>${language}</language>
        <pubDate>${pubDate}</pubDate>
        ${copyright ? `<copyright>${this.escapeXml(copyright)}</copyright>` : ''}
        
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
            <guid>${this.escapeXml(post.guid || post.link)}</guid>
            
            <title><![CDATA[${this.escapeXml(post.title)}]]></title>

            ${post.shortTitle ? `<mi:shortTitle><![CDATA[${this.escapeXml(post.shortTitle)}]]></mi:shortTitle>` : ''}

            <pubDate>${pubDate}</pubDate>
            <link>${this.escapeXml(post.link)}</link>
            
            ${post.categories.map(cat => `<category><![CDATA[${this.escapeXml(cat)}]]></category>`).join('\n            ')}

            ${post.author ? `<dc:creator>${this.escapeXml(post.author)}</dc:creator>` : ''}

            ${isSlideShow ? `<description><![CDATA[${this.escapeXml(post.description)}]]></description>` : `<description><![CDATA[${this.escapeXml(this.cleanDescription(post.description))}]]></description>`}

            ${post.thumbnail ? `<media:content url="${this.escapeXml(post.thumbnail.url)}" type="image/jpeg" medium="image">
                <media:text>${this.escapeXml(post.thumbnail.alt || post.title)}</media:text>
                ${post.thumbnail.attribution ? `<media:description><![CDATA[${this.escapeXml(post.thumbnail.attribution)}]]></media:description>` : ''}
            </media:content>` : ''}

            ${!isSlideShow && post.content ? `<content:encoded><![CDATA[
                ${post.featuredImage ? `<figure>
                    <img src="${this.escapeXml(post.featuredImage.url)}" alt="${this.escapeXml(post.featuredImage.alt || post.title)}" />
                    ${post.featuredImage.attribution ? `<figcaption>${this.escapeXml(post.featuredImage.attribution)}</figcaption>` : ''}
                </figure>` : ''}
                
                ${this.cleanHtml(post.content)}
                
                <p>Like our content? <a href="https://www.msn.com/en-us/community/channel/vid-xiu7j8fdjetbkdk4dam6ikuw95mwdk6m8yi5h7v5cgwy9cbbduks">Follow us</a> for more</p>
            ]]></content:encoded>` : ''}

            ${isSlideShow && post.images ? `<media:group>
                ${post.images.map((image, index) => `<media:content url="${this.escapeXml(image.url)}" type="image/jpeg" medium="image">
                    <media:title><![CDATA[${this.escapeXml(image.title || post.title)}]]></media:title>
                    ${image.text ? `<media:text><![CDATA[${this.escapeXml(image.text)}]]></media:text>` : ''}
                    ${image.description ? `<media:description><![CDATA[${this.escapeXml(image.description)}]]></media:description>` : ''}
                    ${image.attribution || image.caption ? `<media:credit>${this.escapeXml((image.attribution || '') + ' ' + (image.caption || ''))}</media:credit>` : '<media:credit>Image Provided by Source</media:credit>'}
                </media:content>`).join('\n                ')}
            </media:group>` : ''}
        </item>`;
    }
    
    /**
     * Clean HTML content by removing anchor tags
     * @param {string} html - HTML content to clean
     * @returns {string} Cleaned HTML
     */
    static cleanHtml(html) {
        if (!html) return '';
        // Remove anchor tags as shown in the template
        return html.replace(/<\/?a[^>]*>/gi, '');
    }
    
    /**
     * Clean description by removing anchor tags
     * @param {string} description - Description to clean
     * @returns {string} Cleaned description
     */
    static cleanDescription(description) {
        if (!description) return '';
        // Remove anchor tags from description
        return description.replace(/<\/?a[^>]*>/gi, '');
    }
    
    /**
     * Escape XML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    static escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

module.exports = MSNConverter;

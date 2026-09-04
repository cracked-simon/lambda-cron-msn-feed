const MSNConverter = require('./msn-converter');

/**
 * Yahoo Feed Converter Utility
 * Converts normalized posts to Yahoo RSS format.
 * Slideshows are rendered as article HTML (content:encoded), not media:group.
 */
class YahooConverter {
    /**
     * Derive the Yahoo filename by appending -yahoo before the extension.
     * e.g. denofgeeks-articles.xml → denofgeeks-articles-yahoo.xml
     * @param {string} fileName - Original feed file name
     * @returns {string} Yahoo feed file name
     */
    static toYahooFileName(fileName) {
        if (!fileName) return 'feed-yahoo.xml';
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot === -1) {
            return `${fileName}-yahoo`;
        }
        return `${fileName.slice(0, lastDot)}-yahoo${fileName.slice(lastDot)}`;
    }

    /**
     * Combined Yahoo feed filename for a source.
     * e.g. denofgeeks → denofgeeks-articles-slideshows-combined-yahoo.xml
     * @param {string} source - Feed source identifier
     * @returns {string} Combined Yahoo feed file name
     */
    static toCombinedYahooFileName(source) {
        const prefix = source || 'feed';
        return `${prefix}-articles-slideshows-combined-yahoo.xml`;
    }

    /**
     * Convert normalized posts to Yahoo RSS XML format
     * @param {string} baseUrl - Base URL of the source site
     * @param {Array<Object>} posts - Array of normalized posts
     * @param {Object} config - Configuration for feed metadata
     * @returns {string} Yahoo RSS XML
     */
    static convertToYahoo(baseUrl, posts, config = {}) {
        const siteName = config.siteName || 'Content Feed';
        const siteDescription = config.siteDescription || 'Content converted to Yahoo format';
        const language = config.language || 'en-us';
        const copyright = config.copyright || '';
        const timezone = config.timezone || 'America/Los_Angeles';

        const pubDate = MSNConverter.formatDateInTimezone(new Date(), timezone);

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
     * Generate XML for a single post in Yahoo article format
     * @param {Object} post - Normalized post object
     * @param {string} timezone - IANA timezone
     * @returns {string} Post XML
     */
    static generatePostXML(post, timezone = 'America/Los_Angeles') {
        const pubDate = MSNConverter.formatLocalDateWithOffset(post.pubDate, timezone);
        const isSlideShow = post.isSlideShow || false;
        const thumbnail = this.resolveThumbnail(post);
        const categories = Array.isArray(post.categories) ? post.categories : [];

        let encodedContent;
        if (isSlideShow) {
            encodedContent = this.generateSlideshowArticleHtml(post, thumbnail);
        } else {
            encodedContent = this.generateArticleHtml(post, thumbnail);
        }

        return `<item>
            <guid>${post.guid || post.link}</guid>
            <title><![CDATA[${post.title}]]></title>
            <pubDate>${pubDate}</pubDate>
            <link>${post.link}</link>
            ${categories.map(cat => `<category><![CDATA[${cat}]]></category>`).join('\n            ')}

            <description><![CDATA[${MSNConverter.cleanDescription(post.description)}]]></description>

            ${post.author ? `<dc:creator>${post.author}</dc:creator>` : ''}

            <media:thumbnail url="${MSNConverter.escapeXmlUrl(thumbnail)}" width="1600" height="900" />

            <content:encoded><![CDATA[
                ${encodedContent}
            ]]></content:encoded>
        </item>`;
    }

    /**
     * Resolve a thumbnail URL from featuredImage / thumbnail fields
     * @param {Object} post - Normalized post object
     * @returns {string} Thumbnail URL
     */
    static resolveThumbnail(post) {
        let thumbnail = post.featuredImage;
        if (typeof post.featuredImage === 'object' && post.featuredImage) {
            thumbnail = post.featuredImage.url || (post.thumbnail && post.thumbnail.url) || '';
        }
        return thumbnail || '';
    }

    /**
     * Article body: featured image + HTML content
     * @param {Object} post - Normalized post object
     * @param {string} thumbnail - Featured image URL
     * @returns {string} HTML for content:encoded
     */
    static generateArticleHtml(post, thumbnail) {
        const parts = [];

        if (thumbnail) {
            parts.push(this.featuredImageFigure(thumbnail, post.title));
        }

        if (post.content) {
            parts.push(MSNConverter.cleanHtml(post.content));
        }

        return parts.join('\n                ');
    }

    /**
     * Slideshow rendered as article HTML: featured image, intro, then numbered slides
     * @param {Object} post - Normalized post object
     * @param {string} thumbnail - Featured image URL
     * @returns {string} HTML for content:encoded
     */
    static generateSlideshowArticleHtml(post, thumbnail) {
        const parts = [];

        if (thumbnail) {
            parts.push(this.featuredImageFigure(thumbnail, post.title));
        }

        if (post.content) {
            parts.push(MSNConverter.cleanHtml(post.content));
        }

        const images = Array.isArray(post.images) ? post.images : [];
        images.forEach((image, index) => {
            const alt = image.description && image.description !== 'Image Provided by Source'
                ? image.description
                : post.title;
            const title = image.title || post.title;

            let figureInner = `<img src="${image.url}" alt="${this.escapeHtmlAttr(alt)}" />`;

            if (image.attribution) {
                figureInner += `
                        <figure>
                            <figcaption>${image.attribution}</figcaption>
                        </figure>`;
            }

            if (image.caption) {
                figureInner += `
                        <figcaption>${image.caption}</figcaption>`;
            }

            parts.push(`<h2>${index + 1}. ${title}</h2>
                    <figure>
                        ${figureInner}
                    </figure>`);

            const text = MSNConverter.stripTags(image.text);
            if (text) {
                parts.push(`<p>
                    ${text}
                    </p>`);
            }
        });

        return parts.join('\n                ');
    }

    /**
     * Featured image wrapped in a figure
     * @param {string} url - Image URL
     * @param {string} alt - Alt text
     * @returns {string} Figure HTML
     */
    static featuredImageFigure(url, alt) {
        return `<figure>
                    <img src="${url}" alt="${this.escapeHtmlAttr(alt)}" />
                </figure>`;
    }

    /**
     * Escape characters that would break an HTML attribute
     * @param {string} str - Raw attribute value
     * @returns {string} Escaped value
     */
    static escapeHtmlAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }
}

module.exports = YahooConverter;

const cheerio = require('cheerio');
const { safeLog } = require('../utils/sensitive-data');

class WordPressDriver {
    constructor() {
        this.name = 'WordPress';
        this.supportedFormats = ['rest-api'];
        this.postsPerPage = 20; // Hard-coded for now
    }    

    // -------- Fetch from DB methods

    /**
     * Fetch full content for a specific WordPress post from database
     * @param {string} contentHash - Content hash for the item
     * @param {Object} config - Configuration object
     * @param {Object} db - Database manager instance
     * @returns {Promise<Object>} Full content object
     */
    async fetchContent(contentHash, config, db) {
        try {
            safeLog(console.log, `Fetching content from database for hash: ${contentHash}`);
            
            // Get item from database
            const dbItem = await db.getItemByHash(contentHash, config.EXTERNAL_FEED_SOURCE);
            if (!dbItem) {
                throw new Error(`Content not found in database: ${contentHash}`);
            }
            
            // Return the stored full content
            if (dbItem.full_content) {
                // MySQL2 automatically parses JSON fields, so no need to JSON.parse
                return dbItem.full_content;
            }
            
            throw new Error(`No full content stored for hash: ${contentHash}`);
            
        } catch (error) {
            console.error('Error fetching WordPress content from database:', error);
            throw new Error(`WordPress content fetch failed: ${error.message}`);
        }
    }    

    /**
     * Normalize WordPress post for feed generation
     * @param {Object} post - Raw WordPress post
     * @param {string} feedType - Feed type (article/slideshow)
     * @returns {Object} Normalized post object
     */
    normalizePost(post, feedType = '') {
        const parsedContent = this.parseContent(post.content, feedType);
        
        return {
            title: post.title,
            shortTitle: post.title, // Can be customized if needed
            description: post.excerpt,
            content: parsedContent.content,
            link: post.link,
            guid: post.guid,
            pubDate: post.date,
            author: post.author,
            categories: post.categories,
            isSlideShow: parsedContent.isSlideShow,
            thumbnail: this.thumbnail,
            featuredImage: this.thumbnail,
            images: parsedContent.images
        };
    }

    /**
     * Parse WordPress content based on explicit feed type
     * @param {string} content - Raw HTML content
     * @param {string} feedType - The EXTERNAL_FEED_TYPE ("slideshow" or "article")
     * @returns {Object} Parsed content with type and structured data
     */
    parseContent(content, feedType = '') {
        if (!content) {
            return {
                content: '',
                isSlideShow: false,
                images: []
            };
        }
        
        // Determine content type based on explicit feed type
        const isSlideShow = feedType.toLowerCase() === 'slideshow';
        
        if (isSlideShow) {
            // Parse as slideshow
            return this.parseSlideShow(content);
        } else {
            // Parse as article - keep HTML as is
            return {
                content: content,
                isSlideShow: false,
                images: []
            };
        }
    }    

    /**
     * Parse slideshow content from WordPress using Cheerio
     * @param {string} content - Raw HTML content
     * @returns {Object} Parsed slideshow data
     */
    parseSlideShow(content) {
        const $ = cheerio.load(content);
        
        // Remove sidebar elements
        $('.entry__sidebar').remove();
        
        // Remove all div tags but keep their content
        $('div').contents().unwrap();
        
        const images = [];
        let slideIndex = 1;
        
        // Find all slide structures: figure followed by h2
        $('figure.wp-block-image').each((index, figureElement) => {
            const $figure = $(figureElement);
            const $img = $figure.find('img');
            
            if ($img.length === 0) return; // Skip if no image found
            
            const imageUrl = $img.attr('src') || $img.attr('data-src') || null;
            const altText = $img.attr('alt') || '';
            
            if (!imageUrl) return; // Skip if no image URL

            const attribution = $figure.find('.wp-element-caption').text() || '';
            
            // Find the next h2 element after this figure
            const $nextH2 = $figure.nextAll('h2.wp-block-heading').first();
            const title = $nextH2.text().trim();
            
            // Find content between this h2 and the next slide or end
            let slideContent = '';
            let $current = $nextH2.next();
            
            while ($current.length > 0) {
                // Stop if we hit another slide
                if ($current.is('figure.wp-block-image')) {
                    break;
                }
                
                slideContent += $current.prop('outerHTML') || $current.text();
                $current = $current.next();
            }
            
            images.push({
                url: imageUrl,
                title: title,
                text: slideContent,
                description: altText || 'Image Provided by Source',
                attribution: attribution
            });
            
            slideIndex++;
        });
        
        // Find intro content (everything before first slide)
        const $firstSlide = $('figure.wp-block-image.size-large').first();
        let introContent = '';
        
        if ($firstSlide.length > 0) {
            // Get all content before the first slide
            $firstSlide.prevAll().each((index, element) => {
                introContent = $(element).prop('outerHTML') + introContent;
            });
        } else {
            // If no slides found, use all content
            introContent = $.html();
        }
        
        return {
            content: this.stripHtml(introContent),
            isSlideShow: true,
            images: images
        };
    }    
        

    // -------- Ingesting methods (from WP API)

    /**
     * Ingest WordPress posts with pagination support
     * @param {Object} config - Configuration object
     * @param {Object} db - Database manager instance
     * @returns {Promise<Object>} Object with ingested count and new count
     */
    async ingest(config, db) {
        try {
            safeLog(console.log, `Ingesting WordPress posts from: ${config.EXTERNAL_FEED_URL}`);
            
            // Check if this is a new source
            const isNewSource = await db.isNewSource(config);
            console.log(`Source status: ${isNewSource ? 'NEW' : 'EXISTING'}`);
            
            let totalIngested = 0;
            let totalNew = 0;
            let currentPage = 1;
            let totalPages = 1;
            
            do {
                console.log(`Fetching page ${currentPage} of ${totalPages}...`);
                
                // Fetch posts for current page
                const { posts, headers } = await this.fetchPosts(config.EXTERNAL_FEED_URL, config, currentPage);
                
                // Update total pages from headers
                if (headers['x-wp-totalpages']) {
                    totalPages = parseInt(headers['x-wp-totalpages']);
                    console.log(`Total pages available: ${totalPages} (total posts: ${headers['x-wp-total'] || 'unknown'})`);
                }
                
                // Process and insert posts directly to database
                for (const post of posts) {
                    // Clean the post content during ingestion
                    const cleanedPost = this.cleanPostContent(post);
                    
                    const item = {
                        guid: cleanedPost.id,
                        content_hash: this.generateHash(cleanedPost.id),
                        item_published_at: post.date_gmt + 'Z',
                        item_modified_at: post.modified_gmt + 'Z',
                        metadata: {
                            id: cleanedPost.id,
                            title: cleanedPost.title,
                            date: post.date,
                            modified: post.modified,
                            link: post.link,
                            author: post.author
                        },
                        // WordPress provides full content in listing, so store it (cleaned)
                        full_content: cleanedPost
                    };
                    
                    const wasInserted = await db.insertItemDirect(item, config);
                    if (wasInserted) {
                        totalNew++;
                    }
                    totalIngested++;
                }
                
                console.log(`Page ${currentPage}: ${posts.length} posts processed, ${totalNew} new items so far`);
                
                currentPage++;
                
                // For existing sources, only process first page
                // if (!isNewSource && currentPage > 1) {
                //     console.log('Existing source - stopping after first page');
                //     break;
                // }
                
            } while (currentPage <= totalPages);
            
            console.log(`✅ Ingestion complete: ${totalIngested} total, ${totalNew} new items`);
            return {
                totalIngested,
                totalNew,
                pagesProcessed: currentPage - 1
            };
            
        } catch (error) {
            console.error('Error ingesting WordPress posts:', error);
            throw new Error(`WordPress ingestion failed: ${error.message}`);
        }
    }    

    /**
     * Fetch posts from WordPress REST API for a specific page
     * @param {string} baseUrl - Base URL of the WordPress site
     * @param {Object} config - Configuration object with API settings
     * @param {number} page - Page number to fetch
     * @returns {Promise<Object>} Object with posts array and headers
     */
    async fetchPosts(baseUrl, config, page = 1) {
        try {
            const filterParam = config.WP_API_POSTS_FILTER || '';
            const filterValue = config.WP_API_POSTS_FILTER_VALUE || '';
            
            // Build the API URL with pagination
            let queryParams = {
                // 'include': '985880', // debug single post
                'per_page': this.postsPerPage,
                'page': page
            }

            // Add filter parameters only if they are provided
            if (filterParam && filterValue) {
                queryParams[filterParam] = filterValue;
            }            

            let apiUrl = [];
            for (const [key, value] of Object.entries(queryParams)) {
                apiUrl.push(`${key}=${encodeURIComponent(value)}`);
            }
            apiUrl = `${baseUrl}/wp-json/wp/v2/posts?${apiUrl.join('&')}`;
            
            safeLog(console.log, `Fetching WordPress posts from: ${apiUrl}`);
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (config.WP_API_TOKEN) {
                headers['Authorization'] = `Bearer ${config.WP_API_TOKEN}`;
            }
            
            const response = await fetch(apiUrl, { headers });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const posts = await response.json();
            
            // Extract pagination headers
            const responseHeaders = {};
            if (response.headers.get('x-wp-total')) {
                responseHeaders['x-wp-total'] = response.headers.get('x-wp-total');
            }
            if (response.headers.get('x-wp-totalpages')) {
                responseHeaders['x-wp-totalpages'] = response.headers.get('x-wp-totalpages');
            }
            
            console.log(`Fetched ${posts.length} posts from page ${page}`);
            
            return {
                posts: posts,
                headers: responseHeaders
            };
            
        } catch (error) {
            console.error('Error fetching WordPress posts:', error);
            throw new Error(`WordPress API request failed: ${error.message}`);
        }
    }    


    // -------- Convenient methods

    /**
     * Strip HTML tags from text using Cheerio
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHtml(html) {
        if (!html) return '';
        const $ = cheerio.load(html);
        return $.text().replace(/\s+/g, ' ').trim();
    }

    /**
     * Decode HTML entities in text
     * @param {string} text - Text with HTML entities
     * @returns {string} Decoded text
     */
    decodeHtmlEntities(text) {
        if (!text) return text;
        
        const $ = cheerio.load(text);
        return $.text();
    }    

    /**
     * Clean post content during ingestion - remove script tags and ad-dog divs
     * @param {Object} post - Raw WordPress post
     * @returns {Object} Cleaned post object
     */
    cleanPostContent(post) {
        // Create a deep copy of the post to avoid modifying the original
        const cleanedPost = JSON.parse(JSON.stringify(post));
        let finalCleanedPost = {
            'id': cleanedPost.id,
            'date': cleanedPost.date,
            'date_gmt': cleanedPost.date_gmt,
            'modified': cleanedPost.modified,
            'modified_gmt': cleanedPost.modified_gmt,
            'guid': cleanedPost.guid.rendered,
            'slug': cleanedPost.slug,
            'link': cleanedPost.link,
            'title': this.decodeHtmlEntities(cleanedPost.title.rendered),
            'author': cleanedPost.yoast_head_json.author,
            'categories': cleanedPost.yoast_head_json.schema['@graph'][0]['articleSection'],
            'thumbnail': cleanedPost.yoast_head_json.schema['@graph'][0]['thumbnailUrl']
        };
        
        // Clean the content.rendered field if it exists
        if (cleanedPost.content && cleanedPost.content.rendered) {
            finalCleanedPost.content = this.cleanHtmlContent(cleanedPost.content.rendered);
        }
        
        // Clean the excerpt.rendered field if it exists
        if (cleanedPost.excerpt && cleanedPost.excerpt.rendered) {
            finalCleanedPost.excerpt = this.cleanHtmlContent(cleanedPost.excerpt.rendered);
        }
        
        return finalCleanedPost;
    }    

    /**
     * Clean HTML content by removing script tags and ad-dog divs
     * @param {string} htmlContent - Raw HTML content
     * @returns {string} Cleaned HTML content
     */
    cleanHtmlContent(htmlContent) {
        if (!htmlContent) return htmlContent;
        
        const $ = cheerio.load(htmlContent);
        
        // Remove all script tags
        $('script').remove();
        
        // Remove all div tags with class names containing "ad-dog"
        $('div[class*="ad-dog"]').remove();
        
        // Remove html, head, and body tags if they exist
        $('head').remove();
        $('body').contents().unwrap();
        $('html').contents().unwrap();
        
        // Get the cleaned content
        return $.html();
    }    

    /**
     * Generate hash for content tracking
     * @param {string} guid - Unique identifier
     * @returns {string} SHA256 hash
     */
    generateHash(guid) {
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(`${this.name}:${guid}`)
            .digest('hex');
    }    
}

module.exports = new WordPressDriver();
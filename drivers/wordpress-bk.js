const cheerio = require('cheerio');
const { safeLog } = require('../utils/sensitive-data');

/**
 * WordPress REST API driver
 */
class WordPressDriver {
    constructor() {
        this.name = 'WordPress';
        this.supportedFormats = ['rest-api'];
        this.postsPerPage = 20; // Hard-coded for now
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
    
    /**
     * Clean post content during ingestion - remove script tags and ad-dog divs
     * @param {Object} post - Raw WordPress post
     * @returns {Object} Cleaned post object
     */
    cleanPostContent(post) {
        // Create a deep copy of the post to avoid modifying the original
        const cleanedPost = JSON.parse(JSON.stringify(post));
        
        // Clean the content.rendered field if it exists
        if (cleanedPost.content && cleanedPost.content.rendered) {
            cleanedPost.content.rendered = this.cleanHtmlContent(cleanedPost.content.rendered);
        }
        
        // Clean the excerpt.rendered field if it exists
        if (cleanedPost.excerpt && cleanedPost.excerpt.rendered) {
            cleanedPost.excerpt.rendered = this.cleanHtmlContent(cleanedPost.excerpt.rendered);
        }
        
        return cleanedPost;
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
                const { posts, headers } = await this.fetchPostsPage(config.EXTERNAL_FEED_URL, config, currentPage);
                
                // Update total pages from headers
                if (headers['x-wp-totalpages']) {
                    totalPages = parseInt(headers['x-wp-totalpages']);
                    console.log(`Total pages available: ${totalPages} (total posts: ${headers['x-wp-total'] || 'unknown'})`);
                }
                
                // Enrich posts with category names
                const enrichedPosts = await this.enrichPostsWithCategories(config.EXTERNAL_FEED_URL, posts, config);
                
                // Process and insert posts directly to database
                for (const post of enrichedPosts) {
                    // Clean the post content during ingestion
                    const cleanedPost = this.cleanPostContent(post);
                    
                    const item = {
                        guid: post.id,
                        content_hash: this.generateHash(post.id),
                        metadata: {
                            id: post.id,
                            title: post.title?.rendered || 'Untitled',
                            date: post.date,
                            link: post.link,
                            author: post.author_name || ''
                        },
                        // WordPress provides full content in listing, so store it (cleaned)
                        fullContent: cleanedPost
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
                if (!isNewSource && currentPage > 1) {
                    console.log('Existing source - stopping after first page');
                    break;
                }
                
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
        const rawContent = post.content?.rendered || '';
        const categories = this.extractPostCategories(post);
        const parsedContent = this.parseContent(rawContent, feedType);
        
        return {
            title: this.decodeHtmlEntities(post.title?.rendered) || 'Untitled',
            shortTitle: this.decodeHtmlEntities(post.title?.rendered) || '', // Can be customized if needed
            description: post.excerpt?.rendered || '',
            content: parsedContent.content,
            link: post.link || '',
            guid: post.guid?.rendered || post.link || '',
            pubDate: post.date || new Date().toISOString(),
            author: post.author_name || '',
            categories: categories,
            isSlideShow: parsedContent.isSlideShow,
            thumbnail: this.extractThumbnail(post),
            featuredImage: this.extractFeaturedImage(post),
            images: parsedContent.images
        };
    }
    
    /**
     * Fetch posts from WordPress REST API for a specific page
     * @param {string} baseUrl - Base URL of the WordPress site
     * @param {Object} config - Configuration object with API settings
     * @param {number} page - Page number to fetch
     * @returns {Promise<Object>} Object with posts array and headers
     */
    async fetchPostsPage(baseUrl, config, page = 1) {
        try {
            const filterParam = config.WP_API_POSTS_FILTER || '';
            const filterValue = config.WP_API_POSTS_FILTER_VALUE || '';
            
            // Build the API URL with pagination
            let apiUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=${this.postsPerPage}&page=${page}&_embed=1`;
            
            // Add filter parameters only if they are provided
            if (filterParam && filterValue) {
                apiUrl += `&${filterParam}=${encodeURIComponent(filterValue)}`;
            }
            
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
    
    /**
     * Fetch posts from WordPress REST API (legacy method for backward compatibility)
     * @param {string} baseUrl - Base URL of the WordPress site
     * @param {Object} config - Configuration object with API settings
     * @returns {Promise<Array>} Array of WordPress posts with category names
     */
    async fetchPosts(baseUrl, config) {
        try {
            // Use the new paginated method for backward compatibility
            const result = await this.fetchPostsPage(baseUrl, config, 1);
            const posts = result.posts;
            
            console.log(`Fetched ${posts.length} posts from WordPress API`);
            
            // Fetch category names for each post
            const postsWithCategories = await this.enrichPostsWithCategories(baseUrl, posts, config);
            
            return postsWithCategories;
            
        } catch (error) {
            if (error.code === 'ENOTFOUND') {
                throw new Error(`WordPress site not found: ${baseUrl}`);
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error(`Connection refused: ${baseUrl}`);
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error(`Request timeout: ${baseUrl}`);
            }
            throw error;
        }
    }
    
    /**
     * Enrich posts with category names from separate API calls
     * @param {string} baseUrl - Base URL of the WordPress site
     * @param {Array} posts - Array of WordPress posts
     * @param {Object} config - Configuration object with API settings
     * @returns {Promise<Array>} Posts with enriched category names
     */
    async enrichPostsWithCategories(baseUrl, posts, config) {
        try {
            // Get all unique category IDs from all posts
            const categoryIds = new Set();
            posts.forEach(post => {
                if (post.categories && Array.isArray(post.categories)) {
                    post.categories.forEach(catId => categoryIds.add(catId));
                }
            });
            
            if (categoryIds.size === 0) {
                return posts.map(post => ({ ...post, category_names: [] }));
            }
            
            // Fetch category names in batch
            const categoryNames = await this.fetchCategoryNames(baseUrl, Array.from(categoryIds), config);
            
            // Enrich posts with category names
            return posts.map(post => {
                const postCategoryNames = [];
                if (post.categories && Array.isArray(post.categories)) {
                    post.categories.forEach(catId => {
                        if (categoryNames[catId]) {
                            postCategoryNames.push(categoryNames[catId]);
                        }
                    });
                }
                return { ...post, category_names: postCategoryNames };
            });
            
        } catch (error) {
            console.error('Error enriching posts with categories:', error);
            // Return posts without category names if enrichment fails
            return posts.map(post => ({ ...post, category_names: [] }));
        }
    }
    
    /**
     * Fetch category names by IDs
     * @param {string} baseUrl - Base URL of the WordPress site
     * @param {Array} categoryIds - Array of category IDs
     * @param {Object} config - Configuration object with API settings
     * @returns {Promise<Object>} Object mapping category ID to name
     */
    async fetchCategoryNames(baseUrl, categoryIds, config) {
        try {
            // Prepare headers
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (config.WP_API_TOKEN) {
                headers['Authorization'] = `Bearer ${config.WP_API_TOKEN}`;
            }
            
            // Fetch categories in batches (WordPress API limit)
            const batchSize = 10;
            const categoryNames = {};
            
            for (let i = 0; i < categoryIds.length; i += batchSize) {
                const batch = categoryIds.slice(i, i + batchSize);
                const idsParam = batch.join(',');
                const apiUrl = `${baseUrl}/wp-json/wp/v2/categories?include=${idsParam}`;
                
                const response = await fetch(apiUrl, { headers });
                
                if (response.ok) {
                    const categories = await response.json();
                    categories.forEach(cat => {
                        categoryNames[cat.id] = cat.name;
                    });
                } else {
                    console.warn(`Failed to fetch categories batch: ${response.status}`);
                }
            }
            
            return categoryNames;
            
        } catch (error) {
            console.error('Error fetching category names:', error);
            return {};
        }
    }
    
    /**
     * Parse WordPress posts into feed items
     * @param {Array} posts - Array of WordPress posts
     * @param {string} feedType - The EXTERNAL_FEED_TYPE ("slideshow" or "article")
     * @returns {Array} Array of normalized feed items
     */
    parsePosts(posts, feedType = '') {
        try {
            return posts.map(post => this.normalizePost(post, feedType));
            
        } catch (error) {
            console.error('Error parsing WordPress posts:', error);
            throw new Error(`Post parsing failed: ${error.message}`);
        }
    }
    
    /**
     * Normalize WordPress post to standard format
     * @param {Object} post - Raw WordPress post
     * @returns {Object} Normalized item
     */
    normalizePost(post, feedType = '') {
        const rawContent = post.content?.rendered || '';
        const parsedContent = this.parseContent(rawContent, feedType);
        
        return {
            title: this.decodeHtmlEntities(post.title?.rendered) || 'Untitled',
            shortTitle: this.decodeHtmlEntities(post.title?.rendered) || '', // Can be customized if needed
            description: post.excerpt?.rendered || '',
            content: parsedContent.content,
            link: post.link || '',
            guid: post.guid?.rendered || post.link || '',
            pubDate: post.date || new Date().toISOString(),
            author: post.author_name || '',
            categories: this.extractPostCategories(post),
            isSlideShow: parsedContent.isSlideShow,
            thumbnail: this.extractThumbnail(post),
            featuredImage: this.extractFeaturedImage(post),
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
        $('figure.wp-block-image.size-large').each((index, figureElement) => {
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
                if ($current.is('figure.wp-block-image.size-large')) {
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
     * Extract categories from WordPress post
     * @param {Object} post - WordPress post (with enriched category_names)
     * @returns {Array<string>} Array of category names
     */
    extractPostCategories(post) {
        // Use the enriched category_names if available, otherwise fall back to IDs
        if (post.category_names && Array.isArray(post.category_names)) {
            return post.category_names.filter(Boolean);
        }
        
        // Fallback to category IDs if names weren't fetched
        const categories = [];
        if (post.categories && Array.isArray(post.categories)) {
            categories.push(...post.categories.map(id => `Category ${id}`));
        }
        
        return categories.filter(Boolean);
    }
    
    /**
     * Extract thumbnail from WordPress post
     * @param {Object} post - WordPress post
     * @returns {Object|null} Thumbnail object or null
     */
    extractThumbnail(post) {
        // WordPress typically provides featured media in _embedded or via separate API call
        // For now, return null - this would need to be enhanced based on actual WordPress setup
        if (post.featured_media && post._embedded && post._embedded['wp:featuredmedia']) {
            const media = post._embedded['wp:featuredmedia'][0];
            return {
                url: media.source_url || '',
                alt: media.alt_text || post.title?.rendered || '',
                attribution: media.caption?.rendered || ''
            };
        }
        return null;
    }
    
    /**
     * Extract featured image from WordPress post
     * @param {Object} post - WordPress post
     * @returns {Object|null} Featured image object or null
     */
    extractFeaturedImage(post) {
        // Similar to thumbnail but for larger featured image
        if (post.featured_media && post._embedded && post._embedded['wp:featuredmedia']) {
            const media = post._embedded['wp:featuredmedia'][0];
            return {
                url: media.source_url || '',
                alt: media.alt_text || post.title?.rendered || '',
                attribution: media.caption?.rendered || ''
            };
        }
        return null;
    }
    
}

module.exports = new WordPressDriver();

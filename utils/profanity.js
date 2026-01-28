/**
 * Download and parse the profanity list from the specified URL
 * @param {string} url - URL to the profanity list JSON
 * @returns {Promise<Array<string>>} Array of profanity terms
 */
async function getProfanityList(url) {
    try {
        console.log(`Downloading profanity list from: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to download profanity list: HTTP ${response.status}`);
        }
        
        const profanityList = await response.json();
        
        if (!Array.isArray(profanityList)) {
            throw new Error('Profanity list is not an array');
        }
        
        // Convert all terms to lowercase for case-insensitive matching
        return profanityList.map(term => term.toLowerCase().trim()).filter(term => term.length > 0);
        
    } catch (error) {
        console.error('Error downloading profanity list:', error.message);
        throw new Error(`Failed to load profanity list: ${error.message}`);
    }
}

/**
 * Check if text contains any profanity
 * @param {string} text - Text to check
 * @param {Array<string>} profanityList - List of profanity terms
 * @returns {boolean} True if profanity is found
 */
function containsProfanity(text, profanityList) {
    if (!text || !profanityList || profanityList.length === 0) {
        return false;
    }
    
    const lowerText = text.toLowerCase();
    
    return profanityList.some(term => {
        // Check for exact word matches (not substring matches)
        const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
        return regex.test(lowerText);
    });
}

/**
 * Find all profanity words in text
 * @param {string} text - Text to check
 * @param {Array<string>} profanityList - List of profanity terms
 * @returns {Array<string>} Array of matched profanity terms
 */
function findProfanityWords(text, profanityList) {
    if (!text || !profanityList || profanityList.length === 0) {
        return [];
    }
    
    const lowerText = text.toLowerCase();
    const matchedTerms = [];
    
    profanityList.forEach(term => {
        // Check for exact word matches (not substring matches)
        const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
        if (regex.test(lowerText)) {
            matchedTerms.push(term);
        }
    });
    
    return matchedTerms;
}

/**
 * Escape special regex characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter out items that contain profanity
 * @param {Array<Object>} items - Array of feed items
 * @param {Array<string>} profanityList - List of profanity terms
 * @returns {Array<Object>} Filtered array of items
 */
function filterProfanity(items, profanityList) {
    if (!profanityList || profanityList.length === 0) {
        console.log('No profanity list provided, skipping filter');
        return items;
    }
    
    const originalCount = items.length;
    const filteredItems = items.filter(item => {
        // Check title and description for profanity
        const title = item.title || '';
        const description = item.description || '';
        const content = item.content || '';
        
        // For slideshows, also check image content
        let imageContent = '';
        if (item.isSlideShow && item.images && Array.isArray(item.images)) {
            imageContent = item.images.map(image => {
                return [
                    image.title || '',
                    image.text || '',
                    image.description || '',
                    image.attribution || '',
                    image.caption || ''
                ].join(' ');
            }).join(' ');
        }
        
        const hasProfanity = containsProfanity(title, profanityList) ||
                           containsProfanity(description, profanityList) ||
                           containsProfanity(content, profanityList) ||
                           containsProfanity(imageContent, profanityList);
        
        if (hasProfanity) {
            console.log(`Filtered out item due to profanity: "${title}"`);
        }
        
        return !hasProfanity;
    });
    
    const filteredCount = originalCount - filteredItems.length;
    console.log(`Profanity filter: ${filteredCount} items removed, ${filteredItems.length} items remaining`);
    
    return filteredItems;
}

module.exports = {
    getProfanityList,
    containsProfanity,
    findProfanityWords,
    filterProfanity
};

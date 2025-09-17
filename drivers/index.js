const wordpressDriver = require('./wordpress');

/**
 * Base Driver Interface
 * All drivers must implement these methods
 */
class BaseDriver {
    constructor() {
        this.name = 'BaseDriver';
        this.supportedFormats = [];
    }
    
    /**
     * Ingest content from the source (lightweight, fast)
     * @param {Object} config - Configuration object
     * @param {Object} db - Database manager instance
     * @returns {Promise<Object>} Object with ingested count and new count
     */
    async ingest(config, db) {
        throw new Error(`ingest() method not implemented in ${this.name}`);
    }
    
    /**
     * Fetch full content for a specific item
     * @param {string} contentHash - Content hash for the item
     * @param {Object} config - Configuration object
     * @param {Object} db - Database manager instance
     * @returns {Promise<Object>} Full content object
     */
    async fetchContent(contentHash, config, db) {
        throw new Error(`fetchContent() method not implemented in ${this.name}`);
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

/**
 * Registry of available feed drivers
 */
const drivers = {
    wordpress: wordpressDriver
};

/**
 * Get a feed driver by type
 * @param {string} feedType - Type of feed (e.g., 'wordpress')
 * @returns {Object|null} Driver object or null if not found
 */
function getFeedDriver(feedType) {
    const driver = drivers[feedType];
    
    if (!driver) {
        console.error(`No driver found for feed type: ${feedType}`);
        console.log(`Available drivers: ${Object.keys(drivers).join(', ')}`);
        return null;
    }
    
    return driver;
}

/**
 * Get list of available feed types
 * @returns {Array<string>} Array of available feed types
 */
function getAvailableFeedTypes() {
    return Object.keys(drivers);
}

module.exports = {
    BaseDriver,
    getFeedDriver,
    getAvailableFeedTypes
};

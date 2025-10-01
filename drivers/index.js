const wordpressDriver = require('./wordpress');

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
    getFeedDriver,
    getAvailableFeedTypes
};

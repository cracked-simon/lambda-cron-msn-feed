/**
 * Utility functions for handling sensitive data in logs
 */

/**
 * Mask sensitive values in strings
 * @param {string} text - Text that might contain sensitive data
 * @returns {string} Text with sensitive data masked
 */
function maskSensitiveData(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    
    // List of sensitive patterns to mask
    const sensitivePatterns = [
        // API tokens and keys
        { pattern: /Bearer\s+[A-Za-z0-9\s]+/gi, replacement: 'Bearer [MASKED]' },
        { pattern: /WP_API_TOKEN["\s]*[:=]["\s]*[^"\s,}]+/gi, replacement: 'WP_API_TOKEN: [MASKED]' },
        { pattern: /DB_PASSWORD["\s]*[:=]["\s]*[^"\s,}]+/gi, replacement: 'DB_PASSWORD: [MASKED]' },
        { pattern: /password["\s]*[:=]["\s]*[^"\s,}]+/gi, replacement: 'password: [MASKED]' },
        
        // URLs with tokens
        { pattern: /https?:\/\/[^\/]*:[^@\/]*@[^\s]+/gi, replacement: 'https://[MASKED]@[MASKED]' },
        
        // Database connection strings
        { pattern: /mysql:\/\/[^:]+:[^@]+@[^\s]+/gi, replacement: 'mysql://[MASKED]:[MASKED]@[MASKED]' },
        
        // AWS keys and tokens
        { pattern: /AKIA[0-9A-Z]{16}/gi, replacement: 'AKIA[MASKED]' },
        { pattern: /[A-Za-z0-9+/]{40}/g, replacement: '[MASKED_SECRET]' },
    ];
    
    let maskedText = text;
    
    // Apply each pattern
    sensitivePatterns.forEach(({ pattern, replacement }) => {
        maskedText = maskedText.replace(pattern, replacement);
    });
    
    return maskedText;
}

/**
 * Mask sensitive data in objects
 * @param {Object} obj - Object that might contain sensitive data
 * @returns {Object} Object with sensitive data masked
 */
function maskSensitiveObject(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    
    const sensitiveKeys = [
        'WP_API_TOKEN',
        'DB_PASSWORD', 
        'password',
        'token',
        'secret',
        'key',
        'auth',
        'authorization'
    ];
    
    const masked = { ...obj };
    
    // Mask sensitive keys
    Object.keys(masked).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
            masked[key] = '[MASKED]';
        }
    });
    
    return masked;
}

/**
 * Safe logging function that masks sensitive data
 * @param {Function} logFunction - The logging function to use (console.log, logger.info, etc.)
 * @param {...any} args - Arguments to log
 */
function safeLog(logFunction, ...args) {
    const maskedArgs = args.map(arg => {
        if (typeof arg === 'string') {
            return maskSensitiveData(arg);
        } else if (typeof arg === 'object' && arg !== null) {
            return maskSensitiveObject(arg);
        }
        return arg;
    });
    
    logFunction(...maskedArgs);
}

module.exports = {
    maskSensitiveData,
    maskSensitiveObject,
    safeLog
};

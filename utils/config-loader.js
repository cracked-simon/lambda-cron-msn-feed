const fs = require('fs').promises;
const path = require('path');
const { safeLog } = require('./sensitive-data');

/**
 * Configuration loader that can load from files and override environment variables
 */
class ConfigLoader {
    constructor() {
        this.baseConfig = null;
        this.overrideConfig = null;
    }
    
    /**
     * Load configuration from environment variables and optional config file
     * @param {string} configFilePath - Path to config file (optional)
     * @returns {Object} Merged configuration object
     */
    async loadConfig(configFilePath = null) {
        try {
            // First load base environment variables
            this.baseConfig = this.loadEnvironmentVariables();
            
            // If config file is provided, load and merge it
            if (configFilePath) {
                safeLog(console.log, `Loading configuration from: ${configFilePath}`);
                this.overrideConfig = await this.loadConfigFile(configFilePath);
                
                // Merge config file overrides with base config
                const mergedConfig = this.mergeConfigs(this.baseConfig, this.overrideConfig);
                safeLog(console.log, `Configuration merged from file: ${configFilePath}`);
                
                return mergedConfig;
            }
            
            console.log('Using environment variables only');
            return this.baseConfig;
            
        } catch (error) {
            console.error('Error loading configuration:', error);
            throw new Error(`Configuration loading failed: ${error.message}`);
        }
    }
    
    /**
     * Load environment variables (same as existing config.js)
     */
    loadEnvironmentVariables() {
        const dotenv = require('dotenv');
        
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
            console.log('Running in AWS Lambda - using runtime environment variables');
        } else {
            dotenv.config(); // Load .env file for local development
            console.log('Loaded environment variables from .env file');
        }

        return {
            // Feed Configuration
            EXTERNAL_FEED_URL: process.env.EXTERNAL_FEED_URL,
            EXTERNAL_FEED_PLATFORM: process.env.EXTERNAL_FEED_PLATFORM,
            EXTERNAL_FEED_TYPE: process.env.EXTERNAL_FEED_TYPE,
            EXTERNAL_FEED_SOURCE: process.env.EXTERNAL_FEED_SOURCE,
            FEED_FILE_NAME: process.env.FEED_FILE_NAME,
            
            // WordPress API Configuration
            WP_API_TOKEN: process.env.WP_API_TOKEN,
            WP_API_POSTS_FILTER: process.env.WP_API_POSTS_FILTER,
            WP_API_POSTS_FILTER_VALUE: process.env.WP_API_POSTS_FILTER_VALUE,
            
            // MSN Feed Configuration
            SITE_NAME: process.env.SITE_NAME,
            SITE_DESCRIPTION: process.env.SITE_DESCRIPTION,
            SITE_LANGUAGE: process.env.SITE_LANGUAGE,
            SITE_COPYRIGHT: process.env.SITE_COPYRIGHT,
            
            // Database Configuration
            DB_HOST: process.env.DB_HOST,
            DB_PORT: process.env.DB_PORT || 3306,
            DB_NAME: process.env.DB_NAME,
            DB_USER: process.env.DB_USER,
            DB_PASSWORD: process.env.DB_PASSWORD,
            DB_SSL: process.env.DB_SSL,
            
            // Feed Generation Configuration
            FEED_ITEMS_PER_RUN: parseInt(process.env.FEED_ITEMS_PER_RUN) || 5,
            FEED_MAX_TOTAL_ITEMS: parseInt(process.env.FEED_MAX_TOTAL_ITEMS) || 20,
            
            // Storage Configuration
            STORAGE: process.env.STORAGE || 'file', // 'file' or 's3'
            
            // AWS Configuration
            AWS_REGION: process.env.AWS_REGION || 'us-east-1',
            S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET,
            S3_FOLDER_NAME: process.env.S3_FOLDER_NAME || 'feeds',
            CLOUDFRONT_DISTRIBUTION_ID: process.env.CLOUDFRONT_DISTRIBUTION_ID || process.env.AWS_CLOUDFRONT_DISTRO,

            // Profanity Filter
            PROFANITY_LIST_URL: process.env.PROFANITY_LIST_URL || 'https://raw.githubusercontent.com/cracked-simon/literally-profanity/refs/heads/main/final-list.json'
        };
    }
    
    /**
     * Load configuration from JSON file
     * @param {string} configFilePath - Path to the config file
     * @returns {Object} Configuration object from file
     */
    async loadConfigFile(configFilePath) {
        try {
            // Resolve relative paths
            const fullPath = path.resolve(configFilePath);
            
            // Check if file exists
            await fs.access(fullPath);
            
            // Read and parse JSON file
            const fileContent = await fs.readFile(fullPath, 'utf8');
            const config = JSON.parse(fileContent);
            
            safeLog(console.log, `Loaded config file: ${fullPath}`);
            return config;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Config file not found: ${configFilePath}`);
            } else if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON in config file: ${configFilePath}`);
            } else {
                throw new Error(`Error reading config file: ${error.message}`);
            }
        }
    }
    
    /**
     * Merge base config with override config (override takes precedence)
     * @param {Object} baseConfig - Base configuration from environment
     * @param {Object} overrideConfig - Override configuration from file
     * @returns {Object} Merged configuration
     */
    mergeConfigs(baseConfig, overrideConfig) {
        const merged = { ...baseConfig };
        
        // Handle config files with 'overrides' object
        const configOverrides = overrideConfig.overrides || overrideConfig;
        
        // Deep merge the configurations
        for (const [key, value] of Object.entries(configOverrides)) {
            if (value !== null && value !== undefined) {
                merged[key] = value;
                console.log(`Config override: ${key} = ${typeof value === 'object' ? JSON.stringify(value) : value}`);
            }
        }
        
        return merged;
    }
    
    /**
     * Validate required configuration variables
     * @param {Object} config - Configuration object to validate
     * @returns {Array} Array of missing required variables
     */
    validateRequiredConfig(config) {
        const requiredVars = [
            'EXTERNAL_FEED_URL', 
            'EXTERNAL_FEED_PLATFORM', 
            'EXTERNAL_FEED_TYPE', 
            'EXTERNAL_FEED_SOURCE', 
            'FEED_FILE_NAME'
        ];
        
        return requiredVars.filter(varName => !config[varName]);
    }
    
    /**
     * Get available config files in the configs directory
     * @returns {Promise<Array>} Array of available config file names
     */
    async getAvailableConfigs() {
        try {
            const configsDir = path.join(__dirname, '..', 'configs');
            const files = await fs.readdir(configsDir);
            return files.filter(file => file.endsWith('.json'));
        } catch (error) {
            console.log('No configs directory found');
            return [];
        }
    }
}

module.exports = ConfigLoader;

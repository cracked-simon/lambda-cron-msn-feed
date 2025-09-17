const dotenv = require('dotenv');

/**
 * Load environment variables from .env file only when not running in AWS Lambda
 * In Lambda, environment variables are provided by the runtime
 */
function loadEnvironmentVariables() {
    // Check if we're running in AWS Lambda
    const isLambda = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_RUNTIME_DIR;
    
    if (!isLambda) {
        // Load .env file for local development
        dotenv.config();
        console.log('Loaded environment variables from .env file');
    } else {
        console.log('Running in AWS Lambda - using runtime environment variables');
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
        
        // AWS Configuration
        AWS_REGION: process.env.AWS_REGION || 'us-east-1',
        S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET,
        CLOUDFRONT_DISTRIBUTION_ID: process.env.CLOUDFRONT_DISTRIBUTION_ID || process.env.AWS_CLOUDFRONT_DISTRO,
        
        // Profanity Filter
        PROFANITY_LIST_URL: process.env.PROFANITY_LIST_URL || 'https://raw.githubusercontent.com/cracked-simon/literally-profanity/refs/heads/main/final-list.json'
    };
}

module.exports = {
    loadEnvironmentVariables
};

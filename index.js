#!/usr/bin/env node

const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const ConfigLoader = require('./utils/config-loader');
const { getProfanityList, filterProfanity } = require('./utils/profanity');
const { uploadToS3, invalidateCloudFront, testAWSCredentials } = require('./utils/aws');
const MSNConverter = require('./utils/msn-converter');
const DatabaseManager = require('./utils/database');
const { getFeedDriver, getAvailableFeedTypes } = require('./drivers');
const logger = require('./utils/logger');

/**
 * Main EC2 application function with two-phase processing
 * Phase 1: Ingest new content
 * Phase 2: Generate feed from ingested content
 * @param {string} configFile - Config file path
 * @returns {Object} Response object
 */
async function runFeedConverter(configFile) {
    const startTime = new Date();
    logger.info('🚀 Starting RSS-to-MSN feed processing...');
    
    let db = null;
    
    try {
        // Load configuration (environment + config file)
        const configLoader = new ConfigLoader();
        const config = await configLoader.loadConfig(configFile);
        
        // Validate required configuration variables
        const missingVars = configLoader.validateRequiredConfig(config);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required configuration variables: ${missingVars.join(', ')}`);
        }
        
        logger.info(`Processing ${config.EXTERNAL_FEED_TYPE} ${config.EXTERNAL_FEED_PLATFORM} feed from: ${config.EXTERNAL_FEED_URL}`);
        
        // Initialize database connection
        logger.info('📊 Connecting to database...');
        db = new DatabaseManager(config);
        await db.connect();
        
        // Get appropriate feed driver
        const driver = getFeedDriver(config.EXTERNAL_FEED_PLATFORM);
        if (!driver) {
            throw new Error(`Unsupported feed platform: ${config.EXTERNAL_FEED_PLATFORM}`);
        }

        // PHASE 1: INGESTING
        logger.info('\n🔄 PHASE 1: INGESTING NEW CONTENT');
        logger.info('=====================================');

        const ingestResult = await driver.ingest(config, db);
        logger.info(`✅ Ingested ${ingestResult.totalIngested} total items, ${ingestResult.totalNew} new items`);

        // PHASE 2: FEED GENERATION
        logger.info('\n🔄 PHASE 2: GENERATING FEED');
        logger.info('============================');

        // Get profanity list
        logger.info('Loading profanity list...');
        const profanityList = await getProfanityList(config.PROFANITY_LIST_URL);
        logger.info(`Loaded ${profanityList.length} profanity terms`);

        // Get pending items for processing
        logger.info(`Getting ${config.FEED_ITEMS_PER_RUN} pending items for processing...`);
        const pendingItems = await db.getPendingItems(config.FEED_ITEMS_PER_RUN, config);
        logger.info(`Found ${pendingItems.length} pending items`);

        let processedCount = 0;
        let skippedCount = 0;
        const feedItems = [];

        // Process each pending item
        for (const item of pendingItems) {
            try {
                logger.info(`Processing item: ${item.metadata.title}`);

                // Fetch full content from database via driver
                const fullContent = await driver.fetchContent(item.content_hash, config, db);

                // Normalize the content
                const normalizedPost = driver.normalizePost(fullContent, config.EXTERNAL_FEED_TYPE);

                // Apply profanity filter
                const isClean = filterProfanity([normalizedPost], profanityList).length === 0;

                if (isClean) {
                    // Content is clean - add to feed
                    feedItems.push(normalizedPost);
                    await db.updateItemStatus(item.content_hash, item.source, 'published', null, normalizedPost);
                    processedCount++;
                    logger.info(`✅ Published: ${normalizedPost.title}`);
                } else {
                    // Content contains profanity - skip
                    await db.updateItemStatus(item.content_hash, item.source, 'skipped', 'profanity');
                    skippedCount++;
                    logger.info(`❌ Skipped (profanity): ${normalizedPost.title}`);
                }

            } catch (error) {
                logger.error(`Error processing item ${item.guid}:`, error.message);
                await db.updateItemStatus(item.content_hash, item.source, 'skipped', `error: ${error.message}`);
                skippedCount++;
            }
        }

        logger.info(`\n📊 Processing Summary:`);
        logger.info(`   Processed: ${processedCount} items`);
        logger.info(`   Skipped: ${skippedCount} items`);
        logger.info(`   Feed items: ${feedItems.length} items`);

        // Get existing published items to maintain feed window
        const existingPublishedItems = await db.getPublishedItems(1000, config); // Get more than needed
        logger.info(`Existing published items in database: ${existingPublishedItems.length}`);

        // Combine new and existing items
        const allFeedItems = [...feedItems, ...existingPublishedItems.map(item => item.processed_data)];

        // Apply moving window logic - keep only the most recent items for the feed
        let finalFeedItems = allFeedItems;
        if (allFeedItems.length > config.FEED_MAX_TOTAL_ITEMS) {
            logger.info(`Feed exceeds ${config.FEED_MAX_TOTAL_ITEMS} items, applying moving window...`);

            // Sort by publication date (most recent first) and keep only the limit
            finalFeedItems = allFeedItems
                .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
                .slice(0, config.FEED_MAX_TOTAL_ITEMS);

            logger.info(`Moving window applied: ${allFeedItems.length} total items → ${finalFeedItems.length} items in feed`);
        }

        // Generate MSN feed
        logger.info('Converting to MSN format...');
        const msnConfig = {
            siteName: config.SITE_NAME || 'Content Feed',
            siteDescription: config.SITE_DESCRIPTION || 'Content converted to MSN format',
            language: config.SITE_LANGUAGE || 'en-us',
            copyright: config.SITE_COPYRIGHT || ''
        };
        const msnFeed = MSNConverter.convertToMSN(config.EXTERNAL_FEED_URL, finalFeedItems, msnConfig);

        // Upload to S3
        logger.info('Uploading to S3...');
        const s3Result = await uploadToS3(
            config.S3_BUCKET_NAME,
            config.FEED_FILE_NAME,
            msnFeed,
            config.AWS_REGION
        );
        logger.info(`Uploaded to S3: ${s3Result.Location}`);

        // Invalidate CloudFront
        if (config.CLOUDFRONT_DISTRIBUTION_ID) {
            logger.info('Invalidating CloudFront...');
            const invalidationResult = await invalidateCloudFront(
                config.CLOUDFRONT_DISTRIBUTION_ID,
                `/${config.FEED_FILE_NAME}`,
                config.AWS_REGION
            );
            logger.info(`CloudFront invalidation: ${invalidationResult.Invalidation.Id}`);
        }

        const endTime = new Date();
        const duration = Math.round((endTime - startTime) / 1000);

        logger.info(`✅ Feed processed successfully in ${duration}s`);
        
        return {
            message: 'Feed processed successfully',
            feedPlatform: config.EXTERNAL_FEED_PLATFORM,
            feedType: config.EXTERNAL_FEED_TYPE,
            ingested: ingestResult.totalNew,
            processed: processedCount,
            skipped: skippedCount,
            feedItems: finalFeedItems.length,
            s3Location: s3Result.Location,
            cloudFrontInvalidated: !!config.CLOUDFRONT_DISTRIBUTION_ID,
            duration: `${duration}s`
        };

    } catch (error) {
        logger.error('❌ Feed processing failed:', error.message);
        throw error;
    } finally {
        // Clean up database connection
        if (db) {
            await db.close();
        }
    }
}

/**
 * CLI interface for the RSS-to-MSN feed converter
 */
class CLI {
    /**
     * Main CLI entry point
     */
    async run() {
        const args = process.argv.slice(2);
        const configFile = args[0]; // First argument is the config file

        if (!configFile) {
            console.error('❌ Usage: node index.js <config.json>');
            console.error('   Example: node index.js denofgeeks-articles.json');
            process.exit(1);
        }

        console.log(`🚀 RSS-to-MSN Feed Converter - Using config: ${configFile}\n`);

        try {
            // Run the main feed converter with the specified config
            await runFeedConverter(configFile);

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            process.exit(1);
        }
    }
}

// Run the CLI if executed directly
if (require.main === module) {
    const cli = new CLI();
    cli.run().catch(error => {
        console.error('\n💥 CLI Error:', error.message);
        process.exit(1);
    });
}

module.exports = {
    runFeedConverter
};
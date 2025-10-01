/**
 * Migration: Create ingested_content table for RSS-to-MSN feed processing
 * Created: 2024-12-19
 * Description: This migration creates the main table for storing ingested RSS content
 */

const migration = {
    version: '001',
    description: 'Create ingested_content table for RSS-to-MSN feed processing',
    
    /**
     * Apply the migration (create table)
     */
    async up(db) {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ingested_content (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of the content for deduplication',
                source VARCHAR(100) NOT NULL COMMENT 'Source identifier for the feed (e.g., denofgeeks-articles)',
                guid VARCHAR(255) NOT NULL COMMENT 'Original GUID from the RSS feed',
                platform VARCHAR(50) NOT NULL COMMENT 'Platform type (e.g., wordpress)',
                feed_type VARCHAR(50) NOT NULL COMMENT 'Feed type (e.g., articles, slideshows)',
                status VARCHAR(20) DEFAULT 'pending' COMMENT 'Processing status: pending, published, skipped',
                ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the content was first ingested',
                published_at TIMESTAMP NULL COMMENT 'When the content was published to the feed',
                skipped_at TIMESTAMP NULL COMMENT 'When the content was skipped',
                skip_reason VARCHAR(255) NULL COMMENT 'Reason why content was skipped',
                metadata JSON NOT NULL COMMENT 'Original RSS item metadata (title, description, etc.)',
                full_content JSON NULL COMMENT 'Full content fetched from the source',
                processed_data JSON NULL COMMENT 'Processed content ready for MSN feed format',
                
                -- Constraints
                UNIQUE KEY unique_content_source (content_hash, source),
                
                -- Indexes for performance
                INDEX idx_content_hash (content_hash),
                INDEX idx_source (source),
                INDEX idx_status (status),
                INDEX idx_ingested_at (ingested_at),
                INDEX idx_published_at (published_at),
                INDEX idx_platform_feed_type (platform, feed_type),
                INDEX idx_status_source (status, source),
                INDEX idx_ingested_at_status (ingested_at, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
            COMMENT='Stores ingested RSS content with processing status for MSN feed generation'
        `;
        
        await db.execute(createTableSQL);
        
        // Additional indexes are already included in the main CREATE TABLE statement
        // No need to create them separately
        
        console.log('✅ Migration 001: Created ingested_content table with indexes');
    },
    
    /**
     * Rollback the migration (drop table)
     */
    async down(db) {
        await db.execute('DROP TABLE IF EXISTS ingested_content');
        console.log('✅ Migration 001: Dropped ingested_content table');
    }
};

module.exports = migration;

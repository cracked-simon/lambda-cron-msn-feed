/**
 * Database utilities for content storage and tracking
 * MySQL-only implementation
 */
class DatabaseManager {
    constructor(config) {
        this.config = config;
        this.client = null;
    }
    
    /**
     * Initialize MySQL database connection
     */
    async connect() {
        return await this.connectMySQL();
    }
    
    /**
     * Connect to MySQL
     */
    async connectMySQL() {
        const mysql = require('mysql2/promise');
        this.client = await mysql.createConnection({
            host: this.config.DB_HOST,
            port: this.config.DB_PORT || 3306,
            database: this.config.DB_NAME,
            user: this.config.DB_USER,
            password: this.config.DB_PASSWORD,
            ssl: this.config.DB_SSL === 'true'
        });
        
        await this.ensureTables();
        console.log('Connected to MySQL');
        return this.client;
    }
    
    /**
     * Ensure required MySQL tables exist
     */
    async ensureTables() {
        return await this.ensureTablesMySQL();
    }
    
    /**
     * Ensure MySQL tables exist
     */
    async ensureTablesMySQL() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ingested_content (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content_hash VARCHAR(64) NOT NULL,
                source VARCHAR(100) NOT NULL,
                guid VARCHAR(255) NOT NULL,
                platform VARCHAR(50) NOT NULL,
                feed_type VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_at TIMESTAMP NULL,
                skipped_at TIMESTAMP NULL,
                skip_reason VARCHAR(255) NULL,
                metadata JSON NOT NULL,
                full_content JSON NULL,
                processed_data JSON NULL,
                UNIQUE KEY unique_content_source (content_hash, source),
                INDEX idx_content_hash (content_hash),
                INDEX idx_source (source),
                INDEX idx_status (status),
                INDEX idx_ingested_at (ingested_at)
            );
        `;
        
        await this.client.execute(createTableSQL);
    }
    
    
    /**
     * Store new ingested items (batch processing)
     */
    async storeNewItems(items, config) {
        const newItems = [];
        
        for (const item of items) {
            const exists = await this.itemExists(item.content_hash);
            if (!exists) {
                await this.insertItem(item, config);
                newItems.push(item);
            }
        }
        
        return newItems;
    }
    
    /**
     * Check if source is new (no items exist for this source)
     */
    async isNewSource(config) {
        const [rows] = await this.client.execute(`
            SELECT COUNT(*) as count FROM ingested_content 
            WHERE source = ?
        `, [config.EXTERNAL_FEED_SOURCE]);
        
        return rows[0].count === 0;
    }
    
    /**
     * Insert item directly (used by drivers during ingestion)
     */
    async insertItemDirect(item, config) {
        const exists = await this.itemExists(item.content_hash, config.EXTERNAL_FEED_SOURCE);
        if (!exists) {
            await this.insertItem(item, config);
            return true; // Item was inserted
        }
        return false; // Item already exists
    }
    
    /**
     * Check if item exists by hash and source
     */
    async itemExists(contentHash, source) {
        const [rows] = await this.client.execute(
            'SELECT 1 FROM ingested_content WHERE content_hash = ? AND source = ?',
            [contentHash, source]
        );
        return rows.length > 0;
    }
    
    /**
     * Insert new item
     */
    async insertItem(item, config) {
        const itemData = {
            content_hash: item.content_hash,
            source: config.EXTERNAL_FEED_SOURCE,
            guid: item.guid,
            platform: config.EXTERNAL_FEED_PLATFORM,
            feed_type: config.EXTERNAL_FEED_TYPE,
            status: 'pending',
            metadata: item.metadata,
            full_content: item.fullContent || null,
            processed_data: null
        };
        
        await this.client.execute(`
            INSERT INTO ingested_content (content_hash, source, guid, platform, feed_type, metadata, full_content)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            itemData.content_hash,
            itemData.source,
            itemData.guid,
            itemData.platform,
            itemData.feed_type,
            JSON.stringify(itemData.metadata),
            itemData.full_content ? JSON.stringify(itemData.full_content) : null
        ]);
    }
    
    /**
     * Get pending items for feed generation
     */
    async getPendingItems(limit, config) {
        const [rows] = await this.client.execute(`
            SELECT * FROM ingested_content 
            WHERE source = ? AND status = 'pending'
            ORDER BY ingested_at ASC
            LIMIT ?
        `, [config.EXTERNAL_FEED_SOURCE, limit]);
        return rows;
    }
    
    /**
     * Update item status
     */
    async updateItemStatus(contentHash, source, status, skipReason = null, processedData = null) {
        const mysqlUpdate = status === 'published' 
            ? 'published_at = NOW()'
            : status === 'skipped' 
            ? 'skipped_at = NOW(), skip_reason = ?'
            : '';
            
        await this.client.execute(`
            UPDATE ingested_content 
            SET status = ?, ${mysqlUpdate}${processedData ? ', processed_data = ?' : ''}
            WHERE content_hash = ? AND source = ?
        `, processedData 
            ? [status, skipReason, JSON.stringify(processedData), contentHash, source]
            : [status, skipReason || contentHash, contentHash, source]
        );
    }
    
    /**
     * Get published items for feed (with moving window logic)
     */
    async getPublishedItems(maxItems, config) {
        const [rows] = await this.client.execute(`
            SELECT * FROM ingested_content 
            WHERE source = ? AND status = 'published'
            ORDER BY published_at ASC
            LIMIT ?
        `, [config.EXTERNAL_FEED_SOURCE, maxItems]);
        return rows;
    }
    
    /**
     * Get item by content hash and source (for fetching stored content)
     */
    async getItemByHash(contentHash, source) {
        const [rows] = await this.client.execute(`
            SELECT * FROM ingested_content WHERE content_hash = ? AND source = ?
        `, [contentHash, source]);
        
        return rows.length > 0 ? rows[0] : null;
    }
    
    
    /**
     * Close database connection
     */
    async close() {
        if (this.client) {
            await this.client.end();
            this.client = null;
        }
    }
}

module.exports = DatabaseManager;

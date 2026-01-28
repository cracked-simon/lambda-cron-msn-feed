const { safeLog } = require('./sensitive-data');

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
        safeLog(console.log, 'Connected to MySQL');
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
     * Check if source is new (no items exist for this source + platform + feed_type combination)
     */
    async isNewSource(config) {
        const [rows] = await this.client.execute(`
            SELECT COUNT(*) as count FROM ingested_content 
            WHERE source = ? AND platform = ? AND feed_type = ?
        `, [config.EXTERNAL_FEED_SOURCE, config.EXTERNAL_FEED_PLATFORM, config.EXTERNAL_FEED_TYPE]);
        
        return rows[0].count === 0;
    }
    
    /**
     * Insert item directly (used by drivers during ingestion)
     */
    async insertItemDirect(item, config) {
        const dbContent = await this.getItemByHash(item.content_hash, config.EXTERNAL_FEED_SOURCE);

        if (!dbContent) {
            await this.insertItem(item, config);
            return true; // Item was inserted
        } else {
            if (item.item_modified_at != dbContent.item_modified_at) {
                await this.updateItem(item, dbContent.item_modified_at == null ? dbContent.status : 'pending');
            }
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
            full_content: item.full_content || null,
            processed_data: null,
            item_published_at: item.item_published_at,
            item_modified_at: item.item_modified_at
        };
        
        await this.client.execute(`
            INSERT INTO ingested_content (
                content_hash, 
                source, 
                guid, 
                platform, 
                feed_type, 
                status, 
                metadata, 
                full_content,
                item_published_at,
                item_modified_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            itemData.content_hash,
            itemData.source,
            itemData.guid,
            itemData.platform,
            itemData.feed_type,
            itemData.status,
            JSON.stringify(itemData.metadata),
            itemData.full_content ? JSON.stringify(itemData.full_content) : null,
            itemData.item_published_at,
            itemData.item_modified_at
        ]);
    }

    /**
     * Updating an existing item which always puts it into pending
     */
    async updateItem(item, status) {  
        await this.client.execute(`
            UPDATE 
                ingested_content 
            SET
                metadata = ?,
                full_content = ?,
                item_published_at = ?,
                item_modified_at = ?,
                status = ?
            WHERE
                content_hash = ?
        `, [
            JSON.stringify(item.metadata),
            item.full_content ? JSON.stringify(item.full_content) : null,
            item.item_published_at,
            item.item_modified_at,     
            status,       
            item.content_hash
        ]);
    }
        
    
    /**
     * Get pending items for feed generation
     */
    async getPendingItems(limit, config) {
        const limitInt = parseInt(limit, 10);

        const [rows] = await this.client.execute(`
            SELECT * FROM ingested_content 
            WHERE source = ? AND status = 'pending' AND feed_type = ?
            ORDER BY ingested_at ASC
            LIMIT ${limitInt}
        `, [config.EXTERNAL_FEED_SOURCE, config.EXTERNAL_FEED_TYPE]);

        return rows;
    }
    
    /**
     * Update item status
     */
    async updateItemStatus(contentHash, source, status, skipReason = null, processedData = null) {
        let query = 'UPDATE ingested_content SET status = ?';
        let params = [status];
        
        if (status === 'published') {
            query += ', published_at = NOW()';
        } else if (status === 'skipped') {
            query += ', skipped_at = NOW(), skip_reason = ?';
            params.push(skipReason);
        }
        
        if (processedData) {
            query += ', processed_data = ?';
            params.push(JSON.stringify(processedData));
        }
        
        query += ' WHERE content_hash = ? AND source = ?';
        params.push(contentHash, source);
        
        await this.client.execute(query, params);
    }
    
    /**
     * Get published items for feed (with moving window logic)
     * @param {number} maxItems - Maximum number of items to return
     * @param {Object} config - Configuration object
     * @param {Array<string>} excludeContentHashes - Array of content hashes to exclude from results
     */
    async getPublishedItems(maxItems, config, excludeContentHashes = []) {
        const maxItemsInt = parseInt(maxItems, 10);
        
        let query = `
            SELECT * FROM ingested_content 
            WHERE source = ? AND status = 'published' AND feed_type = ?
        `;
        let params = [config.EXTERNAL_FEED_SOURCE, config.EXTERNAL_FEED_TYPE];

        safeLog(console.log, 'Exclude content hashes:', excludeContentHashes);
        
        // Add exclusion clause if content hashes are provided
        if (excludeContentHashes && excludeContentHashes.length > 0) {
            const placeholders = excludeContentHashes.map(() => '?').join(',');
            query += ` AND content_hash NOT IN (${placeholders})`;
            params.push(...excludeContentHashes);
        }
        
        query += ` ORDER BY item_published_at DESC LIMIT ${maxItemsInt}`;
        
        const [rows] = await this.client.execute(query, params);
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

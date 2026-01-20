/**
 * Migration: Add composite indexes for query optimization
 * Created: 2024-12-19
 * Description: Adds composite indexes to optimize getPendingItems and getPublishedItems queries
 *              to prevent "Out of sort memory" errors by allowing MySQL to use indexes for sorting
 */

const migration = {
    version: '002',
    description: 'Add composite indexes for query optimization to prevent sort buffer issues',
    
    /**
     * Apply the migration (add indexes)
     */
    async up(db) {
        // Index for getPendingItems query:
        // WHERE source = ? AND status = 'pending' AND feed_type = ? ORDER BY ingested_at ASC
        await db.execute(`
            CREATE INDEX idx_pending_items_query 
            ON ingested_content (source, status, feed_type, ingested_at)
        `);
        
        // Index for getPublishedItems query:
        // WHERE source = ? AND status = 'published' AND feed_type = ? ORDER BY published_at ASC
        await db.execute(`
            CREATE INDEX idx_published_items_query 
            ON ingested_content (source, status, feed_type, published_at)
        `);
        
        console.log('✅ Migration 002: Added composite indexes for query optimization');
    },
    
    /**
     * Rollback the migration (drop indexes)
     */
    async down(db) {
        await db.execute('DROP INDEX IF EXISTS idx_pending_items_query ON ingested_content');
        await db.execute('DROP INDEX IF EXISTS idx_published_items_query ON ingested_content');
        console.log('✅ Migration 002: Removed composite indexes');
    }
};

module.exports = migration;

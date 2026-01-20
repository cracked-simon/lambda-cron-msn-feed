-- Migration: Add composite indexes for query optimization
-- Created: 2024-12-19
-- Description: Adds composite indexes to optimize getPendingItems and getPublishedItems queries
--              to prevent "Out of sort memory" errors by allowing MySQL to use indexes for sorting

-- Index for getPendingItems query:
-- WHERE source = ? AND status = 'pending' AND feed_type = ? ORDER BY ingested_at ASC
CREATE INDEX idx_pending_items_query 
ON ingested_content (source, status, feed_type, ingested_at);

-- Index for getPublishedItems query:
-- WHERE source = ? AND status = 'published' AND feed_type = ? ORDER BY published_at ASC
CREATE INDEX idx_published_items_query 
ON ingested_content (source, status, feed_type, published_at);

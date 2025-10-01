# Database Migrations

This directory contains database migration files for the lambda-cron-msn-feed project.

## Overview

The migrations manage the database schema for storing and processing RSS feed content that gets converted to MSN format.

## Migration Files

- `001_create_ingested_content_table.js` - Creates the main table for storing ingested RSS content
- `001_create_ingested_content_table.sql` - SQL-only version of the same migration

## Usage

### Prerequisites

Make sure you have the required environment variables set in your `.env` file:

```bash
DB_HOST=your_database_host
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_SSL=false
```

### Running Migrations

```bash
# Show current migration status
node migrations/migrate.js status

# Apply all pending migrations
node migrations/migrate.js up

# Apply migrations up to a specific version
node migrations/migrate.js up 001

# Rollback all migrations
node migrations/migrate.js down

# Rollback migrations down to a specific version
node migrations/migrate.js down 001
```

### Manual SQL Execution

If you prefer to run the SQL directly:

```bash
# Connect to your MySQL database and run:
mysql -h your_host -u your_user -p your_database < migrations/001_create_ingested_content_table.sql
```

## Table Schema

### ingested_content

The main table that stores RSS feed content with processing status:

| Column | Type | Description |
|--------|------|-------------|
| id | INT AUTO_INCREMENT | Primary key |
| content_hash | VARCHAR(64) | SHA-256 hash for deduplication |
| source | VARCHAR(100) | Source identifier (e.g., denofgeeks-articles) |
| guid | VARCHAR(255) | Original RSS GUID |
| platform | VARCHAR(50) | Platform type (e.g., wordpress) |
| feed_type | VARCHAR(50) | Feed type (e.g., articles, slideshows) |
| status | VARCHAR(20) | Processing status: pending, published, skipped |
| ingested_at | TIMESTAMP | When content was first ingested |
| published_at | TIMESTAMP | When content was published to feed |
| skipped_at | TIMESTAMP | When content was skipped |
| skip_reason | VARCHAR(255) | Reason for skipping |
| metadata | JSON | Original RSS item metadata |
| full_content | JSON | Full content from source |
| processed_data | JSON | Processed content for MSN format |

### Indexes

- `unique_content_source` - Ensures no duplicate content per source
- `idx_content_hash` - Fast lookup by content hash
- `idx_source` - Fast filtering by source
- `idx_status` - Fast filtering by processing status
- `idx_ingested_at` - Sorting by ingestion time
- `idx_published_at` - Sorting by publication time
- `idx_platform_feed_type` - Filtering by platform and feed type
- `idx_status_source` - Combined status and source filtering
- `idx_ingested_at_status` - Combined ingestion time and status filtering

## Creating New Migrations

1. Create a new migration file: `XXX_description.js`
2. Follow the existing pattern with `up()` and `down()` methods
3. Use the migration runner to apply the changes

Example migration structure:

```javascript
const migration = {
    version: '002',
    description: 'Add new column to ingested_content',
    
    async up(db) {
        await db.execute('ALTER TABLE ingested_content ADD COLUMN new_field VARCHAR(100)');
    },
    
    async down(db) {
        await db.execute('ALTER TABLE ingested_content DROP COLUMN new_field');
    }
};

module.exports = migration;
```

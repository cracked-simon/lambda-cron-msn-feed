#!/usr/bin/env node

/**
 * Migration runner for lambda-cron-msn-feed
 * Usage: node migrate.js [up|down] [version]
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class MigrationRunner {
    constructor() {
        this.db = null;
        this.migrationsPath = __dirname;
    }
    
    /**
     * Connect to database
     */
    async connect() {
        this.db = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true'
        });
        
        // Create migrations tracking table
        await this.createMigrationsTable();
    }
    
    /**
     * Create migrations tracking table
     */
    async createMigrationsTable() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version VARCHAR(10) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_version (version)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;
        
        await this.db.execute(createTableSQL);
    }
    
    /**
     * Get list of migration files
     */
    getMigrationFiles() {
        return fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.js') && file !== 'migrate.js')
            .sort();
    }
    
    /**
     * Get applied migrations
     */
    async getAppliedMigrations() {
        const [rows] = await this.db.execute('SELECT version FROM migrations ORDER BY version');
        return rows.map(row => row.version);
    }
    
    /**
     * Load migration module
     */
    loadMigration(filename) {
        const filepath = path.join(this.migrationsPath, filename);
        return require(filepath);
    }
    
    /**
     * Run migrations up
     */
    async up(targetVersion = null) {
        const migrationFiles = this.getMigrationFiles();
        const appliedMigrations = await this.getAppliedMigrations();
        
        console.log('🔄 Running migrations...');
        
        for (const filename of migrationFiles) {
            const version = filename.split('_')[0];
            
            // Skip if already applied
            if (appliedMigrations.includes(version)) {
                console.log(`⏭️  Migration ${version} already applied`);
                continue;
            }
            
            // Stop if we've reached the target version
            if (targetVersion && version > targetVersion) {
                break;
            }
            
            try {
                console.log(`🚀 Applying migration ${version}...`);
                const migration = this.loadMigration(filename);
                
                await migration.up(this.db);
                
                // Record migration as applied
                await this.db.execute(
                    'INSERT INTO migrations (version, description) VALUES (?, ?)',
                    [version, migration.description]
                );
                
                console.log(`✅ Migration ${version} applied successfully`);
                
            } catch (error) {
                console.error(`❌ Migration ${version} failed:`, error.message);
                throw error;
            }
        }
        
        console.log('✅ All migrations completed');
    }
    
    /**
     * Run migrations down
     */
    async down(targetVersion = null) {
        const appliedMigrations = await this.getAppliedMigrations();
        
        if (appliedMigrations.length === 0) {
            console.log('ℹ️  No migrations to rollback');
            return;
        }
        
        console.log('🔄 Rolling back migrations...');
        
        // Rollback in reverse order
        const migrationsToRollback = targetVersion 
            ? appliedMigrations.filter(v => v >= targetVersion).reverse()
            : appliedMigrations.reverse();
        
        for (const version of migrationsToRollback) {
            try {
                console.log(`🚀 Rolling back migration ${version}...`);
                
                // Find the migration file
                const migrationFiles = this.getMigrationFiles();
                const filename = migrationFiles.find(f => f.startsWith(version));
                
                if (!filename) {
                    console.error(`❌ Migration file for version ${version} not found`);
                    continue;
                }
                
                const migration = this.loadMigration(filename);
                
                await migration.down(this.db);
                
                // Remove migration record
                await this.db.execute('DELETE FROM migrations WHERE version = ?', [version]);
                
                console.log(`✅ Migration ${version} rolled back successfully`);
                
            } catch (error) {
                console.error(`❌ Rollback of migration ${version} failed:`, error.message);
                throw error;
            }
        }
        
        console.log('✅ All rollbacks completed');
    }
    
    /**
     * Show migration status
     */
    async status() {
        const migrationFiles = this.getMigrationFiles();
        const appliedMigrations = await this.getAppliedMigrations();
        
        console.log('📊 Migration Status:');
        console.log('==================');
        
        for (const filename of migrationFiles) {
            const version = filename.split('_')[0];
            const status = appliedMigrations.includes(version) ? '✅ Applied' : '⏳ Pending';
            console.log(`${version}: ${status}`);
        }
    }
    
    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            await this.db.end();
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    const targetVersion = args[1];
    
    const runner = new MigrationRunner();
    
    try {
        await runner.connect();
        
        switch (command) {
            case 'up':
                await runner.up(targetVersion);
                break;
            case 'down':
                await runner.down(targetVersion);
                break;
            case 'status':
                await runner.status();
                break;
            default:
                console.log('Usage: node migrate.js [up|down|status] [version]');
                console.log('  up [version]    - Apply migrations up to version (or all)');
                console.log('  down [version]  - Rollback migrations down to version (or all)');
                console.log('  status          - Show migration status');
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await runner.close();
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = MigrationRunner;

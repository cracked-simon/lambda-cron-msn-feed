const fs = require('fs').promises;
const path = require('path');

/**
 * Logging utility for EC2 deployment
 * Provides structured logging with file output and console output
 */
class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.logFile = options.logFile || null;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile !== false;
        
        // Create logs directory if it doesn't exist
        if (this.enableFile && !this.logFile) {
            this.logFile = path.join(__dirname, '..', 'logs', 'feed-converter.log');
        }
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }
    
    /**
     * Log a message with specified level
     */
    log(level, message, ...args) {
        if (this.levels[level] > this.levels[this.logLevel]) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            args: args.length > 0 ? args : undefined
        };
        
        const formattedMessage = this.formatMessage(logEntry);
        
        // Console output
        if (this.enableConsole) {
            this.logToConsole(level, formattedMessage);
        }
        
        // File output
        if (this.enableFile && this.logFile) {
            this.logToFile(formattedMessage);
        }
    }
    
    /**
     * Format log message for output
     */
    formatMessage(logEntry) {
        let message = `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}`;
        
        if (logEntry.args) {
            message += ' ' + logEntry.args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
        }
        
        return message;
    }
    
    /**
     * Log to console with appropriate colors
     */
    logToConsole(level, message) {
        const colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[90m'  // Gray
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || '';
        
        console.log(`${color}${message}${reset}`);
    }
    
    /**
     * Log to file (async)
     */
    async logToFile(message) {
        try {
            // Ensure logs directory exists
            const logDir = path.dirname(this.logFile);
            await fs.mkdir(logDir, { recursive: true });
            
            // Append to log file
            await fs.appendFile(this.logFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    /**
     * Log levels
     */
    error(message, ...args) {
        this.log('error', message, ...args);
    }
    
    warn(message, ...args) {
        this.log('warn', message, ...args);
    }
    
    info(message, ...args) {
        this.log('info', message, ...args);
    }
    
    debug(message, ...args) {
        this.log('debug', message, ...args);
    }
    
    /**
     * Log application startup
     */
    startup(config) {
        this.info('🚀 RSS-to-MSN Feed Converter Starting');
        this.info('Configuration:', {
            source: config.EXTERNAL_FEED_SOURCE,
            platform: config.EXTERNAL_FEED_PLATFORM,
            type: config.EXTERNAL_FEED_TYPE,
            url: config.EXTERNAL_FEED_URL,
            output: config.FEED_FILE_NAME
        });
    }
    
    /**
     * Log application shutdown
     */
    shutdown(result = null) {
        if (result) {
            this.info('✅ Application completed successfully');
            this.info('Results:', result);
        } else {
            this.info('🛑 Application shutting down');
        }
    }
    
    /**
     * Log performance metrics
     */
    performance(operation, duration, details = {}) {
        this.info(`⏱️  Performance: ${operation} completed in ${duration}ms`, details);
    }
    
    /**
     * Log database operations
     */
    database(operation, details = {}) {
        this.debug(`🗄️  Database: ${operation}`, details);
    }
    
    /**
     * Log feed processing steps
     */
    feedProcessing(step, details = {}) {
        this.info(`📰 Feed Processing: ${step}`, details);
    }
}

// Create default logger instance
const logger = new Logger({
    logLevel: process.env.LOG_LEVEL || 'info',
    enableConsole: true,
    enableFile: process.env.NODE_ENV !== 'test'
});

module.exports = logger;

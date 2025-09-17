# RSS-to-MSN Feed Converter - EC2 Deployment

This application converts RSS feeds into MSN-compliant feeds and runs on EC2 instances with cron scheduling.

## 🚀 Quick Start

### 1. Deploy via Jenkins

Deploy using your Jenkins pipeline to handle the deployment process.

### 2. Configure Environment

```bash
# Edit the environment file
sudo nano /opt/feed-converter/.env

# Update with your actual values:
# - Database connection details
# - AWS credentials
# - Feed URLs and settings
```

### 3. Test the Application

```bash
# Test with specific config
sudo -u feedconverter node /opt/feed-converter/index.js configs/denofgeeks-articles.json
```

## ⚙️ Configuration

### Environment Variables vs Config Files

The application supports two levels of configuration:

1. **Environment Variables** (`.env` file): Global defaults for all feeds
2. **Config Files** (`configs/*.json`): Site-specific overrides

### Site-Specific Configuration

Each config file can override any environment variable, including:
- `WP_API_TOKEN` - WordPress API token (site-specific)
- `EXTERNAL_FEED_URL` - Source website URL
- `EXTERNAL_FEED_SOURCE` - Unique identifier for this source
- `EXTERNAL_FEED_TYPE` - Content type (article/slideshow)
- `FEED_FILE_NAME` - Output XML filename
- `FEED_ITEMS_PER_RUN` - Number of items to process per run
- `FEED_MAX_TOTAL_ITEMS` - Maximum items in the feed
- And any other environment variable
`
### Example Config File

```json
{
  "name": "My Site - Articles",
  "description": "Configuration for my site's article feed",
  "overrides": {
    "EXTERNAL_FEED_URL": "https://mysite.com",
    "EXTERNAL_FEED_SOURCE": "mysite",
    "EXTERNAL_FEED_TYPE": "article",
    "FEED_FILE_NAME": "mysite-articles.xml",
    "WP_API_TOKEN": "my-site-specific-api-token",
    "WP_API_POSTS_FILTER": "topic",
    "WP_API_POSTS_FILTER_VALUE": "msn_article",
    "SITE_NAME": "My Site",
    "FEED_ITEMS_PER_RUN": 5,
    "FEED_MAX_TOTAL_ITEMS": 20
  }
}
```

### 4. Set Up Cron Jobs

```bash
# Edit crontab to add scheduled jobs
sudo crontab -e

# Add entries like this:
# Run every 4 hours
0 */4 * * * /opt/feed-converter/run-feed-converter.sh denofgeeks-articles.json

# Run twice daily (2 AM and 2 PM)
0 2,14 * * * /opt/feed-converter/run-feed-converter.sh denofgeeks-slideshows.json

# View current cron jobs
sudo crontab -l
```

## 📁 Directory Structure

```
/opt/feed-converter/
├── app.js                 # Main application
├── configs/               # Configuration files
│   ├── denofgeeks-articles.json
│   ├── denofgeeks-slideshows.json
│   └── techcrunch-articles.json
├── drivers/               # Feed drivers
├── utils/                 # Utility modules
├── logs/                  # Application logs
└── .env                   # Environment variables

/var/log/feed-converter/
└── cron.log              # Cron execution logs
```

## ⚙️ Configuration

### Environment Variables

Copy `env.example` to `.env` and configure:

```bash
# Feed Configuration
EXTERNAL_FEED_URL=https://your-wordpress-site.com
EXTERNAL_FEED_PLATFORM=wordpress
EXTERNAL_FEED_TYPE=article
EXTERNAL_FEED_SOURCE=denofgeeks
FEED_FILE_NAME=msn-feed.xml

# Database Configuration
DB_HOST=your-mysql-host
DB_PORT=3306
DB_NAME=msn_feed_db
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password

# AWS Configuration
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
CLOUDFRONT_DISTRIBUTION_ID=your-distribution-id

# WordPress API
WP_API_TOKEN=your-wordpress-api-token
WP_API_POSTS_FILTER=topic
WP_API_POSTS_FILTER_VALUE=msn_article
```

### Configuration Files

Create JSON files in `configs/` to override environment variables:

```json
{
  "name": "Den of Geeks - Articles",
  "description": "Configuration for Den of Geeks article feed",
  "overrides": {
    "EXTERNAL_FEED_URL": "https://www.denofgeek.com",
    "EXTERNAL_FEED_SOURCE": "denofgeeks",
    "EXTERNAL_FEED_TYPE": "article",
    "FEED_FILE_NAME": "denofgeeks-articles.xml",
    "WP_API_POSTS_FILTER_VALUE": "msn_article",
    "SITE_NAME": "Den of Geek",
    "FEED_ITEMS_PER_RUN": 3,
    "FEED_MAX_TOTAL_ITEMS": 15
  }
}
```

## 🕒 Cron Scheduling

### Common Schedules

```bash
# Every 4 hours
'0 */4 * * *'

# Twice daily (2 AM and 2 PM)
'0 2,14 * * *'

# Daily at 6 AM
'0 6 * * *'

# Every 30 minutes
'*/30 * * * *'
```

### Managing Cron Jobs

```bash
# View current cron jobs
sudo crontab -l

# Edit cron jobs
sudo crontab -e

# Remove all cron jobs (if needed)
sudo crontab -r

# Common schedule formats:
# Every 4 hours: 0 */4 * * *
# Twice daily: 0 2,14 * * *
# Daily at 6 AM: 0 6 * * *
# Every 30 minutes: */30 * * * *
```

## 📊 Monitoring

### View Logs

```bash
# Application logs
tail -f /opt/feed-converter/logs/feed-converter.log

# Cron execution logs
tail -f /var/log/feed-converter/cron.log

# System logs
journalctl -u feed-converter -f
```

### Check Status

```bash
# Manual test run with specific config
sudo -u feedconverter node /opt/feed-converter/index.js configs/denofgeeks-articles.json
```

## 🔧 Maintenance

### Update Application

```bash
# Update files via Jenkins deployment
# Jenkins will handle:
# - Stopping services
# - Updating files
# - Installing dependencies
# - Restarting services
```

### Database Maintenance

```bash
# Connect to database
mysql -h your-host -u your-user -p your-database

# Check ingested content
SELECT source, status, COUNT(*) FROM ingested_content GROUP BY source, status;

# Clean up old skipped items (optional)
DELETE FROM ingested_content WHERE status = 'skipped' AND skipped_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check database credentials in `.env`
   - Ensure MySQL server is running and accessible
   - Verify firewall rules

2. **AWS Credentials Error**
   - Check AWS credentials in environment or IAM role
   - Verify S3 bucket permissions
   - Check CloudFront distribution ID

3. **WordPress API Error**
   - Verify WordPress API token
   - Check filter parameters
   - Ensure WordPress site is accessible

4. **Cron Job Not Running**
   - Check cron service: `sudo systemctl status cron`
   - Verify cron job syntax: `sudo crontab -l`
   - Check cron logs: `tail -f /var/log/feed-converter/cron.log`

### Debug Mode

```bash
# Run with debug logging
sudo -u feedconverter LOG_LEVEL=debug node /opt/feed-converter/index.js configs/denofgeeks-articles.json
```

## 📈 Performance

### Optimization Tips

1. **Database Indexing**: Ensure proper indexes on `content_hash`, `source`, and `status` columns
2. **Batch Processing**: Adjust `FEED_ITEMS_PER_RUN` based on your needs
3. **Memory Usage**: Monitor memory usage during large ingestion runs
4. **Log Rotation**: Logs are automatically rotated daily

### Scaling

- **Multiple Sources**: Each source runs independently
- **Multiple Configs**: Different configs can run on different schedules
- **Database Load**: Monitor database performance with multiple concurrent runs
- **AWS Limits**: Be aware of S3 and CloudFront rate limits

## 🔒 Security

- Application runs as non-root user (`feedconverter`)
- Database credentials stored in environment variables
- AWS credentials via IAM roles (recommended)
- Log files have restricted permissions
- Cron jobs run with minimal privileges

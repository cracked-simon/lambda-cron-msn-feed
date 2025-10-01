const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const { safeLog } = require('./sensitive-data');

/**
 * Upload content to S3 bucket
 * @param {string} bucketName - S3 bucket name
 * @param {string} fileName - File name/key in S3
 * @param {string} content - Content to upload
 * @param {string} region - AWS region
 * @param {string} folderName - S3 folder name (optional)
 * @returns {Promise<Object>} S3 upload result
 */
async function uploadToS3(bucketName, fileName, content, region = 'us-east-1', folderName = '') {
    try {
        // Configure AWS SDK
        AWS.config.update({ region });
        const s3 = new AWS.S3();
        
        // Construct the full S3 key with folder
        const s3Key = folderName ? `${folderName}/${fileName}` : fileName;
        
        const params = {
            Bucket: bucketName,
            Key: s3Key,
            Body: content,
            ContentType: 'application/xml',
            CacheControl: 'max-age=3600', // Cache for 1 hour
            Metadata: {
                'processed-by': 'rss-to-msn-feed-converter',
                'processed-at': new Date().toISOString()
            }
        };
        
        safeLog(console.log, `Uploading to S3: s3://${bucketName}/${s3Key}`);
        const result = await s3.upload(params).promise();
        
        return result;
        
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new Error(`S3 upload failed: ${error.message}`);
    }
}

/**
 * Save content to local file
 * @param {string} fileName - File name
 * @param {string} content - Content to save
 * @returns {Promise<Object>} File save result
 */
async function saveToFile(fileName, content) {
    try {
        // Ensure feed directory exists relative to project root (where index.js is located)
        const projectRoot = path.dirname(require.main.filename);
        const feedDir = path.join(projectRoot, 'feed');
        await fs.mkdir(feedDir, { recursive: true });
        
        const filePath = path.join(feedDir, fileName);
        
        safeLog(console.log, `Saving to file: ${filePath}`);
        await fs.writeFile(filePath, content, 'utf8');
        
        return {
            Location: filePath,
            message: 'File saved successfully'
        };
        
    } catch (error) {
        console.error('Error saving to file:', error);
        throw new Error(`File save failed: ${error.message}`);
    }
}

/**
 * Invalidate CloudFront distribution
 * @param {string} distributionId - CloudFront distribution ID
 * @param {string} path - Path to invalidate (e.g., '/feed.xml')
 * @param {string} region - AWS region
 * @returns {Promise<Object>} CloudFront invalidation result
 */
async function invalidateCloudFront(distributionId, path, region = 'us-east-1') {
    try {
        // Configure AWS SDK
        AWS.config.update({ region });
        const cloudfront = new AWS.CloudFront();
        
        const params = {
            DistributionId: distributionId,
            InvalidationBatch: {
                CallerReference: `rss-to-msn-${Date.now()}`,
                Paths: {
                    Quantity: 1,
                    Items: [path]
                }
            }
        };
        
        safeLog(console.log, `Invalidating CloudFront: ${distributionId} - ${path}`);
        const result = await cloudfront.createInvalidation(params).promise();
        
        return result;
        
    } catch (error) {
        console.error('Error invalidating CloudFront:', error);
        throw new Error(`CloudFront invalidation failed: ${error.message}`);
    }
}

/**
 * Test AWS credentials and permissions
 * @param {string} bucketName - S3 bucket name to test
 * @param {string} region - AWS region
 * @returns {Promise<boolean>} True if credentials are valid
 */
async function testAWSCredentials(bucketName, region = 'us-east-1') {
    try {
        AWS.config.update({ region });
        const s3 = new AWS.S3();
        
        // Try to list objects in the bucket
        await s3.headBucket({ Bucket: bucketName }).promise();
        safeLog(console.log, `AWS credentials valid - can access bucket: ${bucketName}`);
        return true;
        
    } catch (error) {
        console.error('AWS credentials test failed:', error.message);
        return false;
    }
}

module.exports = {
    uploadToS3,
    saveToFile,
    invalidateCloudFront,
    testAWSCredentials
};

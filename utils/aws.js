const AWS = require('aws-sdk');

/**
 * Upload content to S3 bucket
 * @param {string} bucketName - S3 bucket name
 * @param {string} fileName - File name/key in S3
 * @param {string} content - Content to upload
 * @param {string} region - AWS region
 * @returns {Promise<Object>} S3 upload result
 */
async function uploadToS3(bucketName, fileName, content, region = 'us-east-1') {
    try {
        // Configure AWS SDK
        AWS.config.update({ region });
        const s3 = new AWS.S3();
        
        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: content,
            ContentType: 'application/xml',
            CacheControl: 'max-age=3600', // Cache for 1 hour
            Metadata: {
                'processed-by': 'rss-to-msn-feed-converter',
                'processed-at': new Date().toISOString()
            }
        };
        
        console.log(`Uploading to S3: s3://${bucketName}/${fileName}`);
        const result = await s3.upload(params).promise();
        
        return result;
        
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new Error(`S3 upload failed: ${error.message}`);
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
        
        console.log(`Invalidating CloudFront: ${distributionId} - ${path}`);
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
        console.log(`AWS credentials valid - can access bucket: ${bucketName}`);
        return true;
        
    } catch (error) {
        console.error('AWS credentials test failed:', error.message);
        return false;
    }
}

module.exports = {
    uploadToS3,
    invalidateCloudFront,
    testAWSCredentials
};

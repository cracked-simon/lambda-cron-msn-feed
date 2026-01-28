const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

/**
 * Send a profanity alert to Slack
 * @param {string} webhookUrl - Slack webhook URL
 * @param {Object} options - Alert options
 * @param {string} options.title - Item title
 * @param {string} options.link - Item link
 * @param {Array<string>} options.flaggedWords - Array of flagged profanity words
 * @param {string} options.source - Feed source name
 * @returns {Promise<void>}
 */
async function sendProfanityAlert(webhookUrl, { title, link, flaggedWords, source }) {
    if (!webhookUrl) {
        logger.warn('Slack webhook URL not configured, skipping notification');
        return;
    }

    const message = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🚨 Profanity Detected",
                    emoji: true
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Source:*\n${source || 'Unknown'}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Flagged Words:*\n${flaggedWords.join(', ')}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Title:*\n${title}`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Link:*\n<${link}|View Item>`
                }
            }
        ]
    };

    return sendSlackMessage(webhookUrl, message);
}

/**
 * Send a message to Slack webhook
 * @param {string} webhookUrl - Slack webhook URL
 * @param {Object} payload - Slack message payload
 * @returns {Promise<void>}
 */
function sendSlackMessage(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(webhookUrl);
            const protocol = url.protocol === 'https:' ? https : http;
            const postData = JSON.stringify(payload);

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = protocol.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        logger.info('Slack notification sent successfully');
                        resolve();
                    } else {
                        logger.error(`Slack notification failed: ${res.statusCode} - ${responseData}`);
                        reject(new Error(`Slack API returned ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                logger.error('Error sending Slack notification:', error.message);
                reject(error);
            });

            req.write(postData);
            req.end();

        } catch (error) {
            logger.error('Error preparing Slack notification:', error.message);
            reject(error);
        }
    });
}

module.exports = {
    sendProfanityAlert,
    sendSlackMessage
};

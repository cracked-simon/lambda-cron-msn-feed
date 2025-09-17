# Project: RSS-to-MSN Feed Converter Lambda

This project implements a generic AWS Lambda function designed to convert RSS feeds into MSN-compliant feeds. The function is structured with pluggable drivers for different feed types, making it extensible for future sources. For now, the focus is on **WordPress feeds**.

## Technology Stack

- **Runtime**: Node.js
- **Platform**: AWS Lambda
- **Storage**: Amazon S3
- **CDN**: CloudFront

---

## Environment Variables

- **`external_feed_url`** – The source RSS feed URL  
- **`feed_type`** – The type of feed to process (currently supports `wordpress`)  
- **`feed_file_name`** – The target file name used when saving the completed MSN feed to S3  

---

## Requirements & Functionality

1. **Profanity Filtering**  
   - Downloads a profanity list from:  
     `https://raw.githubusercontent.com/cracked-simon/literally-profanity/refs/heads/main/final-list.json`  
   - Each post in the feed is checked against this list  
   - Any post containing profanity is excluded from the final feed  

2. **Feed Transformation**  
   - Converts the external feed (WordPress) into MSN-specific XML format  
   - Uses a driver architecture to allow future support for other feed types  

3. **S3 Storage**  
   - Saves the completed, profanity-filtered MSN feed as an object in S3  
   - File is stored using the configured `feed_file_name`  

4. **CloudFront Invalidation**  
   - Automatically clears the CloudFront path for the feed  
   - Ensures that consumers always see the latest version without caching delays  

---

## Future Extensions

- Support for additional feed types (e.g., Medium, Blogger, custom XML)  
- Configurable profanity filtering modes (exclude vs. redact)  
- Enhanced monitoring/metrics (e.g., number of posts filtered, processing duration)  

/**
 * Enhanced Blog Data Processing for Azure AI Search
 * 
 * This module provides enhanced content processing capabilities including:
 * - Advanced text cleaning and extraction
 * - Keyword extraction and analysis
 * - Improved metadata extraction
 * - Better content categorization
 * - Support for semantic search features
 */

const path = require('path');
const fs = require('fs');
const matter = require('gray-matter');

// Remove complex dependencies that might be causing issues
// const removeMd = require('remove-markdown');
// const cheerio = require('cheerio');
// const natural = require('natural');
// const stopword = require('stopword');
// const _ = require('lodash');

/**
 * Enhanced content processor with advanced text analysis
 */
class BlogDataProcessor {
    constructor() {
        // Remove complex NLP initialization
        // this.stemmer = natural.PorterStemmer;
        // this.tokenizer = new natural.WordTokenizer();
        // this.TfIdf = natural.TfIdf;
        
        // Content processing configuration
        this.config = {
            maxDescriptionLength: 200,
            maxKeywords: 10,
            minKeywordLength: 3,
            maxContentLength: 50000, // For search index limits
            extractCodeBlocks: false, // Disabled for performance
            calculateReadingTime: true
        };
    }

    /**
     * Clean and extract text content from markdown (optimized for performance)
     * @param {string} content - Raw markdown content
     * @returns {string} Cleaned text content
     */
    cleanContent(content) {
        try {
            // Quick and simple cleaning for better performance
            let cleaned = content
                .replace(/<[^>]+>/g, ' ')           // Remove HTML tags
                .replace(/```[\s\S]*?```/g, ' ')    // Remove code blocks
                .replace(/`[^`]*`/g, ' ')           // Remove inline code
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert links to text
                .replace(/[#*_~`]/g, ' ')           // Remove markdown syntax
                .replace(/https?:\/\/[^\s]+/g, '')  // Remove URLs
                .replace(/\S+@\S+\.\S+/g, '')       // Remove email addresses
                .replace(/\s+/g, ' ')               // Normalize whitespace
                .trim();
            
            return cleaned;
        } catch (error) {
            console.warn(`Error cleaning content: ${error.message}`);
            return content.substring(0, 1000); // Fallback to first 1000 chars
        }
    }

    /**
     * Extract code blocks from markdown content
     * @param {string} content - Raw markdown content
     * @returns {Array} Array of code blocks with language info
     */
    extractCodeBlocks(content) {
        const codeBlocks = [];
        const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        
        while ((match = codeRegex.exec(content)) !== null) {
            codeBlocks.push({
                language: match[1] || 'text',
                code: match[2].trim()
            });
        }
        
        return codeBlocks;
    }

    /**
     * Extract keywords using simple frequency analysis (optimized for performance)
     * @param {string} content - Cleaned text content
     * @param {string} title - Post title
     * @returns {Array} Array of relevant keywords
     */
    extractKeywords(content, title) {
        try {
            // Simple keyword extraction for better performance
            const combinedText = `${title} ${title} ${content}`.toLowerCase();
            
            // Simple tokenization and filtering
            const words = combinedText
                .replace(/[^a-zA-Z\s-]/g, ' ')
                .split(/\s+/)
                .filter(word => 
                    word.length >= this.config.minKeywordLength && 
                    word.length <= 20 && // Add max length to prevent very long strings
                    !/^\d+$/.test(word)
                );
            
            // Remove common stop words (simplified list)
            const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cannot', 'this', 'that', 'these', 'those', 'a', 'an']);
            
            const filteredWords = words.filter(word => !stopWords.has(word));
            
            // Calculate frequency
            const frequency = {};
            filteredWords.forEach(word => {
                frequency[word] = (frequency[word] || 0) + 1;
            });
            
            // Return top keywords
            return Object.entries(frequency)
                .sort(([,a], [,b]) => b - a)
                .slice(0, this.config.maxKeywords)
                .map(([word]) => word);
        } catch (error) {
            console.warn(`Error extracting keywords: ${error.message}`);
            return [];
        }
    }

    /**
     * Calculate estimated reading time
     * @param {string} content - Text content
     * @returns {number} Reading time in minutes
     */
    calculateReadingTime(content) {
        const wordsPerMinute = 200;
        const wordCount = content.split(/\s+/).length;
        return Math.ceil(wordCount / wordsPerMinute);
    }

    /**
     * Extract and analyze post metadata (simplified for performance)
     * @param {string} filename - Post filename
     * @param {Object} frontMatter - Jekyll front matter
     * @param {string} content - Post content
     * @returns {Object} Enhanced metadata
     */
    processMetadata(filename, frontMatter, content) {
        try {
            // Enhanced date extraction logic
            let postDate;

            // 1. Prioritize date from front matter
            if (frontMatter.date) {
                postDate = new Date(frontMatter.date);
                if (isNaN(postDate.getTime())) {
                    console.warn(`⚠️  Invalid date in front matter for ${filename}.`);
                    postDate = null; // Invalidate to trigger fallback
                }
            }

            // 2. Fallback to filename if front matter date is missing or invalid
            if (!postDate) {
                const dateString = filename.substr(0, 10);
                const dateMatch = dateString.match(/^\d{4}-\d{2}-\d{2}$/);
                
                if (dateMatch) {
                    const parsedDate = new Date(dateString);
                    if (!isNaN(parsedDate.getTime())) {
                        postDate = parsedDate;
                    } else {
                        console.warn(`⚠️  Invalid date string in filename: ${filename}`);
                    }
                }
            }

            // 3. As a last resort, use current date if no valid date is found
            if (!postDate) {
                console.warn(`⚠️  No valid date found for ${filename}, using current date as fallback.`);
                postDate = new Date();
            }
            
            const cleanContent = this.cleanContent(content);
            
            // Skip complex processing for now to avoid performance issues
            const languages = (frontMatter.tags || []).filter(tag => 
                ['javascript', 'python', 'java', 'c#', 'php', 'ruby', 'go', 'rust', 'typescript', 'nodejs'].includes(tag.toLowerCase())
            );

            // Generate SEO-friendly URL
            const urlSlug = filename.trim()
                .replace(/\s+/g, '-')
                .replace(/\.[^/.]+$/, '')
                .slice(11); // Remove date prefix
            
            const permalink = `${filename.substr(0, 4)}/${filename.substr(5, 2)}/${filename.substr(8, 2)}/${urlSlug}/index.html`;

            return {
                id: filename.trim().replace(/\s+/g, '-').replace(/\.[^/.]+$/, "").replace(/[^\w-]/g, ''),
                title: (frontMatter.title || '').trim(),
                author: frontMatter.author_name || frontMatter.author || 'Azure OSS Developer Support',
                tags: [...(frontMatter.tags || []), ...this.extractKeywords(cleanContent, frontMatter.title || '')],
                categories: frontMatter.categories || [],
                languages: languages,
                description: cleanContent.substring(0, this.config.maxDescriptionLength),
                content: cleanContent.substring(0, this.config.maxContentLength),
                url: `/${permalink}`,
                absoluteUrl: `https://azureossd.github.io/${permalink}`,
                pubDate: postDate,
                lastModified: postDate, // Could be enhanced with git info
                readingTime: this.config.calculateReadingTime ? this.calculateReadingTime(cleanContent) : null,
                wordCount: cleanContent.split(/\s+/).length,
                hasCodeBlocks: false, // Simplified for performance
                codeBlockCount: 0, // Simplified for performance
                searchScore: 1.0, // Base score, can be enhanced with popularity metrics
                '@search.action': 'mergeOrUpload'
            };
        } catch (error) {
            console.error(`Error processing metadata for ${filename}:`, error.message);
            // Return minimal valid object
            return {
                id: filename.replace(/\.[^/.]+$/, ""),
                title: frontMatter.title || filename,
                content: content.substring(0, 1000),
                description: content.substring(0, 200),
                pubDate: new Date(),
                url: `/${filename}`,
                '@search.action': 'mergeOrUpload'
            };
        }
    }

    /**
     * Process all blog posts and return enhanced search documents
     * @returns {Array} Array of processed blog post documents
     */
    getAll() {
        const postDir = path.join(__dirname, '..', '_posts');
        
        if (!fs.existsSync(postDir)) {
            console.warn(`⚠️  Posts directory not found: ${postDir}`);
            return [];
        }

        const posts = [];
        const allFiles = fs.readdirSync(postDir);
        
        console.log(`📁 Processing ${allFiles.length} files from ${postDir}`);
        
        let processedCount = 0;
        allFiles.forEach((filename, index) => {
            if (index % 50 === 0) {
                console.log(`  📊 Progress: ${index}/${allFiles.length} files processed`);
            }
            
            // Skip non-markdown files and templates
            if ((!filename.endsWith('.markdown') && !filename.endsWith('.md')) || 
                filename.includes('YYYY-MM-DD-Your-Article-Title') ||
                filename.includes('template')) {
                return;
            }

            // Skip files that don't start with a date pattern
            if (!/^\d{4}-\d{2}-\d{2}-/.test(filename)) {
                console.log(`⏭️  Skipping file without date prefix: ${filename}`);
                return;
            }

            try {
                const filePath = path.resolve(postDir, filename);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const doc = matter(fileContent);
                
                // Skip drafts in production
                if (doc.data.draft === true && process.env.NODE_ENV === 'production') {
                    console.log(`⏭️  Skipping draft: ${filename}`);
                    return;
                }
                
                const processedPost = this.processMetadata(filename, doc.data, doc.content);
                
                // Validate required fields including pubDate
                if (!processedPost.title || !processedPost.content || !processedPost.pubDate || isNaN(processedPost.pubDate.getTime())) {
                    console.warn(`⚠️  Skipping post with missing or invalid required fields: ${filename}`);
                    return;
                }
                
                posts.push(processedPost);
                processedCount++;
                
            } catch (error) {
                console.error(`❌ Error processing ${filename}:`, error.message);
            }
        });

        console.log(`✅ Successfully processed ${posts.length} posts`);
        return posts;
    }

    /**
     * Get a single post by filename for testing
     * @param {string} filename - The filename to process
     * @returns {Object} Processed post object
     */
    getPost(filename) {
        const postDir = path.join(__dirname, '..', '_posts');
        const filePath = path.resolve(postDir, filename);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Post not found: ${filename}`);
        }
        
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const doc = matter(fileContent);
        
        return this.processMetadata(filename, doc.data, doc.content);
    }
}

// Create singleton instance
const processor = new BlogDataProcessor();

module.exports = {
    getAll: () => processor.getAll(),
    getPost: (filename) => processor.getPost(filename),
    processor: processor
};
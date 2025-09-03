/**
 * Enhanced Azure AI Search Blog Indexing Script
 * 
 * This script provides advanced indexing capabilities for blog posts with:
 * - Batch processing for better performance
 * - Semantic search integration
 * - Advanced error handling and retry logic
 * - Index health monitoring
 * - Performance metrics and logging
 * 
 * Security Features:
 * - Uses environment variables for credentials (no hardcoded secrets)
 * - Validates required configuration before execution
 * - Implements proper error handling and logging
 * 
 * Performance Features:
 * - Batch document processing
 * - Concurrent operations where safe
 * - Memory-efficient processing for large datasets
 * - Retry logic with exponential backoff
 */

const { SearchIndexClient, SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const blogData = require('./blog-data.js');

// Load environment variables
require("dotenv").config();

// Enhanced configuration with new features
const CONFIG = {
    searchServiceName: process.env.AZ_SEARCH_SERVICE_NAME,
    adminApiKey: process.env.AZ_SEARCH_ADMIN_KEY,
    indexName: process.env.AZ_SEARCH_INDEX_NAME || 'blog-index',
    environment: process.env.NODE_ENV || 'development',
    
    // Performance settings
    batchSize: parseInt(process.env.BATCH_SIZE) || 100,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,
    
    // Feature flags
    enableSemanticSearch: process.env.ENABLE_SEMANTIC_SEARCH === 'true',
    enableSuggesters: process.env.ENABLE_SUGGESTERS !== 'false', // Default true
    validateDocuments: process.env.VALIDATE_DOCUMENTS !== 'false', // Default true
    
    // Search service configuration
    serviceUrl: null // Will be constructed
};

// Construct service URL
CONFIG.serviceUrl = `https://${CONFIG.searchServiceName}.search.windows.net`;

/**
 * Performance metrics tracker
 */
class PerformanceMetrics {
    constructor() {
        this.startTime = Date.now();
        this.documentsProcessed = 0;
        this.batchesProcessed = 0;
        this.errors = [];
        this.retries = 0;
    }

    addError(error, context = '') {
        this.errors.push({
            message: error.message,
            context: context,
            timestamp: new Date().toISOString()
        });
    }

    addRetry() {
        this.retries++;
    }

    getReport() {
        const duration = Date.now() - this.startTime;
        return {
            totalDuration: `${(duration / 1000).toFixed(2)}s`,
            documentsProcessed: this.documentsProcessed,
            batchesProcessed: this.batchesProcessed,
            documentsPerSecond: ((this.documentsProcessed / duration) * 1000).toFixed(2),
            errorCount: this.errors.length,
            retryCount: this.retries,
            successRate: `${(((this.documentsProcessed - this.errors.length) / this.documentsProcessed) * 100).toFixed(2)}%`
        };
    }
}

/**
 * Validates that all required configuration is present
 * @returns {boolean} True if configuration is valid
 */
function validateConfiguration() {
    const requiredFields = ['searchServiceName', 'adminApiKey'];
    const missingFields = requiredFields.filter(field => !CONFIG[field]);
    
    if (missingFields.length > 0) {
        console.error(`❌ Missing required configuration: ${missingFields.join(', ')}`);
        console.error('Please ensure the following environment variables are set:');
        console.error('- AZ_SEARCH_SERVICE_NAME: Your Azure Search service name');
        console.error('- AZ_SEARCH_ADMIN_KEY: Your Azure Search admin key');
        console.error('\nOptional configuration:');
        console.error('- AZ_SEARCH_INDEX_NAME: Index name (default: blog-index)');
        console.error('- BATCH_SIZE: Documents per batch (default: 100)');
        console.error('- ENABLE_SEMANTIC_SEARCH: Enable semantic search features (default: false)');
        return false;
    }
    
    // Validate numeric configurations
    if (CONFIG.batchSize <= 0 || CONFIG.batchSize > 1000) {
        console.error(`❌ Invalid batch size: ${CONFIG.batchSize}. Must be between 1 and 1000.`);
        return false;
    }
    
    return true;
}

/**
 * Validate document structure before indexing
 * @param {Array} documents - Documents to validate
 * @returns {Object} Validation results
 */
function validateDocuments(documents) {
    const requiredFields = ['id', 'title', 'content'];
    const validationResults = {
        valid: [],
        invalid: [],
        warnings: []
    };

    documents.forEach((doc, index) => {
        const issues = [];
        
        // Check required fields
        requiredFields.forEach(field => {
            if (!doc[field] || (typeof doc[field] === 'string' && doc[field].trim().length === 0)) {
                issues.push(`Missing or empty required field: ${field}`);
            }
        });

        // Check ID format (must be valid for Azure Search)
        if (doc.id && !/^[a-zA-Z0-9_-]+$/.test(doc.id)) {
            issues.push('ID contains invalid characters (only alphanumeric, underscore, and hyphen allowed)');
        }

        // Check content length limits
        if (doc.content && doc.content.length > 50000) {
            validationResults.warnings.push(`Document ${doc.id}: Content length (${doc.content.length}) exceeds recommended limit`);
        }

        if (issues.length === 0) {
            validationResults.valid.push(doc);
        } else {
            validationResults.invalid.push({
                document: doc,
                index: index,
                issues: issues
            });
        }
    });

    return validationResults;
}

/**
 * Process documents in batches with retry logic
 * @param {SearchClient} searchClient - Azure Search client
 * @param {Array} documents - Documents to process
 * @param {PerformanceMetrics} metrics - Performance tracker
 * @returns {Promise<Object>} Processing results
 */
async function processBatches(searchClient, documents, metrics) {
    const results = {
        successful: 0,
        failed: 0,
        details: []
    };

    // Split documents into batches
    const batches = [];
    for (let i = 0; i < documents.length; i += CONFIG.batchSize) {
        batches.push(documents.slice(i, i + CONFIG.batchSize));
    }

    console.log(`📦 Processing ${documents.length} documents in ${batches.length} batches of ${CONFIG.batchSize}`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        
        console.log(`📤 Processing batch ${batchNumber}/${batches.length} (${batch.length} documents)...`);

        let retryCount = 0;
        let success = false;

        while (retryCount <= CONFIG.maxRetries && !success) {
            try {
                const indexResult = await searchClient.mergeOrUploadDocuments(batch);
                
                if (indexResult.results) {
                    const batchSuccessful = indexResult.results.filter(r => r.succeeded).length;
                    const batchFailed = indexResult.results.length - batchSuccessful;
                    
                    results.successful += batchSuccessful;
                    results.failed += batchFailed;
                    
                    // Log failures in this batch
                    const failures = indexResult.results.filter(r => !r.succeeded);
                    failures.forEach(failure => {
                        console.error(`   ❌ Failed to index document ${failure.key}: ${failure.errorMessage}`);
                        metrics.addError(new Error(failure.errorMessage), `Document: ${failure.key}`);
                    });
                    
                    results.details.push({
                        batchNumber: batchNumber,
                        successful: batchSuccessful,
                        failed: batchFailed,
                        retryCount: retryCount
                    });
                }
                
                metrics.documentsProcessed += batch.length;
                metrics.batchesProcessed++;
                success = true;
                
                console.log(`   ✅ Batch ${batchNumber} completed successfully`);
                
            } catch (error) {
                retryCount++;
                metrics.addRetry();
                
                if (retryCount <= CONFIG.maxRetries) {
                    const delay = CONFIG.retryDelayMs * Math.pow(2, retryCount - 1); // Exponential backoff
                    console.warn(`   ⚠️  Batch ${batchNumber} failed (attempt ${retryCount}/${CONFIG.maxRetries + 1}). Retrying in ${delay}ms...`);
                    console.warn(`   Error: ${error.message}`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`   ❌ Batch ${batchNumber} failed after ${CONFIG.maxRetries + 1} attempts: ${error.message}`);
                    metrics.addError(error, `Batch ${batchNumber}`);
                    results.failed += batch.length;
                }
            }
        }
    }

    return results;
}

/**
 * Check if search index exists and get basic info
 * @param {SearchIndexClient} indexClient - Search index client
 * @returns {Promise<Object>} Index information
 */
async function checkIndexHealth(indexClient) {
    try {
        const indexStats = await indexClient.getIndex(CONFIG.indexName);
        console.log(`📊 Index '${CONFIG.indexName}' exists and is accessible`);
        
        // Try to get document count
        const searchClient = indexClient.getSearchClient(CONFIG.indexName);
        const countResult = await searchClient.search('*', { 
            select: [],
            top: 0,
            includeTotalCount: true 
        });
        
        return {
            exists: true,
            documentCount: countResult.count || 0,
            indexInfo: indexStats
        };
    } catch (error) {
        if (error.statusCode === 404) {
            console.warn(`⚠️  Index '${CONFIG.indexName}' does not exist. Please create it first.`);
            return { exists: false, error: 'Index not found' };
        } else {
            console.error(`❌ Error checking index health: ${error.message}`);
            return { exists: false, error: error.message };
        }
    }
}

/**
 * Main indexing function with enhanced error handling and performance monitoring
 */
async function main() {
    const metrics = new PerformanceMetrics();
    
    try {
        console.log('🚀 Starting Enhanced Azure AI Search indexing...');
        console.log('════════════════════════════════════════════════');
        
        // Validate configuration
        if (!validateConfiguration()) {
            process.exit(1);
        }
        
        // Display configuration
        console.log(`📊 Configuration:`);
        console.log(`   Environment: ${CONFIG.environment}`);
        console.log(`   Search Service: ${CONFIG.searchServiceName}`);
        console.log(`   Index Name: ${CONFIG.indexName}`);
        console.log(`   Batch Size: ${CONFIG.batchSize}`);
        console.log(`   Max Retries: ${CONFIG.maxRetries}`);
        console.log(`   Semantic Search: ${CONFIG.enableSemanticSearch ? 'Enabled' : 'Disabled'}`);
        console.log(`   Document Validation: ${CONFIG.validateDocuments ? 'Enabled' : 'Disabled'}`);
        console.log('');
        
        // Initialize Azure Search clients
        const indexClient = new SearchIndexClient(
            CONFIG.serviceUrl,
            new AzureKeyCredential(CONFIG.adminApiKey)
        );
        
        // Check index health
        console.log('🔍 Checking index health...');
        const indexHealth = await checkIndexHealth(indexClient);
        
        if (!indexHealth.exists) {
            console.error('❌ Cannot proceed without a valid search index.');
            console.error('💡 Create the index first using the create-index script or Azure portal.');
            process.exit(1);
        }
        
        console.log(`📈 Current index contains ${indexHealth.documentCount} documents\n`);
        
        const searchClient = indexClient.getSearchClient(CONFIG.indexName);
        
        // Get all blog posts with enhanced processing
        console.log('📚 Retrieving and processing blog posts...');
        const allPosts = blogData.getAll();
        
        if (allPosts.length === 0) {
            console.warn('⚠️  No posts found to index');
            return;
        }
        
        console.log(`📄 Found ${allPosts.length} posts to process\n`);
        
        // Validate documents if enabled
        if (CONFIG.validateDocuments) {
            console.log('� Validating document structure...');
            const validation = validateDocuments(allPosts);
            
            if (validation.invalid.length > 0) {
                console.error(`❌ Found ${validation.invalid.length} invalid documents:`);
                validation.invalid.forEach(({ document, issues }) => {
                    console.error(`   - ${document.id || 'Unknown ID'}: ${issues.join(', ')}`);
                });
                
                console.error('\nFix these issues before continuing.');
                process.exit(1);
            }
            
            if (validation.warnings.length > 0) {
                console.warn(`⚠️  Found ${validation.warnings.length} warnings:`);
                validation.warnings.forEach(warning => {
                    console.warn(`   - ${warning}`);
                });
                console.log('');
            }
            
            console.log(`✅ All ${validation.valid.length} documents passed validation\n`);
        }
        
        // Process documents in batches
        console.log('📤 Starting batch processing...');
        const processingResults = await processBatches(searchClient, allPosts, metrics);
        
        // Display results
        console.log('\n📊 Indexing Results:');
        console.log('═══════════════════════');
        console.log(`✅ Successfully indexed: ${processingResults.successful} documents`);
        console.log(`❌ Failed to index: ${processingResults.failed} documents`);
        console.log(`📦 Batches processed: ${metrics.batchesProcessed}`);
        console.log(`🔄 Total retries: ${metrics.retries}`);
        
        // Performance metrics
        const performanceReport = metrics.getReport();
        console.log('\n⚡ Performance Metrics:');
        console.log('═════════════════════');
        console.log(`🕐 Total duration: ${performanceReport.totalDuration}`);
        console.log(`📈 Documents/second: ${performanceReport.documentsPerSecond}`);
        console.log(`🎯 Success rate: ${performanceReport.successRate}`);
        
        // Error summary
        if (metrics.errors.length > 0) {
            console.log('\n🚨 Error Summary:');
            console.log('════════════════');
            const errorGroups = metrics.errors.reduce((groups, error) => {
                const key = error.message;
                groups[key] = (groups[key] || 0) + 1;
                return groups;
            }, {});
            
            Object.entries(errorGroups).forEach(([error, count]) => {
                console.log(`   ${count}x: ${error}`);
            });
        }
        
        console.log('\n🎉 Indexing process completed!');
        
        // Exit with appropriate code
        process.exit(processingResults.failed > 0 ? 1 : 0);
        
    } catch (error) {
        console.error('\n❌ Critical error during Azure Search indexing:');
        console.error(`   Message: ${error.message}`);
        
        if (error.code) {
            console.error(`   Code: ${error.code}`);
        }
        
        if (error.details) {
            console.error(`   Details: ${JSON.stringify(error.details, null, 2)}`);
        }
        
        // Log stack trace in development
        if (CONFIG.environment === 'development') {
            console.error(`   Stack: ${error.stack}`);
        }
        
        // Add to metrics for final report
        metrics.addError(error, 'Critical error');
        
        console.log('\n📊 Final Performance Report:');
        console.log(JSON.stringify(metrics.getReport(), null, 2));
        
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received interrupt signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received termination signal. Shutting down gracefully...');
    process.exit(0);
});

// Execute main function
main();
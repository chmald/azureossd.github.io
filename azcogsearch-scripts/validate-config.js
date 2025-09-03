/**
 * Configuration Validation Script for Azure AI Search
 * 
 * This script validates the environment configuration and tests
 * connectivity to Azure AI Search service before running indexing operations.
 */

const { SearchIndexClient, AzureKeyCredential } = require("@azure/search-documents");

// Load environment variables
require("dotenv").config();

const CONFIG = {
    searchServiceName: process.env.AZ_SEARCH_SERVICE_NAME,
    adminApiKey: process.env.AZ_SEARCH_ADMIN_KEY,
    queryApiKey: process.env.AZ_SEARCH_QUERY_KEY,
    indexName: process.env.AZ_SEARCH_INDEX_NAME || 'blog-index',
    environment: process.env.NODE_ENV || 'development'
};

/**
 * Validation results tracker
 */
class ValidationResults {
    constructor() {
        this.tests = [];
        this.errors = [];
        this.warnings = [];
    }

    addTest(name, passed, message = '') {
        this.tests.push({ name, passed, message });
        if (!passed) {
            this.errors.push(`${name}: ${message}`);
        }
    }

    addWarning(message) {
        this.warnings.push(message);
    }

    getReport() {
        const passed = this.tests.filter(t => t.passed).length;
        const total = this.tests.length;
        
        return {
            passed,
            total,
            success: this.errors.length === 0,
            successRate: total > 0 ? Math.round((passed / total) * 100) : 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }

    printReport() {
        const report = this.getReport();
        
        console.log('\n📋 Validation Report');
        console.log('══════════════════════');
        console.log(`✅ Passed: ${report.passed}/${report.total} (${report.successRate}%)`);
        
        if (report.errors.length > 0) {
            console.log(`❌ Errors: ${report.errors.length}`);
            report.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
        }
        
        if (report.warnings.length > 0) {
            console.log(`⚠️  Warnings: ${report.warnings.length}`);
            report.warnings.forEach(warning => {
                console.log(`   - ${warning}`);
            });
        }
        
        console.log(`\n🎯 Overall Result: ${report.success ? '✅ PASS' : '❌ FAIL'}`);
        
        return report.success;
    }
}

/**
 * Validate environment variables
 * @param {ValidationResults} results - Validation results tracker
 */
function validateEnvironmentVariables(results) {
    console.log('🔍 Validating environment variables...');
    
    // Required variables
    results.addTest(
        'AZ_SEARCH_SERVICE_NAME',
        !!CONFIG.searchServiceName,
        CONFIG.searchServiceName ? 'Present' : 'Missing required environment variable'
    );
    
    results.addTest(
        'AZ_SEARCH_ADMIN_KEY',
        !!CONFIG.adminApiKey,
        CONFIG.adminApiKey ? 'Present' : 'Missing required environment variable'
    );
    
    // Optional but recommended variables
    if (!CONFIG.queryApiKey) {
        results.addWarning('AZ_SEARCH_QUERY_KEY not set - using admin key for queries (not recommended for production)');
    }
    
    if (CONFIG.indexName === 'blog-index') {
        results.addWarning('Using default index name - consider setting AZ_SEARCH_INDEX_NAME');
    }
    
    // Validate service name format
    if (CONFIG.searchServiceName) {
        const serviceNameRegex = /^[a-z][a-z0-9-]*[a-z0-9]$/;
        results.addTest(
            'Service name format',
            serviceNameRegex.test(CONFIG.searchServiceName),
            serviceNameRegex.test(CONFIG.searchServiceName) ? 'Valid format' : 'Invalid format (must be lowercase, start with letter, contain only letters, numbers, and hyphens)'
        );
    }
    
    // Validate key format (basic check)
    if (CONFIG.adminApiKey) {
        results.addTest(
            'Admin key format',
            CONFIG.adminApiKey.length >= 32,
            CONFIG.adminApiKey.length >= 32 ? 'Valid length' : 'Admin key seems too short'
        );
    }
}

/**
 * Test connectivity to Azure Search service
 * @param {ValidationResults} results - Validation results tracker
 */
async function testConnectivity(results) {
    console.log('🌐 Testing connectivity to Azure Search service...');
    
    if (!CONFIG.searchServiceName || !CONFIG.adminApiKey) {
        results.addTest('Service connectivity', false, 'Cannot test - missing credentials');
        return;
    }
    
    try {
        const serviceUrl = `https://${CONFIG.searchServiceName}.search.windows.net`;
        const client = new SearchIndexClient(serviceUrl, new AzureKeyCredential(CONFIG.adminApiKey));
        
        // Test basic connectivity by listing service statistics
        const serviceStats = await client.getServiceStatistics();
        
        results.addTest(
            'Service connectivity',
            true,
            `Connected successfully - ${serviceStats.counters.documentCount} documents, ${serviceStats.counters.indexCount} indexes`
        );
        
        // Check service limits
        if (serviceStats.limits) {
            const documentUsage = (serviceStats.counters.documentCount / serviceStats.limits.maxDocumentsPerIndex) * 100;
            const indexUsage = (serviceStats.counters.indexCount / serviceStats.limits.maxIndexesPerService) * 100;
            
            if (documentUsage > 80) {
                results.addWarning(`Document storage usage is ${documentUsage.toFixed(1)}% of limit`);
            }
            
            if (indexUsage > 80) {
                results.addWarning(`Index usage is ${indexUsage.toFixed(1)}% of limit`);
            }
        }
        
    } catch (error) {
        let errorMessage = error.message;
        
        if (error.statusCode === 403) {
            errorMessage = 'Authentication failed - check your admin key';
        } else if (error.statusCode === 404) {
            errorMessage = 'Service not found - check your service name';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'DNS resolution failed - check your service name';
        }
        
        results.addTest('Service connectivity', false, errorMessage);
    }
}

/**
 * Check if the target index exists and validate its schema
 * @param {ValidationResults} results - Validation results tracker
 */
async function validateIndex(results) {
    console.log('📖 Validating search index...');
    
    if (!CONFIG.searchServiceName || !CONFIG.adminApiKey) {
        results.addTest('Index validation', false, 'Cannot test - missing credentials');
        return;
    }
    
    try {
        const serviceUrl = `https://${CONFIG.searchServiceName}.search.windows.net`;
        const client = new SearchIndexClient(serviceUrl, new AzureKeyCredential(CONFIG.adminApiKey));
        
        // Check if index exists
        try {
            const index = await client.getIndex(CONFIG.indexName);
            
            results.addTest(
                'Index exists',
                true,
                `Index '${CONFIG.indexName}' found with ${index.fields.length} fields`
            );
            
            // Validate required fields
            const requiredFields = ['id', 'title', 'content', 'description', 'url', 'pubDate'];
            const indexFields = index.fields.map(f => f.name);
            
            requiredFields.forEach(fieldName => {
                const fieldExists = indexFields.includes(fieldName);
                results.addTest(
                    `Required field: ${fieldName}`,
                    fieldExists,
                    fieldExists ? 'Present' : 'Missing - may cause indexing errors'
                );
            });
            
            // Check for recommended fields
            const recommendedFields = ['tags', 'categories', 'author', 'readingTime'];
            recommendedFields.forEach(fieldName => {
                if (!indexFields.includes(fieldName)) {
                    results.addWarning(`Recommended field '${fieldName}' not found in index`);
                }
            });
            
            // Check if suggesters are configured
            if (index.suggesters && index.suggesters.length > 0) {
                results.addTest(
                    'Suggesters configured',
                    true,
                    `${index.suggesters.length} suggester(s) configured`
                );
            } else {
                results.addWarning('No suggesters configured - autocomplete features will not work');
            }
            
            // Check for semantic search configuration
            if (index.semantic && index.semantic.configurations && index.semantic.configurations.length > 0) {
                results.addTest(
                    'Semantic search configured',
                    true,
                    `${index.semantic.configurations.length} semantic configuration(s) found`
                );
            } else {
                results.addWarning('Semantic search not configured - advanced search features will be limited');
            }
            
        } catch (indexError) {
            if (indexError.statusCode === 404) {
                results.addTest(
                    'Index exists',
                    false,
                    `Index '${CONFIG.indexName}' not found - run create-index script first`
                );
            } else {
                results.addTest('Index exists', false, indexError.message);
            }
        }
        
    } catch (error) {
        results.addTest('Index validation', false, error.message);
    }
}

/**
 * Test blog data processing
 * @param {ValidationResults} results - Validation results tracker
 */
async function testBlogDataProcessing(results) {
    console.log('📚 Testing blog data processing...');
    
    try {
        const blogData = require('./blog-data.js');
        
        // Test if blog-data module loads
        results.addTest('Blog data module', true, 'Module loaded successfully');
        
        // Test blog post processing
        const posts = blogData.getAll();
        
        results.addTest(
            'Blog posts found',
            posts.length > 0,
            posts.length > 0 ? `Found ${posts.length} posts` : 'No blog posts found - check _posts directory'
        );
        
        if (posts.length > 0) {
            // Validate first post structure
            const firstPost = posts[0];
            const requiredPostFields = ['id', 'title', 'content', 'url'];
            
            requiredPostFields.forEach(field => {
                results.addTest(
                    `Post field: ${field}`,
                    !!firstPost[field],
                    firstPost[field] ? 'Present' : 'Missing in processed posts'
                );
            });
            
            // Check for enhanced fields
            const enhancedFields = ['tags', 'readingTime', 'wordCount', 'searchScore'];
            enhancedFields.forEach(field => {
                if (firstPost[field] === undefined) {
                    results.addWarning(`Enhanced field '${field}' not found in processed posts`);
                }
            });
        }
        
    } catch (error) {
        results.addTest('Blog data processing', false, error.message);
    }
}

/**
 * Check system dependencies
 * @param {ValidationResults} results - Validation results tracker
 */
function checkDependencies(results) {
    console.log('📦 Checking dependencies...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    results.addTest(
        'Node.js version',
        majorVersion >= 16,
        majorVersion >= 16 ? `${nodeVersion} (supported)` : `${nodeVersion} (requires Node.js 16+)`
    );
    
    // Check required packages
    const requiredPackages = [
        '@azure/search-documents',
        'dotenv',
        'gray-matter',
        'remove-markdown'
    ];
    
    requiredPackages.forEach(packageName => {
        try {
            require.resolve(packageName);
            results.addTest(`Package: ${packageName}`, true, 'Installed');
        } catch (error) {
            results.addTest(`Package: ${packageName}`, false, 'Not installed - run npm install');
        }
    });
    
    // Check for optional enhanced packages
    const optionalPackages = ['cheerio', 'natural', 'stopword', 'lodash'];
    
    optionalPackages.forEach(packageName => {
        try {
            require.resolve(packageName);
            // Package is available
        } catch (error) {
            results.addWarning(`Optional package '${packageName}' not installed - some enhanced features may not work`);
        }
    });
}

/**
 * Main validation function
 */
async function main() {
    console.log('🔧 Azure AI Search Configuration Validator');
    console.log('═══════════════════════════════════════════');
    console.log(`Environment: ${CONFIG.environment}`);
    console.log(`Service: ${CONFIG.searchServiceName || 'Not configured'}`);
    console.log(`Index: ${CONFIG.indexName}`);
    console.log('');
    
    const results = new ValidationResults();
    
    // Run all validation tests
    checkDependencies(results);
    validateEnvironmentVariables(results);
    await testConnectivity(results);
    await validateIndex(results);
    await testBlogDataProcessing(results);
    
    // Print final report
    const success = results.printReport();
    
    if (success) {
        console.log('\n🎉 Configuration is valid! You can proceed with indexing.');
        console.log('💡 Next steps:');
        console.log('   1. Run "npm run create-index" to create/update the search index');
        console.log('   2. Run "npm run index" to populate the index with blog posts');
        console.log('   3. Run "npm run search" to test search functionality');
    } else {
        console.log('\n❌ Configuration issues found. Please fix the errors above before proceeding.');
    }
    
    process.exit(success ? 0 : 1);
}

// Execute main function
main().catch(error => {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
});

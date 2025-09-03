/**
 * Enhanced Azure AI Search Client for Testing and Demonstration
 * 
 * This script demonstrates the advanced search capabilities including:
 * - Semantic search
 * - Faceted search and filtering
 * - Autocomplete and suggestions
 * - Highlighted search results
 * - Advanced ranking and scoring
 */

const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");

// Load environment variables
require("dotenv").config();

const CONFIG = {
    searchServiceName: process.env.AZ_SEARCH_SERVICE_NAME,
    adminApiKey: process.env.AZ_SEARCH_ADMIN_KEY || process.env.AZ_SEARCH_QUERY_KEY,
    indexName: process.env.AZ_SEARCH_INDEX_NAME || 'blog-index',
    enableSemanticSearch: process.env.ENABLE_SEMANTIC_SEARCH === 'true'
};

/**
 * Enhanced search client with advanced capabilities
 */
class EnhancedSearchClient {
    constructor() {
        const serviceUrl = `https://${CONFIG.searchServiceName}.search.windows.net`;
        this.client = new SearchClient(
            serviceUrl,
            CONFIG.indexName,
            new AzureKeyCredential(CONFIG.adminApiKey)
        );
    }

    /**
     * Perform a basic text search with highlighting
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async search(query, options = {}) {
        const searchOptions = {
            top: options.top || 10,
            skip: options.skip || 0,
            includeTotalCount: true,
            highlight: "title,description,content",
            highlightPreTag: "<mark>",
            highlightPostTag: "</mark>",
            select: options.select || [
                "id", "title", "author", "description", "tags", "categories", 
                "languages", "url", "publishedDate", "readingTime", "wordCount"
            ],
            orderBy: options.orderBy || ["search.score() desc", "publishedDate desc"],
            ...options
        };

        if (CONFIG.enableSemanticSearch && options.useSemanticSearch !== false) {
            searchOptions.queryType = "semantic";
            searchOptions.semanticConfiguration = "blog-semantic-config";
            searchOptions.answers = "extractive|count-3";
            searchOptions.captions = "extractive|highlight-true";
        }

        const results = await this.client.search(query, searchOptions);
        return results;
    }

    /**
     * Perform faceted search with filters
     * @param {string} query - Search query
     * @param {Object} filters - Filter options
     * @returns {Promise<Object>} Search results with facets
     */
    async facetedSearch(query, filters = {}) {
        const searchOptions = {
            top: 20,
            includeTotalCount: true,
            facets: [
                "categories,count:10",
                "tags,count:15",
                "languages,count:10",
                "author,count:10",
                "readingTime,interval:5",
                "publishedDate,interval:year"
            ],
            highlight: "title,description",
            highlightPreTag: "<mark>",
            highlightPostTag: "</mark>",
            select: [
                "id", "title", "author", "description", "tags", "categories", 
                "languages", "url", "publishedDate", "readingTime"
            ]
        };

        // Build filter expression
        const filterExpressions = [];
        
        if (filters.categories && filters.categories.length > 0) {
            const categoryFilter = filters.categories.map(cat => `'${cat}'`).join(',');
            filterExpressions.push(`categories/any(c: search.in(c, '${categoryFilter}'))`);
        }
        
        if (filters.tags && filters.tags.length > 0) {
            const tagFilter = filters.tags.map(tag => `'${tag}'`).join(',');
            filterExpressions.push(`tags/any(t: search.in(t, '${tagFilter}'))`);
        }
        
        if (filters.languages && filters.languages.length > 0) {
            const langFilter = filters.languages.map(lang => `'${lang}'`).join(',');
            filterExpressions.push(`languages/any(l: search.in(l, '${langFilter}'))`);
        }
        
        if (filters.author) {
            filterExpressions.push(`author eq '${filters.author}'`);
        }
        
        if (filters.dateRange) {
            if (filters.dateRange.from) {
                filterExpressions.push(`publishedDate ge ${filters.dateRange.from.toISOString()}`);
            }
            if (filters.dateRange.to) {
                filterExpressions.push(`publishedDate le ${filters.dateRange.to.toISOString()}`);
            }
        }
        
        if (filters.readingTime) {
            if (filters.readingTime.min) {
                filterExpressions.push(`readingTime ge ${filters.readingTime.min}`);
            }
            if (filters.readingTime.max) {
                filterExpressions.push(`readingTime le ${filters.readingTime.max}`);
            }
        }
        
        if (filters.hasCodeBlocks !== undefined) {
            filterExpressions.push(`hasCodeBlocks eq ${filters.hasCodeBlocks}`);
        }

        if (filterExpressions.length > 0) {
            searchOptions.filter = filterExpressions.join(' and ');
        }

        if (CONFIG.enableSemanticSearch) {
            searchOptions.queryType = "semantic";
            searchOptions.semanticConfiguration = "blog-semantic-config";
        }

        const results = await this.client.search(query, searchOptions);
        return results;
    }

    /**
     * Get autocomplete suggestions
     * @param {string} partial - Partial query
     * @returns {Promise<Array>} Autocomplete suggestions
     */
    async autocomplete(partial) {
        try {
            const results = await this.client.autocomplete(partial, "title-suggester", {
                autocompleteMode: "twoTerms",
                top: 8
            });
            
            return results.results.map(result => ({
                text: result.text,
                queryPlusText: result.queryPlusText
            }));
        } catch (error) {
            console.warn('Autocomplete not available:', error.message);
            return [];
        }
    }

    /**
     * Get search suggestions
     * @param {string} partial - Partial query
     * @returns {Promise<Array>} Search suggestions
     */
    async suggest(partial) {
        try {
            const results = await this.client.suggest(partial, "title-suggester", {
                top: 5,
                select: ["title", "description", "url"],
                highlight: "title,description",
                highlightPreTag: "<mark>",
                highlightPostTag: "</mark>"
            });
            
            return results.results.map(result => ({
                text: result.text,
                document: result.document
            }));
        } catch (error) {
            console.warn('Suggestions not available:', error.message);
            return [];
        }
    }

    /**
     * Get similar posts based on a post ID
     * @param {string} postId - Post ID to find similar posts for
     * @returns {Promise<Array>} Similar posts
     */
    async findSimilarPosts(postId) {
        // First get the post to analyze
        const postResult = await this.client.search(`id:${postId}`, {
            top: 1,
            select: ["title", "tags", "categories", "keywords", "content"]
        });

        const posts = [];
        for await (const result of postResult.results) {
            posts.push(result.document);
        }

        if (posts.length === 0) {
            return [];
        }

        const post = posts[0];
        
        // Build a query based on the post's metadata
        const queryTerms = [];
        
        if (post.tags && post.tags.length > 0) {
            queryTerms.push(...post.tags.slice(0, 3)); // Top 3 tags
        }
        
        if (post.categories && post.categories.length > 0) {
            queryTerms.push(...post.categories);
        }
        
        if (post.keywords && post.keywords.length > 0) {
            queryTerms.push(...post.keywords.slice(0, 3)); // Top 3 keywords
        }

        const query = queryTerms.join(' ');
        
        const results = await this.client.search(query, {
            top: 6, // Get 6 to exclude the original post
            filter: `id ne '${postId}'`, // Exclude the original post
            select: ["id", "title", "description", "tags", "url", "publishedDate"],
            orderBy: ["search.score() desc"]
        });

        const similarPosts = [];
        for await (const result of results.results) {
            similarPosts.push(result.document);
        }

        return similarPosts.slice(0, 5); // Return top 5 similar posts
    }

    /**
     * Get search analytics and insights
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search analytics
     */
    async getSearchAnalytics(query) {
        const results = await this.search(query);
        
        const analytics = {
            query: query,
            totalResults: results.count,
            processingTime: Date.now(), // Would need to measure actual time
            topCategories: {},
            topTags: {},
            topAuthors: {},
            averageReadingTime: 0,
            resultsWithCode: 0
        };

        const documents = [];
        for await (const result of results.results) {
            documents.push(result.document);
        }

        // Analyze results
        documents.forEach(doc => {
            // Count categories
            if (doc.categories) {
                doc.categories.forEach(cat => {
                    analytics.topCategories[cat] = (analytics.topCategories[cat] || 0) + 1;
                });
            }
            
            // Count tags
            if (doc.tags) {
                doc.tags.forEach(tag => {
                    analytics.topTags[tag] = (analytics.topTags[tag] || 0) + 1;
                });
            }
            
            // Count authors
            if (doc.author) {
                analytics.topAuthors[doc.author] = (analytics.topAuthors[doc.author] || 0) + 1;
            }
            
            // Sum reading time
            if (doc.readingTime) {
                analytics.averageReadingTime += doc.readingTime;
            }
            
            // Count posts with code
            if (doc.hasCodeBlocks) {
                analytics.resultsWithCode++;
            }
        });

        if (documents.length > 0) {
            analytics.averageReadingTime = Math.round(analytics.averageReadingTime / documents.length);
        }

        return analytics;
    }
}

/**
 * Interactive search demo
 */
async function runInteractiveDemo() {
    const searchClient = new EnhancedSearchClient();
    
    console.log('🔍 Enhanced Azure AI Search Demo');
    console.log('═══════════════════════════════════');
    console.log('Available commands:');
    console.log('  search <query>     - Basic search');
    console.log('  faceted <query>    - Faceted search with filters');
    console.log('  similar <postId>   - Find similar posts');
    console.log('  suggest <partial>  - Get suggestions');
    console.log('  analytics <query>  - Search analytics');
    console.log('  help               - Show this help');
    console.log('  exit               - Exit demo');
    console.log('');

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (question) => {
        return new Promise((resolve) => {
            rl.question(question, resolve);
        });
    };

    while (true) {
        try {
            const input = await askQuestion('🔍 Enter command: ');
            const [command, ...args] = input.trim().split(' ');
            const query = args.join(' ');

            if (command === 'exit' || command === 'quit') {
                break;
            }

            if (command === 'help') {
                console.log('Available commands:');
                console.log('  search <query>     - Basic search');
                console.log('  faceted <query>    - Faceted search with filters');
                console.log('  similar <postId>   - Find similar posts');
                console.log('  suggest <partial>  - Get suggestions');
                console.log('  analytics <query>  - Search analytics');
                console.log('  help               - Show this help');
                console.log('  exit               - Exit demo');
                continue;
            }

            if (command === 'search' && query) {
                console.log(`\n🔍 Searching for: "${query}"`);
                const results = await searchClient.search(query);
                
                console.log(`📊 Found ${results.count} results\n`);
                
                let count = 0;
                for await (const result of results.results) {
                    if (count++ >= 5) break; // Show top 5
                    
                    const doc = result.document;
                    console.log(`${count}. ${doc.title}`);
                    console.log(`   Author: ${doc.author} | Reading time: ${doc.readingTime}min`);
                    console.log(`   Tags: ${doc.tags ? doc.tags.join(', ') : 'None'}`);
                    console.log(`   URL: ${doc.url}`);
                    console.log('');
                }
            }
            else if (command === 'faceted' && query) {
                console.log(`\n🔍 Faceted search for: "${query}"`);
                const results = await searchClient.facetedSearch(query);
                
                console.log(`📊 Found ${results.count} results\n`);
                
                // Show facets
                if (results.facets) {
                    console.log('📊 Facets:');
                    Object.entries(results.facets).forEach(([facet, values]) => {
                        console.log(`   ${facet}: ${values.map(v => `${v.value} (${v.count})`).join(', ')}`);
                    });
                    console.log('');
                }
            }
            else if (command === 'similar' && query) {
                console.log(`\n🔍 Finding posts similar to: "${query}"`);
                const similar = await searchClient.findSimilarPosts(query);
                
                console.log(`📊 Found ${similar.length} similar posts\n`);
                similar.forEach((post, index) => {
                    console.log(`${index + 1}. ${post.title}`);
                    console.log(`   Tags: ${post.tags ? post.tags.join(', ') : 'None'}`);
                    console.log(`   URL: ${post.url}`);
                    console.log('');
                });
            }
            else if (command === 'suggest' && query) {
                console.log(`\n💡 Suggestions for: "${query}"`);
                const suggestions = await searchClient.suggest(query);
                
                suggestions.forEach((suggestion, index) => {
                    console.log(`${index + 1}. ${suggestion.text} -> ${suggestion.document.title}`);
                });
                console.log('');
            }
            else if (command === 'analytics' && query) {
                console.log(`\n📊 Analytics for: "${query}"`);
                const analytics = await searchClient.getSearchAnalytics(query);
                
                console.log(`Total results: ${analytics.totalResults}`);
                console.log(`Average reading time: ${analytics.averageReadingTime} minutes`);
                console.log(`Posts with code: ${analytics.resultsWithCode}`);
                console.log(`Top categories: ${Object.entries(analytics.topCategories).slice(0, 3).map(([k,v]) => `${k}(${v})`).join(', ')}`);
                console.log(`Top tags: ${Object.entries(analytics.topTags).slice(0, 5).map(([k,v]) => `${k}(${v})`).join(', ')}`);
                console.log('');
            }
            else {
                console.log('❌ Invalid command or missing query. Type "help" for available commands.');
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }

    rl.close();
    console.log('👋 Goodbye!');
}

/**
 * Main function - runs demo or specific search based on arguments
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (!CONFIG.searchServiceName || !CONFIG.adminApiKey) {
        console.error('❌ Missing required configuration:');
        console.error('- AZ_SEARCH_SERVICE_NAME: Your Azure Search service name');
        console.error('- AZ_SEARCH_ADMIN_KEY or AZ_SEARCH_QUERY_KEY: Your Azure Search key');
        process.exit(1);
    }

    if (args.length === 0) {
        await runInteractiveDemo();
    } else {
        const searchClient = new EnhancedSearchClient();
        const query = args.join(' ');
        
        console.log(`🔍 Searching for: "${query}"`);
        const results = await searchClient.search(query);
        
        console.log(`📊 Found ${results.count} results\n`);
        
        let count = 0;
        for await (const result of results.results) {
            const doc = result.document;
            console.log(`${++count}. ${doc.title}`);
            console.log(`   Author: ${doc.author} | Published: ${new Date(doc.publishedDate).toDateString()}`);
            console.log(`   Description: ${doc.description}`);
            console.log(`   Tags: ${doc.tags ? doc.tags.join(', ') : 'None'}`);
            console.log(`   URL: ${doc.url}`);
            console.log('');
        }
    }
}

// Execute main function
main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});

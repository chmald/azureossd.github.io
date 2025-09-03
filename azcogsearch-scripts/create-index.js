/**
 * Enhanced Azure AI Search Index Creation Script
 * 
 * This script creates an optimized search index with:
 * - Enhanced field definitions for better search relevance
 * - Semantic search configuration
 * - Suggester configuration for autocomplete
 * - Proper analyzers for different content types
 * - Faceting support for filtering
 */

const { SearchIndexClient, AzureKeyCredential } = require("@azure/search-documents");

// Load environment variables
require("dotenv").config();

const CONFIG = {
    searchServiceName: process.env.AZ_SEARCH_SERVICE_NAME,
    adminApiKey: process.env.AZ_SEARCH_ADMIN_KEY,
    indexName: process.env.AZ_SEARCH_INDEX_NAME || 'blog-index',
    enableSemanticSearch: process.env.ENABLE_SEMANTIC_SEARCH === 'true',
    enableSuggesters: process.env.ENABLE_SUGGESTERS !== 'false'
};

/**
 * Enhanced index schema with optimized field configurations
 */
function createIndexSchema() {
    const fields = [
        {
            name: "id",
            type: "Edm.String",
            key: true,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: false
        },
        {
            name: "title",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            retrievable: true,
            sortable: true,
            facetable: false,
            analyzer: "en.microsoft"
        },
        {
            name: "author",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: true
        },
        {
            name: "description",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false,
            analyzer: "en.microsoft"
        },
        {
            name: "content",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false,
            analyzer: "en.microsoft"
        },
        {
            name: "tags",
            type: "Collection(Edm.String)",
            searchable: true,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
        },
        {
            name: "categories",
            type: "Collection(Edm.String)",
            searchable: true,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
        },
        {
            name: "languages",
            type: "Collection(Edm.String)",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
        },
        {
            name: "keywords",
            type: "Collection(Edm.String)",
            searchable: true,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false
        },
        {
            name: "url",
            type: "Edm.String",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: false
        },
        {
            name: "absoluteUrl",
            type: "Edm.String",
            searchable: false,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false
        },
        {
            name: "publishedDate",
            type: "Edm.DateTimeOffset",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: true
        },
        {
            name: "lastModified",
            type: "Edm.DateTimeOffset",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
        },
        {
            name: "readingTime",
            type: "Edm.Int32",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: true
        },
        {
            name: "wordCount",
            type: "Edm.Int32",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
        },
        {
            name: "hasCodeBlocks",
            type: "Edm.Boolean",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
        },
        {
            name: "codeBlockCount",
            type: "Edm.Int32",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
        },
        {
            name: "searchScore",
            type: "Edm.Double",
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
        }
    ];

    const indexDefinition = {
        name: CONFIG.indexName,
        fields: fields,
        corsOptions: {
            allowedOrigins: ["*"],
            maxAgeInSeconds: 300
        }
    };

    // Add suggesters if enabled
    if (CONFIG.enableSuggesters) {
        indexDefinition.suggesters = [
            {
                name: "title-suggester",
                searchMode: "analyzingInfixMatching",
                sourceFields: ["title", "tags", "categories"]
            }
        ];
    }

    // Add semantic search configuration if enabled
    if (CONFIG.enableSemanticSearch) {
        indexDefinition.semantic = {
            configurations: [
                {
                    name: "blog-semantic-config",
                    prioritizedFields: {
                        titleField: {
                            fieldName: "title"
                        },
                        prioritizedContentFields: [
                            {
                                fieldName: "content"
                            },
                            {
                                fieldName: "description"
                            }
                        ],
                        prioritizedKeywordsFields: [
                            {
                                fieldName: "tags"
                            },
                            {
                                fieldName: "categories"
                            },
                            {
                                fieldName: "keywords"
                            }
                        ]
                    }
                }
            ]
        };
    }

    return indexDefinition;
}

/**
 * Check if index exists
 * @param {SearchIndexClient} client - Search index client
 * @returns {Promise<boolean>} True if index exists
 */
async function indexExists(client) {
    try {
        await client.getIndex(CONFIG.indexName);
        return true;
    } catch (error) {
        if (error.statusCode === 404) {
            return false;
        }
        throw error;
    }
}

/**
 * Main function to create or update the search index
 */
async function main() {
    try {
        console.log('🏗️  Azure AI Search Index Creation Tool');
        console.log('════════════════════════════════════════');
        
        // Validate configuration
        if (!CONFIG.searchServiceName || !CONFIG.adminApiKey) {
            console.error('❌ Missing required configuration:');
            console.error('- AZ_SEARCH_SERVICE_NAME: Your Azure Search service name');
            console.error('- AZ_SEARCH_ADMIN_KEY: Your Azure Search admin key');
            process.exit(1);
        }
        
        console.log(`🔍 Search Service: ${CONFIG.searchServiceName}`);
        console.log(`📖 Index Name: ${CONFIG.indexName}`);
        console.log(`🧠 Semantic Search: ${CONFIG.enableSemanticSearch ? 'Enabled' : 'Disabled'}`);
        console.log(`💡 Suggesters: ${CONFIG.enableSuggesters ? 'Enabled' : 'Disabled'}`);
        console.log('');
        
        // Initialize client
        const serviceUrl = `https://${CONFIG.searchServiceName}.search.windows.net`;
        const client = new SearchIndexClient(serviceUrl, new AzureKeyCredential(CONFIG.adminApiKey));
        
        // Check if index exists
        const exists = await indexExists(client);
        
        if (exists) {
            console.log(`⚠️  Index '${CONFIG.indexName}' already exists.`);
            console.log('');
            
            // Get current index to compare
            const currentIndex = await client.getIndex(CONFIG.indexName);
            console.log('📊 Current Index Information:');
            console.log(`   Fields: ${currentIndex.fields.length}`);
            console.log(`   Suggesters: ${currentIndex.suggesters ? currentIndex.suggesters.length : 0}`);
            console.log(`   Semantic Config: ${currentIndex.semantic ? 'Yes' : 'No'}`);
            console.log('');
            
            console.log('🔄 Do you want to recreate the index? This will delete all existing data.');
            console.log('   Type "yes" to continue or anything else to abort:');
            
            // Simple prompt for confirmation
            const response = await new Promise((resolve) => {
                process.stdin.once('data', (data) => {
                    resolve(data.toString().trim().toLowerCase());
                });
            });
            
            if (response !== 'yes') {
                console.log('❌ Index creation aborted.');
                process.exit(0);
            }
            
            console.log('🗑️  Deleting existing index...');
            await client.deleteIndex(CONFIG.indexName);
            console.log('✅ Index deleted successfully.');
        }
        
        // Create new index
        console.log('🏗️  Creating new index with enhanced schema...');
        const indexDefinition = createIndexSchema();
        
        await client.createIndex(indexDefinition);
        
        console.log('✅ Index created successfully!');
        console.log('');
        console.log('📋 Index Features:');
        console.log(`   📝 Fields: ${indexDefinition.fields.length}`);
        console.log(`   🔍 Searchable fields: ${indexDefinition.fields.filter(f => f.searchable).length}`);
        console.log(`   🏷️  Filterable fields: ${indexDefinition.fields.filter(f => f.filterable).length}`);
        console.log(`   📊 Facetable fields: ${indexDefinition.fields.filter(f => f.facetable).length}`);
        console.log(`   📈 Sortable fields: ${indexDefinition.fields.filter(f => f.sortable).length}`);
        
        if (indexDefinition.suggesters) {
            console.log(`   💡 Suggesters: ${indexDefinition.suggesters.length}`);
        }
        
        if (indexDefinition.semantic) {
            console.log(`   🧠 Semantic search: Enabled`);
        }
        
        console.log('');
        console.log('🎉 Index creation completed!');
        console.log('💡 Next steps:');
        console.log('   1. Run "npm run index" to populate the index with blog posts');
        console.log('   2. Test search functionality with the search client');
        
    } catch (error) {
        console.error('❌ Error creating search index:');
        console.error(`   Message: ${error.message}`);
        
        if (error.code) {
            console.error(`   Code: ${error.code}`);
        }
        
        if (error.details) {
            console.error(`   Details: ${JSON.stringify(error.details, null, 2)}`);
        }
        
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received interrupt signal. Exiting...');
    process.exit(0);
});

// Execute main function
main();

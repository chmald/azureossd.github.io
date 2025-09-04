# Azure OSS Developer Support Blog - AI Agent Instructions

## Project Overview
This is a Jekyll-based blog for Azure OSS Developer Support, built with the Minimal Mistakes theme. The site hosts technical articles about running open-source technologies on Azure App Service, with integrated Azure AI Search capabilities.

## Architecture & Key Components

### Core Structure
- **Jekyll Site**: Static site generator with Minimal Mistakes theme (`minimal_mistakes_skin: "contrast"`)
- **Content**: Blog posts in `_posts/` with strict naming convention `YYYY-MM-DD-title.md`
- **Search**: Azure AI Search integration via `azcogsearch-scripts/` for enhanced content discovery
- **Deployment**: GitHub Pages with automated Azure Search indexing on content changes

### Critical File Patterns
- **Blog Posts**: Use template from `_posts/YYYY-MM-DD-Your-Article-Title.md` (DO NOT edit this template file)
- **Front Matter**: Must include `title`, `author_name`, `tags` (max 3), `categories` (specific hierarchy), `date` matching filename
- **Categories**: Follow pattern `[Service Type, Stack, Framework, Database, Blog Type]` - see template for exact values
- **Media**: Store images in `/media/YYYY/MM/` structure, reference as `/media/2019/03/image.png`

## Development Workflows

### Local Development
```bash
# Setup (first time)
bundle install
cd azcogsearch-scripts && npm install && cd ..

# Daily development
bundle exec jekyll serve  # Site at http://localhost:4000
```

### Content Creation Process
1. **Never edit** the template file `_posts/YYYY-MM-DD-Your-Article-Title.md`
2. Copy template and rename with actual date/title: `2025-01-15-setting-up-nodejs.md`
3. Update front matter with real values (maintain category hierarchy)
4. Use H2 headers (`##`) for main sections to support TOC
5. Indent code blocks and media under ordered lists with 3 spaces to maintain numbering

### Azure Search Integration
- **Scripts Location**: `azcogsearch-scripts/` - enhanced v2.0 with semantic search, batch processing
- **Auto-indexing**: Triggered on push to master for `_posts/**` changes via GitHub Actions
- **Environment**: Requires `AZ_SEARCH_SERVICE_NAME` and `AZ_SEARCH_ADMIN_KEY` in GitHub Secrets
- **Local Testing**: `cd azcogsearch-scripts && npm run search` for interactive client

## Project-Specific Conventions

### Content Standards
- **Code Blocks**: Always specify language (```yaml, ```bash, ```javascript)
- **Images**: Include descriptive alt text, maintain `/media/YYYY/MM/` structure
- **Links**: Use absolute paths for internal links (`/categories/`, not `./categories/`)
- **TOC**: Add `toc: true` and `toc_sticky: true` for longer posts

### Navigation & Organization
- **Categories**: Pre-defined in `_data/navigation.yml` - don't create new ones without updating navigation
- **Technology Stacks**: Node.js, Java, Python, PHP, WordPress, .NET Core (match existing patterns)
- **Service Types**: Azure App Service on Linux/Windows, Function App, Azure VM, Azure SDK

### Security & Best Practices
- **Secrets**: All Azure credentials in GitHub Secrets, never in code
- **Dependencies**: Use `npm ci` and `bundle install` for reproducible builds
- **Validation**: Run `npm audit` in azcogsearch-scripts for security checks
- **Images**: Optimize for web, use appropriate teaser images from `/assets/images/`

## Integration Points

### Theme Customization
- **Config**: `_config.yml` defines site-wide settings, analytics (UA-173706243-1), and theme skin
- **Layouts**: Custom layouts in `_layouts/` extend Minimal Mistakes base theme
- **Includes**: Custom components in `_includes/` for specialized functionality

### External Dependencies
- **Jekyll Plugins**: Auto-loaded via theme gem (paginate, sitemap, feed, gist, etc.)
- **Node.js**: Required only for Azure Search scripts, not Jekyll itself
- **Ruby Gems**: Managed via Bundler, see `Gemfile` for theme and dependencies

## Common Pitfalls to Avoid
- Don't break ordered list numbering (use 3-space indentation for sub-content)
- Don't create categories outside the established hierarchy
- Don't edit the template file directly
- Don't commit `.env` files or secrets
- Don't use relative paths for internal site navigation
- Don't skip the `bundle exec` prefix when running Jekyll locally

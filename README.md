<<<<<<< HEAD
# Model-Context-Protocol-servers

# Leafly Cannabis Strain Data Scraper

This project implements a specialized scraper for collecting structured cannabis strain data from Leafly.com, following a standardized schema and methodology. It is implemented as a tool for the Firecrawl MCP server and can also be run as a standalone script.

## Installation

1. Ensure you have Node.js 18+ installed
2. Clone the repository
3. Install dependencies:
   ```bash
   cd firecrawl-mcp-server
   npm install
   ```
4. Set up environment variables:
   ```bash
   # Copy the example .env file
   cp .env.example .env
   
   # Edit the .env file and add your Firecrawl API key
   # You can obtain an API key from https://mendable.ai/firecrawl
   nano .env  # or use any text editor
   ```
5. Build the project:
   ```bash
   npm run build
   ```

## API Key Requirement

**Important**: This scraper requires a valid Firecrawl API key to function. If you try to run the scraper without a valid API key, you will receive a 401 Unauthorized error.

You can set the API key in one of two ways:

1. **Environment Variable**:
   ```bash
   export FIRECRAWL_API_KEY=your_api_key_here
   ```

2. **In a .env file**:
   ```
   FIRECRAWL_API_KEY=your_api_key_here
   ```

If you don't have an API key, you'll need to sign up for one at the Firecrawl website.

## Important TypeScript Notes

If you modify the code and encounter TypeScript errors during compilation, note the following:

1. **Import Extensions**: When importing local modules, you must include the `.js` extension (not `.ts`) due to ES modules requirements:
   ```typescript
   // Correct (with ES modules)
   import { myFunction } from './my-module.js';
   
   // Incorrect (will cause errors)
   import { myFunction } from './my-module';
   ```

2. **Type Assertions**: When working with external APIs, you may need to add type assertions:
   ```typescript
   // Add type assertions for parameters
   const { strains, exportFormat = 'csv' } = args as { strains: string[], exportFormat?: string };
   ```

3. **Null Checking**: Add null/undefined checks before using potentially undefined values:
   ```typescript
   if (!alternativeUrl) {
     console.log(`No valid URL found in search results`);
     return;
   }
   ```

## Features

- Scrapes 66 standardized data points for each cannabis strain from Leafly.com
- Follows a consistent methodology for data extraction and normalization
- Handles cases where data is missing or inconsistent
- Exports data in CSV or JSON format
- Built-in fallback mechanisms for strains that aren't directly accessible

## Data Structure

The scraper collects the following categories of data for each strain:

- **Basic Information**: Strain name
- **Terpenes**: myrcene, pinene, caryophyllene, limonene, linalool, terpinolene, ocimene, humulene, other
- **Cannabinoids**: THC, CBD, CBG, CBN, other
- **Medical Effects**: Stress, Anxiety, Depression, Pain, Insomnia, Lack of Appetite, Nausea, other
- **User Effects**: Happy, Euphoric, Creative, Relaxed, Uplifted, Energetic, Focused, Sleepy, Hungry, Talkative, Tingly, Giggly, DryMouth, DryEyes, Dizzy, Paranoid, Anxious, other
- **Onset and Duration**: onset_minutes, duration_hours
- **Interactions**: Sedatives, Anti-anxiety (benzodiazepines), Antidepressants (SSRIs), Opioid analgesics, Anticonvulsants, Anticoagulants, other
- **Flavors**: Berry, Sweet, Earthy, Pungent, Pine, Vanilla, Minty, Skunky, Citrus, Spicy, Herbal, Diesel, Tropical, Fruity, Grape, other

## Usage

### As a Firecrawl MCP Tool

Once integrated with the Firecrawl MCP server, the tool can be called with the following parameters:

```json
{
  "name": "firecrawl_leafly_strain",
  "arguments": {
    "strains": ["Blue Dream", "OG Kush", "Sour Diesel"],
    "exportFormat": "csv"  // or "json"
  }
}
```

### Using the CLI Script

You can also use the included CLI script to run the scraper directly:

```bash
# Set the Firecrawl API key (required)
export FIRECRAWL_API_KEY=your_api_key_here

# Using npm scripts
npm run scrape-leafly -- output.csv "Blue Dream,OG Kush,Sour Diesel"

# Or running directly
node dist/leafly-scraper-cli.js output.csv "Blue Dream,OG Kush,Sour Diesel"
```

## Methodology

The scraper follows a rigorous methodology for extracting and normalizing data:

1. **Lab Data Priority**: Lab-tested cannabinoid and terpene data is prioritized when available
2. **Consistent Normalization**: When exact values aren't available, standardized normalization is applied:
   - For terpenes: dominant = 0.008, second = 0.005, third = 0.003, others = 0.001
   - For effects and flavors: Values are normalized to a 0.0-1.0 scale
3. **Default Values**: Standard defaults are applied for commonly missing fields:
   - onset_minutes = 5
   - duration_hours = 3
4. **Data Validation**: Outliers and inconsistencies are identified and corrected

## Implementation Details

The scraper is implemented in TypeScript and consists of several key components:

1. **URL Formation and Parsing**: Converts strain names to Leafly URL format
2. **Content Extraction**: Uses regex patterns to extract structured data from page content
3. **Fallback Mechanisms**: If a strain isn't found directly, uses search to find alternative URLs
4. **Rate Limiting**: Implements concurrency control to respect website rate limits
5. **Data Normalization**: Applies the standardized methodology to normalize data

## Troubleshooting

### TypeScript Errors

If you encounter TypeScript compilation errors:

1. Ensure you have all dependencies installed: `npm install`
2. Make sure TypeScript is installed: `npm install -g typescript`
3. TypeScript module errors can typically be fixed by installing the @types packages:
   ```bash
   npm install --save-dev @types/node
   ```

### API Key Issues

The Firecrawl API requires a valid API key. If you get authentication errors:

1. Obtain a valid API key from Firecrawl
2. Set it in your environment: `export FIRECRAWL_API_KEY=your_key_here`
3. Or pass it directly in the code

## Dependencies

- FirecrawlApp: For web scraping and search functionality
- p-queue: For managing concurrent requests
- fs/path: For file operations in the CLI script

## License

This project is intended for research and educational purposes only. Use responsibly and in accordance with Leafly's terms of service. 
>>>>>>> 61e09e2 (Added submodules for Model-Context-Protocol-servers and firecrawl-mcp-server)

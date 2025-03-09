# Model-Context-Protocol Servers

A collection of specialized MCP (Model Context Protocol) servers for different use cases.

## 1. Leafly Cannabis Strain Data Scraper

This MCP server implements a specialized scraper for collecting structured cannabis strain data from Leafly.com, following a standardized schema and methodology.

### Installation

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

### API Key Requirement

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

### Features

- Scrapes 66 standardized data points for each cannabis strain from Leafly.com
- Follows a consistent methodology for data extraction and normalization
- Handles cases where data is missing or inconsistent
- Exports data in CSV or JSON format
- Built-in fallback mechanisms for strains that aren't directly accessible

### Implementation Approaches

#### Regex-Based Extraction

The repository includes a regex-based scraper that extracts data using pattern matching:

```typescript
// Extract cannabinoids using regex
function extractCannabinoids(content: string, strainData: StrainData): void {
  // THC extraction
  const thcMatch = content.match(/THC\s+(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i);
  if (thcMatch) {
    // Take higher end of range per methodology
    const thcValue = thcMatch[2] ? parseFloat(thcMatch[2]) : parseFloat(thcMatch[1]);
    strainData["cannabinoids.THC"] = thcValue / 100;
  }
  
  // Similar patterns for other cannabinoids
}
```

#### LLM-Powered Extraction (Recommended)

The repository also includes an advanced LLM-powered extraction method that uses structured schemas and AI to extract information more accurately:

```typescript
// Using the extract tool for LLM-powered extraction
const strainSchema = {
  type: 'object',
  properties: {
    "strain_name": { type: 'string' },
    "aliases": { type: 'string' },
    "strain_classification": { type: 'string' },
    "thc_percentage": { type: 'number' },
    "cbd_percentage": { type: 'number' },
    "cbg_percentage": { type: 'number' },
    "terpenes": { 
      type: 'object',
      properties: {
        "myrcene": { type: 'string' },
        "caryophyllene": { type: 'string' }
        // Other terpenes...
      }
    },
    // Other properties...
  }
};

// Extract data using LLM
const extractedData = await client.extract([strainUrl], {
  schema: strainSchema,
  systemPrompt: "Extract precise cannabis strain data. Use exact numbers when available.",
  prompt: `Extract all available data for the cannabis strain "${strain}" according to the schema.`
});
```

Benefits of LLM extraction:
- Better handling of unstructured text and variations in formatting
- More resilient to website changes
- Can infer missing values based on context
- Extracts relationships between data points

### Data Structure

The scraper collects the following categories of data for each strain:

- **Basic Information**: Strain name
- **Terpenes**: myrcene, pinene, caryophyllene, limonene, linalool, terpinolene, ocimene, humulene, other
- **Cannabinoids**: THC, CBD, CBG, CBN, other
- **Medical Effects**: Stress, Anxiety, Depression, Pain, Insomnia, Lack of Appetite, Nausea, other
- **User Effects**: Happy, Euphoric, Creative, Relaxed, Uplifted, Energetic, Focused, Sleepy, Hungry, Talkative, Tingly, Giggly, DryMouth, DryEyes, Dizzy, Paranoid, Anxious, other
- **Onset and Duration**: onset_minutes, duration_hours
- **Interactions**: Sedatives, Anti-anxiety (benzodiazepines), Antidepressants (SSRIs), Opioid analgesics, Anticonvulsants, Anticoagulants, other
- **Flavors**: Berry, Sweet, Earthy, Pungent, Pine, Vanilla, Minty, Skunky, Citrus, Spicy, Herbal, Diesel, Tropical, Fruity, Grape, other

### Usage

#### As a Firecrawl MCP Tool

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

#### Using the Extract Tool Directly

For more advanced extraction with the LLM-powered approach:

```json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://www.leafly.com/strains/blue-dream"],
    "schema": {
      "type": "object",
      "properties": {
        "strain_name": { "type": "string" },
        "thc_percentage": { "type": "number" },
        "cbd_percentage": { "type": "number" },
        "effects": { "type": "string" },
        "flavors": { "type": "string" },
        "medical": { "type": "string" },
        "terpenes": { "type": "object" }
      }
    },
    "prompt": "Extract comprehensive cannabis strain data from this Leafly page."
  }
}
```

#### Using the CLI Script

You can also use the included CLI script to run the scraper directly:

```bash
# Set the Firecrawl API key (required)
export FIRECRAWL_API_KEY=your_api_key_here

# Using npm scripts
npm run scrape-leafly -- output.csv "Blue Dream,OG Kush,Sour Diesel"

# Or running directly
node dist/leafly-scraper-cli.js output.csv "Blue Dream,OG Kush,Sour Diesel"
```

### Methodology

The scraper follows a rigorous methodology for extracting and normalizing data:

1. **Lab Data Priority**: Lab-tested cannabinoid and terpene data is prioritized when available
2. **Consistent Normalization**: When exact values aren't available, standardized normalization is applied:
   - For terpenes: dominant = 0.008, second = 0.005, third = 0.003, others = 0.001
   - For effects and flavors: Values are normalized to a 0.0-1.0 scale
3. **Default Values**: Standard defaults are applied for commonly missing fields

### Troubleshooting

#### TypeScript Errors

If you encounter TypeScript compilation errors:

1. Ensure you have all dependencies installed: `npm install`
2. Make sure TypeScript is installed: `npm install -g typescript`
3. TypeScript module errors can typically be fixed by installing the @types packages:
   ```bash
   npm install --save-dev @types/node
   ```

## 2. Python Codebase MCP Server

This MCP server provides code analysis capabilities and file system access for codebase navigation.

### Installation

1. Ensure you have Python 3.7+ installed
2. Install dependencies:
   ```bash
   pip install mcp-python-sdk watchdog
   ```

### Features

- File system navigation and file reading
- Code search functionality
- Project structure analysis
- Real-time file change monitoring
- Function and component discovery
- Dependency analysis

### Usage

Start the server:

```bash
python mcp_server.py
```

The server provides tools for code analysis:

- **search_function**: Find function definitions in code files
- **search_code**: Search for text across all code files
- **get_project_structure**: Generate a tree-like structure of the project
- **analyze_dependencies**: Analyze project dependencies
- **find_components**: Discover React/React Native components

### Resources

- **/file/list/{directory}**: List files in a directory
- **/file/read/{filepath}**: Read file contents
- **/file/info/{filepath}**: Get file metadata
- **/file/changes/{directory}**: Get recently modified files

## 3. DeepSeek R1 MCP Server

This MCP server provides access to DeepSeek AI models for text generation, summarization, and document processing.

### Installation

1. Ensure you have Node.js 14+ installed
2. Install dependencies:
   ```bash
   npm install @modelcontextprotocol/sdk openai dotenv
   ```
3. Set up environment variables:
   ```bash
   # Create a .env file
   echo "DEEPSEEK_API_KEY=your_api_key_here" > .env
   ```

### Features

- Text generation using DeepSeek R1 model
- Text summarization
- Streaming text generation
- Multi-model support
- Document processing (summarize, extract entities, analyze sentiment)
- File operations for saving outputs

### Usage

Start the server:

```bash
node deepseek_mcp.js
```

The server provides the following tools:

- **deepseek_r1**: Generate text using DeepSeek R1 model
- **deepseek_summarize**: Summarize text
- **deepseek_stream**: Stream text generation
- **deepseek_multi**: Generate text using different DeepSeek models
- **deepseek_document**: Process documents (summarize, extract entities, analyze sentiment)

### Resources

- **/model/info**: Get information about supported models
- **/server/status**: Check server status
- **/file/save/{filename}**: Save content to a file
- **/file/list**: List saved files
- **/file/read/{filename}**: Read saved file contents

## 4. JSON MCP Server

This MCP server provides advanced JSON querying and manipulation capabilities.

### Installation

1. Ensure you have Node.js 14+ installed
2. Install dependencies:
   ```bash
   npm install @modelcontextprotocol/sdk node-fetch jsonpath
   ```

### Features

- Query JSON data using JSONPath
- Advanced filtering
- String operations
- Numeric operations
- Date operations
- Array transformations
- Complex data comparisons
- Result caching
- Save and manage query results

### Usage

Start the server:

```bash
node json_mcp.js
```

The server provides the following tools:

- **query**: Query JSON data using JSONPath expressions
- **filter**: Filter JSON data based on conditions
- **save_query**: Save query results to a file
- **compare_json**: Compare two JSON datasets

### Resources

- **/saved_queries/list**: List saved queries
- **/saved_queries/get/{filename}**: Retrieve a saved query
- **/cache/status**: Check cache status
- **/cache/clear**: Clear the cache

## License

This project is intended for research and educational purposes only. Use responsibly and in accordance with the respective terms of service for any external APIs or websites.

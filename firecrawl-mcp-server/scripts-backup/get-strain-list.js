import dotenv from 'dotenv';
import FirecrawlApp from '@mendable/firecrawl-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize environment variables
dotenv.config();

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Scrape Leafly's strain explorer pages to get a comprehensive list of strains
 */
async function getAllStrainUrls() {
  console.log('🔍 Starting to gather Leafly strain URLs...');
  
  // Initialize Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Base URLs for strain listings
  // These URLs cover different sorting options to maximize strain discovery
  const startingUrls = [
    // Popular strains sorted by various criteria
    'https://www.leafly.com/strains?sort=popular',
    'https://www.leafly.com/strains?sort=name',
    'https://www.leafly.com/strains?sort=trending',
    
    // Strains by type
    'https://www.leafly.com/strains/lists/category/hybrid',
    'https://www.leafly.com/strains/lists/category/indica', 
    'https://www.leafly.com/strains/lists/category/sativa',
    
    // Strains by effect
    'https://www.leafly.com/strains/lists/effect/relaxed',
    'https://www.leafly.com/strains/lists/effect/happy',
    'https://www.leafly.com/strains/lists/effect/euphoric',
    'https://www.leafly.com/strains/lists/effect/uplifted',
    'https://www.leafly.com/strains/lists/effect/creative',
    'https://www.leafly.com/strains/lists/effect/energetic',
    'https://www.leafly.com/strains/lists/effect/focused',
    'https://www.leafly.com/strains/lists/effect/sleepy',
    
    // Various curated lists to capture more strains
    'https://www.leafly.com/strains/lists/flavor/sweet',
    'https://www.leafly.com/strains/lists/flavor/earthy',
    'https://www.leafly.com/strains/lists/characteristic/high-thc',
    'https://www.leafly.com/strains/lists/characteristic/high-cbd',
    'https://www.leafly.com/strains/lists/growing/low-yield'
  ];
  
  // Function to extract strain URLs from HTML content
  const extractStrainUrls = (content) => {
    // Look for strain URLs in the content using regex
    const strainUrlPattern = /href="(\/strains\/[^"]+)"/g;
    const matches = [...content.matchAll(strainUrlPattern)];
    
    // Extract and normalize URLs
    return matches
      .map(match => match[1]) // Get the captured group
      .filter(url => url && !url.includes('/strains/lists/') && !url.includes('/strains?')) // Filter out non-strain URLs
      .map(url => {
        // Extract just the strain name from the URL
        const parts = url.split('/');
        return parts[parts.length - 1];
      });
  };
  
  // Set to track unique strain names
  const strainNames = new Set();
  
  // Process each starting URL
  for (let i = 0; i < startingUrls.length; i++) {
    const url = startingUrls[i];
    console.log(`\nProcessing listing page (${i + 1}/${startingUrls.length}): ${url}`);
    
    try {
      // Scrape the page
      const result = await client.scrapeUrl(url, {
        formats: ['html'],
        onlyMainContent: false, // We need the full HTML to find all links
        waitFor: 3000 // Wait for dynamic content to load
      });
      
      if (result.success && result.html) {
        // Extract strain URLs
        const strainsOnPage = extractStrainUrls(result.html);
        
        // Add to our set of unique strains
        const initialCount = strainNames.size;
        strainsOnPage.forEach(strain => strainNames.add(strain));
        
        console.log(`Found ${strainsOnPage.length} strains, ${strainNames.size - initialCount} new (Total: ${strainNames.size})`);
      } else {
        console.error(`Failed to scrape ${url}: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error processing ${url}: ${error.message}`);
    }
    
    // Delay between requests to avoid rate limiting
    if (i < startingUrls.length - 1) {
      console.log('Waiting 3 seconds before next page...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  // Convert set to array and sort alphabetically
  const sortedStrains = [...strainNames].sort();
  
  console.log(`\n✅ Found ${sortedStrains.length} unique strain names`);
  
  // Save the results
  const outputDir = path.join(__dirname, 'leafly-extract-data');
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(
    path.join(outputDir, 'all-strain-names.json'),
    JSON.stringify(sortedStrains, null, 2)
  );
  
  await fs.writeFile(
    path.join(outputDir, 'all-strain-names.txt'),
    sortedStrains.join('\n')
  );
  
  console.log(`\n✅ Strain list saved to leafly-extract-data/all-strain-names.json`);
  
  return sortedStrains;
}

// Execute the function
console.log('Starting Leafly strain discovery process...');
getAllStrainUrls().then(strains => {
  console.log(`Process complete! Found ${strains.length} strains.`);
}).catch(err => {
  console.error('Fatal error during strain discovery:', err);
}); 
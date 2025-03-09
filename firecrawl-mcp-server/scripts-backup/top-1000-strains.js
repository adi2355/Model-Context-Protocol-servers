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
 * Initially seed with a manually curated list of popular strains 
 * to ensure we at least have the top strains covered
 */
const POPULAR_STRAINS = [
  // Most popular hybrids
  'blue-dream', 'wedding-cake', 'gelato', 'mimosa', 'pineapple-express',
  'gg4', 'gsc', 'mac', 'zkittlez', 'runtz',
  'purple-punch', 'do-si-dos', 'sherbert', 'cookies-and-cream', 'gorilla-glue',
  
  // Popular indicas
  'granddaddy-purple', 'northern-lights', 'bubba-kush', 'purple-kush', 'hindu-kush',
  'skywalker-og', 'blueberry', 'ice-cream-cake', 'afghan-kush', 'purple-urkle',
  
  // Popular sativas
  'jack-herer', 'sour-diesel', 'durban-poison', 'green-crack', 'super-lemon-haze',
  'super-silver-haze', 'strawberry-cough', 'trainwreck', 'maui-wowie', 'tangie',
  
  // High CBD strains
  'acdc', 'harlequin', 'sour-tsunami', 'cannatonic', 'charlottes-web',
  'ringo-gift', 'pennywise', 'harle-tsu', 'cbd-critical-mass', 'canna-tsu',
  
  // Award winners
  'white-widow', 'ak-47', 'white-tahoe-cookie', 'chemdawg', 'og-kush',
  'sunset-sherbert', 'wedding-gelato', 'black-diamond', 'grease-monkey', 'banana-kush',
  
  // Classic strains
  'afghani', 'skunk-1', 'g13', 'cheese', 'chronic',
  'amnesia-haze', 'bubblegum', 'godfather-og', 'la-confidential', 'master-kush',
];

/**
 * Extract strain URLs using an improved approach with the /extract endpoint
 */
async function getMoreStrains() {
  console.log('🔍 Getting additional strains using /extract...');
  
  // Initialize Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Create a set including our starting strains
  const allStrains = new Set(POPULAR_STRAINS);
  console.log(`Starting with ${allStrains.size} hard-coded popular strains`);
  
  // URLs with strain listings
  const listingUrls = [
    'https://www.leafly.com/strains',
    'https://www.leafly.com/strains/lists/category/indica',
    'https://www.leafly.com/strains/lists/category/sativa',
    'https://www.leafly.com/strains/lists/category/hybrid',
    'https://www.leafly.com/strains/lists/effect/relaxed',
    'https://www.leafly.com/strains/lists/effect/happy',
    'https://www.leafly.com/strains/lists/effect/sleepy',
    'https://www.leafly.com/strains/lists/flavor/sweet'
  ];
  
  // Define schema to extract strain links
  const schema = {
    type: 'object',
    properties: {
      strain_urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of URLs for individual strain pages'
      }
    }
  };
  
  // Extract strain URLs using the /extract endpoint
  for (const url of listingUrls) {
    console.log(`\nExtracting strain URLs from ${url}...`);
    
    try {
      const result = await client.extract([url], {
        schema,
        prompt: `Extract all strain URLs from this Leafly strains listing page. Look for links to individual strain pages, which should have URLs in the format "/strains/strain-name". Return all strain URLs you can find on this page as an array of strings, with each string being just the URL path (starting with "/strains/").`
      });
      
      if (result.success && result.data && result.data.strain_urls) {
        // Process and normalize strain URLs
        const strainUrls = result.data.strain_urls
          // Handle potentially various URL formats
          .map(url => {
            // Extract just the strain name part
            let strain;
            if (url.startsWith('/strains/')) {
              strain = url.replace('/strains/', '');
            } else if (url.startsWith('https://www.leafly.com/strains/')) {
              strain = url.replace('https://www.leafly.com/strains/', '');
            } else {
              strain = url;
            }
            
            // Clean up any query parameters or hashes
            return strain.split('?')[0].split('#')[0].trim();
          })
          // Remove empty strings and obvious non-strain URLs
          .filter(strain => 
            strain && 
            !strain.includes('/') && 
            !strain.includes('lists') &&
            !strain.includes('search') &&
            strain.length > 1
          );
        
        // Add to our collection
        const initialCount = allStrains.size;
        strainUrls.forEach(strain => allStrains.add(strain));
        
        console.log(`Found ${strainUrls.length} strains, ${allStrains.size - initialCount} new (Total: ${allStrains.size})`);
      } else {
        console.error(`Failed to extract strains from ${url}: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error processing ${url}: ${error.message}`);
    }
    
    // Delay between requests
    console.log('Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  return [...allStrains];
}

/**
 * Generate strain name variations to expand our list
 */
function generateVariations(strains) {
  // Set to hold all strains including variations
  const expandedStrains = new Set(strains);
  const initialCount = expandedStrains.size;
  
  // Common prefixes and suffixes to try
  const prefixes = ['super-', 'royal-', 'purple-', 'white-', 'black-', 'golden-', 'lemon-', 'blue-', 'green-', 'sour-'];
  const suffixes = ['kush', 'haze', 'og', 'diesel', 'cookies', 'dream', 'cake', 'punch', 'glue', 'gelato'];
  
  // Generate name variations
  console.log('\nGenerating strain variations...');
  
  // Add common prefix and suffix combinations with base strain names
  for (const strain of strains) {
    // Skip empty or invalid strains
    if (!strain || strain.startsWith('-')) continue;
    
    // Try adding common prefixes
    for (const prefix of prefixes) {
      const variation = prefix + strain.replace(/^(super|royal|purple|white|black|golden|lemon|blue|green|sour)-/, '');
      if (!variation.startsWith('-')) {
        expandedStrains.add(variation);
      }
    }
    
    // Try adding common suffixes
    for (const suffix of suffixes) {
      // Add with hyphen to form proper strain names
      const variation = strain.replace(/(kush|haze|og|diesel|cookies|dream|cake|punch|glue|gelato)$/, '') + '-' + suffix;
      if (!variation.startsWith('-')) {
        expandedStrains.add(variation);
      }
    }
  }
  
  // Convert to array and filter out invalid names
  const validStrains = [...expandedStrains].filter(strain => !strain.startsWith('-'));
  
  console.log(`Added ${validStrains.length - initialCount} variations (Total: ${validStrains.length})`);
  
  return validStrains;
}

/**
 * Save the strain list to files
 */
async function saveStrainList(strains) {
  // Create output directory
  const outputDir = path.join(__dirname, 'leafly-extract-data');
  await fs.mkdir(outputDir, { recursive: true });
  
  // Filter out invalid strain names (those that start with a dash)
  const validStrains = strains.filter(strain => !strain.startsWith('-'));
  
  console.log(`Filtered out ${strains.length - validStrains.length} invalid strain names`);
  
  // Sort alphabetically
  const sortedStrains = [...validStrains].sort();
  
  // Save as JSON
  await fs.writeFile(
    path.join(outputDir, 'strain-list.json'),
    JSON.stringify(sortedStrains, null, 2)
  );
  
  // Save as text (one per line)
  await fs.writeFile(
    path.join(outputDir, 'strain-list.txt'),
    sortedStrains.join('\n')
  );
  
  // Also save as the complete strain list (for compatibility)
  await fs.writeFile(
    path.join(outputDir, 'complete-strain-list.json'),
    JSON.stringify(sortedStrains, null, 2)
  );
  
  console.log(`\n✅ Saved ${sortedStrains.length} strains to:`);
  console.log(`- ${path.join(outputDir, 'strain-list.json')}`);
  console.log(`- ${path.join(outputDir, 'strain-list.txt')}`);
}

/**
 * Main function to create a comprehensive strain list
 */
async function createStrainList() {
  console.log('Creating comprehensive Leafly strain list...');
  
  // Start with hard-coded popular strains
  console.log(`Starting with ${POPULAR_STRAINS.length} hardcoded popular strains`);
  
  // Get additional strains from Leafly
  const discoveredStrains = await getMoreStrains();
  console.log(`\nDiscovered ${discoveredStrains.length} strains from Leafly`);
  
  // Generate variations to expand the list further
  const expandedStrains = generateVariations(discoveredStrains);
  console.log(`\nExpanded to ${expandedStrains.length} strains with variations`);
  
  // Keep the list to a reasonable size (top 1000)
  let finalStrains = expandedStrains;
  if (expandedStrains.length > 1000) {
    finalStrains = expandedStrains.slice(0, 1000);
    console.log(`\nLimiting to top 1000 strains for processing`);
  }
  
  // Save the strain list
  await saveStrainList(finalStrains);
  
  return finalStrains;
}

// Run the script
createStrainList().then(strains => {
  console.log(`\n🎉 Successfully created a list of ${strains.length} strains!`);
  console.log(`You can now run extract-1000-strains.js to process these strains.`);
}).catch(err => {
  console.error('Error creating strain list:', err);
}); 
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
 * Get strains from Leafly using pagination and their API endpoints
 */
async function getStrainsByPagination() {
  console.log('🔍 Starting to gather Leafly strains via pagination...');
  
  // Initialize Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Set to track unique strain slugs
  const strainSlugs = new Set();
  
  // Maximum number of pages to process
  const MAX_PAGES = 100; // This should give us around 2000-3000 strains
  
  // Pagination parameters
  let pageSize = 50; // Strains per page
  let currentPage = 1;
  let hasMorePages = true;
  
  // Base URL for the pagination API
  const baseUrl = 'https://www.leafly.com/strains';
  
  // Process each page
  while (hasMorePages && currentPage <= MAX_PAGES) {
    const pageUrl = `${baseUrl}?page=${currentPage}&sort=popular&take=${pageSize}`;
    console.log(`\nProcessing page ${currentPage}/${MAX_PAGES}: ${pageUrl}`);
    
    try {
      // First approach: Extract HTML with Firecrawl
      const result = await client.scrapeUrl(pageUrl, {
        formats: ['html'],
        onlyMainContent: false,
        waitFor: 5000 // Longer wait time for pagination to load
      });
      
      if (result.success && result.html) {
        // Extract strain URLs from the HTML
        const strainsOnPage = extractStrainUrls(result.html);
        
        // Add to our set
        const initialCount = strainSlugs.size;
        strainsOnPage.forEach(strain => strainSlugs.add(strain));
        
        // Log progress
        const newStrains = strainSlugs.size - initialCount;
        console.log(`Found ${strainsOnPage.length} strains on page, ${newStrains} new (Total: ${strainSlugs.size})`);
        
        // If we didn't find any new strains on this page, we might have reached the end
        if (newStrains === 0 && currentPage > 5) { // Allow a few empty pages at the start
          console.log('No new strains found on this page. May have reached the end of the list.');
          
          // Give it one more page before quitting
          if (currentPage > 10) {
            hasMorePages = false;
          }
        }
      } else {
        console.error(`Failed to scrape page ${currentPage}: ${result.error || 'Unknown error'}`);
        
        // Try one more time before giving up
        console.log('Retrying once after a longer delay...');
        await new Promise(r => setTimeout(r, 10000)); // 10 second delay
        
        const retryResult = await client.scrapeUrl(pageUrl, {
          formats: ['html'],
          onlyMainContent: false,
          waitFor: 8000 // Even longer wait
        });
        
        if (retryResult.success && retryResult.html) {
          console.log('Retry successful');
          const strainsOnPage = extractStrainUrls(retryResult.html);
          const initialCount = strainSlugs.size;
          strainsOnPage.forEach(strain => strainSlugs.add(strain));
          console.log(`Found ${strainsOnPage.length} strains on retry, ${strainSlugs.size - initialCount} new (Total: ${strainSlugs.size})`);
        } else {
          console.error('Retry also failed, continuing to next page');
        }
      }
      
      // Move to next page
      currentPage++;
      
      // Delay between pages to avoid rate limiting
      console.log('Waiting 5 seconds before next page...');
      await new Promise(r => setTimeout(r, 5000));
    } catch (error) {
      console.error(`Error processing page ${currentPage}: ${error.message}`);
      
      // If we encounter an error, we'll skip this page and try the next one
      currentPage++;
      console.log('Waiting 8 seconds before trying again...');
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  
  // Convert set to array and sort alphabetically
  const sortedStrains = [...strainSlugs].sort();
  
  console.log(`\n✅ Found ${sortedStrains.length} unique strain names through pagination`);
  
  // Save the results
  const outputDir = path.join(__dirname, 'leafly-extract-data');
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(
    path.join(outputDir, 'paginated-strains.json'),
    JSON.stringify(sortedStrains, null, 2)
  );
  
  await fs.writeFile(
    path.join(outputDir, 'paginated-strains.txt'),
    sortedStrains.join('\n')
  );
  
  console.log(`\n✅ Strain list saved to leafly-extract-data/paginated-strains.json`);
  
  return sortedStrains;
}

/**
 * Extract strain URLs from HTML content
 */
function extractStrainUrls(html) {
  // Look for strain URLs in the HTML
  const strainUrlPattern = /href="(\/strains\/[^"]+)"/g;
  const matches = [...html.matchAll(strainUrlPattern)];
  
  // Extract just the strain slugs
  return matches
    .map(match => match[1]) // Get the captured group
    .filter(url => url && !url.includes('/strains/lists/') && !url.includes('/strains?')) // Filter non-strain URLs
    .map(url => {
      // Extract just the strain name from the URL
      const parts = url.split('/');
      return parts[parts.length - 1];
    })
    .filter(Boolean) // Remove any empty strings
    .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
}

/**
 * Merge strain lists from both methods
 */
async function mergeStrainLists() {
  console.log('Starting to get comprehensive strain list...');
  
  try {
    // First, get strains from the category listings
    const listingStrains = await getAllStrainUrls();
    console.log(`Got ${listingStrains.length} strains from category listings`);
    
    // Then, get strains via pagination
    const paginatedStrains = await getStrainsByPagination();
    console.log(`Got ${paginatedStrains.length} strains from pagination`);
    
    // Merge and remove duplicates
    const allStrains = new Set([...listingStrains, ...paginatedStrains]);
    const finalStrainList = [...allStrains].sort();
    
    console.log(`\n✅ Final combined list contains ${finalStrainList.length} unique strains`);
    
    // Save the final combined list
    const outputDir = path.join(__dirname, 'leafly-extract-data');
    
    await fs.writeFile(
      path.join(outputDir, 'complete-strain-list.json'),
      JSON.stringify(finalStrainList, null, 2)
    );
    
    await fs.writeFile(
      path.join(outputDir, 'complete-strain-list.txt'),
      finalStrainList.join('\n')
    );
    
    console.log(`\n✅ Complete strain list saved to leafly-extract-data/complete-strain-list.json`);
    
    return finalStrainList;
  } catch (error) {
    console.error('Error merging strain lists:', error);
    throw error;
  }
}

// Execute just the pagination approach for now
// We can call mergeStrainLists() later if we want to combine methods
console.log('Starting Leafly strain pagination discovery...');
getStrainsByPagination().then(strains => {
  console.log(`Process complete! Found ${strains.length} strains via pagination.`);
}).catch(err => {
  console.error('Fatal error during strain discovery:', err);
}); 
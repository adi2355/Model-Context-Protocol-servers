import dotenv from 'dotenv';
import FirecrawlApp from '@mendable/firecrawl-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeLeaflyStrains } from './dist/leafly-scraper.js';

// Initialize environment variables
dotenv.config();

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testScraper() {
  console.log('Initializing Firecrawl client...');
  
  // Initialize the Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Define strains to test (a mix of different types)
  const strainsToTest = [
    "Blue Dream",      // Sativa-dominant hybrid
    "OG Kush",         // Indica-dominant hybrid 
    "Northern Lights", // Pure indica
    "Durban Poison",   // Pure sativa
    "ACDC"             // High-CBD strain
  ];
  
  console.log(`Testing scraper with strains: ${strainsToTest.join(', ')}`);
  
  try {
    // Scrape the strains one by one to avoid rate limiting
    for (const strain of strainsToTest) {
      console.log(`\nScraping strain: ${strain}...`);
      const result = await scrapeLeaflyStrains(client, [strain], 'json');
      
      if (result.success && result.data && result.data.length > 0) {
        console.log(`✅ Successfully scraped ${strain} data`);
        
        // Save individual strain result
        const outputFile = path.join(__dirname, 'test-output', `${strain.replace(/\s+/g, '_')}.json`);
        await fs.writeFile(outputFile, JSON.stringify(result.data, null, 2));
        console.log(`✅ Results saved to ${outputFile}`);
        
        // Print a summary of the data extracted
        const strainData = result.data[0];
        console.log(`\nData summary for ${strain}:`);
        console.log(`- Classification: ${strainData.strain_classification || 'Not found'}`);
        console.log(`- THC: ${strainData["THC %"] || 'Not found'}%`);
        console.log(`- CBD: ${strainData["CBD %"] || 'Not found'}%`);
        console.log(`- Top terpenes: ${getTerpenes(strainData)}`);
        console.log(`- Medical effects: ${strainData.Medical || 'Not found'}`);
        console.log(`- Effects: ${strainData.Effects || 'Not found'}`);
        console.log(`- Flavors: ${strainData.Flavors || 'Not found'}`);
        
        // Delay to avoid rate limiting
        console.log('Waiting 5 seconds before next strain...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error(`❌ Failed to scrape ${strain}:`, result.error || 'No data returned');
      }
    }
    
    // Combine all results
    console.log('\nCombining all results...');
    const allResults = [];
    for (const strain of strainsToTest) {
      try {
        const strainFile = path.join(__dirname, 'test-output', `${strain.replace(/\s+/g, '_')}.json`);
        const strainData = JSON.parse(await fs.readFile(strainFile, 'utf8'));
        if (strainData && strainData.length > 0) {
          allResults.push(strainData[0]);
        }
      } catch (err) {
        console.warn(`Warning: Could not read data for ${strain}`, err.message);
      }
    }
    
    // Save combined results
    if (allResults.length > 0) {
      const combinedFile = path.join(__dirname, 'test-output', 'all-test-strains.json');
      await fs.writeFile(combinedFile, JSON.stringify(allResults, null, 2));
      console.log(`✅ All results saved to ${combinedFile}`);
      
      // Convert to CSV
      const { convertToCSV } = await import('./dist/leafly-scraper.js');
      const csvData = convertToCSV(allResults);
      const csvFile = path.join(__dirname, 'test-output', 'all-test-strains.csv');
      await fs.writeFile(csvFile, csvData);
      console.log(`✅ CSV data saved to ${csvFile}`);
    } else {
      console.error('❌ No results to combine');
    }
  } catch (error) {
    console.error('❌ Error during scraping:', error);
  }
}

// Helper function to get dominant terpenes
function getTerpenes(strainData) {
  const terpenes = [
    "Caryophyllene", "Limonene", "Myrcene", "Pinene", "Humulene", 
    "Terpinolene", "Ocimene", "Linalool", "Terpineol", "Valencene"
  ];
  
  const dominantTerpenes = terpenes
    .filter(terpene => strainData[terpene] === "Dominant")
    .join(', ');
    
  return dominantTerpenes || 'Not found';
}

// Run the test
testScraper().catch(console.error); 
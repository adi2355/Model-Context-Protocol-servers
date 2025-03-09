#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FirecrawlApp from '@mendable/firecrawl-js';
import { scrapeLeaflyStrains } from './firecrawl-mcp-server/src/leafly-scraper.js';

// Sample list of strains - using a subset of the provided 100 strains
const DEFAULT_STRAINS = [
  "Blue Dream",
  "GSC (Girl Scout Cookies)",
  "OG Kush",
  "Sour Diesel",
  "Durban Poison"
];

async function main() {
  try {
    // Parse command line arguments
    const outputFile = process.argv[2] || 'strain-data.csv';
    const strainsArg = process.argv[3] || '';
    
    // Use provided strains or default list
    const strains = strainsArg ? 
      strainsArg.split(',').map(s => s.trim()) : 
      DEFAULT_STRAINS;
    
    console.log(`Will scrape ${strains.length} strains: ${strains.join(', ')}`);
    console.log(`Results will be saved to: ${outputFile}`);
    
    // Initialize FirecrawlApp client
    const client = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY || '',
    });
    
    // Scrape strains
    console.log('Starting strain scraping...');
    const result = await scrapeLeaflyStrains(client, strains, 'csv');
    
    if (!result.success) {
      console.error('Error:', result.error);
      process.exit(1);
    }
    
    // Write results to file
    fs.writeFileSync(outputFile, result.data);
    console.log(`Successfully scraped strains and saved to ${outputFile}`);
    
  } catch (error) {
    console.error('Error running scraper:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 
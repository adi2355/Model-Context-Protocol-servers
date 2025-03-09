#!/usr/bin/env node

/// <reference types="node" />

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FirecrawlApp from '@mendable/firecrawl-js';
import { scrapeLeaflyStrains } from './leafly-scraper.js';

// Sample list of strains - using a subset of the provided 100 strains
const DEFAULT_STRAINS: string[] = [
  "Blue Dream",
  "GSC (Girl Scout Cookies)",
  "OG Kush",
  "Sour Diesel",
  "Durban Poison"
];

async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const outputFile: string = process.argv[2] || 'strain-data.csv';
    const strainsArg: string = process.argv[3] || '';
    
    // Use provided strains or default list
    const strains: string[] = strainsArg ? 
      strainsArg.split(',').map((s: string) => s.trim()) : 
      DEFAULT_STRAINS;
    
    console.log(`Will scrape ${strains.length} strains: ${strains.join(', ')}`);
    console.log(`Results will be saved to: ${outputFile}`);
    
    // Initialize FirecrawlApp client with explicit API key
    // This approach worked in our test script
    const client = new FirecrawlApp({
      apiKey: "fc-c6727b10239646c8b67dcdf97c1a4321"
      // No custom apiUrl - use the default
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
main().catch((err: Error) => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 
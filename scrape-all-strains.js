#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// The complete list of 100 strains from the provided data
const ALL_STRAINS = [
  "Blue Dream",
  "Original Glue (GG4)",
  "Wedding Cake",
  "GSC (Girl Scout Cookies)",
  "Northern Lights",
  "Chemdog (Chemdawg)",
  "Trainwreck",
  "GMO Cookies",
  "Mendo Breath",
  "Motorbreath",
  "Forbidden Fruit",
  "Gushers",
  "Alien OG",
  "Rainbow Belts",
  "Dutch Treat",
  "MAC (Miracle Alien Cookies)",
  "Mimosa",
  "Strawberry Cough",
  "Cheese",
  "Blueberry Muffins",
  "Stardawg",
  "Kush Mints",
  "Orange Creamsicle",
  "Key Lime Pie",
  "Lemon Tree",
  "Grape Pie",
  "Mango",
  "OG Kush",
  "Ice Cream Cake",
  "Do-Si-Dos",
  "Slurricane",
  "Apple Fritter",
  "Peanut Butter Breath",
  "Grape Ape",
  "LA Kush Cake",
  "Mazar x Blueberry OG",
  "Master Kush",
  "Afghani",
  "Animal Cookies",
  "Khalifa Kush",
  "Zkittlez",
  "Granddaddy Purple",
  "Purple Punch",
  "White Rhino",
  "Bubba Kush",
  "Purple Kush",
  "LA Confidential",
  "9 Pound Hammer",
  "Purple Urkle",
  "Blackberry Kush",
  "Hindu Kush",
  "Pink Kush",
  "Papaya Punch",
  "MK Ultra",
  "Blueberry",
  "Sour Diesel",
  "Pineapple Express",
  "Maui Wowie",
  "Durban Poison",
  "Acapulco Gold",
  "Green Crack",
  "Super Lemon Haze",
  "Super Silver Haze",
  "Tropicana Cookies",
  "White Fire OG",
  "Lamb's Bread",
  "Island Sweet Skunk",
  "Gelato",
  "Jack Herer",
  "Bruce Banner",
  "Tangie",
  "Strawberry Banana",
  "Headband",
  "Haze",
  "Skunk #1",
  "Chocolope",
  "Vanilla Frosting",
  "Biscotti",
  "Runtz",
  "White Widow",
  "Cherry Pie",
  "AK-47",
  "Candyland",
  "Fruity Pebbles (FPOG)",
  "Lava Cake",
  "Banana Kush",
  "Triangle Kush",
  "Gelonade",
  "ACDC",
  "Watermelon Zkittlez",
  "Pennywise",
  "SFV OG",
  "Zookies",
  "Papaya",
  "Guava",
  "Bubble Gum",
  "Lemonnade",
  "Harlequin",
  "Black Jack",
  "Ghost Train Haze"
];

// Configuration
const BATCH_SIZE = 5; // Process 5 strains at a time
const BATCH_DELAY = 15000; // 15 second delay between batches to avoid rate limiting
const outputFile = process.argv[2] || 'all-strains-data.csv';

// Path to the Firecrawl MCP server directory
const serverDir = path.join(process.cwd(), 'firecrawl-mcp-server');

// Check if the dist directory and compiled JS file exist
const cliScriptPath = path.join(serverDir, 'dist', 'leafly-scraper-cli.js');
if (!fs.existsSync(cliScriptPath)) {
  console.error(`Error: The compiled script at ${cliScriptPath} doesn't exist.`);
  console.log('Make sure you have built the project by running:');
  console.log('npm run install-deps');
  console.log('npm run build');
  process.exit(1);
}

// Process strains in batches
async function processAllStrains() {
  console.log(`Starting to process ${ALL_STRAINS.length} strains in batches of ${BATCH_SIZE}...`);
  console.log(`Final results will be merged to: ${outputFile}`);
  
  // Set to track successfully processed strains
  const processedStrains = new Set();
  let currentBatch = 1;
  const totalBatches = Math.ceil(ALL_STRAINS.length / BATCH_SIZE);
  
  // Create temp directory if it doesn't exist
  const tempDir = path.join(process.cwd(), 'temp-data');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  
  // Process each batch
  for (let i = 0; i < ALL_STRAINS.length; i += BATCH_SIZE) {
    const batchStrains = ALL_STRAINS.slice(i, i + BATCH_SIZE);
    const batchOutputFile = path.join(tempDir, `batch-${currentBatch}.csv`);
    
    console.log(`\n---------------`);
    console.log(`Processing batch ${currentBatch} of ${totalBatches}`);
    console.log(`Strains in this batch: ${batchStrains.join(', ')}`);
    console.log(`Saving batch results to: ${batchOutputFile}`);
    console.log(`---------------\n`);
    
    try {
      // Process this batch
      await processBatch(batchStrains, batchOutputFile);
      
      // Mark these strains as processed
      batchStrains.forEach(strain => processedStrains.add(strain));
      
      console.log(`\nBatch ${currentBatch} complete! ${batchStrains.length} strains processed.`);
      
      // Delay before next batch (unless this is the last batch)
      if (i + BATCH_SIZE < ALL_STRAINS.length) {
        console.log(`Waiting ${BATCH_DELAY/1000} seconds before processing next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    } catch (error) {
      console.error(`Error processing batch ${currentBatch}:`, error);
    }
    
    currentBatch++;
  }
  
  // Merge all batch files into final output
  await mergeBatchFiles(tempDir, outputFile);
  
  // Summary
  console.log(`\n===============`);
  console.log(`Processing complete!`);
  console.log(`Successfully processed ${processedStrains.size} out of ${ALL_STRAINS.length} strains.`);
  console.log(`Results saved to: ${outputFile}`);
  console.log(`===============\n`);
}

// Process a batch of strains
async function processBatch(strains, outputFile) {
  return new Promise((resolve, reject) => {
    // Format the strains as a comma-separated string
    const strainsArg = strains.join(',');
    
    // Run the CLI script for this batch
    const child = spawn('node', [cliScriptPath, outputFile, strainsArg], {
      env: process.env,
      stdio: 'inherit',
      cwd: serverDir
    });
    
    child.on('error', (error) => {
      reject(error);
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

// Merge all batch files into a single output file
async function mergeBatchFiles(tempDir, outputFile) {
  console.log('\nMerging batch files into final output...');
  
  const batchFiles = fs.readdirSync(tempDir)
    .filter(file => file.startsWith('batch-') && file.endsWith('.csv'))
    .map(file => path.join(tempDir, file))
    .sort();
  
  if (batchFiles.length === 0) {
    console.log('No batch files found to merge.');
    return;
  }
  
  // Read the header from the first file
  const header = fs.readFileSync(batchFiles[0], 'utf8').split('\n')[0];
  
  // Start the output file with the header
  fs.writeFileSync(outputFile, header + '\n');
  
  // Add data from each batch file (skipping the header)
  let totalRows = 0;
  
  for (const batchFile of batchFiles) {
    const content = fs.readFileSync(batchFile, 'utf8');
    const lines = content.split('\n');
    
    // Skip the header (first line)
    const dataLines = lines.slice(1).filter(line => line.trim());
    
    if (dataLines.length > 0) {
      fs.appendFileSync(outputFile, dataLines.join('\n') + '\n');
      totalRows += dataLines.length;
    }
  }
  
  console.log(`Merged ${batchFiles.length} batch files with a total of ${totalRows} strains.`);
}

// Run the process
processAllStrains().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 
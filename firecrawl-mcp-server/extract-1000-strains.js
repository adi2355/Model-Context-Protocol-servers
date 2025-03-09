import dotenv from 'dotenv';
import FirecrawlApp from '@mendable/firecrawl-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Initialize environment variables
dotenv.config();

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - adjust these as needed
const CONFIG = {
  // Batch processing
  BATCH_SIZE: 5,                      // Number of strains to process in each batch
  DELAY_BETWEEN_BATCHES: 15,           // 15 seconds between batches
  DELAY_BETWEEN_STRAINS: 2,            // 2 seconds between individual strains
  DELAY_BETWEEN_RETRIES: 45,           // 45 seconds between retries (longer to handle rate limits)
  MAX_RETRIES: 3,                     // Maximum retries for failed extractions
  
  // Checkpointing
  CHECKPOINT_FREQUENCY: 10,           // Save checkpoint every 10 batches
  CHECKPOINT_FILE: 'checkpoint.json', // File to store progress
  
  // Runtime control
  MAX_STRAINS_PER_RUN: 1300,          // Maximum strains to process in one execution
  RATE_LIMIT_PAUSE: 15 * 60 * 1000,   // 15 minutes pause if we hit severe rate limiting
  
  // Output paths
  OUTPUT_DIR: 'leafly-extract-data',
  INDIVIDUAL_DIR: 'individual-strains',
  BATCHES_DIR: 'batches',
  LOGS_DIR: 'logs',
  PARALLEL_STRAINS: 3,                 // Number of strains to process in parallel
  ENABLE_CHECKPOINTING: true           // Whether to enable checkpointing
};

// Schema for extracting strain data
const STRAIN_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'The name of the cannabis strain'
    },
    url: {
      type: 'string',
      description: 'The Leafly URL for this strain'
    },
    classification: {
      type: 'string',
      description: 'The strain classification (Indica, Sativa, Hybrid)'
    },
    thc_percent: {
      type: ['number', 'null'],
      description: 'The THC percentage of the strain'
    },
    cbd_percent: {
      type: ['number', 'null'],
      description: 'The CBD percentage of the strain'
    },
    effects: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'An array of effects produced by the strain'
    },
    flavors: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'An array of flavors associated with the strain'
    },
    medical: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Medical conditions the strain may help with'
    },
    terpenes: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Terpenes present in the strain'
    },
    grow_info: {
      type: 'object',
      properties: {
        difficulty: {
          type: 'string',
          description: 'Growing difficulty (easy, moderate, difficult)'
        },
        flowering_time_weeks: {
          type: ['number', 'null', 'string'],
          description: 'Flowering time in weeks'
        },
        yield: {
          type: 'string',
          description: 'Expected yield (low, medium, high)'
        },
        height: {
          type: 'string',
          description: 'Plant height (short, medium, tall)'
        }
      },
      description: 'Information related to growing this strain'
    },
    lineage: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Parent strains in the lineage'
    },
    awards: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Awards won by this strain'
    },
    average_rating: {
      type: ['number', 'null'],
      description: 'Average user rating (out of 5)'
    },
    rating_count: {
      type: ['number', 'null'],
      description: 'Number of user ratings'
    },
    description: {
      type: 'string',
      description: 'Detailed description of the strain'
    }
  },
  required: ['name']
};

// Extraction prompt
const EXTRACT_PROMPT = `
  Extract comprehensive information about this cannabis strain from Leafly.
  Include all available details about the strain, focusing on:
  
  - Basic strain info: name, classification (Indica, Sativa, Hybrid)
  - THC and CBD percentages (as numbers only, without % sign)
  - Effects (like relaxed, happy, euphoric)
  - Flavors (like earthy, sweet, citrus)
  - Medical benefits (what conditions it helps with)
  - Terpene profile
  - Growing information (difficulty, flowering time, yield, height)
  - Strain lineage/parents
  - Any awards the strain has won
  - Average user rating and number of ratings
  - Detailed description
  
  For effects, flavors, terpenes, and medical benefits, return as arrays of strings.
  For percentages, return as numbers (e.g., 18 not "18%").
  If information is not available, return null or an empty array as appropriate.
`;

/**
 * Main function to extract data for up to 1000 strains
 */
async function extract1000Strains() {
  console.log('🌿 Starting Leafly 1000+ Strain Data Extraction 🌿');
  
  // Setup Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Create output directories
  const baseOutputDir = path.join(__dirname, CONFIG.OUTPUT_DIR);
  const individualDir = path.join(baseOutputDir, CONFIG.INDIVIDUAL_DIR);
  const batchesDir = path.join(baseOutputDir, CONFIG.BATCHES_DIR);
  const logsDir = path.join(baseOutputDir, CONFIG.LOGS_DIR);
  
  await fs.mkdir(baseOutputDir, { recursive: true });
  await fs.mkdir(individualDir, { recursive: true });
  await fs.mkdir(batchesDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  
  // Create log files
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const logFile = path.join(logsDir, `extraction-log-${timestamp}.txt`);
  const errorLogFile = path.join(logsDir, `error-log-${timestamp}.txt`);
  
  // Initialize logs
  await fs.writeFile(logFile, `Extraction started at ${new Date().toISOString()}\n`, { flag: 'a' });
  await fs.writeFile(errorLogFile, `Error log started at ${new Date().toISOString()}\n`, { flag: 'a' });
  
  // Log helper function
  const logMessage = async (message, isError = false) => {
    const logEntry = `[${new Date().toISOString()}] ${message}\n`;
    console.log(message);
    await fs.writeFile(isError ? errorLogFile : logFile, logEntry, { flag: 'a' });
  };
  
  // Load strain list - either from command line or from a file
  let allStrains = [];
  let strainListPaths = [
    path.join(baseOutputDir, 'complete-strain-list.json'),
    path.join(baseOutputDir, 'leafly-strains.json'),
    path.join(baseOutputDir, 'paginated-strains.json')
  ];
  
  // Try all potential strain list files
  let strainsLoaded = false;
  for (const strainListPath of strainListPaths) {
    try {
      if (existsSync(strainListPath)) {
        const strainData = await fs.readFile(strainListPath, 'utf8');
        allStrains = JSON.parse(strainData);
        await logMessage(`Loaded ${allStrains.length} strains from ${strainListPath}`);
        strainsLoaded = true;
        break;
      }
    } catch (error) {
      await logMessage(`Error loading strain list from ${strainListPath}: ${error.message}`, true);
    }
  }
  
  if (!strainsLoaded) {
    await logMessage(`No strain list found. Please run extract-leafly-strains-balanced.js first.`, true);
    return;
  }
  
  // Limit to maximum strains per run if needed
  if (allStrains.length > CONFIG.MAX_STRAINS_PER_RUN) {
    await logMessage(`Limiting to ${CONFIG.MAX_STRAINS_PER_RUN} strains for this run (out of ${allStrains.length} total)`);
    allStrains = allStrains.slice(0, CONFIG.MAX_STRAINS_PER_RUN);
  }
  
  // Rate limit tracking
  let rateLimitHits = 0;
  const rateLimitDelay = CONFIG.RATE_LIMIT_PAUSE;

  // Load checkpoint if exists
  const checkpointPath = path.join(baseOutputDir, CONFIG.CHECKPOINT_FILE);
  let checkpoint = { 
    processedStrains: [], 
    failedStrains: [], 
    lastBatchIndex: -1,
    startTime: new Date().toISOString()
  };
  let lastCheckpointTime = Date.now();
  
  if (CONFIG.ENABLE_CHECKPOINTING && existsSync(checkpointPath)) {
    try {
      const checkpointData = await fs.readFile(checkpointPath, 'utf8');
      const loadedCheckpoint = JSON.parse(checkpointData);
      
      // Validate checkpoint data
      if (loadedCheckpoint.processedStrains && Array.isArray(loadedCheckpoint.processedStrains)) {
        checkpoint = loadedCheckpoint;
        await logMessage(`Loaded checkpoint with ${checkpoint.processedStrains.length} processed strains, ${checkpoint.failedStrains.length} failed strains. Resuming from batch ${checkpoint.lastBatchIndex + 1}`);
      }
    } catch (error) {
      await logMessage(`Error loading checkpoint: ${error.message}. Starting from scratch.`, true);
    }
  }
  
  // Filter out already processed strains
  const strainsToProcess = allStrains.filter(strain => 
    !checkpoint.processedStrains.includes(strain) && 
    !checkpoint.failedStrains.includes(strain)
  );
  
  await logMessage(`Processing ${strainsToProcess.length} strains (${checkpoint.processedStrains.length} already processed, ${checkpoint.failedStrains.length} previously failed)`);
  
  // Create batches of strains for processing
  const batches = [];
  for (let i = 0; i < strainsToProcess.length; i += CONFIG.BATCH_SIZE) {
    batches.push(strainsToProcess.slice(i, i + CONFIG.BATCH_SIZE));
  }
  
  // Fix the batch counting
  const totalBatches = batches.length;
  await logMessage(`Split into ${totalBatches} batches of up to ${CONFIG.BATCH_SIZE} strains each`);
  
  // Start processing from the last batch index + 1
  // Make sure we're using correct batch indexing
  const startBatchIndex = 0; // Always start at 0 for the filtered list
  await logMessage(`Starting from batch ${checkpoint.lastBatchIndex + 1}/${totalBatches + checkpoint.lastBatchIndex + 1}`);
  
  // Save checkpoint function
  const saveCheckpoint = async () => {
    try {
      // Try to save checkpoint
      await fs.writeFile(
        checkpointPath,
        JSON.stringify(checkpoint, null, 2)
      );
      lastCheckpointTime = Date.now();
      await logMessage(`💾 Saved checkpoint: ${checkpoint.processedStrains.length} processed, ${checkpoint.failedStrains.length} failed, batch ${checkpoint.lastBatchIndex}`);
    } catch (error) {
      await logMessage(`Error saving checkpoint: ${error.message}`, true);
    }
  };
  
  // Function to process a single strain
  async function processStrain(strain, batchIndex, strainIndex) {
    if (checkpoint.processedStrains.includes(strain) || checkpoint.failedStrains.includes(strain)) {
      return { success: true, skipped: true, strain };
    }
    
    await logMessage(`📊 Processing ${strain} (${strainIndex}/${batches[batchIndex].length} in current batch)`);
    
    // Track retry attempts
    let attempts = 0;
    let success = false;
    let resultData = null;
    
    while (!success && attempts < CONFIG.MAX_RETRIES) {
      attempts++;
      
      if (attempts > 1) {
        await logMessage(`Attempt ${attempts}/${CONFIG.MAX_RETRIES}...`);
      }
      
      try {
        // Generate strain URL
        const url = `https://www.leafly.com/strains/${strain}`;
        
        // Perform extraction
        const result = await client.extract([url], {
          schema: STRAIN_SCHEMA,
          prompt: EXTRACT_PROMPT
        });
        
        if (result.success && result.data) {
          success = true;
          resultData = result.data;
          
          // Save individual strain data
          const strainFilePath = path.join(individualDir, `${strain}.json`);
          await fs.writeFile(strainFilePath, JSON.stringify(resultData, null, 2));
          
          // Log success and strain summary
          let summary = `Data summary for ${resultData.name || strain}:\n`;
          summary += `- Classification: ${resultData.classification || 'Not found'}\n`;
          summary += `- THC: ${resultData.thc_percent !== undefined ? resultData.thc_percent + '%' : 'Not found'}\n`;
          summary += `- CBD: ${resultData.cbd_percent !== undefined ? resultData.cbd_percent + '%' : 'Not found'}\n`;
          
          // Ensure effects is an array before joining
          if (resultData.effects) {
            const effectsArray = Array.isArray(resultData.effects) ? 
              resultData.effects : 
              (typeof resultData.effects === 'string' ? [resultData.effects] : []);
            
            if (effectsArray.length > 0) {
              summary += `- Effects: ${effectsArray.join(', ')}\n`;
            }
          }
          
          // Ensure terpenes is an array before joining
          if (resultData.terpenes) {
            const terpenesArray = Array.isArray(resultData.terpenes) ? 
              resultData.terpenes : 
              (typeof resultData.terpenes === 'string' ? [resultData.terpenes] : []);
            
            if (terpenesArray.length > 0) {
              summary += `- Dominant terpenes: ${terpenesArray.join(', ')}`;
            } else {
              summary += `- Dominant terpenes: None found`;
            }
          } else {
            summary += `- Dominant terpenes: None found`;
          }
          
          await logMessage(`✅ Successfully extracted data for ${strain}\n\n${summary}`);
          
          // Add to processed strains
          checkpoint.processedStrains.push(strain);
        } else {
          // Handle API error
          throw new Error(result.error || 'Unknown extraction error');
        }
      } catch (error) {
        // Handle different types of errors
        if (error.message && (
          error.message.includes('rate limit') ||
          error.message.includes('too many requests') ||
          error.message.includes('429')
        )) {
          // Rate limit error
          rateLimitHits++;
          await logMessage(`⚠️ Rate limit hit (${rateLimitHits} times). Pausing for ${rateLimitDelay/60000} minutes...`, true);
          await new Promise(r => setTimeout(r, rateLimitDelay));
          attempts--; // Don't count rate limit errors as retry attempts
        } else {
          // Other error
          await logMessage(`❌ Error extracting data for ${strain}: ${error.message}`, true);
          await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_RETRIES * 1000));
        }
      }
    }
    
    // If still not successful after retries, mark as failed
    if (!success) {
      checkpoint.failedStrains.push(strain);
      await logMessage(`❌ Failed to extract data for ${strain} after ${CONFIG.MAX_RETRIES} attempts, skipping`, true);
      return { success: false, strain };
    }
    
    // Delay between strains (if not the last strain in a batch)
    if (strainIndex < batches[batchIndex].length) {
      await logMessage(`Waiting ${CONFIG.DELAY_BETWEEN_STRAINS} seconds before next strain...`);
      await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_STRAINS * 1000));
    }
    
    return { success: true, strain, data: resultData };
  }
  
  // Periodic checkpoint
  if (CONFIG.ENABLE_CHECKPOINTING) {
    setInterval(() => {
      // Check if we need to save a checkpoint
      const timeSinceLastCheckpoint = Date.now() - lastCheckpointTime;
      if (timeSinceLastCheckpoint >= 5 * 60 * 1000) { // 5 minutes
        saveCheckpoint();
      }
    }, 60 * 1000); // Check every minute
  }
  
  // Show extraction stats
  function showExtractionStats() {
    const totalStrains = allStrains.length;
    const processed = checkpoint.processedStrains.length;
    const failed = checkpoint.failedStrains.length;
    const remaining = totalStrains - processed - failed;
    const percentComplete = Math.round((processed / totalStrains) * 100);
    
    // Calculate estimated time remaining
    let timeRemaining = 'Unknown';
    if (processed > 0) {
      const startTime = new Date(checkpoint.startTime).getTime();
      const currentTime = Date.now();
      const elapsedMs = currentTime - startTime;
      const msPerStrain = elapsedMs / processed;
      const remainingMs = msPerStrain * remaining;
      
      // Convert to hours and minutes
      const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
      const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      
      timeRemaining = `~${remainingHours}h ${remainingMinutes}m`;
    }
    
    console.log('\n📊 Extraction Progress:');
    console.log(`- Processed: ${processed}/${totalStrains} (${percentComplete}%)`);
    console.log(`- Failed: ${failed}`);
    console.log(`- Remaining: ${remaining}`);
    console.log(`- Estimated Time Remaining: ${timeRemaining}`);
    console.log(`- Rate Limit Hits: ${rateLimitHits}`);
  }
  
  // Process batches (with support for parallel strain processing)
  for (let batchIndex = startBatchIndex; batchIndex < batches.length; batchIndex++) {
    // Show progress stats
    if (batchIndex % 5 === 0) {
      showExtractionStats();
    }
    
    const currentBatch = batches[batchIndex];
    await logMessage(`\n🔄 Processing Batch ${batchIndex + 1}/${batches.length}`);
    await logMessage(`Strains in this batch: ${currentBatch.join(', ')}`);
    
    // Process strains in parallel
    const batchStartTime = Date.now();
    
    // Process strains in smaller parallel groups to avoid overwhelming the API
    for (let i = 0; i < currentBatch.length; i += CONFIG.PARALLEL_STRAINS) {
      const parallelBatch = currentBatch.slice(i, i + CONFIG.PARALLEL_STRAINS);
      
      // Process this smaller batch in parallel
      await Promise.all(
        parallelBatch.map((strain, idx) => 
          processStrain(strain, batchIndex, i + idx + 1)
        )
      );
    }
    
    // Combine results for this batch
    const batchResults = {
      timestamp: new Date().toISOString(),
      batch_index: batchIndex,
      strains: currentBatch,
      processedCount: currentBatch.filter(strain => checkpoint.processedStrains.includes(strain)).length,
      failedCount: currentBatch.filter(strain => checkpoint.failedStrains.includes(strain)).length
    };
    
    // Save batch results
    const batchFilePath = path.join(batchesDir, `batch-${batchIndex}.json`);
    await fs.writeFile(batchFilePath, JSON.stringify(batchResults, null, 2));
    
    // Update last batch index
    checkpoint.lastBatchIndex = batchIndex;
    
    // Save intermediate results
    if (batchIndex % CONFIG.CHECKPOINT_FREQUENCY === 0 || batchIndex === batches.length - 1) {
      await saveIntermediateResults(batchIndex);
      await saveCheckpoint();
    }
    
    // Calculate batch completion time and success rate
    const batchDuration = (Date.now() - batchStartTime) / 1000;
    const successRate = (batchResults.processedCount / currentBatch.length) * 100;
    
    await logMessage(`✅ Saved batch ${batchIndex + 1} with ${batchResults.processedCount} strains`);
    await logMessage(`Batch ${batchIndex + 1} completed in ${batchDuration.toFixed(2)} seconds`);
    await logMessage(`Success rate: ${successRate.toFixed(2)}% (${batchResults.processedCount}/${currentBatch.length})`);
    
    // Check if this is the last batch
    if (batchIndex < batches.length - 1) {
      await logMessage(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES} seconds before next batch...`);
      await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_BATCHES * 1000));
    }
  }
  
  // Final checkpoint
  await saveCheckpoint();
  
  // Save final results
  await logMessage(`\n🎉 Extraction complete!`);
  await logMessage(`Processed ${checkpoint.processedStrains.length}/${allStrains.length} strains`);
  await logMessage(`Failed: ${checkpoint.failedStrains.length} strains`);
  
  // Combine all results
  await saveIntermediateResults('final');
  await combineAllResults(individualDir, baseOutputDir);
  
  // Log completion
  await logMessage(`\n✅ All processing complete!`);
  await logMessage(`Total strains processed: ${checkpoint.processedStrains.length}`);
  await logMessage(`Total strains failed: ${checkpoint.failedStrains.length}`);
  await logMessage(`Results saved to ${baseOutputDir}/all-strains.json and ${baseOutputDir}/all-strains.csv`);
  
  // Return the results
  return {
    totalStrains: allStrains.length,
    processedStrains: checkpoint.processedStrains.length,
    failedStrains: checkpoint.failedStrains.length
  };
}

/**
 * Save intermediate results based on processed strains so far
 */
async function saveIntermediateResults(batchIndex) {
  try {
    const individualDir = path.join(__dirname, CONFIG.OUTPUT_DIR, CONFIG.INDIVIDUAL_DIR);
    const baseOutputDir = path.join(__dirname, CONFIG.OUTPUT_DIR);
    
    // Skip if individual directory doesn't exist
    if (!existsSync(individualDir)) {
      console.log(`Individual strains directory not found at ${individualDir}`);
      return;
    }
    
    // Read all individual strain files
    const files = await fs.readdir(individualDir);
    const strainFiles = files.filter(file => file.endsWith('.json'));
    
    if (strainFiles.length === 0) {
      console.log('No individual strain files found to combine');
      return;
    }
    
    console.log(`Combining ${strainFiles.length} individual strain files into intermediate results...`);
    
    // Read and parse each strain file
    const allStrains = [];
    
    for (const file of strainFiles) {
      try {
        const filePath = path.join(individualDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const strainData = JSON.parse(fileContent);
        allStrains.push(strainData);
      } catch (error) {
        console.error(`Error processing ${file}: ${error.message}`);
      }
    }
    
    // If no valid data found, return
    if (allStrains.length === 0) {
      console.log('No valid strain data found in files');
      return;
    }
    
    // Save as JSON
    const outputFilename = `intermediate-results-batch-${batchIndex}`;
    const jsonPath = path.join(baseOutputDir, `${outputFilename}.json`);
    
    await fs.writeFile(
      jsonPath,
      JSON.stringify(allStrains, null, 2)
    );
    
    // Convert to CSV
    const csvData = convertToCSV(allStrains);
    const csvPath = path.join(baseOutputDir, `${outputFilename}.csv`);
    
    await fs.writeFile(csvPath, csvData);
    
    console.log(`Saved intermediate results to:
- ${jsonPath}
- ${csvPath}`);
    
    return { jsonPath, csvPath };
  } catch (error) {
    console.error(`Error saving intermediate results: ${error.message}`);
  }
}

/**
 * Merge batch results up to a specific batch
 */
async function mergeBatchResults(batchesDir, baseOutputDir, maxBatch) {
  console.log(`\n🔄 Creating intermediate results up to batch ${maxBatch}...`);
  
  const allStrains = [];
  
  // Read batch files
  for (let i = 1; i <= maxBatch; i++) {
    const batchPath = path.join(batchesDir, `batch-${i}.json`);
    
    try {
      if (existsSync(batchPath)) {
        const batchContent = await fs.readFile(batchPath, 'utf8');
        const batchData = JSON.parse(batchContent);
        
        if (Array.isArray(batchData)) {
          allStrains.push(...batchData);
        }
      }
    } catch (error) {
      console.error(`Error reading batch ${i}: ${error.message}`);
    }
  }
  
  if (allStrains.length > 0) {
    // Save as JSON
    await fs.writeFile(
      path.join(baseOutputDir, `intermediate-results-batch-${maxBatch}.json`),
      JSON.stringify(allStrains, null, 2)
    );
    
    // Convert to CSV
    const csv = convertToCSV(allStrains);
    await fs.writeFile(
      path.join(baseOutputDir, `intermediate-results-batch-${maxBatch}.csv`),
      csv
    );
    
    console.log(`✅ Intermediate results saved with ${allStrains.length} strains`);
  }
}

/**
 * Combine all individual strain data into a single file
 */
async function combineAllResults(individualDir, baseOutputDir) {
  const allStrains = [];
  
  // Read all individual strain files
  try {
    const files = await fs.readdir(individualDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(individualDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const strainData = JSON.parse(fileContent);
        allStrains.push(strainData);
      }
    }
    
    // Save combined results
    if (allStrains.length > 0) {
      // Save as JSON
      await fs.writeFile(
        path.join(baseOutputDir, 'all-strains.json'),
        JSON.stringify(allStrains, null, 2)
      );
      
      // Convert to CSV
      const csv = convertToCSV(allStrains);
      await fs.writeFile(
        path.join(baseOutputDir, 'all-strains.csv'),
        csv
      );
      
      console.log(`✅ Combined data saved to all-strains.json and all-strains.csv (${allStrains.length} strains)`);
    }
  } catch (error) {
    console.error(`Error combining results: ${error.message}`);
  }
}

/**
 * Convert JSON data to CSV format
 */
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  // Get all unique keys from all objects
  const allKeys = new Set();
  data.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  
  // Convert Set to Array and create header row
  const headers = [...allKeys];
  let csv = headers.join(',') + '\n';
  
  // Add data rows
  data.forEach(item => {
    const row = headers.map(key => {
      const value = item[key];
      
      // Handle different value types
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'object') {
        // For objects and arrays, stringify and escape quotes
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      } else if (typeof value === 'string') {
        // Escape quotes in strings and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      } else {
        // Numbers, booleans, etc.
        return value;
      }
    });
    
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

// Run the extraction process
console.log('Starting Leafly 1000+ Strain Data Extraction Process...');
extract1000Strains().catch(err => {
  console.error('Fatal error during extraction:', err);
});
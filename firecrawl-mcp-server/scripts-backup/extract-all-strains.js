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

// Set constants
const BATCH_SIZE = 5; // Process strains in batches of 5
const DELAY_BETWEEN_BATCHES = 10000; // 10 seconds between batches
const DELAY_BETWEEN_RETRIES = 30000; // 30 seconds between retries
const MAX_RETRIES = 3; // Maximum retries for failed extractions

// Leafly's top 100 strains (this is just an illustrative list - extend with actual strains)
const TOP_STRAINS = [
  // Popular hybrids
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
  
  // Award winning strains
  'white-widow', 'ak-47', 'white-tahoe-cookie', 'chemdawg', 'og-kush',
  'sunset-sherbert', 'wedding-gelato', 'black-diamond', 'grease-monkey', 'banana-kush',
  
  // Classic & legacy strains
  'afghani', 'skunk-1', 'g13', 'cheese', 'chronic',
  'amnesia-haze', 'bubblegum', 'godfather-og', 'la-confidential', 'master-kush',
  
  // New popular strains 
  'ice-cream-cake', 'apple-fritter', 'gary-payton', 'kush-mints', 'lava-cake',
  'cereal-milk', 'apple-fritter', 'jealousy', 'london-pound-cake', 'white-runtz',
  
  // Landrace strains
  'acapulco-gold', 'lamb-bread', 'malawi', 'panama-red', 'thai',
  'afghani', 'hindu-kush', 'durban-poison', 'colombian-gold', 'jamaican',
  
  // Special/unique strains
  'alien-og', 'gods-gift', 'headband', 'kosher-kush', 'larry-bird'
];

// Strain Schema matching our StrainData interface
const STRAIN_SCHEMA = {
  type: 'object',
  properties: {
    "strain_name": { type: 'string', description: 'Name of the cannabis strain' },
    "aliases": { type: 'string', description: 'Alternative names for the strain' },
    "strain_classification": { type: 'string', description: 'Strain type (Indica, Sativa, Hybrid, etc.)' },
    "lineage_parents": { type: 'string', description: 'Parent strains' },
    "rating_average": { type: 'number', description: 'Average user rating (0-5)' },
    "rating_count": { type: 'number', description: 'Number of user ratings' },
    "thc_percentage": { type: 'number', description: 'THC percentage content' },
    "cbd_percentage": { type: 'number', description: 'CBD percentage content' },
    "cbg_percentage": { type: 'number', description: 'CBG percentage content' },
    "terpenes": { 
      type: 'object', 
      description: 'Terpene profile with dominance levels',
      properties: {
        "myrcene": { type: 'string' },
        "caryophyllene": { type: 'string' },
        "limonene": { type: 'string' },
        "pinene": { type: 'string' },
        "humulene": { type: 'string' },
        "terpinolene": { type: 'string' },
        "ocimene": { type: 'string' },
        "linalool": { type: 'string' }
      }
    },
    "effects": { type: 'string', description: 'Primary user effects (relaxed, happy, etc.)' },
    "medical": { type: 'string', description: 'Medical benefits (stress relief, pain, etc.)' },
    "flavors": { type: 'string', description: 'Flavor profile' },
    "grow_info": {
      type: 'object',
      description: 'Growing information',
      properties: {
        "difficulty": { type: 'string', description: 'Grow difficulty (Easy, Moderate, Difficult)' },
        "flowering_weeks": { type: 'number', description: 'Flowering time in weeks' },
        "yield": { type: 'string', description: 'Expected yield (Low, Medium, High)' },
        "height": { type: 'string', description: 'Plant height' }
      }
    },
    "awards": { type: 'string', description: 'Awards and recognitions' },
    "description": { type: 'string', description: 'General strain description' }
  },
  required: ["strain_name"]
};

// Extract prompt for detailed strain data
const EXTRACT_PROMPT = `
  Extract comprehensive cannabis strain data from the Leafly strain page.
  Include information about:
  - Basic strain info (name, classification, lineage)
  - Cannabinoid content (THC, CBD, CBG percentages)
  - Terpene profile (dominant and present terpenes)
  - Effects (both recreational and medical)
  - Flavors and aromas
  - Growing information (difficulty, flowering time, yield, height)
  - Any awards or recognitions
  - User ratings
  - General description of the strain
  
  For terpenes, classify them as either "Dominant" or "Present" based on their prominence.
  For effects and flavors, provide comma-separated lists.
  Extract growing information even if it's only implied by the strain type.
  If you find conflicting information, prioritize the most reliable sources and recent data.
`;

/**
 * Main function to extract data for all strains
 */
async function extractAllStrains() {
  console.log('🌿 Starting Leafly Strain Data Extraction 🌿');
  console.log(`Processing ${TOP_STRAINS.length} strains in batches of ${BATCH_SIZE}`);
  console.log('--------------------------------------------------');
  
  // Initialize Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Create output directories
  const baseOutputDir = path.join(__dirname, 'leafly-extract-data');
  const individualDir = path.join(baseOutputDir, 'individual-strains');
  const batchesDir = path.join(baseOutputDir, 'batches');
  
  await fs.mkdir(baseOutputDir, { recursive: true });
  await fs.mkdir(individualDir, { recursive: true });
  await fs.mkdir(batchesDir, { recursive: true });
  
  // Create log file
  const logFile = path.join(baseOutputDir, 'extraction-log.txt');
  await fs.writeFile(logFile, `Extraction started at ${new Date().toISOString()}\n`, { flag: 'a' });
  
  // Track successful and failed extractions
  const successfulStrains = [];
  const failedStrains = [];
  
  // Process strains in batches
  const batches = [];
  for (let i = 0; i < TOP_STRAINS.length; i += BATCH_SIZE) {
    batches.push(TOP_STRAINS.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Split into ${batches.length} batches`);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStartTime = new Date();
    
    console.log(`\n🔄 Processing Batch ${batchIndex + 1}/${batches.length}`);
    console.log(`Strains in this batch: ${batch.join(', ')}`);
    
    // Format batch strains as proper URLs
    const batchUrls = batch.map(strain => `https://www.leafly.com/strains/${strain}`);
    
    // Process each strain in the batch individually for better error handling
    const batchResults = [];
    
    for (let strainIndex = 0; strainIndex < batch.length; strainIndex++) {
      const strain = batch[strainIndex];
      const strainUrl = batchUrls[strainIndex];
      
      console.log(`\n📊 Processing ${strain} (${strainIndex + 1}/${batch.length} in current batch)`);
      
      // Try to extract the strain with retries
      let success = false;
      let strainData = null;
      let attempts = 0;
      
      while (!success && attempts < MAX_RETRIES) {
        attempts++;
        try {
          console.log(`Attempt ${attempts}/${MAX_RETRIES}...`);
          
          // Make the extraction request
          const extractResult = await client.extract([strainUrl], {
            schema: STRAIN_SCHEMA,
            prompt: EXTRACT_PROMPT
          });
          
          if (extractResult.success && extractResult.data) {
            // Handle case where data might be an array or a single object
            strainData = Array.isArray(extractResult.data) ? 
              extractResult.data[0] : extractResult.data;
            
            if (strainData) {
              success = true;
              console.log(`✅ Successfully extracted data for ${strain}`);
              
              // Add to batch results
              batchResults.push(strainData);
              
              // Save individual strain data
              const safeFileName = strain.replace(/[^a-zA-Z0-9_-]/g, '_');
              await fs.writeFile(
                path.join(individualDir, `${safeFileName}.json`),
                JSON.stringify(strainData, null, 2)
              );
              
              // Log success
              const logMessage = `[SUCCESS] ${new Date().toISOString()} - ${strain}\n`;
              await fs.writeFile(logFile, logMessage, { flag: 'a' });
              
              // Add to successful strains
              successfulStrains.push(strain);
              
              // Print summary
              console.log(`\nData summary for ${strainData.strain_name || strain}:`);
              console.log(`- Classification: ${strainData.strain_classification || 'Not found'}`);
              console.log(`- THC: ${strainData.thc_percentage !== undefined ? strainData.thc_percentage + '%' : 'Not found'}`);
              console.log(`- CBD: ${strainData.cbd_percentage !== undefined ? strainData.cbd_percentage + '%' : 'Not found'}`);
              
              if (strainData.effects) {
                console.log(`- Effects: ${strainData.effects}`);
              }
              
              if (strainData.terpenes) {
                const dominantTerpenes = Object.entries(strainData.terpenes)
                  .filter(([key, value]) => value === 'Dominant')
                  .map(([key, _]) => key)
                  .join(', ');
                console.log(`- Dominant terpenes: ${dominantTerpenes || 'None found'}`);
              }
            }
          } else {
            console.error(`❌ Extraction failed: ${extractResult.error || 'Unknown error'}`);
            
            // If it's the last attempt, log the failure
            if (attempts === MAX_RETRIES) {
              const logMessage = `[FAILED] ${new Date().toISOString()} - ${strain} - ${extractResult.error || 'Unknown error'}\n`;
              await fs.writeFile(logFile, logMessage, { flag: 'a' });
              failedStrains.push(strain);
            } else {
              console.log(`Retrying in ${DELAY_BETWEEN_RETRIES / 1000} seconds...`);
              await new Promise(r => setTimeout(r, DELAY_BETWEEN_RETRIES));
            }
          }
        } catch (error) {
          console.error(`❌ Error during extraction: ${error.message}`);
          
          // If it's the last attempt, log the failure
          if (attempts === MAX_RETRIES) {
            const logMessage = `[ERROR] ${new Date().toISOString()} - ${strain} - ${error.message}\n`;
            await fs.writeFile(logFile, logMessage, { flag: 'a' });
            failedStrains.push(strain);
          } else {
            console.log(`Retrying in ${DELAY_BETWEEN_RETRIES / 1000} seconds...`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_RETRIES));
          }
        }
      }
      
      // Short delay between strains in the same batch
      if (strainIndex < batch.length - 1) {
        console.log(`Waiting 2 seconds before next strain...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Save batch results
    if (batchResults.length > 0) {
      await fs.writeFile(
        path.join(batchesDir, `batch-${batchIndex + 1}.json`),
        JSON.stringify(batchResults, null, 2)
      );
      
      console.log(`✅ Saved batch ${batchIndex + 1} with ${batchResults.length} strains`);
    }
    
    // Calculate and log batch statistics
    const batchEndTime = new Date();
    const batchDuration = (batchEndTime - batchStartTime) / 1000;
    const batchSuccessRate = (batchResults.length / batch.length) * 100;
    
    console.log(`\nBatch ${batchIndex + 1} completed in ${batchDuration.toFixed(2)} seconds`);
    console.log(`Success rate: ${batchSuccessRate.toFixed(2)}% (${batchResults.length}/${batch.length})`);
    
    // Delay before next batch
    if (batchIndex < batches.length - 1) {
      console.log(`\nWaiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Combine all successful results into a single file
  console.log('\n🔄 Combining all strain data...');
  
  const allStrains = [];
  
  // Read all individual strain files
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
    
    console.log(`✅ Combined data saved to all-strains.json and all-strains.csv`);
  }
  
  // Final statistics
  const successRate = (successfulStrains.length / TOP_STRAINS.length) * 100;
  console.log('\n📊 Extraction Complete! Final Statistics:');
  console.log(`Total strains processed: ${TOP_STRAINS.length}`);
  console.log(`Successful extractions: ${successfulStrains.length} (${successRate.toFixed(2)}%)`);
  console.log(`Failed extractions: ${failedStrains.length}`);
  
  if (failedStrains.length > 0) {
    console.log('\nFailed strains:');
    console.log(failedStrains.join(', '));
    
    // Save list of failed strains for later retry
    await fs.writeFile(
      path.join(baseOutputDir, 'failed-strains.json'),
      JSON.stringify(failedStrains, null, 2)
    );
  }
  
  // Log completion
  const completionLog = `\nExtraction completed at ${new Date().toISOString()}\n` +
                        `Success rate: ${successRate.toFixed(2)}% (${successfulStrains.length}/${TOP_STRAINS.length})\n` +
                        `--------------------------------------------------\n`;
  await fs.writeFile(logFile, completionLog, { flag: 'a' });
  
  console.log('\n🎉 All processing complete!');
}

/**
 * Convert JSON data to CSV format
 * @param {Array} data - Array of strain data objects
 * @returns {string} CSV formatted string
 */
function convertToCSV(data) {
  // Define all columns in desired order
  const columns = [
    // Basic strain info
    "strain_name",
    "aliases",
    "strain_classification",
    "lineage_parents",
    "rating_average",
    "rating_count",
    
    // Cannabinoids 
    "thc_percentage",
    "cbd_percentage",
    "cbg_percentage",
    
    // Effects and medical use
    "effects",
    "medical",
    
    // Flavors
    "flavors",
    
    // Terpenes
    "terpenes.myrcene",
    "terpenes.caryophyllene",
    "terpenes.limonene",
    "terpenes.pinene",
    "terpenes.humulene",
    "terpenes.terpinolene",
    "terpenes.ocimene",
    "terpenes.linalool",
    
    // Growing information
    "grow_info.difficulty",
    "grow_info.flowering_weeks",
    "grow_info.yield",
    "grow_info.height",
    
    // Additional information
    "awards",
    "description"
  ];
  
  // Create header row
  let csv = columns.join(',') + '\n';
  
  // Add data rows
  for (const strain of data) {
    const row = columns.map(column => {
      // Handle nested properties
      let value;
      if (column.includes('.')) {
        const [parent, child] = column.split('.');
        value = strain[parent] ? strain[parent][child] : '';
      } else {
        value = strain[column] !== undefined ? strain[column] : '';
      }
      
      // Escape commas and quotes in the value
      const escaped = typeof value === 'string' 
        ? '"' + value.replace(/"/g, '""') + '"' 
        : value;
      
      return escaped;
    });
    
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

// Run the extraction process
console.log('Starting Leafly Strain Extraction Process...');
extractAllStrains().catch(err => {
  console.error('Fatal error during extraction:', err);
}); 
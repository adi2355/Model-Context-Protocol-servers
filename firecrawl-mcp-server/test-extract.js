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

async function testExtractFeature() {
  console.log('🌿 Testing Firecrawl Extract Feature for Leafly Strains 🌿');
  console.log('--------------------------------------------------');
  
  // Initialize the Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Define test strains (a diverse selection)
  const testStrains = [
    'https://www.leafly.com/strains/blue-dream',   // Popular hybrid
    'https://www.leafly.com/strains/acdc',         // High CBD strain
    'https://www.leafly.com/strains/granddaddy-purple',  // Popular indica
    'https://www.leafly.com/strains/jack-herer',   // Popular sativa
    'https://www.leafly.com/strains/wedding-cake'  // Award-winning strain
  ];
  
  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, 'extract-test-output');
  await fs.mkdir(outputDir, { recursive: true });
  
  // Define schema matching our current StrainData interface
  const schema = {
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
  
  // Define the extract prompt
  const prompt = `
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
  `;
  
  try {
    console.log(`Processing each strain individually...`);
    
    // Process each strain separately to ensure we get data for all of them
    const allResults = [];
    
    for (const strainUrl of testStrains) {
      console.log(`\nProcessing: ${strainUrl}`);
      // Try to extract the strain name from the URL
      const urlParts = strainUrl.split('/');
      const strainUrlName = urlParts[urlParts.length - 1];
      
      try {
        // Make the extract call for this single strain
        const extractResult = await client.extract([strainUrl], {
          schema: schema,
          prompt: prompt
        });
        
        if (extractResult.success && extractResult.data) {
          console.log('✅ Extraction successful!');
          
          // Handle case where data might be an array or a single object
          const strainData = Array.isArray(extractResult.data) ? 
            extractResult.data[0] : extractResult.data;
          
          if (strainData) {
            // Save the strain data
            const strainName = strainData.strain_name || strainUrlName;
            const safeFileName = strainName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            
            await fs.writeFile(
              path.join(outputDir, `${safeFileName}.json`),
              JSON.stringify(strainData, null, 2)
            );
            
            console.log(`✅ Saved data for ${strainName}`);
            
            // Add to our collection
            allResults.push(strainData);
            
            // Print a summary
            console.log(`\nData summary for ${strainName}:`);
            console.log(`- Classification: ${strainData.strain_classification || 'Not found'}`);
            console.log(`- THC: ${strainData.thc_percentage !== undefined ? strainData.thc_percentage + '%' : 'Not found'}`);
            console.log(`- CBD: ${strainData.cbd_percentage !== undefined ? strainData.cbd_percentage + '%' : 'Not found'}`);
            console.log(`- Effects: ${strainData.effects || 'Not found'}`);
            console.log(`- Medical: ${strainData.medical || 'Not found'}`);
            console.log(`- Growing difficulty: ${strainData.grow_info?.difficulty || 'Not found'}`);
            
            if (strainData.terpenes) {
              const dominantTerpenes = Object.entries(strainData.terpenes)
                .filter(([key, value]) => value === 'Dominant')
                .map(([key, _]) => key)
                .join(', ');
              console.log(`- Dominant terpenes: ${dominantTerpenes || 'None found'}`);
            }
            
            if (strainData.awards) {
              console.log(`- Awards: ${strainData.awards}`);
            }
            
            if (strainData.lineage_parents) {
              console.log(`- Lineage: ${strainData.lineage_parents}`);
            }
          }
        } else {
          console.error(`❌ Failed to extract data for ${strainUrlName}:`, extractResult.error || 'No data returned');
        }
      } catch (error) {
        console.error(`❌ Error processing ${strainUrlName}:`, error.message);
      }
      
      // Add a delay to avoid rate limiting
      console.log('Waiting 2 seconds before next strain...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Save all results
    if (allResults.length > 0) {
      await fs.writeFile(
        path.join(outputDir, 'all-strains-extract.json'),
        JSON.stringify(allResults, null, 2)
      );
      console.log(`\n✅ All results saved to extract-test-output/all-strains-extract.json`);
      console.log(`Successfully extracted data for ${allResults.length} out of ${testStrains.length} strains.`);
    } else {
      console.error('❌ Failed to extract data for any strains.');
    }
    
    // Let's also try extracting multiple strains with a wildcard
    console.log('\n\nTesting wildcard extraction (this might take a bit longer)...');
    try {
      // Use asyncExtract for better control over the job
      const extractJob = await client.asyncExtract(['https://www.leafly.com/strains/blue-dream'], {
        schema: schema,
        prompt: prompt,
        enableWebSearch: true  // Enable web search for enriched data
      });
      
      console.log(`✅ Wildcard extraction job started with ID: ${extractJob.job_id}`);
      console.log('Checking job status (this might take a few minutes)...');
      
      // Poll for job status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!completed && attempts < maxAttempts) {
        attempts++;
        const jobStatus = await client.getExtractStatus(extractJob.job_id);
        
        console.log(`Job status (attempt ${attempts}/${maxAttempts}): ${jobStatus.status}, Progress: ${jobStatus.progress || 0}%`);
        
        if (jobStatus.status === 'completed') {
          completed = true;
          
          await fs.writeFile(
            path.join(outputDir, 'wildcard-extraction-result.json'),
            JSON.stringify(jobStatus, null, 2)
          );
          
          console.log('✅ Wildcard extraction completed successfully!');
          console.log(`Results saved to extract-test-output/wildcard-extraction-result.json`);
        } else if (jobStatus.status === 'failed') {
          console.error('❌ Wildcard extraction job failed:', jobStatus.error || 'No error details available');
          break;
        }
        
        if (!completed) {
          console.log('Waiting 30 seconds before checking again...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      if (!completed) {
        console.log('⚠️ Extraction job is taking longer than expected. You can check status later with the job ID.');
      }
    } catch (error) {
      console.error('❌ Error with wildcard extraction:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Run the test
console.log('Starting Extract feature test...');
testExtractFeature().catch(console.error); 
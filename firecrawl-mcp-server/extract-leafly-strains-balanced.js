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

// Configuration
const CONFIG = {
  BATCH_SIZE: 5, // Number of URLs to process in each batch
  DELAY_BETWEEN_BATCHES: 10, // Seconds to wait between batches
  OUTPUT_DIR: 'leafly-extract-data',
  MAX_RETRIES: 3,
  DELAY_BETWEEN_RETRIES: 30, // Seconds to wait between retries
  MAX_PAGES_PER_CATEGORY: 5, // Max pages to process per category
  TARGET_TOTAL_STRAINS: 1200, // Overall target for total strains
  STRAINS_PER_CATEGORY: 25, // Target strains to collect per category
  PAGES_TO_SKIP_AFTER_DUPLICATES: 3, // If we find too many duplicates in a row, skip ahead
  PARALLEL_CATEGORIES: 3, // Number of categories to process in parallel
  MAX_PARALLEL_REQUESTS: 5, // Maximum number of parallel requests
  ENABLE_CHECKPOINTING: true, // Enable checkpointing for resumability
  CHECKPOINT_INTERVAL: 5 * 60 * 1000, // Checkpoint every 5 minutes
  CHECKPOINT_FILE: 'strain-extraction-checkpoint.json' // File to store checkpoint data
};

/**
 * Main function to extract all strain names from Leafly
 */
async function extractBalancedStrainSet() {
  console.log('🔎 Starting Leafly Balanced Strain Set Extraction...');
  
  // Setup Firecrawl client
  const client = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY,
    apiUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'
  });
  
  // Create output directory
  const outputDir = path.join(__dirname, CONFIG.OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  
  // Set to track unique strain slugs (automatically prevents duplicates)
  const strainSlugs = new Set();
  
  // Count of encountered duplicates for reporting
  let duplicateCount = 0;
  
  // Rate limit tracking
  let rateLimitHits = 0;
  const rateLimitDelay = 60 * 1000; // 1 minute pause after rate limit

  // Helper function to normalize and add strain slugs
  const addStrainSlug = (slug) => {
    // Normalize the slug: lowercase, trim, remove any special characters
    const normalizedSlug = slug.toLowerCase()
                             .trim()
                             .replace(/[^a-z0-9-]/g, '')
                             .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
    
    // Only add if it's valid
    if (normalizedSlug && normalizedSlug.length > 1) {
      const isNewStrain = !strainSlugs.has(normalizedSlug);
      
      if (isNewStrain) {
        strainSlugs.add(normalizedSlug);
      } else {
        duplicateCount++;
        // Not logging each duplicate to avoid cluttering output
      }
      
      return isNewStrain;
    }
    return false;
  };
  
  // Define filter categories for a balanced dataset
  const filterCategories = [
    // Base categories
    { type: 'base', name: 'all', url: 'https://www.leafly.com/strains', sortParam: 'sort=most-reviews', targetCount: 50 },
    
    // Strain types
    { type: 'strain-type', name: 'indica', url: 'https://www.leafly.com/strains/lists/category/indica', sortParam: 'sort=most-reviews', targetCount: 50 },
    { type: 'strain-type', name: 'sativa', url: 'https://www.leafly.com/strains/lists/category/sativa', sortParam: 'sort=most-reviews', targetCount: 50 },
    { type: 'strain-type', name: 'hybrid', url: 'https://www.leafly.com/strains/lists/category/hybrid', sortParam: 'sort=most-reviews', targetCount: 50 },
    
    // Popular effects
    { type: 'effect', name: 'relaxed', url: 'https://www.leafly.com/strains/lists/effect/relaxed', targetCount: 25 },
    { type: 'effect', name: 'happy', url: 'https://www.leafly.com/strains/lists/effect/happy', targetCount: 25 },
    { type: 'effect', name: 'euphoric', url: 'https://www.leafly.com/strains/lists/effect/euphoric', targetCount: 25 },
    { type: 'effect', name: 'uplifted', url: 'https://www.leafly.com/strains/lists/effect/uplifted', targetCount: 25 },
    { type: 'effect', name: 'creative', url: 'https://www.leafly.com/strains/lists/effect/creative', targetCount: 25 },
    { type: 'effect', name: 'energetic', url: 'https://www.leafly.com/strains/lists/effect/energetic', targetCount: 25 },
    { type: 'effect', name: 'focused', url: 'https://www.leafly.com/strains/lists/effect/focused', targetCount: 25 },
    { type: 'effect', name: 'giggly', url: 'https://www.leafly.com/strains/lists/effect/giggly', targetCount: 25 },
    { type: 'effect', name: 'aroused', url: 'https://www.leafly.com/strains/lists/effect/aroused', targetCount: 25 },
    { type: 'effect', name: 'talkative', url: 'https://www.leafly.com/strains/lists/effect/talkative', targetCount: 25 },
    { type: 'effect', name: 'hungry', url: 'https://www.leafly.com/strains/lists/effect/hungry', targetCount: 25 },
    { type: 'effect', name: 'sleepy', url: 'https://www.leafly.com/strains/lists/effect/sleepy', targetCount: 25 },
    { type: 'effect', name: 'tingly', url: 'https://www.leafly.com/strains/lists/effect/tingly', targetCount: 25 },
    
    // Medical benefits
    { type: 'medical', name: 'stress', url: 'https://www.leafly.com/strains/lists/condition/stress', targetCount: 25 },
    { type: 'medical', name: 'anxiety', url: 'https://www.leafly.com/strains/lists/condition/anxiety', targetCount: 25 },
    { type: 'medical', name: 'depression', url: 'https://www.leafly.com/strains/lists/condition/depression', targetCount: 25 },
    { type: 'medical', name: 'pain', url: 'https://www.leafly.com/strains/lists/condition/pain', targetCount: 25 },
    { type: 'medical', name: 'insomnia', url: 'https://www.leafly.com/strains/lists/condition/insomnia', targetCount: 25 },
    { type: 'medical', name: 'inflammation', url: 'https://www.leafly.com/strains/lists/condition/inflammation', targetCount: 25 },
    { type: 'medical', name: 'headaches', url: 'https://www.leafly.com/strains/lists/condition/headaches', targetCount: 25 },
    { type: 'medical', name: 'fatigue', url: 'https://www.leafly.com/strains/lists/condition/fatigue', targetCount: 25 },
    { type: 'medical', name: 'nausea', url: 'https://www.leafly.com/strains/lists/condition/nausea', targetCount: 25 },
    { type: 'medical', name: 'migraines', url: 'https://www.leafly.com/strains/lists/condition/migraines', targetCount: 25 },
    { type: 'medical', name: 'muscle-spasms', url: 'https://www.leafly.com/strains/lists/condition/muscle-spasms', targetCount: 25 },
    { type: 'medical', name: 'seizures', url: 'https://www.leafly.com/strains/lists/condition/seizures', targetCount: 25 },
    { type: 'medical', name: 'arthritis', url: 'https://www.leafly.com/strains/lists/condition/arthritis', targetCount: 25 },
    { type: 'medical', name: 'PTSD', url: 'https://www.leafly.com/strains/lists/condition/ptsd', targetCount: 25 },
    
    // THC Levels
    { type: 'thc', name: 'low-thc', url: 'https://www.leafly.com/strains?potency[thc]=0-10', targetCount: 25 },
    { type: 'thc', name: 'medium-thc', url: 'https://www.leafly.com/strains?potency[thc]=10-20', targetCount: 25 },
    { type: 'thc', name: 'high-thc', url: 'https://www.leafly.com/strains?potency[thc]=20-', targetCount: 25 },
    
    // Dominant terpenes
    { type: 'terpene', name: 'myrcene', url: 'https://www.leafly.com/strains/lists/terpenes/myrcene', targetCount: 25 },
    { type: 'terpene', name: 'caryophyllene', url: 'https://www.leafly.com/strains/lists/terpenes/caryophyllene', targetCount: 25 },
    { type: 'terpene', name: 'limonene', url: 'https://www.leafly.com/strains/lists/terpenes/limonene', targetCount: 25 },
    { type: 'terpene', name: 'terpinolene', url: 'https://www.leafly.com/strains/lists/terpenes/terpinolene', targetCount: 25 },
    { type: 'terpene', name: 'pinene', url: 'https://www.leafly.com/strains/lists/terpenes/pinene', targetCount: 25 },
    { type: 'terpene', name: 'ocimene', url: 'https://www.leafly.com/strains/lists/terpenes/ocimene', targetCount: 25 },
    { type: 'terpene', name: 'linalool', url: 'https://www.leafly.com/strains/lists/terpenes/linalool', targetCount: 25 },
    
    // Popular flavors
    { type: 'flavor', name: 'sweet', url: 'https://www.leafly.com/strains/lists/flavor/sweet', targetCount: 25 },
    { type: 'flavor', name: 'earthy', url: 'https://www.leafly.com/strains/lists/flavor/earthy', targetCount: 25 },
    { type: 'flavor', name: 'citrus', url: 'https://www.leafly.com/strains/lists/flavor/citrus', targetCount: 25 },
    { type: 'flavor', name: 'berry', url: 'https://www.leafly.com/strains/lists/flavor/berry', targetCount: 25 },
    { type: 'flavor', name: 'pine', url: 'https://www.leafly.com/strains/lists/flavor/pine', targetCount: 25 },
    { type: 'flavor', name: 'woody', url: 'https://www.leafly.com/strains/lists/flavor/woody', targetCount: 25 },
    { type: 'flavor', name: 'spicy-herbal', url: 'https://www.leafly.com/strains/lists/flavor/spicy-herbal', targetCount: 25 },
    { type: 'flavor', name: 'pungent', url: 'https://www.leafly.com/strains/lists/flavor/pungent', targetCount: 25 },
    { type: 'flavor', name: 'diesel', url: 'https://www.leafly.com/strains/lists/flavor/diesel', targetCount: 25 },
    { type: 'flavor', name: 'tropical', url: 'https://www.leafly.com/strains/lists/flavor/tropical', targetCount: 25 },
    { type: 'flavor', name: 'flowery', url: 'https://www.leafly.com/strains/lists/flavor/flowery', targetCount: 25 },
    { type: 'flavor', name: 'lemon', url: 'https://www.leafly.com/strains/lists/flavor/lemon', targetCount: 25 },
    { type: 'flavor', name: 'skunk', url: 'https://www.leafly.com/strains/lists/flavor/skunk', targetCount: 25 },
    { type: 'flavor', name: 'blueberry', url: 'https://www.leafly.com/strains/lists/flavor/blueberry', targetCount: 25 },
    { type: 'flavor', name: 'grape', url: 'https://www.leafly.com/strains/lists/flavor/grape', targetCount: 25 },
    { type: 'flavor', name: 'orange', url: 'https://www.leafly.com/strains/lists/flavor/orange', targetCount: 25 },
    { type: 'flavor', name: 'chemical', url: 'https://www.leafly.com/strains/lists/flavor/chemical', targetCount: 25 },
  ];
  
  // Show distribution plan
  console.log(`Will process ${filterCategories.length} different filter categories for a balanced dataset`);
  
  // Group by type for reporting
  const categoryTypes = {};
  for (const cat of filterCategories) {
    if (!categoryTypes[cat.type]) categoryTypes[cat.type] = [];
    categoryTypes[cat.type].push(cat);
  }
  
  // Show category types and counts
  console.log('\n📊 Planned Category Distribution:');
  for (const type in categoryTypes) {
    console.log(`- ${type}: ${categoryTypes[type].length} categories, targeting ${categoryTypes[type].reduce((sum, cat) => sum + cat.targetCount, 0)} strains`);
  }
  
  // Track strains found per category
  const strainsPerCategory = {};
  const strainsPerType = {};
  let totalNewStrainsFound = 0;
  
  // Load checkpoint if it exists
  const checkpointPath = path.join(outputDir, CONFIG.CHECKPOINT_FILE);
  let processedCategories = [];
  let lastCheckpointTime = Date.now();
  
  if (CONFIG.ENABLE_CHECKPOINTING && existsSync(checkpointPath)) {
    try {
      const checkpointData = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
      
      // Restore state from checkpoint
      if (checkpointData.strainSlugs) {
        checkpointData.strainSlugs.forEach(slug => strainSlugs.add(slug));
        console.log(`Restored ${strainSlugs.size} strains from checkpoint`);
      }
      
      if (checkpointData.processedCategories) {
        processedCategories = checkpointData.processedCategories;
        console.log(`Restored ${processedCategories.length} processed categories from checkpoint`);
      }
      
      if (checkpointData.strainsPerCategory) {
        Object.assign(strainsPerCategory, checkpointData.strainsPerCategory);
      }
      
      if (checkpointData.strainsPerType) {
        Object.assign(strainsPerType, checkpointData.strainsPerType);
      }
      
      if (checkpointData.totalNewStrainsFound) {
        totalNewStrainsFound = checkpointData.totalNewStrainsFound;
      }
      
      if (checkpointData.duplicateCount) {
        duplicateCount = checkpointData.duplicateCount;
      }
      
      console.log(`✅ Successfully restored checkpoint data from ${checkpointPath}`);
      showRuntimeStats();
    } catch (error) {
      console.error(`Error loading checkpoint: ${error.message}`);
      console.log(`Starting fresh extraction process...`);
    }
  }
  
  // Define schema for strain extraction
  const schema = {
    type: 'object',
    properties: {
      strains: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            slug: { type: 'string' }
          }
        }
      },
      total_found: { type: 'number' },
      has_more: { type: 'boolean' }
    }
  };
  
  // Filter out already processed categories
  const categoriesToProcess = filterCategories.filter(
    category => !processedCategories.includes(`${category.type}-${category.name}`)
  );
  
  console.log(`Will process ${categoriesToProcess.length} categories (${filterCategories.length - categoriesToProcess.length} already processed)`);
  
  // Create checkpoint function
  const saveCheckpoint = async () => {
    try {
      const checkpointData = {
        timestamp: new Date().toISOString(),
        strainSlugs: [...strainSlugs],
        processedCategories,
        strainsPerCategory,
        strainsPerType,
        totalNewStrainsFound,
        duplicateCount
      };
      
      await fs.writeFile(
        checkpointPath,
        JSON.stringify(checkpointData, null, 2)
      );
      
      console.log(`\n💾 Saved checkpoint with ${strainSlugs.size} strains at ${new Date().toISOString()}`);
      lastCheckpointTime = Date.now();
      
      // Show current distribution
      showRuntimeStats();
    } catch (error) {
      console.error(`Error saving checkpoint: ${error.message}`);
    }
  };
  
  // Periodic checkpoint
  if (CONFIG.ENABLE_CHECKPOINTING) {
    setInterval(() => {
      // Only checkpoint if enough time has passed
      if (Date.now() - lastCheckpointTime >= CONFIG.CHECKPOINT_INTERVAL) {
        saveCheckpoint();
      }
    }, 60 * 1000); // Check every minute
  }
  
  // Show runtime stats periodically
  function showRuntimeStats() {
    console.log(`\n📊 Current Collection Distribution (${strainSlugs.size} total strains):`);
    
    // Show type distribution
    for (const type in strainsPerType) {
      if (strainsPerType[type] > 0) {
        const percentage = Math.round((strainsPerType[type] / totalNewStrainsFound) * 100) || 0;
        console.log(`- ${type}: ${strainsPerType[type]} strains (${percentage}%)`);
      }
    }
    
    // Show top 5 categories with most strains
    const topCategories = Object.entries(strainsPerCategory)
      .filter(([_, count]) => count > 0)
      .sort(([_, countA], [__, countB]) => countB - countA)
      .slice(0, 5);
    
    if (topCategories.length > 0) {
      console.log(`\nTop 5 Categories:`);
      topCategories.forEach(([name, count]) => {
        console.log(`- ${name}: ${count} strains`);
      });
    }
  }
  
  // Process a single category
  async function processCategory(category) {
    console.log(`\n📋 Processing category: ${category.type} - ${category.name}`);
    
    // Initialize counter for this category
    if (!strainsPerCategory[category.name]) strainsPerCategory[category.name] = 0;
    if (!strainsPerType[category.type]) strainsPerType[category.type] = 0;
    
    const initialTotalCount = strainSlugs.size;
    const initialCategoryCount = strainsPerCategory[category.name];
    let consecutiveDuplicates = 0;
    let newStrainsFromCategory = 0;
    
    // Process multiple pages for each category
    for (let page = 1; page <= CONFIG.MAX_PAGES_PER_CATEGORY; page++) {
      // Break if we've met the target for this category
      newStrainsFromCategory = strainsPerCategory[category.name] - initialCategoryCount;
      if (newStrainsFromCategory >= category.targetCount) {
        console.log(`✅ Collected ${newStrainsFromCategory} new strains from ${category.name}, reached target of ${category.targetCount}.`);
        break;
      }
      
      // Skip pages if we're getting too many duplicates
      if (consecutiveDuplicates >= CONFIG.PAGES_TO_SKIP_AFTER_DUPLICATES) {
        console.log(`⏩ Skipping to next category after ${consecutiveDuplicates} pages with mostly duplicates.`);
        break;
      }
      
      // Construct URL with sorting parameter if available
      let url = `${category.url}?page=${page}`;
      if (category.sortParam) {
        url = `${category.url}?${category.sortParam}&page=${page}`;
      }
      
      console.log(`\n🔍 Processing ${category.name} page ${page}: ${url}`);
      
      // Make the extraction request
      let success = false;
      let retries = 0;
      let result;
      
      while (!success && retries < CONFIG.MAX_RETRIES) {
        try {
          if (retries > 0) {
            console.log(`Retry ${retries}/${CONFIG.MAX_RETRIES} after ${CONFIG.DELAY_BETWEEN_RETRIES}s delay...`);
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_RETRIES * 1000));
          }
          
          result = await client.extract([url], {
            schema,
            prompt: `
              Extract all cannabis strain information from this Leafly page.
              For each strain on the page, return:
              - name: The display name of the strain
              - url: The full URL to the strain's detail page
              - slug: Just the slug/identifier part of the URL (e.g., "blue-dream" from "/strains/blue-dream")
              
              Also indicate:
              - total_found: The number of strains found on this page
              - has_more: Boolean indicating if there are more pages of results (look for pagination)
            `
          });
          
          success = true;
        } catch (error) {
          // Check for rate limiting errors
          if (error.message && (
              error.message.includes('rate limit') ||
              error.message.includes('too many requests') ||
              error.message.includes('429')
          )) {
            rateLimitHits++;
            console.error(`Rate limit hit (${rateLimitHits} times). Pausing for ${rateLimitDelay/1000} seconds...`);
            await new Promise(r => setTimeout(r, rateLimitDelay));
          } else {
            console.error(`Error extracting from ${url}: ${error.message}`);
            retries++;
          }
        }
      }
      
      if (!success) {
        console.error(`Failed to extract data after ${CONFIG.MAX_RETRIES} retries. Skipping to next page.`);
        continue;
      }
      
      // Process the extraction results
      if (result.success && result.data && result.data.strains && Array.isArray(result.data.strains)) {
        const strainsOnPage = result.data.strains;
        
        // Process each strain
        let newStrainsOnPage = 0;
        const initialSlugsSize = strainSlugs.size;
        
        for (const strain of strainsOnPage) {
          let added = false;
          
          if (strain.slug) {
            added = addStrainSlug(strain.slug);
          } else if (strain.url) {
            // Extract slug from URL if slug not directly provided
            const match = strain.url.match(/\/strains\/([^/?#]+)/);
            if (match && match[1]) {
              added = addStrainSlug(match[1]);
            }
          }
          
          if (added) newStrainsOnPage++;
        }
        
        // Track duplicate rate for this page
        const duplicateRate = 1 - (newStrainsOnPage / strainsOnPage.length);
        
        // If most strains on this page were duplicates, increment counter
        if (duplicateRate > 0.8 && strainsOnPage.length > 5) {
          consecutiveDuplicates++;
        } else {
          consecutiveDuplicates = 0; // Reset if we found some new strains
        }
        
        // Update category and type counts
        strainsPerCategory[category.name] += newStrainsOnPage;
        strainsPerType[category.type] += newStrainsOnPage;
        totalNewStrainsFound += newStrainsOnPage;
        
        // Log progress
        console.log(`Found ${strainsOnPage.length} strains on page, ${newStrainsOnPage} new (Total: ${strainSlugs.size}, Duplicates this page: ${Math.round(duplicateRate * 100)}%)`);
        console.log(`Progress for ${category.name}: ${strainsPerCategory[category.name]}/${category.targetCount} strains`);
        
        // Check if we reached the end of results
        const hasMore = result.data.has_more !== false; // Default to true if not specified
        if (!hasMore || strainsOnPage.length === 0) {
          console.log(`No more results found for ${category.name}. Moving to next category.`);
          break;
        }
      } else {
        console.log(`No strains found on page ${page} for ${category.name}.`);
        if (page > 1) break; // Only break if we're past the first page
      }
      
      // Wait between pages
      console.log(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}s before next page...`);
      await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_BATCHES * 1000));
    }
    
    // Log summary for this category
    newStrainsFromCategory = strainsPerCategory[category.name] - initialCategoryCount;
    console.log(`\n📊 Category summary for ${category.type} - ${category.name}:`);
    console.log(`- Collected ${newStrainsFromCategory} new unique strains`);
    console.log(`- Progress toward target: ${Math.min(100, Math.round(newStrainsFromCategory / category.targetCount * 100))}%`);
    console.log(`- Total strains in collection: ${strainSlugs.size}`);
    
    // Mark category as processed
    processedCategories.push(`${category.type}-${category.name}`);
    
    // Save checkpoint after each category
    if (CONFIG.ENABLE_CHECKPOINTING) {
      await saveCheckpoint();
    }
    
    return newStrainsFromCategory;
  }
  
  // Process categories in parallel batches
  const totalCategories = categoriesToProcess.length;
  let categoriesProcessed = 0;
  
  console.log(`\n🚀 Starting parallel processing with ${CONFIG.PARALLEL_CATEGORIES} concurrent categories`);
  
  // Process in batches
  for (let i = 0; i < totalCategories; i += CONFIG.PARALLEL_CATEGORIES) {
    // Check if we've reached the overall target
    if (strainSlugs.size >= CONFIG.TARGET_TOTAL_STRAINS) {
      console.log(`\n⚠️ Reached overall target of ${CONFIG.TARGET_TOTAL_STRAINS} strains. Stopping early.`);
      break;
    }
    
    const batch = categoriesToProcess.slice(i, i + CONFIG.PARALLEL_CATEGORIES);
    console.log(`\n🔄 Processing batch ${Math.floor(i / CONFIG.PARALLEL_CATEGORIES) + 1} with ${batch.length} categories (${categoriesProcessed}/${totalCategories} processed)`);
    
    // Process batch in parallel
    await Promise.all(batch.map(category => processCategory(category)));
    
    categoriesProcessed += batch.length;
    console.log(`\n✅ Completed batch. Total progress: ${categoriesProcessed}/${totalCategories} categories (${Math.round(categoriesProcessed/totalCategories*100)}%)`);
    
    // Show runtime stats after each batch
    showRuntimeStats();
  }
  
  // Final checkpoint after all processing
  if (CONFIG.ENABLE_CHECKPOINTING) {
    await saveCheckpoint();
  }
  
  // Save results
  const strainList = [...strainSlugs].sort();
  
  // Double-check for any remaining duplicates (shouldn't be any since we used a Set)
  const uniqueStrainList = [...new Set(strainList)];
  if (uniqueStrainList.length !== strainList.length) {
    console.log(`⚠️ Found and removed ${strainList.length - uniqueStrainList.length} unexpected duplicates in final list`);
  }
  
  // Save final output files
  await fs.writeFile(
    path.join(outputDir, 'leafly-strains.json'),
    JSON.stringify(uniqueStrainList, null, 2)
  );
  
  // Save as text (one per line)
  await fs.writeFile(
    path.join(outputDir, 'leafly-strains.txt'),
    uniqueStrainList.join('\n')
  );
  
  // Also save as the complete strain list (for compatibility)
  await fs.writeFile(
    path.join(outputDir, 'complete-strain-list.json'),
    JSON.stringify(uniqueStrainList, null, 2)
  );
  
  console.log(`\n✅ Successfully extracted ${uniqueStrainList.length} unique strain names from Leafly!`);
  console.log(`Found and skipped ${duplicateCount} duplicates during extraction`);
  console.log(`Strain lists saved to:`);
  console.log(`- ${path.join(outputDir, 'leafly-strains.json')}`);
  console.log(`- ${path.join(outputDir, 'leafly-strains.txt')}`);
  console.log(`- ${path.join(outputDir, 'complete-strain-list.json')}`);
  
  // Show category distribution summary by type
  console.log(`\n📊 Category Type Distribution Summary:`);
  for (const type in strainsPerType) {
    const count = strainsPerType[type];
    const percentage = Math.round((count / totalNewStrainsFound) * 100) || 0;
    console.log(`- ${type}: ${count} strains (${percentage}% of total)`);
  }
  
  // Show detailed category breakdown
  console.log(`\n📊 Detailed Category Breakdown:`);
  for (const category of filterCategories) {
    const count = strainsPerCategory[category.name] || 0;
    if (count > 0) {
      console.log(`- ${category.type} - ${category.name}: ${count} strains`);
    }
  }
  
  return uniqueStrainList;
}

// Run the script
extractBalancedStrainSet().catch(err => {
  console.error('Error extracting balanced strain set:', err);
  process.exit(1);
}); 
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Filter incomplete strain data entries based on specified criteria
 */
async function filterIncompleteStrains() {
  console.log('🧹 Starting strain data filtering...');
  
  // Configuration
  const INPUT_FILE = path.join(__dirname, 'processed-data/standardized-strains.json');
  const OUTPUT_FILE = path.join(__dirname, 'processed-data/filtered-strains.json');
  const OUTPUT_CSV = path.join(__dirname, 'processed-data/filtered-strains.csv');
  const STATS_FILE = path.join(__dirname, 'processed-data/filtering-stats.json');
  
  // Minimum number of critical fields required
  const MIN_CRITICAL_FIELDS = 3;
  
  // Critical columns that should have values
  const CRITICAL_COLUMNS = [
    'thc_percent', 'average_rating', 'rating_count', 
    'effects', 'medical', 'flavors', 'description'
  ];
  
  try {
    // Read the JSON file
    console.log(`Reading data from: ${INPUT_FILE}`);
    const data = JSON.parse(await fs.readFile(INPUT_FILE, 'utf8'));
    
    // Count total strains before filtering
    const totalStrains = data.length;
    console.log(`Total strains before filtering: ${totalStrains}`);
    
    // Apply filtering
    const filteredStrains = data.filter(strain => {
      // Count non-empty critical fields
      let criticalFieldCount = 0;
      
      for (const field of CRITICAL_COLUMNS) {
        if (field === 'effects' || field === 'medical' || field === 'flavors' || field === 'description') {
          // Array fields should have length > 0 or string should not be empty
          if (Array.isArray(strain[field]) && strain[field].length > 0) {
            criticalFieldCount++;
          } else if (typeof strain[field] === 'string' && strain[field].trim() !== '') {
            criticalFieldCount++;
          }
        } else {
          // Numeric fields should not be null
          if (strain[field] !== null && strain[field] !== undefined) {
            criticalFieldCount++;
          }
        }
      }
      
      // Apply filtering criteria
      return (
        // Must have THC value OR CBD value
        ((strain.thc_percent !== null && strain.thc_percent !== undefined) || 
         (strain.cbd_percent !== null && strain.cbd_percent !== undefined)) &&
        // Must have at least some effects, medical uses, or flavors
        ((Array.isArray(strain.effects) && strain.effects.length > 0) || 
         (Array.isArray(strain.medical) && strain.medical.length > 0) || 
         (Array.isArray(strain.flavors) && strain.flavors.length > 0)) &&
        // Must have a description
        (typeof strain.description === 'string' && strain.description.trim() !== '') &&
        // Must have at least MIN_CRITICAL_FIELDS critical fields with values
        (criticalFieldCount >= MIN_CRITICAL_FIELDS)
      );
    });
    
    // Count total strains after filtering
    const filteredCount = filteredStrains.length;
    const removedCount = totalStrains - filteredCount;
    
    console.log(`Strains kept: ${filteredCount} (${(filteredCount/totalStrains*100).toFixed(1)}%)`);
    console.log(`Strains removed: ${removedCount} (${(removedCount/totalStrains*100).toFixed(1)}%)`);
    
    // Calculate field completeness for the filtered dataset
    const fieldCompleteness = {};
    
    for (const field of ['name', 'classification', 'thc_percent', 'cbd_percent', 'cbg_percent', 
                         'average_rating', 'rating_count', 'effects', 'medical', 'flavors', 
                         'terpenes', 'lineage', 'awards', 'description']) {
      
      let count = 0;
      
      for (const strain of filteredStrains) {
        if (Array.isArray(strain[field])) {
          if (strain[field].length > 0) count++;
        } else if (typeof strain[field] === 'string') {
          if (strain[field].trim() !== '') count++;
        } else {
          if (strain[field] !== null && strain[field] !== undefined) count++;
        }
      }
      
      fieldCompleteness[field] = {
        count,
        percentage: count / filteredCount
      };
    }
    
    // Examples of removed strains
    const removedStrains = data
      .filter(strain => !filteredStrains.includes(strain))
      .slice(0, 10)
      .map(strain => strain.name);
    
    // Generate statistics object
    const stats = {
      timestamp: new Date().toISOString(),
      total_strains: totalStrains,
      kept_strains: filteredCount,
      removed_strains: removedCount,
      kept_percentage: filteredCount / totalStrains,
      examples_removed: removedStrains,
      field_completeness: fieldCompleteness
    };
    
    // Save filtered data
    console.log(`Saving filtered data to ${OUTPUT_FILE}...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(filteredStrains, null, 2));
    
    // Generate CSV
    console.log(`Converting to CSV format...`);
    const csv = generateCSV(filteredStrains);
    await fs.writeFile(OUTPUT_CSV, csv);
    
    // Save statistics
    console.log(`Saving filtering statistics to ${STATS_FILE}...`);
    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
    
    // Output filtering summary
    console.log('\n📊 FIELD COMPLETENESS IN FILTERED DATASET');
    console.log('=======================================');
    for (const [field, values] of Object.entries(fieldCompleteness)) {
      console.log(`${field}: ${values.count} records (${(values.percentage*100).toFixed(1)}%)`);
    }
    
    console.log('\n❌ EXAMPLES OF REMOVED STRAINS');
    console.log('============================');
    for (const strain of removedStrains) {
      console.log(`- ${strain}`);
    }
    
    console.log(`\n✅ Filtering complete! Kept ${filteredCount}/${totalStrains} strains (${(filteredCount/totalStrains*100).toFixed(1)}%)`);
    
    return stats;
    
  } catch (error) {
    console.error(`Error during strain filtering: ${error.message}`);
    throw error;
  }
}

/**
 * Generates CSV content from strain data
 */
function generateCSV(strains) {
  // Define headers (flat structure)
  const headers = [
    'name', 'classification', 'thc_percent', 'cbd_percent', 'cbg_percent',
    'average_rating', 'rating_count', 'effects', 'medical', 'flavors', 'terpenes',
    'lineage', 'awards', 'grow_info_yield', 'grow_info_height', 'grow_info_difficulty',
    'grow_info_flowering_time_weeks', 'description', 'url'
  ];
  
  // Create CSV header row
  let csv = headers.join(',') + '\n';
  
  // Add each strain as a row
  for (const strain of strains) {
    const row = headers.map(header => {
      if (header.includes('grow_info_')) {
        // Handle nested grow_info
        const subField = header.replace('grow_info_', '');
        const value = strain.grow_info ? strain.grow_info[subField] : '';
        return formatCSVField(value);
      } else if (['effects', 'medical', 'flavors', 'terpenes', 'lineage', 'awards'].includes(header)) {
        // Join arrays with semicolons
        const value = Array.isArray(strain[header]) ? strain[header].join(';') : '';
        return formatCSVField(value);
      } else {
        // Regular fields
        return formatCSVField(strain[header]);
      }
    });
    
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

/**
 * Formats a field for CSV output
 */
function formatCSVField(value) {
  if (value === null || value === undefined) return '';
  
  // Convert to string and escape quotes
  const str = String(value).replace(/"/g, '""');
  
  // Wrap in quotes if contains comma, newline or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes(';')) {
    return `"${str}"`;
  }
  
  return str;
}

// Run the filtering
filterIncompleteStrains().catch(error => {
  console.error('Error during strain filtering:', error);
  process.exit(1);
}); 
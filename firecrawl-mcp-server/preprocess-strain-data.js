import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  INPUT_DIR: path.join(__dirname, 'leafly-extract-data'),
  OUTPUT_DIR: path.join(__dirname, 'processed-data'),
  RAW_DATA_FILES: [
    'individual-strains'      // Directory with individual strain files
  ],
  OUTPUT_FILE: 'standardized-strains.json',
  OUTPUT_CSV: 'standardized-strains.csv',
  LOG_FREQUENCY: 100,         // Log progress every X strains processed
  MIN_REQUIRED_FIELDS: ['name'] // Fields required for inclusion
};

/**
 * Main preprocessing function to standardize strain data from different formats
 */
async function preprocessStrainData() {
  console.log('🧪 Starting strain data preprocessing and standardization...');
  
  // Create output directory if it doesn't exist
  await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
  
  // Track statistics
  const stats = {
    totalProcessed: 0,
    formatsDetected: {
      newFormat: 0,
      oldFormat: 0,
      emptyFormat: 0,
      unknown: 0
    },
    convertedSuccessfully: 0,
    missingCriticalData: 0,
    duplicates: 0,
    filesProcessed: 0,
    startTime: Date.now()
  };
  
  // Load all strain data from various files
  const allStrains = [];
  const strainNames = new Map(); // Track names to avoid duplicates, with source info
  
  // Process each input file/pattern
  for (const dataSource of CONFIG.RAW_DATA_FILES) {
    const sourcePath = path.join(CONFIG.INPUT_DIR, dataSource);
    
    if (!existsSync(sourcePath)) {
      console.log(`⚠️ Data source not found: ${sourcePath}`);
      continue;
    }
    
    const sourceStats = await fs.stat(sourcePath);
    
    if (sourceStats.isDirectory()) {
      // Handle directory of individual files
      console.log(`📂 Processing individual files from ${dataSource}...`);
      const files = await fs.readdir(sourcePath);
      let processedInDirectory = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(sourcePath, file);
          await processFile(filePath, allStrains, strainNames, stats);
          processedInDirectory++;
          
          // Show progress periodically
          if (processedInDirectory % CONFIG.LOG_FREQUENCY === 0) {
            console.log(`  ⏳ Processed ${processedInDirectory}/${files.length} files from ${dataSource}...`);
          }
        }
      }
      console.log(`  ✅ Completed processing ${processedInDirectory} files from ${dataSource}`);
    } else {
      // Regular JSON file
      console.log(`📄 Processing data file: ${dataSource}...`);
      await processFile(sourcePath, allStrains, strainNames, stats);
      console.log(`  ✅ Completed processing ${dataSource}`);
    }
    stats.filesProcessed++;
  }
  
  // Sort by strain name
  console.log('🔄 Sorting strains alphabetically...');
  allStrains.sort((a, b) => a.name.localeCompare(b.name));
  
  // Validate data quality
  console.log('🔍 Validating data quality...');
  const validationReport = validateDataQuality(allStrains);
  
  // Write standardized output
  console.log('💾 Writing standardized JSON data...');
  const outputPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);
  await fs.writeFile(outputPath, JSON.stringify(allStrains, null, 2));
  
  // Write as CSV too
  console.log('💾 Converting to CSV format...');
  const csvContent = generateCSV(allStrains);
  const csvPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_CSV);
  await fs.writeFile(csvPath, csvContent);
  
  // Calculate additional statistics
  const processingTime = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  const nullValueSummary = countNullValues(allStrains);
  
  // Write processing report
  console.log('📊 Generating processing report...');
  const reportPath = path.join(CONFIG.OUTPUT_DIR, 'preprocessing-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    stats: stats,
    processingTimeSeconds: processingTime,
    datasetSize: allStrains.length,
    nullValueSummary: nullValueSummary,
    dataQualityValidation: validationReport
  };
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  // Generate sample data file for quick inspection
  const sampleStrains = allStrains.slice(0, 10);
  const samplePath = path.join(CONFIG.OUTPUT_DIR, 'sample-strains.json');
  await fs.writeFile(samplePath, JSON.stringify(sampleStrains, null, 2));
  
  // Print summary
  console.log('\n✅ Preprocessing complete!');
  console.log(`⏱️ Processing time: ${processingTime} seconds`);
  console.log(`📊 Processed ${stats.totalProcessed} strains, standardized ${stats.convertedSuccessfully} strains`);
  console.log(`🧮 Format counts: New: ${stats.formatsDetected.newFormat}, Old: ${stats.formatsDetected.oldFormat}, Empty: ${stats.formatsDetected.emptyFormat}, Unknown: ${stats.formatsDetected.unknown}`);
  console.log(`🚫 Skipped ${stats.duplicates} duplicates and ${stats.missingCriticalData} with missing critical data`);
  console.log(`💾 Saved to ${outputPath} and ${csvPath}`);
  console.log(`📝 Full report saved to ${reportPath}`);
  console.log(`🔍 Data quality: ${validationReport.overallQuality}`);
  
  return {
    strains: allStrains,
    stats: stats,
    report: report
  };
}

/**
 * Process a single file and extract/standardize all strains
 */
async function processFile(filePath, allStrains, strainNames, stats) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Handle array or single object
    const strains = Array.isArray(data) ? data : [data];
    
    for (const strain of strains) {
      stats.totalProcessed++;
      
      // Detect format
      const format = detectFormat(strain);
      stats.formatsDetected[format]++;
      
      // Convert to standard format
      const standardized = convertToStandardFormat(strain, format);
      
      // Skip if missing critical data
      if (CONFIG.MIN_REQUIRED_FIELDS.some(field => !standardized[field] || standardized[field].trim() === '')) {
        stats.missingCriticalData++;
        continue;
      }
      
      // Check for duplicates
      const normName = standardized.name.toLowerCase().trim();
      if (strainNames.has(normName)) {
        // If we already have this strain, keep the one with more data
        const existingIndex = strainNames.get(normName);
        const existingStrain = allStrains[existingIndex];
        
        if (shouldReplaceExisting(existingStrain, standardized)) {
          // Replace with better quality data
          allStrains[existingIndex] = standardized;
        } else {
          stats.duplicates++;
        }
        continue;
      }
      
      // Add to collection
      strainNames.set(normName, allStrains.length);
      allStrains.push(standardized);
      stats.convertedSuccessfully++;
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }
}

/**
 * Detect which format a strain object uses
 */
function detectFormat(strain) {
  // Check for new format (has url field)
  if (strain.url && typeof strain.url === 'string') {
    return 'newFormat';
  }
  
  // Check for old format with data
  if (strain.strain_name && 
      (strain.effects || strain.flavors || 
       (strain.terpenes && typeof strain.terpenes === 'object' && 
        Object.values(strain.terpenes).some(v => v === 'Present' || v === 'Dominant')))) {
    return 'oldFormat';
  }
  
  // Check for empty format
  if (strain.strain_name && 
      (!strain.effects || strain.effects === '') && 
      (!strain.flavors || strain.flavors === '')) {
    return 'emptyFormat';
  }
  
  return 'unknown';
}

/**
 * Convert different strain formats to the standardized format
 */
function convertToStandardFormat(strain, format) {
  // Start with a template of the standard format
  const standardized = {
    name: '',
    url: '',
    classification: '',
    thc_percent: null,
    cbd_percent: null,
    cbg_percent: null,
    average_rating: null,
    rating_count: 0,
    effects: [],
    medical: [],
    flavors: [],
    terpenes: [],
    lineage: [],
    awards: [],
    grow_info: {
      yield: '',
      height: '',
      difficulty: '',
      flowering_time_weeks: null
    },
    description: ''
  };
  
  if (format === 'newFormat') {
    // New format conversion
    standardized.name = strain.name || '';
    standardized.url = strain.url || '';
    standardized.classification = strain.classification || '';
    standardized.thc_percent = strain.thc_percent || null;
    standardized.cbd_percent = strain.cbd_percent || null;
    standardized.cbg_percent = null; // Not in new format
    standardized.average_rating = strain.average_rating || null;
    standardized.rating_count = strain.rating_count || 0;
    standardized.effects = Array.isArray(strain.effects) ? [...strain.effects] : [];
    standardized.medical = Array.isArray(strain.medical) ? [...strain.medical] : [];
    standardized.flavors = Array.isArray(strain.flavors) ? [...strain.flavors] : [];
    standardized.terpenes = Array.isArray(strain.terpenes) ? [...strain.terpenes] : [];
    standardized.lineage = Array.isArray(strain.lineage) ? [...strain.lineage] : [];
    standardized.awards = Array.isArray(strain.awards) ? [...strain.awards] : [];
    standardized.description = strain.description || '';
    
    // Handle grow info
    if (strain.grow_info) {
      standardized.grow_info = {
        yield: strain.grow_info.yield || '',
        height: strain.grow_info.height || '',
        difficulty: strain.grow_info.difficulty || '',
        flowering_time_weeks: strain.grow_info.flowering_time_weeks || null
      };
    }
  } else if (format === 'oldFormat' || format === 'emptyFormat' || format === 'unknown') {
    // Old format conversion - more lenient to handle variations
    standardized.name = strain.strain_name || strain.name || '';
    
    // Create URL from name if not present
    if (!strain.url) {
      standardized.url = `https://www.leafly.com/strains/${encodeURIComponent(standardized.name.toLowerCase().replace(/\s+/g, '-'))}`;
    } else {
      standardized.url = strain.url;
    }
    
    standardized.classification = strain.strain_classification || strain.classification || '';
    standardized.thc_percent = strain.thc_percentage || strain.thc_percent || null;
    standardized.cbd_percent = strain.cbd_percentage || strain.cbd_percent || null;
    standardized.cbg_percent = strain.cbg_percentage || strain.cbg_percent || null;
    standardized.average_rating = strain.rating_average || strain.average_rating || null;
    standardized.rating_count = strain.rating_count || 0;
    standardized.description = strain.description || strain.strain_description || '';
    
    // Convert effects, handling both string and array formats
    if (strain.effects) {
      if (typeof strain.effects === 'string') {
        standardized.effects = strain.effects.split(',').map(item => item.trim()).filter(Boolean);
      } else if (Array.isArray(strain.effects)) {
        standardized.effects = [...strain.effects];
      }
    }
    
    // Convert medical conditions, handling both string and array formats
    if (strain.medical) {
      if (typeof strain.medical === 'string') {
        standardized.medical = strain.medical.split(',').map(item => item.trim()).filter(Boolean);
      } else if (Array.isArray(strain.medical)) {
        standardized.medical = [...strain.medical];
      }
    }
    
    // Convert flavors, handling both string and array formats
    if (strain.flavors) {
      if (typeof strain.flavors === 'string') {
        standardized.flavors = strain.flavors.split(',').map(item => item.trim()).filter(Boolean);
      } else if (Array.isArray(strain.flavors)) {
        standardized.flavors = [...strain.flavors];
      }
    }
    
    // Handle terpenes (from object to array)
    if (strain.terpenes) {
      if (typeof strain.terpenes === 'object' && !Array.isArray(strain.terpenes)) {
        // Get dominant terpenes first
        const dominant = Object.entries(strain.terpenes)
          .filter(([_, value]) => value === 'Dominant')
          .map(([key, _]) => formatTerpeneName(key));
        
        // Then get present terpenes
        const present = Object.entries(strain.terpenes)
          .filter(([_, value]) => value === 'Present')
          .map(([key, _]) => formatTerpeneName(key));
        
        // Combine, with dominant terpenes first
        standardized.terpenes = [...dominant, ...present];
      } else if (Array.isArray(strain.terpenes)) {
        standardized.terpenes = [...strain.terpenes];
      }
    }
    
    // Handle lineage
    if (strain.lineage_parents || strain.lineage) {
      const lineageSource = strain.lineage_parents || strain.lineage;
      
      if (typeof lineageSource === 'string') {
        // Handle different formats like "A x B" or "A, B"
        const parents = lineageSource
          .replace(' x ', ',')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        
        standardized.lineage = parents;
      } else if (Array.isArray(lineageSource)) {
        standardized.lineage = [...lineageSource];
      }
    }
    
    // Handle awards
    if (strain.awards) {
      if (typeof strain.awards === 'string') {
        const awardsList = strain.awards.split(',').map(item => item.trim()).filter(Boolean);
        standardized.awards = awardsList;
      } else if (Array.isArray(strain.awards)) {
        standardized.awards = [...strain.awards];
      }
    }
    
    // Handle grow info
    if (strain.grow_info) {
      if (typeof strain.grow_info === 'object') {
        standardized.grow_info = {
          yield: strain.grow_info.yield || '',
          height: strain.grow_info.height || '',
          difficulty: strain.grow_info.difficulty || '',
          flowering_time_weeks: strain.grow_info.flowering_time_weeks || 
                               strain.grow_info.flowering_weeks || null
        };
      }
    }
  }
  
  // Final cleanups
  
  // Normalize classification
  if (standardized.classification) {
    standardized.classification = standardized.classification.charAt(0).toUpperCase() + 
      standardized.classification.slice(1).toLowerCase();
  }
  
  // Ensure numeric values are actually numbers and handle edge cases
  standardized.thc_percent = parseNumericValue(standardized.thc_percent);
  standardized.cbd_percent = parseNumericValue(standardized.cbd_percent);
  standardized.cbg_percent = parseNumericValue(standardized.cbg_percent);
  standardized.average_rating = parseNumericValue(standardized.average_rating);
  standardized.rating_count = parseInt(standardized.rating_count) || 0;
  
  if (standardized.grow_info && standardized.grow_info.flowering_time_weeks) {
    standardized.grow_info.flowering_time_weeks = parseNumericValue(standardized.grow_info.flowering_time_weeks);
  }
  
  // Ensure arrays are unique and properly formatted
  standardized.effects = [...new Set(standardized.effects.map(item => capitalizeFirstLetter(item)))];
  standardized.medical = [...new Set(standardized.medical.map(item => capitalizeFirstLetter(item)))];
  standardized.flavors = [...new Set(standardized.flavors.map(item => capitalizeFirstLetter(item)))];
  standardized.terpenes = [...new Set(standardized.terpenes.map(item => capitalizeFirstLetter(item)))];
  standardized.lineage = [...new Set(standardized.lineage)];
  standardized.awards = [...new Set(standardized.awards)];
  
  return standardized;
}

/**
 * Determines if a new strain record should replace an existing one based on data quality
 */
function shouldReplaceExisting(existing, newStrain) {
  // Count non-empty fields
  const countNonEmpty = (obj) => {
    let count = 0;
    
    // Count top-level fields
    for (const key in obj) {
      if (key === 'grow_info') continue; // Skip nested object for now
      
      if (Array.isArray(obj[key])) {
        if (obj[key].length > 0) count++;
      } else if (obj[key] !== null && obj[key] !== '') {
        count++;
      }
    }
    
    // Count grow_info fields
    if (obj.grow_info) {
      for (const key in obj.grow_info) {
        if (obj.grow_info[key] !== null && obj.grow_info[key] !== '') {
          count++;
        }
      }
    }
    
    return count;
  };
  
  const existingCount = countNonEmpty(existing);
  const newCount = countNonEmpty(newStrain);
  
  // Replace if the new strain has more data
  return newCount > existingCount;
}

/**
 * Formats terpene name for consistency
 */
function formatTerpeneName(name) {
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
  
  // Handle some common terpene spelling variations
  const terpeneMapping = {
    'Caryophyliene': 'Caryophyllene',
    'Caryophyllene oxide': 'Caryophyllene',
    'B-caryophyllene': 'Caryophyllene',
    'Beta-caryophyllene': 'Caryophyllene',
    'B-myrcene': 'Myrcene',
    'Beta-myrcene': 'Myrcene',
    'A-pinene': 'Pinene',
    'Alpha-pinene': 'Pinene',
    'B-pinene': 'Pinene',
    'Beta-pinene': 'Pinene'
  };
  
  return terpeneMapping[formattedName] || formattedName;
}

/**
 * Parses and normalizes numeric values
 */
function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  // Handle string values with % signs
  if (typeof value === 'string') {
    value = value.replace('%', '').trim();
  }
  
  // Parse as float and handle NaN
  const numValue = parseFloat(value);
  return isNaN(numValue) ? null : numValue;
}

/**
 * Capitalizes the first letter of a string
 */
function capitalizeFirstLetter(string) {
  if (!string || typeof string !== 'string') return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Generates CSV content from standardized strain data
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
        const value = strain.grow_info[subField];
        return formatCSVField(value);
      } else if (['effects', 'medical', 'flavors', 'terpenes', 'lineage', 'awards'].includes(header)) {
        // Join arrays with semicolons
        return formatCSVField(strain[header].join(';'));
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

/**
 * Counts null/empty values for each field across all strains
 */
function countNullValues(strains) {
  const nullCounts = {};
  const totalStrains = strains.length;
  
  // Define fields to check
  const fields = [
    'name', 'classification', 'thc_percent', 'cbd_percent', 'cbg_percent',
    'average_rating', 'rating_count', 'effects', 'medical', 'flavors', 'terpenes',
    'lineage', 'awards', 'description'
  ];
  
  // Count nulls/empties for each field
  for (const field of fields) {
    nullCounts[field] = {
      count: strains.filter(strain => {
        if (Array.isArray(strain[field])) {
          return strain[field].length === 0;
        } else {
          return strain[field] === null || strain[field] === undefined || strain[field] === '';
        }
      }).length,
      percentage: 0 // Will calculate below
    };
    
    // Calculate percentage
    nullCounts[field].percentage = ((nullCounts[field].count / totalStrains) * 100).toFixed(1);
  }
  
  // Special handling for grow_info nested fields
  nullCounts['grow_info'] = {
    yield: {
      count: strains.filter(s => !s.grow_info.yield).length,
      percentage: ((strains.filter(s => !s.grow_info.yield).length / totalStrains) * 100).toFixed(1)
    },
    height: {
      count: strains.filter(s => !s.grow_info.height).length,
      percentage: ((strains.filter(s => !s.grow_info.height).length / totalStrains) * 100).toFixed(1)
    },
    difficulty: {
      count: strains.filter(s => !s.grow_info.difficulty).length,
      percentage: ((strains.filter(s => !s.grow_info.difficulty).length / totalStrains) * 100).toFixed(1)
    },
    flowering_time_weeks: {
      count: strains.filter(s => !s.grow_info.flowering_time_weeks).length,
      percentage: ((strains.filter(s => !s.grow_info.flowering_time_weeks).length / totalStrains) * 100).toFixed(1)
    }
  };
  
  return nullCounts;
}

/**
 * Validates the overall quality of the dataset
 */
function validateDataQuality(strains) {
  const totalStrains = strains.length;
  const qualityScores = {
    completeness: 0,
    consistency: 0,
    richness: 0
  };
  
  // Critical fields that should be present
  const criticalFields = ['name', 'classification', 'thc_percent'];
  const enrichmentFields = ['effects', 'flavors', 'terpenes'];
  
  // Track field presence across all strains
  const fieldPresence = {};
  
  // Check each strain for data quality
  strains.forEach(strain => {
    // Track critical fields
    criticalFields.forEach(field => {
      if (!fieldPresence[field]) fieldPresence[field] = 0;
      
      let hasValue = false;
      if (Array.isArray(strain[field])) {
        hasValue = strain[field].length > 0;
      } else {
        hasValue = strain[field] !== null && strain[field] !== undefined && strain[field] !== '';
      }
      
      if (hasValue) fieldPresence[field]++;
    });
    
    // Track enrichment fields
    enrichmentFields.forEach(field => {
      if (!fieldPresence[field]) fieldPresence[field] = 0;
      if (Array.isArray(strain[field]) && strain[field].length > 0) {
        fieldPresence[field]++;
      }
    });
  });
  
  // Calculate completeness score
  const criticalFieldsCompleteness = criticalFields.map(field => 
    fieldPresence[field] ? fieldPresence[field] / totalStrains : 0
  );
  qualityScores.completeness = (criticalFieldsCompleteness.reduce((a, b) => a + b, 0) / criticalFields.length) * 100;
  
  // Calculate consistency score - look at the consistency of field presence
  const fieldConsistencyScores = [...criticalFields, ...enrichmentFields].map(field => {
    const presence = fieldPresence[field] ? fieldPresence[field] / totalStrains : 0;
    // Score peaks at either 0% (consistently absent) or 100% (consistently present)
    return Math.max(presence, 1 - presence);
  });
  qualityScores.consistency = (fieldConsistencyScores.reduce((a, b) => a + b, 0) / fieldConsistencyScores.length) * 100;
  
  // Calculate richness score - percentage of strains with all enrichment fields
  const strainsWithEnrichment = strains.filter(strain => 
    enrichmentFields.every(field => 
      Array.isArray(strain[field]) && strain[field].length > 0
    )
  ).length;
  qualityScores.richness = (strainsWithEnrichment / totalStrains) * 100;
  
  // Calculate overall quality score
  const overallQuality = (
    (qualityScores.completeness * 0.5) + 
    (qualityScores.consistency * 0.3) + 
    (qualityScores.richness * 0.2)
  ).toFixed(1);
  
  // Get quality rating
  let qualityRating;
  if (overallQuality >= 90) qualityRating = 'Excellent';
  else if (overallQuality >= 80) qualityRating = 'Very Good';
  else if (overallQuality >= 70) qualityRating = 'Good';
  else if (overallQuality >= 60) qualityRating = 'Fair';
  else qualityRating = 'Poor';
  
  return {
    fieldPresence: Object.fromEntries(
      Object.entries(fieldPresence).map(([field, count]) => 
        [field, { count, percentage: ((count / totalStrains) * 100).toFixed(1) }]
      )
    ),
    scores: qualityScores,
    overallQuality: `${qualityRating} (${overallQuality}% score)`,
    recommendations: generateRecommendations(qualityScores, fieldPresence, totalStrains)
  };
}

/**
 * Generates recommendations for improving data quality
 */
function generateRecommendations(scores, fieldPresence, totalStrains) {
  const recommendations = [];
  
  // Check for completeness issues
  if (scores.completeness < 80) {
    const missingFields = [];
    for (const [field, count] of Object.entries(fieldPresence)) {
      const percentage = (count / totalStrains) * 100;
      if (percentage < 70) {
        missingFields.push(`${field} (${percentage.toFixed(1)}% present)`);
      }
    }
    
    if (missingFields.length > 0) {
      recommendations.push(
        `Improve completeness of critical fields: ${missingFields.join(', ')}`
      );
    }
  }
  
  // Check for consistency issues
  if (scores.consistency < 75) {
    recommendations.push(
      'Improve data consistency by filling in missing fields or standardizing field presence'
    );
  }
  
  // Check for richness issues
  if (scores.richness < 60) {
    recommendations.push(
      'Enrich strain data with more effects, flavors, and terpene information'
    );
  }
  
  // Add general recommendations
  recommendations.push(
    'Consider validating THC/CBD percentages against reliable sources',
    'Standardize terpene names and remove spelling variations',
    'Validate strain classifications (Indica/Sativa/Hybrid)'
  );
  
  return recommendations;
}

// Run the preprocessing
preprocessStrainData().catch(error => {
  console.error('Error during preprocessing:', error);
  process.exit(1);
}); 
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analyzes the strain dataset and produces a distribution report
 */
async function analyzeStrainDataset() {
  console.log('📊 Analyzing Strain Dataset...');
  
  // Define the paths
  const outputDir = path.join(__dirname, 'leafly-extract-data');
  const strainListPath = path.join(outputDir, 'complete-strain-list.json');
  const individualDir = path.join(outputDir, 'individual-strains');
  const analysisOutputPath = path.join(outputDir, 'dataset-analysis.json');
  const checkpointPath = path.join(outputDir, 'strain-extraction-checkpoint.json');
  
  // Check if strain list exists
  if (!existsSync(strainListPath)) {
    console.error(`Strain list file not found at ${strainListPath}`);
    return;
  }
  
  // Load strain list
  const strainList = JSON.parse(await fs.readFile(strainListPath, 'utf8'));
  console.log(`Loaded ${strainList.length} unique strains from strain list`);
  
  // Try to load checkpoint data for more detailed analysis
  let checkpointData = null;
  if (existsSync(checkpointPath)) {
    try {
      checkpointData = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
      console.log(`Loaded checkpoint data from ${checkpointPath}`);
    } catch (error) {
      console.error(`Error loading checkpoint: ${error.message}`);
    }
  }
  
  // Initialize distribution tracking
  const distribution = {
    total: strainList.length,
    strainTypes: {
      indica: 0,
      sativa: 0,
      hybrid: 0,
      unknown: 0
    },
    effectCounts: {},
    medicalCounts: {},
    terpeneCounts: {},
    flavorCounts: {},
    thcLevels: {
      low: 0,
      medium: 0,
      high: 0,
      unknown: 0
    },
    categoryDistribution: checkpointData?.strainsPerCategory || {},
    typeDistribution: checkpointData?.strainsPerType || {}
  };
  
  // Check if we have individual strain data to analyze
  let individualStrainsExist = existsSync(individualDir);
  
  if (individualStrainsExist) {
    console.log(`Individual strain data directory found at ${individualDir}`);
    const strainFiles = await fs.readdir(individualDir);
    console.log(`Found ${strainFiles.length} individual strain files`);
    
    // Process strain data files
    let processedCount = 0;
    
    for (const file of strainFiles) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const strainData = JSON.parse(await fs.readFile(path.join(individualDir, file), 'utf8'));
        processedCount++;
        
        // Update strain type counts
        if (strainData.classification) {
          const classification = strainData.classification.toLowerCase();
          if (classification.includes('indica')) {
            distribution.strainTypes.indica++;
          } else if (classification.includes('sativa')) {
            distribution.strainTypes.sativa++;
          } else if (classification.includes('hybrid')) {
            distribution.strainTypes.hybrid++;
          } else {
            distribution.strainTypes.unknown++;
          }
        } else {
          distribution.strainTypes.unknown++;
        }
        
        // Update THC level counts
        if (strainData.thc_percent) {
          const thc = parseFloat(strainData.thc_percent);
          if (!isNaN(thc)) {
            if (thc < 10) {
              distribution.thcLevels.low++;
            } else if (thc < 20) {
              distribution.thcLevels.medium++;
            } else {
              distribution.thcLevels.high++;
            }
          } else {
            distribution.thcLevels.unknown++;
          }
        } else {
          distribution.thcLevels.unknown++;
        }
        
        // Update effects
        if (strainData.effects && Array.isArray(strainData.effects)) {
          for (const effect of strainData.effects) {
            const effectName = effect.toLowerCase().trim();
            if (effectName) {
              distribution.effectCounts[effectName] = (distribution.effectCounts[effectName] || 0) + 1;
            }
          }
        }
        
        // Update medical conditions
        if (strainData.medical && Array.isArray(strainData.medical)) {
          for (const condition of strainData.medical) {
            const conditionName = condition.toLowerCase().trim();
            if (conditionName) {
              distribution.medicalCounts[conditionName] = (distribution.medicalCounts[conditionName] || 0) + 1;
            }
          }
        }
        
        // Update terpenes
        if (strainData.terpenes && Array.isArray(strainData.terpenes)) {
          for (const terpene of strainData.terpenes) {
            const terpeneName = terpene.toLowerCase().trim();
            if (terpeneName) {
              distribution.terpeneCounts[terpeneName] = (distribution.terpeneCounts[terpeneName] || 0) + 1;
            }
          }
        }
        
        // Update flavors
        if (strainData.flavors && Array.isArray(strainData.flavors)) {
          for (const flavor of strainData.flavors) {
            const flavorName = flavor.toLowerCase().trim();
            if (flavorName) {
              distribution.flavorCounts[flavorName] = (distribution.flavorCounts[flavorName] || 0) + 1;
            }
          }
        }
        
        // Log progress periodically
        if (processedCount % 100 === 0) {
          console.log(`Processed ${processedCount}/${strainFiles.length} strain files...`);
        }
      } catch (error) {
        console.error(`Error processing ${file}: ${error.message}`);
      }
    }
    
    console.log(`Finished processing ${processedCount} strain files`);
  } else {
    console.log(`No individual strain data found. Analysis will be limited to the checkpoint data.`);
  }
  
  // Sort and trim the detailed distributions
  distribution.topEffects = sortObjectByValues(distribution.effectCounts, 10);
  distribution.topMedical = sortObjectByValues(distribution.medicalCounts, 10);
  distribution.topTerpenes = sortObjectByValues(distribution.terpeneCounts, 10);
  distribution.topFlavors = sortObjectByValues(distribution.flavorCounts, 10);
  
  // Add category type distribution from the checkpoint
  if (checkpointData) {
    distribution.extractionDetails = {
      timestamp: checkpointData.timestamp,
      processedCategories: checkpointData.processedCategories.length,
      duplicatesSkipped: checkpointData.duplicateCount
    };
  }
  
  // Generate report
  console.log('\n📊 Dataset Distribution Report:');
  console.log(`Total Strains: ${distribution.total}`);
  
  if (individualStrainsExist) {
    console.log('\nStrain Types:');
    for (const [type, count] of Object.entries(distribution.strainTypes)) {
      const percentage = Math.round((count / distribution.total) * 100);
      console.log(`- ${type}: ${count} (${percentage}%)`);
    }
    
    console.log('\nTHC Levels:');
    for (const [level, count] of Object.entries(distribution.thcLevels)) {
      const percentage = Math.round((count / distribution.total) * 100);
      console.log(`- ${level}: ${count} (${percentage}%)`);
    }
    
    console.log('\nTop 10 Effects:');
    for (const [effect, count] of Object.entries(distribution.topEffects)) {
      const percentage = Math.round((count / distribution.total) * 100);
      console.log(`- ${effect}: ${count} (${percentage}%)`);
    }
    
    console.log('\nTop 10 Medical Uses:');
    for (const [condition, count] of Object.entries(distribution.topMedical)) {
      const percentage = Math.round((count / distribution.total) * 100);
      console.log(`- ${condition}: ${count} (${percentage}%)`);
    }
  }
  
  // Show category type distribution if available
  if (checkpointData?.strainsPerType) {
    console.log('\nCategory Type Distribution:');
    for (const [type, count] of Object.entries(checkpointData.strainsPerType)) {
      const percentage = Math.round((count / checkpointData.totalNewStrainsFound) * 100);
      console.log(`- ${type}: ${count} (${percentage}%)`);
    }
  }
  
  // Save analysis to file
  await fs.writeFile(
    analysisOutputPath,
    JSON.stringify(distribution, null, 2)
  );
  
  console.log(`\n✅ Analysis complete! Saved to ${analysisOutputPath}`);
  
  // Generate a simple HTML report for visualization
  await generateHtmlReport(distribution, outputDir);
  
  return distribution;
}

/**
 * Sorts an object by its values (descending) and returns the top N entries
 */
function sortObjectByValues(obj, limit = null) {
  const entries = Object.entries(obj);
  entries.sort((a, b) => b[1] - a[1]);
  
  if (limit && entries.length > limit) {
    return Object.fromEntries(entries.slice(0, limit));
  }
  
  return Object.fromEntries(entries);
}

/**
 * Generates a simple HTML report for visualizing the dataset
 */
async function generateHtmlReport(distribution, outputDir) {
  const reportPath = path.join(outputDir, 'dataset-report.html');
  
  // Generate the HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leafly Strain Dataset Analysis</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .chart-container {
      position: relative;
      width: 100%;
      max-width: 800px;
      margin: 0 auto 40px;
    }
    .chart-row {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 40px;
    }
    .chart-card {
      flex: 1;
      min-width: 300px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      padding: 20px;
      background: #fff;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .stats {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 30px;
    }
    .stat-card {
      flex: 1;
      min-width: 200px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      text-align: center;
    }
    .stat-number {
      font-size: 32px;
      font-weight: bold;
      color: #3498db;
      margin: 10px 0;
    }
    .stat-label {
      font-size: 14px;
      color: #7f8c8d;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Leafly Strain Dataset Analysis</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">Total Strains</div>
      <div class="stat-number">${distribution.total}</div>
    </div>
    ${distribution.extractionDetails ? `
    <div class="stat-card">
      <div class="stat-label">Categories Processed</div>
      <div class="stat-number">${distribution.extractionDetails.processedCategories}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Duplicates Skipped</div>
      <div class="stat-number">${distribution.extractionDetails.duplicatesSkipped}</div>
    </div>
    ` : ''}
  </div>
  
  <div class="chart-row">
    <div class="chart-card">
      <h2>Strain Types</h2>
      <div class="chart-container">
        <canvas id="strainTypesChart"></canvas>
      </div>
    </div>
    
    <div class="chart-card">
      <h2>THC Levels</h2>
      <div class="chart-container">
        <canvas id="thcLevelsChart"></canvas>
      </div>
    </div>
  </div>
  
  <div class="chart-row">
    <div class="chart-card">
      <h2>Top Effects</h2>
      <div class="chart-container">
        <canvas id="effectsChart"></canvas>
      </div>
    </div>
    
    <div class="chart-card">
      <h2>Top Medical Uses</h2>
      <div class="chart-container">
        <canvas id="medicalChart"></canvas>
      </div>
    </div>
  </div>
  
  ${distribution.typeDistribution ? `
  <div class="chart-card">
    <h2>Category Type Distribution</h2>
    <div class="chart-container">
      <canvas id="categoryTypeChart"></canvas>
    </div>
  </div>
  ` : ''}
  
  <script>
    // Prepare the data
    const distribution = ${JSON.stringify(distribution)};
    
    // Helper function to generate colors
    function generateColors(count) {
      const colors = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
        '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad',
        '#27ae60', '#2980b9', '#f1c40f', '#e67e22', '#95a5a6'
      ];
      
      if (count <= colors.length) {
        return colors.slice(0, count);
      }
      
      // If we need more colors, repeat and vary them
      const result = [];
      for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
      }
      return result;
    }
    
    // Create strain types chart if data exists
    if (distribution.strainTypes) {
      const typesData = Object.values(distribution.strainTypes);
      const typesLabels = Object.keys(distribution.strainTypes).map(t => t.charAt(0).toUpperCase() + t.slice(1));
      
      new Chart(document.getElementById('strainTypesChart'), {
        type: 'pie',
        data: {
          labels: typesLabels,
          datasets: [{
            data: typesData,
            backgroundColor: generateColors(typesLabels.length)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const percentage = ((value / distribution.total) * 100).toFixed(1);
                  return \`\${context.label}: \${value} (\${percentage}%)\`;
                }
              }
            }
          }
        }
      });
    }
    
    // Create THC levels chart if data exists
    if (distribution.thcLevels) {
      const thcData = Object.values(distribution.thcLevels);
      const thcLabels = Object.keys(distribution.thcLevels).map(t => t.charAt(0).toUpperCase() + t.slice(1));
      
      new Chart(document.getElementById('thcLevelsChart'), {
        type: 'pie',
        data: {
          labels: thcLabels,
          datasets: [{
            data: thcData,
            backgroundColor: generateColors(thcLabels.length)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const percentage = ((value / distribution.total) * 100).toFixed(1);
                  return \`\${context.label}: \${value} (\${percentage}%)\`;
                }
              }
            }
          }
        }
      });
    }
    
    // Create effects chart if data exists
    if (distribution.topEffects) {
      const effectsData = Object.values(distribution.topEffects);
      const effectsLabels = Object.keys(distribution.topEffects).map(e => e.charAt(0).toUpperCase() + e.slice(1));
      
      new Chart(document.getElementById('effectsChart'), {
        type: 'bar',
        data: {
          labels: effectsLabels,
          datasets: [{
            label: 'Number of Strains',
            data: effectsData,
            backgroundColor: '#3498db'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const percentage = ((value / distribution.total) * 100).toFixed(1);
                  return \`\${value} strains (\${percentage}%)\`;
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
    
    // Create medical chart if data exists
    if (distribution.topMedical) {
      const medicalData = Object.values(distribution.topMedical);
      const medicalLabels = Object.keys(distribution.topMedical).map(m => m.charAt(0).toUpperCase() + m.slice(1));
      
      new Chart(document.getElementById('medicalChart'), {
        type: 'bar',
        data: {
          labels: medicalLabels,
          datasets: [{
            label: 'Number of Strains',
            data: medicalData,
            backgroundColor: '#2ecc71'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const percentage = ((value / distribution.total) * 100).toFixed(1);
                  return \`\${value} strains (\${percentage}%)\`;
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
    
    // Create category type distribution chart if data exists
    if (distribution.typeDistribution) {
      const typeData = Object.values(distribution.typeDistribution);
      const typeLabels = Object.keys(distribution.typeDistribution);
      
      new Chart(document.getElementById('categoryTypeChart'), {
        type: 'pie',
        data: {
          labels: typeLabels,
          datasets: [{
            data: typeData,
            backgroundColor: generateColors(typeLabels.length)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const total = typeData.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return \`\${context.label}: \${value} (\${percentage}%)\`;
                }
              }
            }
          }
        }
      });
    }
  </script>
</body>
</html>
  `;
  
  // Write the HTML file
  await fs.writeFile(reportPath, html);
  console.log(`📊 HTML report generated at ${reportPath}`);
}

// Run the analysis
analyzeStrainDataset().catch(err => {
  console.error('Error analyzing dataset:', err);
  process.exit(1);
}); 
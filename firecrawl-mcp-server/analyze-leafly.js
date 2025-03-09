#!/usr/bin/env node

import FirecrawlApp from '@mendable/firecrawl-js';
import fs from 'fs';
import path from 'path';

// Sample strains covering different types to analyze
const SAMPLE_STRAINS = [
  "Blue Dream",        // Popular hybrid
  "OG Kush",           // Classic strain
  "Northern Lights",   // Classic indica 
  "Durban Poison",     // Pure sativa
  "ACDC",              // High CBD strain
  "Wedding Cake",      // Modern/popular strain
  "GSC",               // Girl Scout Cookies - another popular strain
  "Runtz",             // Newer strain
  "Granddaddy Purple", // Purple strain
  "Sour Diesel"        // Classic sativa
];

// Initialize FirecrawlApp client
const client = new FirecrawlApp({
  apiKey: "fc-c6727b10239646c8b67dcdf97c1a4321"
});

// Create analysis directory
const ANALYSIS_DIR = path.join(process.cwd(), 'leafly-analysis');
if (!fs.existsSync(ANALYSIS_DIR)) {
  fs.mkdirSync(ANALYSIS_DIR);
}

async function analyzeLeaflyContent() {
  console.log("Starting Leafly content analysis...");
  
  // Create a summary file
  const summaryFile = path.join(ANALYSIS_DIR, 'summary.txt');
  fs.writeFileSync(summaryFile, 'LEAFLY CONTENT STRUCTURE ANALYSIS\n\n');
  
  for (const strain of SAMPLE_STRAINS) {
    try {
      console.log(`Analyzing strain: ${strain}`);
      
      // Format strain name for URL
      const formattedName = strain
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const leaflyUrl = `https://www.leafly.com/strains/${formattedName}`;
      
      // 1. Scrape with minimal processing to get raw content
      const rawData = await client.scrapeUrl(leaflyUrl, {
        formats: ['html', 'markdown'],
        onlyMainContent: false  // Get everything
      });
      
      if (!rawData.success) {
        console.log(`Failed to scrape ${strain}. Trying search...`);
        const searchResults = await client.search(`${strain} strain site:leafly.com/strains`);
        
        if (!searchResults.success || !searchResults.data.length) {
          console.log(`Could not find ${strain} on Leafly`);
          continue;
        }
        
        // Try the first search result
        const alternativeUrl = searchResults.data[0].url;
        const retryData = await client.scrapeUrl(alternativeUrl, {
          formats: ['html', 'markdown'],
          onlyMainContent: false
        });
        
        if (!retryData.success) {
          console.log(`Could not scrape alternative URL for ${strain}`);
          continue;
        }
        
        // Save the content
        saveStrainContent(strain, retryData, summaryFile);
      } else {
        // Save the content
        saveStrainContent(strain, rawData, summaryFile);
      }
      
      // Wait between requests to avoid rate limiting
      console.log(`Waiting 5 seconds before next request...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`Error analyzing ${strain}:`, error);
    }
  }
  
  console.log(`\nAnalysis complete! Files saved to ${ANALYSIS_DIR}`);
}

function saveStrainContent(strain, data, summaryFile) {
  // Create a directory for this strain
  const strainDir = path.join(ANALYSIS_DIR, formatStrainDir(strain));
  if (!fs.existsSync(strainDir)) {
    fs.mkdirSync(strainDir);
  }
  
  // Save raw data
  if (data.html) {
    fs.writeFileSync(path.join(strainDir, 'raw.html'), data.html);
  }
  
  if (data.markdown) {
    fs.writeFileSync(path.join(strainDir, 'content.md'), data.markdown);
  }
  
  // Extract key sections for quick reference
  const markdown = data.markdown || '';
  
  // Look for common sections
  const sections = {
    'Cannabinoids': extractSection(markdown, /(?:Cannabinoids|THC\s*Content|CBD\s*Content)/i, 1000),
    'Terpenes': extractSection(markdown, /(?:Terpenes|Dominant terpenes|Common terpenes)/i, 1000),
    'Effects': extractSection(markdown, /(?:Effects|Feel|Feelings|Make you feel)/i, 1000),
    'Medical': extractSection(markdown, /(?:Medical|Helps with|Relieves|Treats)/i, 1000),
    'Flavor': extractSection(markdown, /(?:Flavor|Taste|Aroma|Smell)/i, 1000),
    'Description': extractSection(markdown, /(?:About|Description|Overview)/i, 1500),
  };
  
  // Save sections file
  let sectionsContent = `# ${strain} Content Analysis\n\n`;
  for (const [name, content] of Object.entries(sections)) {
    if (content) {
      sectionsContent += `## ${name}\n\n${content}\n\n`;
    }
  }
  
  fs.writeFileSync(path.join(strainDir, 'sections.md'), sectionsContent);
  
  // Add to summary file
  fs.appendFileSync(summaryFile, `\n\n## ${strain}\n\n`);
  
  // Add section summaries to the overall summary
  for (const [name, content] of Object.entries(sections)) {
    if (content) {
      // Just get the first 150 chars of each section for the summary
      const preview = content.substring(0, 150).replace(/\n/g, ' ') + '...';
      fs.appendFileSync(summaryFile, `### ${name}\n${preview}\n\n`);
    }
  }
  
  console.log(`Saved content for ${strain}`);
}

function extractSection(markdown, patternRegex, maxLength = 500) {
  const lines = markdown.split('\n');
  let captureSection = false;
  let sectionContent = '';
  let lineCount = 0;
  
  for (const line of lines) {
    // Start capturing if we find a header matching our pattern
    if (!captureSection && patternRegex.test(line)) {
      captureSection = true;
    }
    
    // If we're capturing, add the line to our section content
    if (captureSection) {
      sectionContent += line + '\n';
      lineCount++;
      
      // Stop if we hit a new header (that's not a sub-header of what we're capturing)
      // Or if we've captured enough lines
      if ((line.startsWith('# ') || line.startsWith('## ')) && lineCount > 1) {
        break;
      }
      
      // Also stop if we've captured a lot of content
      if (sectionContent.length > maxLength) {
        sectionContent += "...(truncated)";
        break;
      }
    }
  }
  
  return sectionContent.trim();
}

function formatStrainDir(strain) {
  return strain.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
}

// Run the analysis
analyzeLeaflyContent().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 
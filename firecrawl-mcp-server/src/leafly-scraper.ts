import FirecrawlApp from '@mendable/firecrawl-js';
import PQueue from 'p-queue';

// Define interface for strain data
export interface StrainData {
  "Strain Name": string;
  aliases?: string;
  strain_classification?: string;
  "lineage.parents"?: string;
  "rating.average"?: number;
  "rating.count"?: number;
  "grow_info.difficulty"?: string;
  "grow_info.flowering_weeks"?: number;
  "grow_info.yield"?: string;
  "grow_info.height"?: string;
  awards?: string;
  description?: string;
  [key: string]: string | number | null | undefined;
}

// Helper function to format strain name for URL
export function formatStrainForUrl(strain: string): string {
  return strain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper function to extract cannabinoids from content
export function extractCannabinoids(content: string, strainData: StrainData): void {
  // THC extraction - more flexible patterns
  const thcMatch = content.match(/THC\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i) || 
                   content.match(/THC\s*content\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i) ||
                   content.match(/contains\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%\s*THC/i);
  
  if (thcMatch) {
    // Take higher end of range per methodology
    const thcValue = thcMatch[2] ? parseFloat(thcMatch[2]) : parseFloat(thcMatch[1]);
    strainData["THC %"] = thcValue; // Store as percentage
  } else if (content.match(/high\s+THC|potent|strong/i)) {
    // If described as high THC but no percentage
    strainData["THC %"] = 20; // Assume 20%
  }
  
  // CBD extraction - enhanced patterns
  const cbdMatch = content.match(/CBD\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i) ||
                   content.match(/CBD\s*content\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i);
  
  if (cbdMatch) {
    const cbdValue = cbdMatch[2] ? parseFloat(cbdMatch[2]) : parseFloat(cbdMatch[1]);
    strainData["CBD %"] = cbdValue; // Store as percentage
  } else if (content.match(/high\s+CBD|CBD-rich|CBD\s+dominant/i)) {
    strainData["CBD %"] = 10; // Assume 10% for high CBD strains
  }
  
  // CBG extraction
  const cbgMatch = content.match(/CBG\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i);
  
  if (cbgMatch) {
    const cbgValue = cbgMatch[2] ? parseFloat(cbgMatch[2]) : parseFloat(cbgMatch[1]);
    strainData["CBG %"] = cbgValue; // Store as percentage
  }
  
  // CBN extraction - enhanced
  const cbnMatch = content.match(/CBN\s*:?\s*(\d+(?:\.\d+)?)-?(\d+(?:\.\d+)?)?\s*%/i);
  if (cbnMatch) {
    const cbnValue = cbnMatch[2] ? parseFloat(cbnMatch[2]) : parseFloat(cbnMatch[1]);
    strainData["cannabinoids.CBN"] = cbnValue / 100;
  }
  
  // Look for potency descriptions if no specific percentages
  if (!strainData["THC %"] && content.match(/very potent|extremely strong|highly potent/i)) {
    strainData["THC %"] = 25; // Assume 25% for very potent
  }
}

// Helper function to extract terpenes from content
export function extractTerpenes(content: string, strainData: StrainData): void {
  // Define all terpenes we want to extract
  const terpenes = [
    { name: "Caryophyllene", patterns: [/caryophyllene/i, /spicy/i, /peppery/i, /woody/i] },
    { name: "Limonene", patterns: [/limonene/i, /citrus/i, /lemon/i, /orange/i, /tangy/i] },
    { name: "Myrcene", patterns: [/myrcene/i, /earthy/i, /musky/i, /herbal/i, /cloves/i] },
    { name: "Pinene", patterns: [/pinene/i, /pine/i, /forest/i, /woody/i] },
    { name: "Humulene", patterns: [/humulene/i, /hoppy/i, /woody/i, /earthy/i] },
    { name: "Terpinolene", patterns: [/terpinolene/i, /floral/i, /herbal/i, /pine/i] },
    { name: "Ocimene", patterns: [/ocimene/i, /sweet/i, /woody/i, /herbal/i] },
    { name: "Linalool", patterns: [/linalool/i, /floral/i, /lavender/i, /spicy/i] },
    { name: "Terpineol", patterns: [/terpineol/i, /floral/i, /lilac/i, /pine/i, /clove/i] },
    { name: "Valencene", patterns: [/valencene/i, /citrus/i, /sweet/i, /fresh/i] }
  ];
  
  // Look for dominant terpene section
  const terpenesSection = content.match(/(?:dominant|primary)\s+terpenes?(?:[^\n]+)?(?:\n+|\s+)((?:[^\n]+\n+){1,10})/i) ||
                          content.match(/terpene\s+profile(?:[^\n]+)?(?:\n+|\s+)((?:[^\n]+\n+){1,10})/i);
                         
  if (terpenesSection) {
    const terpeneContent = terpenesSection[1];
    
    // Extract terpenes from the dedicated section
    for (const terpene of terpenes) {
      for (const pattern of terpene.patterns) {
        if (pattern.test(terpeneContent)) {
          // Determine if it's dominant, secondary, or minor based on order and description
          const isFirst = terpeneContent.match(new RegExp(`^[^\\n]*${pattern.source}`, 'i'));
          const isDominant = terpeneContent.match(new RegExp(`dominant[^\\n]*${pattern.source}|${pattern.source}[^\\n]*dominant|primary[^\\n]*${pattern.source}|${pattern.source}[^\\n]*primary`, 'i'));
          
          if (isFirst || isDominant) {
            strainData[terpene.name] = "Dominant";
          } else {
            strainData[terpene.name] = "Present";
          }
          break;
        }
      }
    }
  } else {
    // If no dedicated section, use the whole content to look for terpene mentions
    for (const terpene of terpenes) {
      let found = false;
      for (const pattern of terpene.patterns) {
        if (pattern.test(content)) {
          found = true;
          break;
        }
      }
      
      if (found) {
        strainData[terpene.name] = "Present";
      }
    }
  }
}

// Helper function to extract effects from content
export function extractEffects(content: string, strainData: StrainData): void {
  // Define common effects
  const medicalEffects = [
    "Stress", "Anxiety", "Depression", "Pain", "Insomnia", 
    "Lack of Appetite", "Nausea", "Inflammation", "Headaches", "Muscle Spasms"
  ];
  
  const userEffects = [
    "Happy", "Euphoric", "Creative", "Relaxed", "Uplifted", 
    "Energetic", "Focused", "Sleepy", "Hungry", "Talkative",
    "Tingly", "Giggly", "Aroused", "Calm"
  ];
  
  // Extract medical effects
  let medicalMatches: string[] = [];
  
  // Look for medical effects section
  const medicalSection = content.match(/medical(?:[^.]*?benefits|[^.]*?effects|[^.]*?uses)[^.]*?(?:include|are|:)?([^.]+)/i);
  if (medicalSection) {
    // Extract specific conditions
    for (const effect of medicalEffects) {
      const effectPattern = new RegExp(`\\b${effect.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (effectPattern.test(medicalSection[1])) {
        medicalMatches.push(effect);
      }
    }
  }
  
  // Look for other medical mentions throughout the content
  for (const effect of medicalEffects) {
    const effectPattern = new RegExp(`\\b(?:helps with|alleviates|reduces|treats|managing|relief from|helps|treat)\\s+\\w+\\s+${effect.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (effectPattern.test(content) && !medicalMatches.includes(effect)) {
      medicalMatches.push(effect);
    }
  }
  
  // Extract user/recreational effects
  let userMatches: string[] = [];
  
  // Look for effects section
  const effectsSection = content.match(/effects(?:[^.]*?)(?:include|are|:)?([^.]+)/i);
  if (effectsSection) {
    // Extract specific feelings
    for (const effect of userEffects) {
      const effectPattern = new RegExp(`\\b${effect.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (effectPattern.test(effectsSection[1])) {
        userMatches.push(effect);
      }
    }
  }
  
  // Look for effects mentions throughout the content
  for (const effect of userEffects) {
    const effectPattern = new RegExp(`\\b(?:makes you feel|feeling|feeling of|sense of|produces|creates)\\s+\\w+\\s+${effect.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (effectPattern.test(content) && !userMatches.includes(effect)) {
      userMatches.push(effect);
    }
  }
  
  // Set medical effects
  if (medicalMatches.length > 0) {
    strainData["Medical"] = medicalMatches.join(', ');
  }
  
  // Set user effects
  if (userMatches.length > 0) {
    strainData["Effects"] = userMatches.join(', ');
  }
}

// Helper function to extract flavors from content
export function extractFlavors(content: string, strainData: StrainData): void {
  // Define common flavors
  const flavors = [
    "Berry", "Sweet", "Earthy", "Pungent", "Pine", 
    "Vanilla", "Minty", "Skunky", "Citrus", "Spicy", 
    "Herbal", "Diesel", "Tropical", "Fruity", "Grape",
    "Woody", "Floral", "Coffee", "Cheese", "Chocolate"
  ];
  
  // Look for flavor/aroma section
  const flavorSection = content.match(/(?:flavors?|aroma|scents?|smells?|tastes?)(?:[^.]*?)(?:include|are|:)?([^.]+)/i);
  
  let flavorMatches: string[] = [];
  
  if (flavorSection) {
    // Extract specific flavors from section
    for (const flavor of flavors) {
      const flavorPattern = new RegExp(`\\b${flavor.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (flavorPattern.test(flavorSection[1]) && !flavorMatches.includes(flavor)) {
        flavorMatches.push(flavor);
      }
    }
  }
  
  // Look for flavor mentions throughout the content
  for (const flavor of flavors) {
    const flavorPattern = new RegExp(`\\b(?:tastes like|smells like|aroma of|flavor of|scent of|notes of)\\s+\\w+\\s+${flavor.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (flavorPattern.test(content) && !flavorMatches.includes(flavor)) {
      flavorMatches.push(flavor);
    }
  }
  
  // Set flavors
  if (flavorMatches.length > 0) {
    strainData["Flavors"] = flavorMatches.join(', ');
  }
}

// Helper function to normalize strain data values
export function normalizeStrainData(strainData: StrainData): void {
  // Normalize strain name: remove extra spaces and capitalize words
  if (strainData["Strain Name"]) {
    strainData["Strain Name"] = strainData["Strain Name"]
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  
  // Normalize ratings - ensure we handle string or number types appropriately
  if (strainData["rating.average"] !== undefined) {
    // Convert any rating to a number with one decimal place
    const ratingValue = typeof strainData["rating.average"] === 'string' 
      ? parseFloat(strainData["rating.average"] as string) 
      : Number(strainData["rating.average"]);
      
    if (!isNaN(ratingValue)) {
      strainData["rating.average"] = parseFloat(ratingValue.toFixed(1));
    }
  }
  
  if (strainData["rating.count"] !== undefined) {
    // Convert any count to a number without decimals
    let countValue: number;
    
    if (typeof strainData["rating.count"] === 'string') {
      // Handle string with possible commas
      countValue = parseInt((strainData["rating.count"] as string).replace(/,/g, ''), 10);
    } else {
      countValue = Number(strainData["rating.count"]);
    }
    
    if (!isNaN(countValue)) {
      strainData["rating.count"] = Math.round(countValue);
    }
  }
  
  // Normalize strain classification to standard format
  if (strainData["strain_classification"]) {
    // Convert to title case
    let classification = String(strainData["strain_classification"]).toLowerCase();
    
    // Standardize hybrid subtypes
    if (classification.includes('hybrid')) {
      if (classification.includes('indica') && classification.includes('dominant')) {
        classification = 'Indica-dominant Hybrid';
      } else if (classification.includes('sativa') && classification.includes('dominant')) {
        classification = 'Sativa-dominant Hybrid';
      } else {
        classification = 'Hybrid';
      }
    } 
    // Standardize pure types
    else if (classification.includes('indica')) {
      classification = 'Indica';
    } else if (classification.includes('sativa')) {
      classification = 'Sativa';
    } else if (classification.includes('ruderalis')) {
      classification = 'Ruderalis';
    }
    
    strainData["strain_classification"] = classification;
  }
  
  // Normalize grow difficulty
  if (strainData["grow_info.difficulty"]) {
    const difficulty = String(strainData["grow_info.difficulty"]).toLowerCase();
    if (difficulty.includes('easy') || difficulty.includes('beginner')) {
      strainData["grow_info.difficulty"] = 'Easy';
    } else if (difficulty.includes('moderate') || difficulty.includes('intermediate')) {
      strainData["grow_info.difficulty"] = 'Moderate';
    } else if (difficulty.includes('difficult') || difficulty.includes('hard') || difficulty.includes('advanced')) {
      strainData["grow_info.difficulty"] = 'Difficult';
    }
  }
  
  // Normalize flowering time to ensure it's a number of weeks
  if (strainData["grow_info.flowering_weeks"]) {
    let flowering = String(strainData["grow_info.flowering_weeks"]);
    
    // Extract numeric values
    const numericMatches = flowering.match(/(\d+)\s*(?:-\s*(\d+))?/);
    if (numericMatches) {
      if (numericMatches[2]) { // If there's a range
        const min = parseInt(numericMatches[1]);
        const max = parseInt(numericMatches[2]);
        // Take the average of the range
        strainData["grow_info.flowering_weeks"] = Math.round((min + max) / 2);
      } else { // Single value
        strainData["grow_info.flowering_weeks"] = parseInt(numericMatches[1]);
      }
    }
  }
  
  // Normalize yield to standard categories (Low, Medium, High)
  if (strainData["grow_info.yield"]) {
    const yield_val = String(strainData["grow_info.yield"]).toLowerCase();
    
    if (yield_val.includes('low') || yield_val.includes('small') || yield_val.match(/\b(1|one)\b/i)) {
      strainData["grow_info.yield"] = 'Low';
    } else if (yield_val.includes('high') || yield_val.includes('large') || yield_val.includes('heavy') || 
               yield_val.match(/\b(3|three)\b/i) || yield_val.includes('substantial')) {
      strainData["grow_info.yield"] = 'High';
    } else {
      strainData["grow_info.yield"] = 'Medium';
    }
  }
  
  // Normalize height
  if (strainData["grow_info.height"]) {
    const height = String(strainData["grow_info.height"]).toLowerCase();
    
    // Categorize height
    if (height.includes('tall') || height.includes('high') || height.match(/\b(5|6|7|8|9|10)(-|\s)feet\b/i) || 
        height.match(/\b(150|160|170|180|190|200|210|220|230|240|250)\s*cm\b/i)) {
      strainData["grow_info.height"] = 'Tall (>150cm)';
    } else if (height.includes('short') || height.includes('small') || height.match(/\b(1|2)(-|\s)feet\b/i) || 
              height.match(/\b(30|40|50|60|70|80|90)\s*cm\b/i)) {
      strainData["grow_info.height"] = 'Short (<100cm)';
    } else {
      strainData["grow_info.height"] = 'Medium (100-150cm)';
    }
  }
}

// Helper function to validate strain data quality
export function validateDataQuality(strainData: StrainData): void {
  // Check for outliers
  if ((strainData["THC %"] as number) > 0.4) { // 40% THC is extremely unlikely
    strainData["THC %"] = 0.4; // Cap at 40%
  }
  
  // Check for inconsistencies
  if ((strainData["THC %"] as number) > 0.25 && 
      (!strainData["user_effects.Euphoric"] || (strainData["user_effects.Euphoric"] as number) < 0.3)) {
    // High THC should correlate with euphoric effects
    strainData["user_effects.Euphoric"] = 0.5; // Set moderate value as fallback
  }
}

// Helper function to extract strain aliases
export function extractAliases(content: string, strainData: StrainData): void {
  // Look for "also known as" or similar phrases
  const aliasPatterns = [
    /also known as [""]([^""]*)[""]|also called [""]([^""]*)[""]|aka [""](.*?)[""]/i,
    /also known as\s+(.*?)(?:[.,]|$)/i,
    /\((?:aka|also called|also known as)\s+(.*?)\)/i,
    /(?:aka|also called)\s+(.*?)(?:[.,]|$)/i
  ];
  
  for (const pattern of aliasPatterns) {
    const match = content.match(pattern);
    if (match) {
      // Use the first non-undefined capturing group
      const alias = match[1] || match[2] || match[3] || '';
      if (alias.trim()) {
        strainData.aliases = alias.trim();
        return;
      }
    }
  }
}

// Helper function to extract strain classification
export function extractClassification(content: string, strainData: StrainData): void {
  // Look for common strain type descriptions
  if (content.match(/\bindica-dominant\b|\bpure indica\b|\bheavy indica\b|\bmostly indica\b/i)) {
    strainData.strain_classification = "Indica";
  } else if (content.match(/\bsativa-dominant\b|\bpure sativa\b|\bstrong sativa\b|\bmostly sativa\b/i)) {
    strainData.strain_classification = "Sativa";
  } else if (content.match(/\b50\/50 hybrid\b|\bbalanced hybrid\b|\beven hybrid\b/i)) {
    strainData.strain_classification = "Hybrid (50/50)";
  } else if (content.match(/\bindica hybrid\b|\bindica-leaning\b|\bindica-hybrid\b/i)) {
    strainData.strain_classification = "Hybrid (Indica-dominant)";
  } else if (content.match(/\bsativa hybrid\b|\bsativa-leaning\b|\bsativa-hybrid\b/i)) {
    strainData.strain_classification = "Hybrid (Sativa-dominant)";
  } else if (content.match(/\bhybrid\b/i)) {
    strainData.strain_classification = "Hybrid";
  }
  
  // If we still don't have a classification, try to infer from the effects
  if (!strainData.strain_classification) {
    // Check if CBD-dominant strain
    if (content.match(/\bhigh(?:-|\s+)CBD\b|\bCBD(?:-|\s+)dominant\b|\bCBD-rich\b/i)) {
      strainData.strain_classification = "High CBD";
    } 
    
    // Check if balanced THC/CBD strain
    else if (content.match(/\bbalanced THC\/CBD\b|\bequal THC and CBD\b/i)) {
      strainData.strain_classification = "Balanced THC/CBD";
    }
  }
}

// Helper function to extract ratings
export function extractRatings(content: string, strainData: StrainData): void {
  // Look for rating patterns: 4.5 out of 5, 4.5/5, etc.
  const ratingPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*5(?:\s+stars)?(?:\s+from\s+(\d+(?:,\d+)*)\s+(?:ratings|reviews))?/i,
    /rating:\s*(\d+(?:\.\d+)?)(?:\s*\/\s*5)?(?:\s+\((\d+(?:,\d+)*)\s+(?:ratings|reviews|votes)\))?/i,
    /average rating\s*:?\s*(\d+(?:\.\d+)?)(?:\s+from\s+(\d+(?:,\d+)*)\s+users)?/i
  ];
  
  for (const pattern of ratingPatterns) {
    const match = content.match(pattern);
    if (match) {
      const ratingValue = parseFloat(match[1]);
      if (!isNaN(ratingValue) && ratingValue >= 0 && ratingValue <= 5) {
        strainData["rating.average"] = ratingValue;
        
        // If we have the count of ratings, also extract that
        if (match[2]) {
          const ratingCount = parseInt(match[2].replace(/,/g, ''));
          if (!isNaN(ratingCount)) {
            strainData["rating.count"] = ratingCount;
          }
        }
        return;
      }
    }
  }
  
  // If we couldn't find an explicit rating, look for more generic sentiment
  if (content.match(/\bhighly\s+rated\b|\bpopular\b|\bwell-loved\b|\bfan\s+favorite\b/i)) {
    strainData["rating.average"] = 4.5; // Assume high rating for popular strains
  }
}

// Helper function to extract strain lineage
export function extractLineage(content: string, strainData: StrainData): void {
  // Various patterns to identify parent strains
  const lineagePatterns = [
    // Direct mention of parents
    /(?:bred from|cross(?:ed)? (?:between|of|with)|hybrid of|bred by crossing|genetic cross of|lineage of)\s+([^.]+?)(?:\s+and\s+|\s+x\s+|\s+&\s+)([^.]+?)(?:[,.]|$)/i,
    
    // Origin mention
    /created by (?:breeding|crossing)\s+([^.]+?)(?:\s+(?:with|and|x)\s+)([^.]+?)(?:[,.]|$)/i,
    
    // Explicit parent mention
    /(?:parent strains are|parents include|parents:|parental strains:|lineage:)\s+([^.]+?)(?:\s+(?:and|x|&)\s+|\s*[,/]\s*)([^.]+?)(?:[,.]|$)/i,
    
    // Direct genetic lineage
    /(?:genetics|genetic makeup|genetic lineage|genetic background)(?:[^.]*?from|[^.]*?:)\s+([^.]+?)(?:\s+(?:and|x|&)\s+|\s*[,/]\s*)([^.]+?)(?:[,.]|$)/i,
    
    // Possessive parent reference
    /(?:'s|s'|s) child|offspring of\s+([^.]+?)(?:\s+(?:and|x|&)\s+|\s*[,/]\s*)([^.]+?)(?:[,.]|$)/i
  ];
  
  // Try each pattern to find mentions of parent strains
  for (const pattern of lineagePatterns) {
    const match = content.match(pattern);
    if (match) {
      // Extract parent strains from the match
      const parent1 = cleanStrainName(match[1]);
      const parent2 = cleanStrainName(match[2]);
      
      if (parent1 && parent2) {
        strainData["lineage.parents"] = `${parent1} × ${parent2}`;
        return;
      }
    }
  }
  
  // If no direct crossing pattern found, try to find any mention of lineage
  const lineageSectionPattern = /(?:genetics|lineage|origin|background|heritage|ancestry|parentage)[^:]*:?\s*([^.]+?)(?:\.|$)/i;
  const lineageSectionMatch = content.match(lineageSectionPattern);
  
  if (lineageSectionMatch) {
    const lineageText = lineageSectionMatch[1].trim();
    
    // Look for common crossing syntax in the section
    const crossPattern = /([^,x×X&+]+?)\s*(?:x|×|X|&|\+)\s*([^,x×X&+]+)/;
    const crossMatch = lineageText.match(crossPattern);
    
    if (crossMatch) {
      const parent1 = cleanStrainName(crossMatch[1]);
      const parent2 = cleanStrainName(crossMatch[2]);
      
      if (parent1 && parent2) {
        strainData["lineage.parents"] = `${parent1} × ${parent2}`;
        return;
      }
    }
    
    // Look for "child of" or "from" phrases
    const childOfPattern = /(?:child|descendent|comes) (?:of|from) ([^.]+)/i;
    const childOfMatch = lineageText.match(childOfPattern);
    
    if (childOfMatch) {
      const parentText = childOfMatch[1].trim();
      
      // Check if multiple parents are mentioned with "and" or commas
      if (parentText.match(/\s+and\s+|,/)) {
        // Extract multiple parents
        const parents = parentText.split(/\s+and\s+|,\s*/).map(p => cleanStrainName(p)).filter(Boolean);
        if (parents.length >= 2) {
          strainData["lineage.parents"] = `${parents[0]} × ${parents[1]}`;
          return;
        }
      }
    }
  }
  
  // Try to find direct mentions of well-known parent strains throughout the content
  const commonParentStrains = [
    "OG Kush", "Skunk", "Haze", "Northern Lights", "Blueberry", "White Widow", 
    "Chemdawg", "Afghani", "Thai", "Diesel", "Purple", "Kush", "Jack Herer", "Durban Poison",
    "Hawaiian", "Girl Scout Cookies", "Bubba Kush", "Hindu Kush", "Cookies", "Gelato", "Zkittlez"
  ];
  
  let foundParents: string[] = [];
  for (const parentStrain of commonParentStrains) {
    // Look for phrases that indicate parentage
    const parentPattern = new RegExp(`(?:descend(?:s|ed) from|(?:is|was) a child of|comes from|bred from|crossed with|genetics from)[^.]*?\\b${parentStrain}\\b`, 'i');
    if (content.match(parentPattern)) {
      foundParents.push(parentStrain);
      if (foundParents.length >= 2) break;
    }
  }
  
  if (foundParents.length === 2) {
    strainData["lineage.parents"] = `${foundParents[0]} × ${foundParents[1]}`;
  } else if (foundParents.length === 1) {
    // Look for a second parent mentioned in the same sentence
    const parentSentencePattern = new RegExp(`[^.]*?\\b${foundParents[0]}\\b[^.]*?(?:and|with|x|×)[^.]*?\\b([A-Z][a-zA-Z0-9 ]+?)\\b[^.]*?\\.`, 'i');
    const parentSentenceMatch = content.match(parentSentencePattern);
    
    if (parentSentenceMatch) {
      const secondParent = cleanStrainName(parentSentenceMatch[1]);
      if (secondParent && !foundParents.includes(secondParent)) {
        strainData["lineage.parents"] = `${foundParents[0]} × ${secondParent}`;
      }
    }
  }
}

// Helper function to clean strain names
function cleanStrainName(name: string): string {
  // Standardize the strain name
  let cleanName = name.trim()
    // Remove non-alphanumeric characters at start and end
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    // Remove phrases like "the", "strain", "variety", etc.
    .replace(/\b(?:the|strain|variety|known as|called|famous|popular)\b/gi, '')
    // Remove parentheticals
    .replace(/\([^)]+\)/g, '')
    // Clean extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
    
  // Capitalize first letter of each word
  cleanName = cleanName.replace(/\b\w/g, c => c.toUpperCase());
  
  // Special case for OG, CBD, THC, etc. that should be uppercase
  cleanName = cleanName.replace(/\b(Og)\b/g, 'OG');
  cleanName = cleanName.replace(/\b(Cbd)\b/g, 'CBD');
  cleanName = cleanName.replace(/\b(Thc)\b/g, 'THC');
  
  return cleanName;
}

// Helper function to extract growing information
export function extractGrowInfo(content: string, strainData: StrainData): void {
  // First look for a dedicated growing section
  const growSectionPattern = /(?:grow(?:ing)? info|cultiv(?:ation|ating)|grow(?:ing)? tips|grow(?:er)?(?:'s)? guide)(?:[^.]*?:|\n+)([^#]+?)(?:(?:##|\n\n)|$)/i;
  const growSection = content.match(growSectionPattern);
  
  let growText = growSection ? growSection[1] : content;
  
  // Extract difficulty level with expanded patterns
  extractGrowDifficulty(growText, strainData);
  
  // Extract flowering time with enhanced patterns
  extractFloweringTime(growText, strainData);
  
  // Extract yield information
  extractYield(growText, strainData);
  
  // Extract height information
  extractHeight(growText, strainData);
  
  // If we didn't find information in a dedicated section, try strain type inference
  if (!strainData["grow_info.difficulty"] || !strainData["grow_info.flowering_weeks"]) {
    inferGrowInfoFromStrainType(content, strainData);
  }
}

// Function to extract growing difficulty
function extractGrowDifficulty(content: string, strainData: StrainData): void {
  // Extensive patterns for difficulty
  const difficultyPatterns = [
    // Direct mention patterns
    /(?:grow(?:ing)? difficulty|difficulty (?:to|of) grow(?:ing)?|cultivation difficulty|difficulty level)(?:\s+is|\s*:)?\s+(easy|moderate|medium|difficult|hard|beginner|intermediate|advanced)/i,
    
    // Descriptive patterns
    /(?:easy|beginner[\s-]friendly|simple|straightforward) to grow/i,
    /(?:moderate|medium|intermediate) difficulty to grow/i,
    /(?:difficult|hard|challenging|advanced|expert) to grow/i,
    
    // Grower level patterns
    /(?:ideal|perfect|good|recommended) for (?:beginner|novice|new|first[\s-]time) growers/i,
    /(?:recommended|suitable|better) for (?:intermediate|experienced|seasoned) growers/i,
    /(?:best|only) for (?:advanced|expert|professional|master) growers/i,
    
    // Descriptive phrases
    /(?:doesn't|does not) require (?:much|extensive|special) (?:care|expertise|knowledge|attention)/i,
    /requires (?:moderate|some) (?:care|expertise|knowledge|attention)/i,
    /requires (?:significant|considerable|extensive|special) (?:care|expertise|knowledge|attention)/i,
    
    // Resistance patterns
    /(?:high|good|excellent) resistance to (?:pests|disease|mold|mildew)/i,
    /(?:prone|susceptible|vulnerable) to (?:pests|disease|mold|mildew)/i
  ];
  
  // Initialize difficulty matching
  let difficultyLevel = null;
  
  // Check direct difficulty statements first
  const directMatch = content.match(/(?:grow(?:ing)? difficulty|difficulty (?:to|of) grow(?:ing)?|cultivation difficulty|difficulty level)(?:\s+is|\s*:)?\s+(easy|moderate|medium|difficult|hard|beginner|intermediate|advanced)/i);
  
  if (directMatch) {
    const difficulty = directMatch[1].toLowerCase();
    if (difficulty === 'easy' || difficulty === 'beginner') {
      difficultyLevel = 'Easy';
    } else if (difficulty === 'moderate' || difficulty === 'medium' || difficulty === 'intermediate') {
      difficultyLevel = 'Moderate';
    } else {
      difficultyLevel = 'Difficult';
    }
  } else {
    // Try all patterns and score the difficulty
    let easyScore = 0;
    let moderateScore = 0;
    let difficultScore = 0;
    
    // Check easy patterns
    if (content.match(/(?:easy|beginner[\s-]friendly|simple|straightforward) to grow/i)) easyScore += 2;
    if (content.match(/(?:ideal|perfect|good|recommended) for (?:beginner|novice|new|first[\s-]time) growers/i)) easyScore += 2;
    if (content.match(/(?:doesn't|does not) require (?:much|extensive|special) (?:care|expertise|knowledge|attention)/i)) easyScore += 1;
    if (content.match(/(?:high|good|excellent) resistance to (?:pests|disease|mold|mildew)/i)) easyScore += 1;
    
    // Check moderate patterns
    if (content.match(/(?:moderate|medium|intermediate) difficulty to grow/i)) moderateScore += 2;
    if (content.match(/(?:recommended|suitable|better) for (?:intermediate|experienced|seasoned) growers/i)) moderateScore += 2;
    if (content.match(/requires (?:moderate|some) (?:care|expertise|knowledge|attention)/i)) moderateScore += 1;
    
    // Check difficult patterns
    if (content.match(/(?:difficult|hard|challenging|advanced|expert) to grow/i)) difficultScore += 2;
    if (content.match(/(?:best|only) for (?:advanced|expert|professional|master) growers/i)) difficultScore += 2;
    if (content.match(/requires (?:significant|considerable|extensive|special) (?:care|expertise|knowledge|attention)/i)) difficultScore += 1;
    if (content.match(/(?:prone|susceptible|vulnerable) to (?:pests|disease|mold|mildew)/i)) difficultScore += 1;
    
    // Determine difficulty based on highest score
    if (easyScore > moderateScore && easyScore > difficultScore) {
      difficultyLevel = 'Easy';
    } else if (difficultScore > easyScore && difficultScore > moderateScore) {
      difficultyLevel = 'Difficult';
    } else if (moderateScore > 0) {
      difficultyLevel = 'Moderate';
    }
  }
  
  if (difficultyLevel) {
    strainData["grow_info.difficulty"] = difficultyLevel;
  }
}

// Function to extract flowering time
function extractFloweringTime(content: string, strainData: StrainData): void {
  // Comprehensive patterns for flowering time
  const floweringPatterns = [
    // Direct statements with weeks
    /(?:flowering|flower) (?:time|period|duration|cycle)(?:\s+is|\s+of|\s*:)?\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:week|wk)s?/i,
    /(?:flowering|flower) takes (?:around|about|approximately|roughly)?\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:week|wk)s?/i,
    /(?:flowers|flowering) in (?:around|about|approximately|roughly)?\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:week|wk)s?/i,
    
    // Weekly ranges
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:week|wk)s? (?:flowering|flower) (?:time|period|duration|cycle)/i,
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:week|wk)s? to flower/i,
    
    // Mentions of flowering with days
    /(?:flowering|flower) (?:time|period|duration|cycle)(?:\s+is|\s+of|\s*:)?\s+(\d+)(?:\s*-\s*(\d+))?\s*days?/i,
    /(?:flowers|flowering) in (?:around|about|approximately|roughly)?\s+(\d+)(?:\s*-\s*(\d+))?\s*days?/i,
    
    // Monthly patterns
    /(?:flowering|flower) (?:time|period|duration|cycle)(?:\s+is|\s+of|\s*:)?\s+(\d+)(?:\s*-\s*(\d+))?\s*months?/i
  ];
  
  // Try all patterns to find flowering time
  for (const pattern of floweringPatterns) {
    const match = content.match(pattern);
    if (match) {
      // If there's a range, take the average
      if (match[2]) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        // For weeks, use the average
        if (pattern.toString().includes('week|wk')) {
          strainData["grow_info.flowering_weeks"] = Math.round((min + max) / 2);
          return;
        }
        // For days, convert to weeks
        else if (pattern.toString().includes('days?')) {
          const avgDays = (min + max) / 2;
          strainData["grow_info.flowering_weeks"] = Math.round(avgDays / 7);
          return;
        }
        // For months, convert to weeks
        else if (pattern.toString().includes('months?')) {
          const avgMonths = (min + max) / 2;
          strainData["grow_info.flowering_weeks"] = Math.round(avgMonths * 4.3);
          return;
        }
      } else {
        // Single value
        const value = parseInt(match[1]);
        // For weeks, use directly
        if (pattern.toString().includes('week|wk')) {
          strainData["grow_info.flowering_weeks"] = value;
          return;
        }
        // For days, convert to weeks
        else if (pattern.toString().includes('days?')) {
          strainData["grow_info.flowering_weeks"] = Math.round(value / 7);
          return;
        }
        // For months, convert to weeks
        else if (pattern.toString().includes('months?')) {
          strainData["grow_info.flowering_weeks"] = Math.round(value * 4.3);
          return;
        }
      }
    }
  }
  
  // If we still don't have a flowering time, look for specific phrases
  if (!strainData["grow_info.flowering_weeks"]) {
    // Check for "quick", "fast", "short", etc.
    if (content.match(/(?:quick|fast|rapid|short)\s+flower(?:ing)?/i) || 
        content.match(/flowers? (?:quickly|rapidly|fast)/i)) {
      strainData["grow_info.flowering_weeks"] = 7; // Assume 7 weeks for fast-flowering strains
    }
    // Check for "long", "extended", etc.
    else if (content.match(/(?:long|extended|lengthy)\s+flower(?:ing)?/i) || 
             content.match(/flowers? (?:slowly|late)/i)) {
      strainData["grow_info.flowering_weeks"] = 10; // Assume 10 weeks for slow-flowering strains
    }
  }
}

// Function to extract yield information
function extractYield(content: string, strainData: StrainData): void {
  // Comprehensive patterns for yield
  const yieldPatterns = [
    // Direct statements
    /(?:yield|harvest|production)(?:\s+is|\s*:)?\s+(low|small|minimal|average|medium|moderate|high|large|heavy|abundant|massive)/i,
    /(?:produces|produces a|gives|offers|provides) (?:a )?(low|small|minimal|average|medium|moderate|high|large|heavy|abundant|massive) (?:yield|harvest|production)/i,
    
    // Descriptive statements
    /(?:low|small|minimal|poor|modest)-(?:yield|yielding|producing)/i,
    /(?:average|medium|moderate)-(?:yield|yielding|producing)/i,
    /(?:high|large|heavy|abundant|massive|excellent|exceptional)-(?:yield|yielding|producing)/i,
    
    // Quantified statements (grams per plant/m²)
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:g|grams)\/(?:plant|m2|m²|sqm|square meter)/i
  ];
  
  // Try to find direct yield statements
  for (const pattern of yieldPatterns) {
    const match = content.match(pattern);
    if (match) {
      // For quantified yield
      if (pattern.toString().includes('g|grams')) {
        const yield_min = match[1] ? parseInt(match[1]) : 0;
        const yield_max = match[2] ? parseInt(match[2]) : yield_min;
        const yield_avg = (yield_min + yield_max) / 2;
        
        if (yield_avg < 300) {
          strainData["grow_info.yield"] = 'Low';
        } else if (yield_avg > 500) {
          strainData["grow_info.yield"] = 'High';
        } else {
          strainData["grow_info.yield"] = 'Medium';
        }
      } 
      // For descriptive yield
      else {
        const yield_desc = match[1] ? match[1].toLowerCase() : '';
        
        if (yield_desc.match(/low|small|minimal|poor|modest/i) || 
            pattern.toString().includes('low|small|minimal|poor|modest') && match[0]) {
          strainData["grow_info.yield"] = 'Low';
        } else if (yield_desc.match(/high|large|heavy|abundant|massive|excellent|exceptional/i) || 
                  pattern.toString().includes('high|large|heavy|abundant|massive|excellent|exceptional') && match[0]) {
          strainData["grow_info.yield"] = 'High';
        } else {
          strainData["grow_info.yield"] = 'Medium';
        }
      }
      
      return;
    }
  }
  
  // If no specific yield information found, set default based on strain type
  if (!strainData["grow_info.yield"] && strainData["strain_classification"]) {
    const classification = strainData["strain_classification"].toLowerCase();
    
    if (classification.includes('indica')) {
      strainData["grow_info.yield"] = 'Medium'; // Indicas typically have medium yields
    } else if (classification.includes('sativa')) {
      strainData["grow_info.yield"] = 'High'; // Sativas often have higher yields
    } else {
      strainData["grow_info.yield"] = 'Medium'; // Default for hybrids
    }
  } else if (!strainData["grow_info.yield"]) {
    // Default if no other information
    strainData["grow_info.yield"] = 'Medium';
  }
}

// Function to extract height information
function extractHeight(content: string, strainData: StrainData): void {
  // Comprehensive patterns for height
  const heightPatterns = [
    // Direct statements with measurements
    /(?:height|plant height|grows to|reaches|gets|grows)(?:\s+is|\s+of|\s*:|\s+about|\s+up to)?\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:cm|centimeters|centimetres|m|meters|metres)/i,
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:cm|centimeters|centimetres|m|meters|metres)(?:\s+tall|\s+in height|\s+high)/i,
    
    // Feet/inches
    /(?:height|plant height|grows to|reaches|gets|grows)(?:\s+is|\s+of|\s*:|\s+about|\s+up to)?\s+(\d+)(?:\s*-\s*(\d+))?\s*(?:ft|feet|foot)/i,
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:ft|feet|foot)(?:\s+tall|\s+in height|\s+high)/i,
    /(\d+)(?:\s*-\s*(\d+))?\s*(?:inches|inch|in)(?:\s+tall|\s+in height|\s+high)/i,
    
    // Descriptive height
    /(?:short|compact|small|dwarf|miniature|tiny)(?:\s+plant|\s+strain|\s+variety)?/i,
    /(?:medium|average|moderate)(?:\s+height|\s+size|\s+plant|\s+strain|\s+variety)?/i,
    /(?:tall|high|large|big|giant|towering)(?:\s+plant|\s+strain|\s+variety)?/i
  ];
  
  // Try to find height statements
  for (const pattern of heightPatterns) {
    const match = content.match(pattern);
    if (match) {
      // For direct measurements
      if (match[1]) {
        // For centimeters
        if (pattern.toString().includes('cm|centimeters|centimetres')) {
          const height_min = parseInt(match[1]);
          const height_max = match[2] ? parseInt(match[2]) : height_min;
          const height_avg = (height_min + height_max) / 2;
          
          if (height_avg < 100) {
            strainData["grow_info.height"] = 'Short (<100cm)';
          } else if (height_avg > 150) {
            strainData["grow_info.height"] = 'Tall (>150cm)';
          } else {
            strainData["grow_info.height"] = 'Medium (100-150cm)';
          }
        }
        // For meters
        else if (pattern.toString().includes('m|meters|metres')) {
          const height_min = parseFloat(match[1]) * 100; // Convert to cm
          const height_max = match[2] ? parseFloat(match[2]) * 100 : height_min;
          const height_avg = (height_min + height_max) / 2;
          
          if (height_avg < 100) {
            strainData["grow_info.height"] = 'Short (<100cm)';
          } else if (height_avg > 150) {
            strainData["grow_info.height"] = 'Tall (>150cm)';
          } else {
            strainData["grow_info.height"] = 'Medium (100-150cm)';
          }
        }
        // For feet
        else if (pattern.toString().includes('ft|feet|foot')) {
          const height_min = parseFloat(match[1]) * 30.48; // Convert to cm
          const height_max = match[2] ? parseFloat(match[2]) * 30.48 : height_min;
          const height_avg = (height_min + height_max) / 2;
          
          if (height_avg < 100) {
            strainData["grow_info.height"] = 'Short (<100cm)';
          } else if (height_avg > 150) {
            strainData["grow_info.height"] = 'Tall (>150cm)';
          } else {
            strainData["grow_info.height"] = 'Medium (100-150cm)';
          }
        }
        // For inches
        else if (pattern.toString().includes('inches|inch|in')) {
          const height_min = parseFloat(match[1]) * 2.54; // Convert to cm
          const height_max = match[2] ? parseFloat(match[2]) * 2.54 : height_min;
          const height_avg = (height_min + height_max) / 2;
          
          if (height_avg < 100) {
            strainData["grow_info.height"] = 'Short (<100cm)';
          } else if (height_avg > 150) {
            strainData["grow_info.height"] = 'Tall (>150cm)';
          } else {
            strainData["grow_info.height"] = 'Medium (100-150cm)';
          }
        }
      }
      // For descriptive height
      else {
        if (pattern.toString().includes('short|compact|small|dwarf|miniature|tiny') && match[0]) {
          strainData["grow_info.height"] = 'Short (<100cm)';
        } else if (pattern.toString().includes('tall|high|large|big|giant|towering') && match[0]) {
          strainData["grow_info.height"] = 'Tall (>150cm)';
        } else {
          strainData["grow_info.height"] = 'Medium (100-150cm)';
        }
      }
      
      return;
    }
  }
  
  // If no specific height information found, set default based on strain type
  if (!strainData["grow_info.height"] && strainData["strain_classification"]) {
    const classification = strainData["strain_classification"].toLowerCase();
    
    if (classification.includes('indica')) {
      strainData["grow_info.height"] = 'Short (<100cm)'; // Indicas typically shorter
    } else if (classification.includes('sativa')) {
      strainData["grow_info.height"] = 'Tall (>150cm)'; // Sativas typically taller
    } else {
      strainData["grow_info.height"] = 'Medium (100-150cm)'; // Default for hybrids
    }
  } else if (!strainData["grow_info.height"]) {
    // Default if no other information
    strainData["grow_info.height"] = 'Medium (100-150cm)';
  }
}

// Function to infer growing information from strain type
function inferGrowInfoFromStrainType(content: string, strainData: StrainData): void {
  // If strain classification is available, use it to make inferences
  if (strainData["strain_classification"]) {
    const classification = strainData["strain_classification"].toLowerCase();
    
    // Set difficulty if not already found
    if (!strainData["grow_info.difficulty"]) {
      if (classification.includes('indica')) {
        strainData["grow_info.difficulty"] = 'Easy'; // Indicas typically easier to grow
      } else if (classification.includes('sativa')) {
        strainData["grow_info.difficulty"] = 'Moderate'; // Sativas often more challenging
      } else {
        strainData["grow_info.difficulty"] = 'Moderate'; // Default for hybrids
      }
    }
    
    // Set flowering time if not already found
    if (!strainData["grow_info.flowering_weeks"]) {
      if (classification.includes('indica')) {
        strainData["grow_info.flowering_weeks"] = 8; // Indicas typically 7-9 weeks
      } else if (classification.includes('sativa')) {
        strainData["grow_info.flowering_weeks"] = 10; // Sativas typically 9-12 weeks
      } else {
        strainData["grow_info.flowering_weeks"] = 9; // Default for hybrids
      }
    }
  } 
  // If no classification, try to infer from content
  else {
    if (content.match(/indica/i) && !content.match(/sativa/i)) {
      // Set defaults for indica
      if (!strainData["grow_info.difficulty"]) strainData["grow_info.difficulty"] = 'Easy';
      if (!strainData["grow_info.flowering_weeks"]) strainData["grow_info.flowering_weeks"] = 8;
    } else if (content.match(/sativa/i) && !content.match(/indica/i)) {
      // Set defaults for sativa
      if (!strainData["grow_info.difficulty"]) strainData["grow_info.difficulty"] = 'Moderate';
      if (!strainData["grow_info.flowering_weeks"]) strainData["grow_info.flowering_weeks"] = 10;
    } else {
      // Set defaults for (assumed) hybrid
      if (!strainData["grow_info.difficulty"]) strainData["grow_info.difficulty"] = 'Moderate';
      if (!strainData["grow_info.flowering_weeks"]) strainData["grow_info.flowering_weeks"] = 9;
    }
  }
}

// Helper function to extract awards and accolades
export function extractAwards(content: string, strainData: StrainData): void {
  // Look for a dedicated awards section
  const awardSectionPattern = /(?:awards|accolades|achievements|recognitions|prizes|honors)(?:[^.]*?:|\n+)([^#]+?)(?:(?:##|\n\n)|$)/i;
  const awardSection = content.match(awardSectionPattern);
  
  // Use section text if found, otherwise use full content
  const textToSearch = awardSection ? awardSection[1] : content;
  
  // Common cannabis award competitions
  const competitions = [
    "Cannabis Cup", "High Times", "Emerald Cup", "Spannabis", "Lift & Co", 
    "Dope Cup", "THC Championship", "710 Cup", "Jack Herer Cup", "Karma Cup",
    "Expo Weed", "Indica Sativa Awards", "Budtender Awards", "Cannabis Awards",
    "Highlife Cup", "IC420 Growers Cup", "Seattle Cup", "Amsterdam Cup", "Kush Cup",
    "Elite Cup", "Cultivation Classic", "Secret Cup", "Jamaica Cup"
  ];
  
  // Award years to look for (recent decades)
  const years = Array.from({length: 2025-1990}, (_, i) => (1990 + i).toString());
  
  // Build patterns for recognizing awards
  const awardPatterns = [
    // Generic award patterns
    /\b(?:won|awarded|won a|earned|received|garnered|took home|earned a|received a|took|captured|claimed|awarded with)\s+[^.]+?(?:(?:1st|2nd|3rd|first|second|third|top)\s+[^.]+?)?(?:award|prize|cup|medal|trophy|honors|honour|title|recognition)/i,
    
    // Achievement patterns
    /\b(?:recognized|acclaimed|celebrated|honored|renowned|best|favored|voted|praised)\s+(?:as|for|with)\s+[^.]+?(?:award|prize|cup|recognition|achievement)/i,
    
    // Specific placement patterns
    /\b(?:placed|earned|took|won|secured|achieved|garnered)\s+(?:(?:1st|2nd|3rd|first|second|third)\s+[^.]+?\s+)?(?:place|position|prize|ranking|standing|spot)/i,
    
    // Best strain patterns
    /\b(?:named|voted|judged|selected|picked|chosen|awarded|recognized|ranked)\s+(?:as|the)?\s+(?:the\s+)?"?(?:best|top|finest|most\s+outstanding|most\s+potent|highest\s+quality|highest\s+thc|favorite)[^"\.]+?(?:strain|variety|indica|sativa|hybrid|cannabis)/i,
    
    // Competition finalist/winner patterns
    /\b(?:winner|finalist|champion|recipient|awardee|honoree)\s+[^.]+?(?:competition|contest|cup|championship|awards show)/i
  ];
  
  // Extract awards
  let awards: string[] = [];
  
  // Check for specific competition mentions (These are more reliable)
  for (const competition of competitions) {
    // Create competition-specific patterns
    const competitionPatterns = [
      // Winner patterns
      new RegExp(`(?:won|winner of|awarded|placed|earned|received)\\s+[^.]+?${competition}`, 'i'),
      new RegExp(`${competition}\\s+[^.]+?(?:winner|champion|gold|first|1st|top)`, 'i'),
      // Placement patterns
      new RegExp(`(?:1st|2nd|3rd|first|second|third)\\s+(?:place|position|prize)\\s+[^.]+?${competition}`, 'i'),
      new RegExp(`${competition}\\s+[^.]+?(?:1st|2nd|3rd|first|second|third)\\s+(?:place|position|prize)`, 'i')
    ];
    
    for (const pattern of competitionPatterns) {
      const matches = textToSearch.match(pattern);
      if (matches) {
        // Extract and clean the award text
        for (const match of [matches[0]]) {
          // Find a year if available
          let year = "";
          for (const yearStr of years) {
            if (match.includes(yearStr)) {
              year = yearStr;
              break;
            }
          }
          
          // Create a standardized award text
          let award = cleanAwardText(match);
          
          // Add year if found
          if (year && !award.includes(year)) {
            award = `${award} (${year})`;
          }
          
          awards.push(award);
        }
      }
    }
  }
  
  // If no competition-specific awards found, try generic award patterns
  if (awards.length === 0) {
    for (const pattern of awardPatterns) {
      const matches = textToSearch.match(pattern);
      if (matches) {
        // Extract and clean the award text
        for (const match of [matches[0]]) {
          // Find a year if available
          let year = "";
          for (const yearStr of years) {
            if (match.includes(yearStr)) {
              year = yearStr;
              break;
            }
          }
          
          // Create a standardized award text
          let award = cleanAwardText(match);
          
          // Add year if found
          if (year && !award.includes(year)) {
            award = `${award} (${year})`;
          }
          
          awards.push(award);
        }
      }
    }
  }
  
  // Also look for specific mentions of awards in bullet points or lists
  const bulletPointAwards = textToSearch.match(/[•\-*]\s*([^•\-*\n]+award[^•\-*\n]+)/gi);
  if (bulletPointAwards) {
    for (const award of bulletPointAwards) {
      awards.push(cleanAwardText(award.replace(/^[•\-*]\s*/, '')));
    }
  }
  
  // Set the awards field if we found any
  if (awards.length > 0) {
    // Remove duplicates and limit to a reasonable number
    const uniqueAwards = [...new Set(awards)].slice(0, 5);
    strainData.awards = uniqueAwards.join('; ');
  }
}

// Helper function to clean award text
function cleanAwardText(text: string): string {
  let award = text.trim();
  
  // Remove pronouns and strain references
  award = award.replace(/\b(it|this strain|this variety|the strain|strain)\b/gi, '');
  
  // Fix capitalization
  award = award.charAt(0).toUpperCase() + award.slice(1);
  
  // Remove excess whitespace
  award = award.replace(/\s+/g, ' ').trim();
  
  // Remove any trailing punctuation
  award = award.replace(/[.,;:!?]+$/, '');
  
  return award;
}

// Helper function to extract strain description
export function extractDescription(content: string, strainData: StrainData): void {
  // Look for description paragraphs
  // Try to find a self-contained paragraph that describes the strain
  const descriptionPatterns = [
    // Opening sentence patterns that likely introduce a strain
    /(?:[A-Z][^.!?]*?(?:strain|variety)[^.!?]*?\.)[^.!?]*?(?:[A-Z][^.!?]*?\.)/,
    // Look for sentences that contain the strain name and key descriptors
    new RegExp(`(?:[A-Z][^.!?]*?${strainData["Strain Name"]}[^.!?]*?\.)[^.!?]*?(?:[A-Z][^.!?]*?\\.)`),
    // Fallback to paragraphs mentioning "effects", "flavor", or "aroma"
    /(?:[A-Z][^.!?]*?(?:effects|flavor|aroma|terpenes|potency)[^.!?]*?\.)[^.!?]*?(?:[A-Z][^.!?]*?\.)/,
    // Sentences containing THC percentages
    /(?:[A-Z][^.!?]*?(?:THC|potency)[^.!?]*?\.)[^.!?]*?(?:[A-Z][^.!?]*?\.)/, 
    // Sentences mentioning dominant effects like "relaxing", "euphoric", etc.
    /(?:[A-Z][^.!?]*?(?:relaxing|euphoric|creative|energetic|calming)[^.!?]*?\.)[^.!?]*?(?:[A-Z][^.!?]*?\.)/
  ];
  
  for (const pattern of descriptionPatterns) {
    const match = content.match(pattern);
    if (match) {
      let description = cleanDescription(match[0]);
      
      // Set the description if it's reasonably long (avoid incomplete descriptions)
      if (description.length >= 40) {
        strainData.description = description;
        return;
      }
    }
  }
  
  // If we haven't found a good description yet, try to extract the first substantial paragraph
  const paragraphs = content.split(/\n\n+/);
  for (const paragraph of paragraphs) {
    // Skip very short paragraphs, navigation elements, etc.
    if (paragraph.length < 40 || paragraph.includes('http') || paragraph.includes('[') || paragraph.includes('<a')) {
      continue;
    }
    
    // Skip paragraphs that look like metadata or navigation
    if (paragraph.match(/^\s*(?:home|menu|strains|products|shop|login|sign up|search)\s*$/i)) {
      continue;
    }
    
    // Clean up the paragraph
    let description = cleanDescription(paragraph);
    
    // If it's long enough and seems like actual content, use it
    if (description.length >= 50 && description.match(/[A-Z]/)) {
      strainData.description = description;
      // Limit to a reasonable length
      if (strainData.description.length > 300) {
        strainData.description = strainData.description.substring(0, 297) + '...';
      }
      return;
    }
  }
  
  // If we still don't have a description, look for specific description sections
  const descriptionSectionMatch = content.match(/(?:About|Description|Overview)[^:]*:?\s*([^#]+?)(?:(?:##|\n\n))/i);
  if (descriptionSectionMatch && descriptionSectionMatch[1]) {
    let description = cleanDescription(descriptionSectionMatch[1]);
    
    if (description.length >= 40) {
      strainData.description = description;
      // Limit to a reasonable length
      if (strainData.description.length > 300) {
        strainData.description = strainData.description.substring(0, 297) + '...';
      }
    }
  }
}

// Helper function to clean description text
function cleanDescription(text: string): string {
  let description = text.trim();
  
  // Remove markdown links completely (not just the brackets)
  description = description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove incomplete links or URLs
  description = description.replace(/\(https?:\/\/[^)]*$/g, '');
  description = description.replace(/https?:\/\/\S+/g, '');
  
  // Remove any remaining markdown artifacts
  description = description.replace(/\[[^\]]+\]/g, '');
  
  // Remove HTML tags
  description = description.replace(/<[^>]+>/g, '');
  
  // Fix common formatting issues
  description = description.replace(/&amp;/g, '&');
  description = description.replace(/&quot;/g, '"');
  description = description.replace(/&apos;/g, "'");
  description = description.replace(/&lt;/g, '<');
  description = description.replace(/&gt;/g, '>');
  
  // Normalize whitespace 
  description = description.replace(/\s+/g, ' ').trim();
  
  // Make sure it doesn't start with a bullet point or other odd character
  description = description.replace(/^[-•*>]\s*/, '');
  
  // Ensure the description doesn't end mid-sentence
  const lastPeriodIndex = description.lastIndexOf('.');
  if (lastPeriodIndex > 0 && lastPeriodIndex < description.length - 1) {
    description = description.substring(0, lastPeriodIndex + 1);
  }
  
  return description;
}

// Helper function to extract and process strain data
export function extractAndProcessStrainData(strainName: string, pageData: any, results: StrainData[]): void {
  // Create strain data object with proper structure
  const strainData: StrainData = {
    "Strain Name": strainName
    // Initialize all other columns as empty or default values
  };
  
  const content = pageData.markdown || pageData.html || '';
  if (!content) return;
  
  // Extract basic information
  extractAliases(content, strainData);
  extractClassification(content, strainData);
  extractRatings(content, strainData);
  extractLineage(content, strainData);
  extractGrowInfo(content, strainData);
  extractAwards(content, strainData);
  extractDescription(content, strainData);
  
  // Extract effects and composition data
  extractCannabinoids(content, strainData);
  extractTerpenes(content, strainData);
  extractEffects(content, strainData);
  extractFlavors(content, strainData);
  
  // Apply normalization rules from methodology
  normalizeStrainData(strainData);
  
  // Add to results
  results.push(strainData);
}

// Helper function to convert data to CSV
export function convertToCSV(data: StrainData[]): string {
  // Define all columns in desired order
  const columns = [
    // Basic strain info
    "Strain Name",
    "aliases",
    "strain_classification",
    "lineage.parents",
    "rating.average",
    "rating.count",
    
    // Cannabinoids 
    "THC %",
    "CBD %",
    "CBG %",
    
    // Terpenes (in order of common prevalence)
    "Caryophyllene",
    "Limonene",
    "Myrcene",
    "Pinene",
    "Humulene",
    "Terpinolene",
    "Ocimene",
    "Linalool",
    "Terpineol",
    "Valencene",
    
    // Medical & User effects
    "Medical",
    "Effects",
    
    // Flavors
    "Flavors",
    
    // Grow information
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
      // Get the value or empty string if undefined
      const value = strain[column] !== undefined ? strain[column] : '';
      
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

// Main function to scrape Leafly strains
export async function scrapeLeaflyStrains(client: FirecrawlApp, strains: string[], exportFormat: string = 'csv'): Promise<any> {
  const results: StrainData[] = [];
  const queue = new PQueue({ concurrency: 3 }); // Respect site rate limits
  
  try {
    // Process each strain
    await Promise.all(strains.map(strain => queue.add(async () => {
      // 1. Format strain name for URL
      const formattedName = formatStrainForUrl(strain);
      const leaflyUrl = `https://www.leafly.com/strains/${formattedName}`;
      
      // 2. Scrape the strain page
      const pageData = await client.scrapeUrl(leaflyUrl, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 2000 // Wait for dynamic content to load
      });
      
      if (!pageData.success) {
        // Try alternative URL formats or search
        const searchResults = await client.search(`${strain} strain site:leafly.com/strains`);
        if (!searchResults.success || searchResults.data.length === 0) {
          // Log failure and continue to next strain
          console.log(`Could not find ${strain} on Leafly.com`);
          return;
        }
        // Use first search result
        const alternativeUrl = searchResults.data[0].url;
        if (!alternativeUrl) {
          console.log(`No valid URL found for ${strain} in search results`);
          return;
        }
        
        const retryPageData = await client.scrapeUrl(alternativeUrl, {
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          waitFor: 2000
        });
        
        if (!retryPageData.success) return; // Skip this strain if still failing
        
        // Use the retry data
        extractAndProcessStrainData(strain, retryPageData, results);
      } else {
        // Process successful initial scrape
        extractAndProcessStrainData(strain, pageData, results);
      }
    })));
    
    // Return results in requested format
    if (exportFormat === 'csv') {
      return {
        success: true,
        data: convertToCSV(results)
      };
    } else {
      return {
        success: true,
        data: results
      };
    }
  } catch (error) {
    console.error('Error scraping strains:', error);
    return {
      success: false,
      error: `Error scraping strains: ${error}`
    };
  }
}
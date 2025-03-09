import FirecrawlApp from '@mendable/firecrawl-js';

async function testWithUrl(apiUrl) {
  try {
    console.log(`\nTesting with API URL: ${apiUrl || 'default'}`);
    
    const client = new FirecrawlApp({
      apiKey: "fc-c6727b10239646c8b67dcdf97c1a4321",
      ...(apiUrl ? { apiUrl } : {}) // Only include apiUrl if provided
    });

    const result = await client.scrapeUrl("https://example.com", {
      formats: ["markdown"]
    });
    
    console.log("SUCCESS! Response:", JSON.stringify(result, null, 2).substring(0, 200) + "...");
    return true;
  } catch (error) {
    console.error("Error:", error.message);
    if (error.statusCode) console.error("Status code:", error.statusCode);
    return false;
  }
}

async function runTests() {
  // Try with different URL variations
  const urls = [
    null, // Default (no URL specified)
    "https://api.firecrawl.dev/v1",
    "https://api.firecrawl.dev",
    "https://firecrawl.dev/api"
  ];
  
  for (const url of urls) {
    const success = await testWithUrl(url);
    if (success) {
      console.log(`\n✅ SUCCESS with URL: ${url || 'default'}`);
      break;
    }
  }
}

runTests();
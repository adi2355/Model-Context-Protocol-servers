import { FastMCP } from "@modelcontextprotocol/sdk/fastmcp";
import fetch from 'node-fetch';
import JSONPath from 'jsonpath';
import fs from 'fs';
import path from 'path';

// Initialize FastMCP
const mcp = FastMCP("json");

// Helper function to fetch data
async function fetchData(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

mcp.resource({
    uri: "cache/status",
    handler: async () => {
        return {
            size: queryCache.size,
            maxSize: MAX_CACHE_SIZE,
            ttlMinutes: CACHE_TTL / (60 * 1000),
            entries: Array.from(queryCache.keys()).map(key => ({
                key,
                age: Math.round((Date.now() - queryCache.get(key).timestamp) / 1000) + " seconds"
            }))
        };
    }
});

mcp.resource({
    uri: "cache/clear",
    handler: async () => {
        const previousSize = queryCache.size;
        queryCache.clear();
        return {
            status: "success",
            clearedEntries: previousSize,
            currentSize: queryCache.size
        };
    }
});

// Process command line arguments
const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : null;

// Start the server
if (port) {
    console.error(`JSON MCP Server starting on HTTP port ${port}`);
    mcp.run({ transport: "http", port });
} else {
    console.error("JSON MCP Server running on stdio");
    mcp.run({ transport: "stdio" });
}

// Handle process events
process.on('SIGINT', () => {
    console.error("Shutting down JSON MCP Server...");
    mcp.close();
    process.exit(0);
});
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Error fetching data: ${error.message}`);
    }
}

// Handle array operations
function handleArrayOperations(data, expression) {
    let result = [...data];
    // Handle sorting
    const sortMatch = expression.match(/\.sort\(([-]?\w+)\)/);
    if (sortMatch) {
        const field = sortMatch[1];
        const isDesc = field.startsWith('-');
        const sortField = isDesc ? field.slice(1) : field;
        result.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            return isDesc ?
                (bVal > aVal ? 1 : -1) :
                (aVal > bVal ? 1 : -1);
        });
        return result;
    }
    // Handle distinct
    if (expression.includes('.distinct()')) {
        return Array.from(new Set(result));
    }
    // Handle reverse and slice operations
    if (expression.includes("-1")) {
        result = result.reverse();
    }
    const sliceMatch = expression.match(/\[(\d+):(\d+)\]/);
    if (sliceMatch) {
        const start = parseInt(sliceMatch[1]);
        const end = parseInt(sliceMatch[2]);
        result = result.slice(start, end);
    }
    return result;
}

// Handle aggregation operations
function handleAggregation(data, operation) {
    if (!Array.isArray(data) || data.length === 0)
        return 0;
    const sumMatch = operation.match(/\.sum\((\w+)\)/);
    if (sumMatch) {
        const field = sumMatch[1];
        return data.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
    }
    const avgMatch = operation.match(/\.avg\((\w+)\)/);
    if (avgMatch) {
        const field = avgMatch[1];
        const sum = data.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
        return sum / data.length;
    }
    const minMatch = operation.match(/\.min\((\w+)\)/);
    if (minMatch) {
        const field = minMatch[1];
        return Math.min(...data.map(item => Number(item[field]) || 0));
    }
    const maxMatch = operation.match(/\.max\((\w+)\)/);
    if (maxMatch) {
        const field = maxMatch[1];
        return Math.max(...data.map(item => Number(item[field]) || 0));
    }
    return 0;
}

// Handle array length calculation
function getArrayLength(data) {
    if (Array.isArray(data)) {
        return data.length;
    }
    if (typeof data === 'object' && data !== null) {
        return Object.keys(data).length;
    }
    return 0;
}

// Handle string operations
function handleStringOperations(value, operation) {
    // String case operations
    if (operation === '.toLowerCase()')
        return value.toLowerCase();
    if (operation === '.toUpperCase()')
        return value.toUpperCase();
    // String test operations
    const startsWithMatch = operation.match(/\.startsWith\(['"](.+)['"]\)/);
    if (startsWithMatch)
        return value.startsWith(startsWithMatch[1]);
    const endsWithMatch = operation.match(/\.endsWith\(['"](.+)['"]\)/);
    if (endsWithMatch)
        return value.endsWith(endsWithMatch[1]);
    const containsMatch = operation.match(/\.contains\(['"](.+)['"]\)/);
    if (containsMatch)
        return value.includes(containsMatch[1]);
    const matchesMatch = operation.match(/\.matches\(['"](.+)['"]\)/);
    if (matchesMatch)
        return new RegExp(matchesMatch[1]).test(value);
    return value;
}

// Handle array transformations
function handleArrayTransformations(data, expression) {
    // Map operation
    const mapMatch = expression.match(/\.map\((\w+)\)/);
    if (mapMatch) {
        const field = mapMatch[1];
        return data.map(item => item[field]);
    }
    // Flatten operation
    if (expression === '.flatten()') {
        return data.flat();
    }
    // Union operation
    const unionMatch = expression.match(/\.union\((\[.*?\])\)/);
    if (unionMatch) {
        const otherArray = JSON.parse(unionMatch[1]);
        return Array.from(new Set([...data, ...otherArray]));
    }
    // Intersection operation
    const intersectionMatch = expression.match(/\.intersection\((\[.*?\])\)/);
    if (intersectionMatch) {
        const otherArray = JSON.parse(intersectionMatch[1]);
        return data.filter(item => otherArray.includes(item));
    }
    return data;
}

// Handle grouping operations
function handleGrouping(data, expression) {
    // Group by field
    const groupMatch = expression.match(/\.groupBy\((\w+)\)/);
    if (!groupMatch)
        return {};
    const field = groupMatch[1];
    const groups = data.reduce((acc, item) => {
        const key = item[field]?.toString() || 'null';
        if (!acc[key])
            acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
    // Handle aggregation after grouping
    const aggMatch = expression.match(/\.(\w+)\((\w+)\)$/);
    if (!aggMatch)
        return groups;
    const [_, aggFunc, aggField] = aggMatch;
    const result = {};
    for (const [key, group] of Object.entries(groups)) {
        switch (aggFunc) {
            case 'count':
                result[key] = group.length;
                break;
            case 'sum':
                result[key] = group.reduce((sum, item) => sum + (Number(item[aggField]) || 0), 0);
                break;
            case 'avg':
                const sum = group.reduce((acc, item) => acc + (Number(item[aggField]) || 0), 0);
                result[key] = sum / group.length;
                break;
            case 'max':
                result[key] = Math.max(...group.map(item => Number(item[aggField]) || 0));
                break;
            case 'min':
                result[key] = Math.min(...group.map(item => Number(item[aggField]) || 0));
                break;
        }
    }
    return result;
}

// Handle numeric operations
function handleNumericOperations(data, expression) {
    // Extract field name if it exists
    const fieldMatch = expression.match(/^(\w+)\.math/);
    const field = fieldMatch ? fieldMatch[1] : null;
    // Get numeric values to operate on
    const values = field
        ? data.map(item => Number(item[field]) || 0)
        : data.map(Number);
    const mathMatch = expression.match(/\.math\(([\+\-\*\/\d\s]+)\)/);
    if (mathMatch) {
        const expr = mathMatch[1].trim();
        return values.map(num => {
            try {
                // Safe eval for basic math operations
                return Function(`'use strict'; return ${num}${expr}`)();
            }
            catch {
                return 0;
            }
        });
    }
    // Rounding operations
    if (expression.endsWith('.round()')) {
        return values.map(num => Math.round(num));
    }
    if (expression.endsWith('.floor()')) {
        return values.map(num => Math.floor(num));
    }
    if (expression.endsWith('.ceil()')) {
        return values.map(num => Math.ceil(num));
    }
    // Math functions
    if (expression.endsWith('.abs()')) {
        return values.map(num => Math.abs(num));
    }
    if (expression.endsWith('.sqrt()')) {
        return values.map(num => Math.sqrt(num));
    }
    if (expression.endsWith('.pow2()')) {
        return values.map(num => Math.pow(num, 2));
    }
    return values;
}

// Handle date operations
function handleDateOperations(data, expression) {
    // Date formatting
    const formatMatch = expression.match(/\.format\(['"](.+)['"]\)/);
    if (formatMatch) {
        const format = formatMatch[1];
        return data.map(date => {
            const d = new Date(date);
            return format
                .replace('YYYY', d.getFullYear().toString())
                .replace('MM', (d.getMonth() + 1).toString().padStart(2, '0'))
                .replace('DD', d.getDate().toString().padStart(2, '0'))
                .replace('HH', d.getHours().toString().padStart(2, '0'))
                .replace('mm', d.getMinutes().toString().padStart(2, '0'))
                .replace('ss', d.getSeconds().toString().padStart(2, '0'));
        });
    }
    // Date comparison
    if (expression === '.isToday()') {
        const today = new Date();
        return data.map(date => {
            const d = new Date(date);
            return d.getDate() === today.getDate() &&
                d.getMonth() === today.getMonth() &&
                d.getFullYear() === today.getFullYear();
        });
    }
    // Date calculations
    const addMatch = expression.match(/\.add\((\d+),\s*['"](\w+)['"]\)/);
    if (addMatch) {
        const [_, amount, unit] = addMatch;
        return data.map(date => {
            const d = new Date(date);
            switch (unit) {
                case 'days':
                    d.setDate(d.getDate() + Number(amount));
                    break;
                case 'months':
                    d.setMonth(d.getMonth() + Number(amount));
                    break;
                case 'years':
                    d.setFullYear(d.getFullYear() + Number(amount));
                    break;
            }
            return d.toISOString();
        });
    }
    return data;
}

// Handle complex filtering
function handleComplexFilter(data, condition) {
    // Handle string operations in filter
    if (condition.includes('.contains(')) {
        const match = condition.match(/@\.(\w+)\.contains\(['"](.+)['"]\)/);
        if (match) {
            const [_, field, searchStr] = match;
            return data.filter(item => String(item[field]).includes(searchStr));
        }
    }
    if (condition.includes('.startsWith(')) {
        const match = condition.match(/@\.(\w+)\.startsWith\(['"](.+)['"]\)/);
        if (match) {
            const [_, field, searchStr] = match;
            return data.filter(item => String(item[field]).startsWith(searchStr));
        }
    }
    if (condition.includes('.endsWith(')) {
        const match = condition.match(/@\.(\w+)\.endsWith\(['"](.+)['"]\)/);
        if (match) {
            const [_, field, searchStr] = match;
            return data.filter(item => String(item[field]).endsWith(searchStr));
        }
    }
    if (condition.includes('.matches(')) {
        const match = condition.match(/@\.(\w+)\.matches\(['"](.+)['"]\)/);
        if (match) {
            const [_, field, pattern] = match;
            const regex = new RegExp(pattern);
            return data.filter(item => regex.test(String(item[field])));
        }
    }
    // Handle comparison operations
    const compMatch = condition.match(/@\.(\w+)\s*([><=!]+)\s*(.+)/);
    if (compMatch) {
        const [_, field, op, value] = compMatch;
        const compareValue = value.startsWith('"') || value.startsWith("'")
            ? value.slice(1, -1)
            : Number(value);
        return data.filter(item => {
            const itemValue = item[field];
            switch (op) {
                case '>': return itemValue > compareValue;
                case '>=': return itemValue >= compareValue;
                case '<': return itemValue < compareValue;
                case '<=': return itemValue <= compareValue;
                case '==': return itemValue == compareValue;
                case '!=': return itemValue != compareValue;
                default: return false;
            }
        });
    }
    return data;
}

// Cache of recent query results
const queryCache = new Map();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Cache management functions
 */
function getCachedResult(cacheKey) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCachedResult(cacheKey, data) {
    // Manage cache size
    if (queryCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry
        const oldestKey = [...queryCache.entries()]
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        queryCache.delete(oldestKey);
    }
    
    queryCache.set(cacheKey, {
        data,
        timestamp: Date.now()
    });
}

// Tool definitions using the decorator pattern
mcp.tool({
    name: "query",
    handler: async (args) => {
        const { url, jsonPath } = args;
        const cacheKey = `query:${url}:${jsonPath}`;
        const cachedResult = getCachedResult(cacheKey);
        if (cachedResult) {
            return JSON.stringify(cachedResult, null, 2);
        }

        const jsonData = await fetchData(url);
        
        // Handle complex filtering with string operations
        const filterMatch = jsonPath.match(/\[\?\((.+?)\)\]/);
        if (filterMatch) {
            const condition = filterMatch[1];
            let baseData = Array.isArray(jsonData) ? jsonData : [jsonData];
            // Get the base path before the filter
            const basePath = jsonPath.split('[?')[0];
            if (basePath !== '$') {
                baseData = JSONPath.value(jsonData, basePath);
            }
            // Apply filter
            let result = handleComplexFilter(baseData, condition);
            // Handle operations after filter
            const afterFilter = jsonPath.split(')]')[1];
            if (afterFilter) {
                if (afterFilter.includes('.{')) {
                    // Handle projection
                    const projectionMatch = afterFilter.match(/\.\{(.+?)\}/);
                    if (projectionMatch) {
                        const fieldPairs = projectionMatch[1].split(',')
                            .map(pair => {
                            const [key, value] = pair.split(':').map(s => s.trim());
                            return { key, value: value || key };
                        }
                }, null, 2);
        } catch (error) {
            return `Error comparing JSON: ${error.message}`;
        }
    }
});
            }
            
            // Mixed types (one array, one object)
            return JSON.stringify({
                summary: {
                    typeMismatch: true,
                    firstType: isArray1 ? "array" : "object",
                    secondType: isArray2 ? "array" : "object"
                },
                details: {
                    first: data1,
                    second: data2
                }
            }, null, 2););
                        result = result.map((item) => {
                            const obj = {};
                            fieldPairs.forEach(({ key, value }) => {
                                obj[key] = item[value];
                            });
                            return obj;
                        });
                    }
                }
            }
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle numeric operations
        if (jsonPath.match(/\.(math|round|floor|ceil|abs|sqrt|pow2)/)) {
            let baseData;
            const basePath = jsonPath.split('.math')[0].split('.round')[0]
                .split('.floor')[0].split('.ceil')[0]
                .split('.abs')[0].split('.sqrt')[0].split('.pow2')[0];
            if (basePath === '$') {
                baseData = Array.isArray(jsonData) ? jsonData : [jsonData];
            }
            else {
                baseData = JSONPath.value(jsonData, basePath);
                if (!Array.isArray(baseData)) {
                    baseData = [baseData];
                }
            }
            const numericOp = jsonPath.slice(basePath.length);
            const result = handleNumericOperations(baseData, numericOp);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle date operations
        if (jsonPath.match(/\.(format|isToday|add)\(/)) {
            const baseData = Array.isArray(jsonData) ? jsonData : [jsonData];
            const dateOp = jsonPath.slice(jsonPath.indexOf('.'));
            const result = handleDateOperations(baseData, dateOp);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle string operations
        if (jsonPath.match(/\.(toLowerCase|toUpperCase|startsWith|endsWith|contains|matches)\(/)) {
            const baseData = JSONPath.value(jsonData, jsonPath.split('.')[0]);
            const stringOp = jsonPath.slice(jsonPath.indexOf('.') + 1);
            const result = handleStringOperations(baseData, stringOp);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle array transformations
        if (jsonPath.match(/\.(map|flatten|union|intersection)\(/)) {
            const baseData = Array.isArray(jsonData) ? jsonData : [jsonData];
            const transformOp = jsonPath.slice(jsonPath.indexOf('.'));
            const result = handleArrayTransformations(baseData, transformOp);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle grouping operations
        if (jsonPath.includes('.groupBy(')) {
            const baseData = Array.isArray(jsonData) ? jsonData : [jsonData];
            const result = handleGrouping(baseData, jsonPath);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle aggregation functions
        if (jsonPath.match(/\.(sum|avg|min|max)\(\w+\)/)) {
            const result = handleAggregation(Array.isArray(jsonData) ? jsonData : [jsonData], jsonPath);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle array operations (sort, distinct)
        if (jsonPath.includes('.sort(') || jsonPath.includes('.distinct()')) {
            let result = Array.isArray(jsonData) ? jsonData : [jsonData];
            const operations = jsonPath.split(/(?=\.(?:sort|distinct))/);
            for (const op of operations) {
                if (op.startsWith('.sort') || op.startsWith('.distinct')) {
                    result = handleArrayOperations(result, op);
                }
            }
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle length() function
        if (jsonPath === "$.length()") {
            const result = getArrayLength(jsonData);
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle complex array operations (reverse, slice)
        if (jsonPath.includes("-1") || jsonPath.includes(":")) {
            let result = Array.isArray(jsonData) ? jsonData : [jsonData];
            // Split multiple operations
            const operations = jsonPath.match(/\[.*?\]/g) || [];
            for (const op of operations) {
                result = handleArrayOperations(result, op);
            }
            // Handle field selection
            if (jsonPath.includes(".")) {
                const fieldMatch = jsonPath.match(/\.([^.\[]+)$/);
                if (fieldMatch) {
                    const field = fieldMatch[1];
                    result = result.map(item => item[field]);
                }
            }
            setCachedResult(cacheKey, result);
            return JSON.stringify(result, null, 2);
        }
        
        // Handle object projection
        if (jsonPath.includes(".{")) {
            const allData = Array.isArray(jsonData) ? jsonData : [jsonData];
            const projectionMatch = jsonPath.match(/\.\{(.+?)\}/);
            if (projectionMatch) {
                const fieldPairs = projectionMatch[1].split(',')
                    .map(pair => {
                    const [key, value] = pair.split(':').map(s => s.trim());
                    return { key, value: value || key };
                });
                const result = allData.map((item) => {
                    const obj = {};
                    fieldPairs.forEach(({ key, value }) => {
                        obj[key] = item[value];
                    });
                    return obj;
                });
                setCachedResult(cacheKey, result);
                return JSON.stringify(result, null, 2);
            }
        }
        
        // Default JSONPath evaluation
        const result = JSONPath.value(jsonData, jsonPath);
        setCachedResult(cacheKey, result);
        return JSON.stringify(result, null, 2);
    }
});

mcp.tool({
    name: "filter",
    handler: async (args) => {
        const { url, jsonPath, condition } = args;
        const cacheKey = `filter:${url}:${jsonPath}:${condition}`;
        const cachedResult = getCachedResult(cacheKey);
        if (cachedResult) {
            return JSON.stringify(cachedResult, null, 2);
        }

        const jsonData = await fetchData(url);
        
        // Get base data using jsonPath
        let baseData = JSONPath.value(jsonData, jsonPath);
        if (!Array.isArray(baseData)) {
            baseData = [baseData];
        }
        
        // Apply filter condition
        const result = baseData.filter((item) => {
            try {
                // Handle common comparison operators
                if (condition.includes(' > ')) {
                    const [field, value] = condition.split(' > ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    return Number(item[fieldName]) > Number(value);
                }
                if (condition.includes(' < ')) {
                    const [field, value] = condition.split(' < ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    return Number(item[fieldName]) < Number(value);
                }
                if (condition.includes(' >= ')) {
                    const [field, value] = condition.split(' >= ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    return Number(item[fieldName]) >= Number(value);
                }
                if (condition.includes(' <= ')) {
                    const [field, value] = condition.split(' <= ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    return Number(item[fieldName]) <= Number(value);
                }
                if (condition.includes(' == ')) {
                    const [field, value] = condition.split(' == ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    const compareValue = value.startsWith('"') || value.startsWith("'")
                        ? value.slice(1, -1)
                        : Number(value);
                    return item[fieldName] == compareValue;
                }
                if (condition.includes(' != ')) {
                    const [field, value] = condition.split(' != ').map(s => s.trim());
                    const fieldName = field.replace('@.', '');
                    const compareValue = value.startsWith('"') || value.startsWith("'")
                        ? value.slice(1, -1)
                        : Number(value);
                    return item[fieldName] != compareValue;
                }
                return false;
            }
            catch {
                return false;
            }
        });
        
        setCachedResult(cacheKey, result);
        return JSON.stringify(result, null, 2);
    }
});

// New feature: Save and manage query results
const SAVE_DIR = "./saved_queries";

// Ensure save directory exists
if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
}

mcp.tool({
    name: "save_query",
    handler: async (args) => {
        const { url, jsonPath, filename } = args;
        try {
            // Validate filename (security check)
            if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                return "Invalid filename. Please use alphanumeric characters only.";
            }
            
            // Add json extension if not present
            const safeFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
            
            // Get data using the query tool
            const queryTool = mcp.getTool("query");
            const result = await queryTool.handler({ url, jsonPath });
            const resultObj = JSON.parse(result);
            
            // Save to file
            const savePath = path.join(SAVE_DIR, safeFilename);
            fs.writeFileSync(savePath, JSON.stringify(resultObj, null, 2), 'utf8');
            
            return `Query result saved to ${safeFilename}`;
        } catch (error) {
            return `Error saving query: ${error.message}`;
        }
    }
});

mcp.resource({
    uri: "saved_queries/list",
    handler: async () => {
        try {
            const files = fs.readdirSync(SAVE_DIR);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const stats = fs.statSync(path.join(SAVE_DIR, file));
                    return {
                        filename: file,
                        created: stats.birthtime,
                        size: stats.size
                    };
                });
        } catch (error) {
            return { error: error.message };
        }
    }
});

mcp.resource({
    uri: "saved_queries/get/{filename}",
    handler: async (filename) => {
        try {
            // Validate filename (security check)
            if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                return { error: "Invalid filename" };
            }
            
            const filePath = path.join(SAVE_DIR, filename);
            if (!fs.existsSync(filePath)) {
                return { error: "File not found" };
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return { error: error.message };
        }
    }
});

mcp.tool({
    name: "compare_json",
    handler: async (args) => {
        const { url1, jsonPath1, url2, jsonPath2 } = args;
        try {
            // Fetch both datasets
            const queryTool = mcp.getTool("query");
            const result1 = await queryTool.handler({ url: url1, jsonPath: jsonPath1 });
            const result2 = await queryTool.handler({ url: url2, jsonPath: jsonPath2 });
            
            const data1 = JSON.parse(result1);
            const data2 = JSON.parse(result2);
            
            // Handle different comparison scenarios
            const isArray1 = Array.isArray(data1);
            const isArray2 = Array.isArray(data2);
            
            // Compare object structures
            if (!isArray1 && !isArray2) {
                // Both are objects
                const keys1 = Object.keys(data1);
                const keys2 = Object.keys(data2);
                
                // Find common, unique keys
                const commonKeys = keys1.filter(key => keys2.includes(key));
                const uniqueToFirst = keys1.filter(key => !keys2.includes(key));
                const uniqueToSecond = keys2.filter(key => !keys1.includes(key));
                
                // Find differences in common keys
                const differences = {};
                commonKeys.forEach(key => {
                    if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
                        differences[key] = {
                            first: data1[key],
                            second: data2[key]
                        };
                    }
                });
                
                return JSON.stringify({
                    summary: {
                        commonKeysCount: commonKeys.length,
                        uniqueToFirstCount: uniqueToFirst.length,
                        uniqueToSecondCount: uniqueToSecond.length,
                        differingValuesCount: Object.keys(differences).length
                    },
                    details: {
                        commonKeys,
                        uniqueToFirst,
                        uniqueToSecond,
                        differences
                    }
                }, null, 2);
            }
            
            // Compare arrays
            if (isArray1 && isArray2) {
                // Both are arrays
                // Find items that exist in both, only in first, only in second
                const stringified1 = data1.map(item => JSON.stringify(item));
                const stringified2 = data2.map(item => JSON.stringify(item));
                
                const onlyInFirst = data1.filter(item => 
                    !stringified2.includes(JSON.stringify(item)));
                const onlyInSecond = data2.filter(item => 
                    !stringified1.includes(JSON.stringify(item)));
                const inBoth = data1.filter(item => 
                    stringified2.includes(JSON.stringify(item)));
                
                return JSON.stringify({
                    summary: {
                        totalInFirst: data1.length,
                        totalInSecond: data2.length,
                        onlyInFirstCount: onlyInFirst.length,
                        onlyInSecondCount: onlyInSecond.length,
                        inBothCount: inBoth.length
                    },
                    details: {
                        onlyInFirst: onlyInFirst.slice(0, 10), // Limit to avoid huge outputs
                        onlyInSecond: onlyInSecond.slice(0, 10),
                        inBoth: inBoth.slice(0, 10)
                    }                                      
                }, null, 2);
            }
            
            // Mixed types (one array, one object)
            return JSON.stringify({
                summary: {
                    typeMismatch: true,
                    firstType: isArray1 ? "array" : "object",
                    secondType: isArray2 ? "array" : "object"
                },
                details: {
                    first: data1,
                    second: data2
                }
            }, null, 2);
        } catch (error) {
            return `Error comparing JSON: ${error.message}`;
        }
    }
});
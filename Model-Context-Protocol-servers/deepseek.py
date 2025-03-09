import { FastMCP } from "@modelcontextprotocol/sdk/fastmcp";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
    throw new Error("DEEPSEEK_API_KEY environment variable is required");
}

interface ChatCompletionArgs {
    prompt: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
}

function isValidChatCompletionArgs(args: unknown): args is ChatCompletionArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "prompt" in args &&
        typeof (args as ChatCompletionArgs).prompt === "string" &&
        ((args as ChatCompletionArgs).max_tokens === undefined || typeof (args as ChatCompletionArgs).max_tokens === "number") &&
        ((args as ChatCompletionArgs).temperature === undefined || typeof (args as ChatCompletionArgs).temperature === "number") &&
        ((args as ChatCompletionArgs).top_p === undefined || typeof (args as ChatCompletionArgs).top_p === "number") &&
        ((args as ChatCompletionArgs).stop_sequences === undefined || Array.isArray((args as ChatCompletionArgs).stop_sequences))
    );
}

// Initialize FastMCP with server name
const mcp = new FastMCP("deepseek_r1");

// Initialize OpenAI client for DeepSeek
const openai = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://api.deepseek.com"
});

// Define supported models and their capabilities
const SUPPORTED_MODELS = {
    "deepseek-reasoner": {
        name: "DeepSeek-Reasoner (R1)",
        context_length: 8192,
        capabilities: ["reasoning", "math", "code"],
        description: "Optimized for complex reasoning tasks"
    },
    "deepseek-chat": {
        name: "DeepSeek-Chat (V3)",
        context_length: 8192,
        capabilities: ["conversation", "general knowledge"],
        description: "General purpose chat model"
    },
    "deepseek-coder": {
        name: "DeepSeek-Coder",
        context_length: 16384,
        capabilities: ["code generation", "debugging", "explanation"],
        description: "Specialized for coding tasks"
    }
};

// Default model to use
const DEFAULT_MODEL = "deepseek-reasoner";

// Cache for recent responses (simple in-memory cache)
const responseCache = new Map();

// Set up resource for model information
mcp.resource({
    uri: "model/info",
    handler: async () => {
        return {
            supported_models: SUPPORTED_MODELS,
            default_model: DEFAULT_MODEL,
            provider: "DeepSeek"
        };
    }
});

// Set up resource for server status
mcp.resource({
    uri: "server/status",
    handler: async () => {
        return {
            status: "online",
            version: "1.0.0",
            uptime: process.uptime(),
            api_status: "connected",
            cache_size: responseCache.size
        };
    }
});

// Base DeepSeek R1 tool
mcp.tool({
    name: "deepseek_r1",
    description: "Generate text using DeepSeek R1 model",
    inputSchema: {
        type: "object",
        properties: {
            prompt: {
                type: "string",
                description: "Input text for DeepSeek"
            },
            max_tokens: {
                type: "number",
                description: "Maximum tokens to generate (default: 8192)",
                minimum: 1,
                maximum: 8192
            },
            temperature: {
                type: "number",
                description: "Sampling temperature (default: 0.2)",
                minimum: 0,
                maximum: 2
            },
            top_p: {
                type: "number",
                description: "Nucleus sampling parameter (default: 0.95)",
                minimum: 0,
                maximum: 1
            },
            stop_sequences: {
                type: "array",
                items: { type: "string" },
                description: "Sequences that will stop generation"
            }
        },
        required: ["prompt"]
    },
    handler: async (args: unknown) => {
        if (!isValidChatCompletionArgs(args)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid chat completion arguments"
            );
        }

        // Check cache for identical prompts with the same parameters
        const cacheKey = JSON.stringify(args);
        if (responseCache.has(cacheKey)) {
            console.log("Cache hit for prompt");
            return responseCache.get(cacheKey);
        }

        try {
            const completion = await openai.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: "You are an intelligent assistant powered by DeepSeek R1."
                    },
                    {
                        role: "user",
                        content: args.prompt
                    }
                ],
                max_tokens: args.max_tokens ?? 8192,
                temperature: args.temperature ?? 0.2,
                top_p: args.top_p ?? 0.95,
                stop: args.stop_sequences
            });

            const result = {
                content: completion.choices[0]?.message?.content || "No response",
                model: DEFAULT_MODEL,
                usage: completion.usage
            };

            // Cache the response (with a limit of 100 entries)
            if (responseCache.size >= 100) {
                // Remove oldest entry (first key)
                const firstKey = responseCache.keys().next().value;
                responseCache.delete(firstKey);
            }
            responseCache.set(cacheKey, result);

            return result;
        } catch (error) {
            console.error("DeepSeek API error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `DeepSeek API error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Add summarization tool
mcp.tool({
    name: "deepseek_summarize",
    description: "Summarize text using DeepSeek R1 model",
    inputSchema: {
        type: "object",
        properties: {
            text: {
                type: "string",
                description: "Text to summarize"
            },
            max_length: {
                type: "number",
                description: "Maximum length of summary (default: 200 words)",
                minimum: 50,
                maximum: 1000
            },
            format: {
                type: "string",
                description: "Format of the summary",
                enum: ["paragraph", "bullet_points", "tl;dr"]
            }
        },
        required: ["text"]
    },
    handler: async (args: any) => {
        const maxLength = args.max_length ?? 200;
        const format = args.format ?? "paragraph";
        
        let summaryPrompt = "";
        switch (format) {
            case "bullet_points":
                summaryPrompt = `Please summarize the following text in bullet points (maximum ${maxLength} words):\n\n${args.text}`;
                break;
            case "tl;dr":
                summaryPrompt = `${args.text}\n\nTL;DR (maximum ${maxLength} words):`;
                break;
            default:
                summaryPrompt = `Please summarize the following text in a concise paragraph (maximum ${maxLength} words):\n\n${args.text}`;
        }
        
        try {
            const completion = await openai.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: "You are a summarization expert who creates concise, accurate summaries."
                    },
                    {
                        role: "user",
                        content: summaryPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: Math.min(maxLength * 5, 2000) // Rough estimate of tokens from words
            });

            return {
                summary: completion.choices[0]?.message?.content || "Failed to generate summary",
                format: format,
                requested_length: maxLength
            };
        } catch (error) {
            console.error("Summarization error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `Summarization error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Add streaming support
mcp.tool({
    name: "deepseek_stream",
    description: "Stream text generation from DeepSeek R1",
    inputSchema: {
        type: "object",
        properties: {
            prompt: {
                type: "string",
                description: "Input text for DeepSeek"
            },
            max_tokens: {
                type: "number",
                description: "Maximum tokens to generate"
            },
            temperature: {
                type: "number",
                description: "Sampling temperature"
            }
        },
        required: ["prompt"]
    },
    handler: async (args: any, context: any) => {
        try {
            const stream = await openai.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: "You are an intelligent assistant powered by DeepSeek R1."
                    },
                    {
                        role: "user",
                        content: args.prompt
                    }
                ],
                max_tokens: args.max_tokens ?? 8192,
                temperature: args.temperature ?? 0.2,
                stream: true
            });
            
            let fullResponse = "";
            
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                fullResponse += content;
                
                // Send incremental updates
                if (content) {
                    context.streamUpdate({
                        content: content
                    });
                }
            }
            
            return { 
                content: fullResponse,
                status: "streaming_complete"
            };
        } catch (error) {
            console.error("Streaming error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `Streaming error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Add multi-model support
mcp.tool({
    name: "deepseek_multi",
    description: "Generate text using different DeepSeek models",
    inputSchema: {
        type: "object",
        properties: {
            prompt: { 
                type: "string",
                description: "Input text for the model"
            },
            model: { 
                type: "string", 
                enum: Object.keys(SUPPORTED_MODELS),
                description: "Which DeepSeek model to use"
            },
            max_tokens: {
                type: "number",
                description: "Maximum tokens to generate"
            },
            temperature: {
                type: "number",
                description: "Sampling temperature"
            }
        },
        required: ["prompt", "model"]
    },
    handler: async (args: any) => {
        if (!Object.keys(SUPPORTED_MODELS).includes(args.model)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Unsupported model: ${args.model}. Available models: ${Object.keys(SUPPORTED_MODELS).join(", ")}`
            );
        }

        try {
            const completion = await openai.chat.completions.create({
                model: args.model,
                messages: [
                    {
                        role: "system",
                        content: `You are an intelligent assistant powered by ${SUPPORTED_MODELS[args.model].name}.`
                    },
                    {
                        role: "user",
                        content: args.prompt
                    }
                ],
                max_tokens: args.max_tokens ?? 8192,
                temperature: args.temperature ?? 0.2
            });

            return {
                content: completion.choices[0]?.message?.content || "No response",
                model: args.model,
                model_info: SUPPORTED_MODELS[args.model],
                usage: completion.usage
            };
        } catch (error) {
            console.error("Multi-model API error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `${args.model} API error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Add document processing
mcp.tool({
    name: "deepseek_document",
    description: "Process documents with DeepSeek",
    inputSchema: {
        type: "object",
        properties: {
            file_content: { 
                type: "string",
                description: "Content of the document to process"
            },
            action: { 
                type: "string",
                enum: ["summarize", "extract_entities", "analyze_sentiment", "extract_key_points"],
                description: "Action to perform on the document"
            },
            format: {
                type: "string",
                enum: ["text", "json", "markdown"],
                description: "Format of the output"
            }
        },
        required: ["file_content", "action"]
    },
    handler: async (args: any) => {
        const format = args.format || "text";
        let systemPrompt = "You are a document analysis expert.";
        let userPrompt = "";
        
        switch (args.action) {
            case "summarize":
                userPrompt = `Please summarize the following document:\n\n${args.file_content}`;
                break;
            case "extract_entities":
                systemPrompt = "You are an entity extraction expert. Extract all named entities (people, organizations, locations, dates, etc).";
                userPrompt = `Extract all entities from this document ${format === "json" ? "and return them as JSON" : ""}:\n\n${args.file_content}`;
                break;
            case "analyze_sentiment":
                systemPrompt = "You are a sentiment analysis expert.";
                userPrompt = `Analyze the sentiment of this document. Provide a detailed analysis ${format === "json" ? "in JSON format" : ""}:\n\n${args.file_content}`;
                break;
            case "extract_key_points":
                userPrompt = `Extract the key points from this document ${format === "json" ? "and return them as JSON" : ""}:\n\n${args.file_content}`;
                break;
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported action: ${args.action}`
                );
        }
        
        try {
            const completion = await openai.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 4000
            });

            return {
                result: completion.choices[0]?.message?.content || "Failed to process document",
                action: args.action,
                format: format
            };
        } catch (error) {
            console.error("Document processing error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `Document processing error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Add file operations
mcp.resource({
    uri: "file/save/{filename}",
    method: "POST",
    handler: async (filename: string, content: string) => {
        try {
            // Security check - prevent writing outside designated folder
            if (filename.includes("..") || filename.includes("/")) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    "Invalid filename. Cannot contain path separators or parent directory references."
                );
            }
            
            // Create outputs directory if it doesn't exist
            const outputDir = "./outputs";
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
            }
            
            const filePath = `${outputDir}/${filename}`;
            fs.writeFileSync(filePath, content);
            
            return {
                success: true,
                filename: filename,
                path: filePath
            };
        } catch (error) {
            console.error("File save error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `File save error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

mcp.resource({
    uri: "file/list",
    handler: async () => {
        try {
            const outputDir = "./outputs";
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
                return { files: [] };
            }
            
            const files = fs.readdirSync(outputDir);
            return {
                files: files.map(file => ({
                    name: file,
                    size: fs.statSync(`${outputDir}/${file}`).size,
                    created: fs.statSync(`${outputDir}/${file}`).birthtime
                }))
            };
        } catch (error) {
            console.error("File list error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `File list error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

mcp.resource({
    uri: "file/read/{filename}",
    handler: async (filename: string) => {
        try {
            // Security check
            if (filename.includes("..") || filename.includes("/")) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    "Invalid filename. Cannot contain path separators or parent directory references."
                );
            }
            
            const outputDir = "./outputs";
            const filePath = `${outputDir}/${filename}`;
            
            if (!fs.existsSync(filePath)) {
                throw new McpError(
                    ErrorCode.NotFound,
                    `File not found: ${filename}`
                );
            }
            
            const content = fs.readFileSync(filePath, "utf-8");
            return {
                filename: filename,
                content: content
            };
        } catch (error) {
            console.error("File read error:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `File read error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
});

// Set up error handling
process.on("SIGINT", async () => {
    await mcp.close();
    process.exit(0);
});

// Start the MCP server
console.error("Enhanced DeepSeek R1 MCP server running on stdio");
mcp.run({ transport: "stdio" });
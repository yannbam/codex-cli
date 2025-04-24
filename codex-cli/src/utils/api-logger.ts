import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Function to get the current timestamp in ISO format
function getISOTimestamp(): string {
  return new Date().toISOString();
}

// Function to get a detailed timestamp for filename
function getDetailedTimestamp(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  const time = timeStr ? timeStr.replace(/:/g, '-') : '00-00-00'; // HH-MM-SS with fallback
  return `${date}--${time}`;
}

// Define types for request and response objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = Record<string, unknown> | any;

// Function to sanitize API responses by removing potential API keys
function sanitizeData(data: ApiData | null): ApiData | null {
  if (!data) {
    return data;
  }
  
  let clone;
  try {
    // Deep clone to avoid modifying the original
    clone = JSON.parse(JSON.stringify(data));
  } catch (e) {
    // If an object can't be stringified (e.g., contains circular references),
    // we'll do a shallow clone instead for safety
    clone = { ...data };
  }
  
  // Remove API keys from headers if present
  if (clone.headers) {
    if (clone.headers.authorization) {
      clone.headers.authorization = "[REDACTED]";
    }
    if (clone.headers.Authorization) {
      clone.headers.Authorization = "[REDACTED]";
    }
  }
  
  // Remove API keys from defaultHeaders if present
  if (clone.defaultHeaders) {
    if (clone.defaultHeaders.authorization) {
      clone.defaultHeaders.authorization = "[REDACTED]";
    }
    if (clone.defaultHeaders.Authorization) {
      clone.defaultHeaders.Authorization = "[REDACTED]";
    }
  }
  
  // Remove apiKey if it exists at the top level
  if (clone.apiKey) {
    clone.apiKey = "[REDACTED]";
  }
  
  return clone;
}

/**
 * Class to handle API logging of requests and responses for both
 * Responses API and Chat Completions API formats.
 */
export class ApiLogger {
  private logFile: string;
  private enabled: boolean;
  private sessionId: string;
  private pendingRequests: Map<string, {
    timestamp: string;
    request: ApiData;
    chatRequest: ApiData | null;
    cmdContext?: string;
  }>;

  constructor() {
    const homeDir = os.homedir();
    const logsDir = path.join(homeDir, ".codex", "api-logs");
    
    // Create the logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create a unique session ID for this logger instance
    this.sessionId = `session-${getDetailedTimestamp()}`;
    
    // Create one log file for this session
    this.logFile = path.join(logsDir, `api-${this.sessionId}.log`);
    this.enabled = process.env["LOG_API_RAW"] === "true";
    
    // Track pending requests for correlation
    this.pendingRequests = new Map();
    
    // Initialize empty log file
    if (this.enabled) {
      try {
        fs.writeFileSync(this.logFile, `API REQUEST/RESPONSE LOG - SESSION: ${this.sessionId}\n\n`);
      } catch (error) {
        // Silent failure
        // eslint-disable-next-line no-console
        console.error("Error initializing API log file", error);
      }
    }
  }

  // Method to check if logging is enabled
  isEnabled(): boolean {
    return this.enabled;
  }

  // Method to capture command context that triggered the request
  addRequestContext(requestId: string, context: string): void {
    if (!this.enabled || !requestId) {
      return;
    }
    
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.cmdContext = context;
    }
  }

  // Log entry for a full API cycle (combines responses & chat completions data)
  logApiCycle(
    responsesRequest: ApiData, 
    chatRequest: ApiData | null, 
    chatResponse: ApiData | null, 
    responsesResponse: ApiData
  ): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Skip logging if we don't have a proper response yet
      // This handles the streaming case where the response is not fully available yet
      if (!responsesResponse || typeof responsesResponse !== 'object' || 
          (Object.keys(responsesResponse).length === 1 && responsesResponse.controller !== undefined)) {
        // Store the request for later when the full response is available
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        this.pendingRequests.set(requestId, {
          timestamp: getISOTimestamp(),
          request: responsesRequest,
          chatRequest
        });
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedResponsesRequest = sanitizeData(responsesRequest);
      const sanitizedChatRequest = sanitizeData(chatRequest);
      const sanitizedChatResponse = sanitizeData(chatResponse);
      const sanitizedResponsesResponse = sanitizeData(responsesResponse);
      
      let logEntry = `[${timestamp}]\n\n`;
      
      // Add model information or command context if available
      if (responsesRequest && typeof responsesRequest === 'object') {
        const model = responsesRequest.model;
        if (model && typeof model === 'string') {
          logEntry += `>>> ${model}\n\n`;
        }
      }
      
      // 1. Responses format request (always included)
      logEntry += "RESPONSES FORMAT REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedResponsesRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      
      // 2 & 3. Chat Completions format (only if actually translated)
      if (chatRequest) {
        logEntry += "CHAT COMPLETIONS FORMAT REQUEST (TRANSLATED)\n";
        logEntry += `${JSON.stringify(sanitizedChatRequest, null, 2)}\n`;
        logEntry += "------------------------------------------------------\n\n";
      }
      
      if (chatResponse) {
        logEntry += "CHAT COMPLETIONS FORMAT RESPONSE\n";
        logEntry += `${JSON.stringify(sanitizedChatResponse, null, 2)}\n`;
        logEntry += "------------------------------------------------------\n\n";
      }
      
      // 4. Final responses format response
      logEntry += "RESPONSES FORMAT RESPONSE";
      if (chatResponse) {
        logEntry += " (BACK-TRANSLATED)";
      }
      logEntry += "\n";
      logEntry += `${JSON.stringify(sanitizedResponsesResponse, null, 2)}\n`;
      
      logEntry += "\n/====================================================\\\n\n";
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silent failure - don't disrupt normal operation
      // eslint-disable-next-line no-console
      console.error("Error logging API cycle", error);
    }
  }

  // Legacy method for compatibility - logs only Responses API data
  logResponsesApi(request: ApiData, response: ApiData | null): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Skip logging if we don't have a proper response yet (streaming case)
      if (!response || typeof response !== 'object' || 
          (Object.keys(response).length === 1 && response.controller !== undefined)) {
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      const logEntry = `[${timestamp}]\n\nRESPONSES API REQUEST\n${JSON.stringify(sanitizedRequest, null, 2)}\n------------------------------------------------------\nRESPONSES API RESPONSE\n${JSON.stringify(sanitizedResponse, null, 2)}\n\n/====================================================\\\n\n`;
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silent failure
      // eslint-disable-next-line no-console
      console.error("Error logging Responses API", error);
    }
  }

  // Legacy method for compatibility - logs only Chat Completions API data
  logChatCompletionsApi(request: ApiData, response: ApiData | null): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Skip logging if we don't have a proper response yet (streaming case)
      if (!response || typeof response !== 'object' || 
          (Object.keys(response).length === 1 && response.controller !== undefined)) {
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      const logEntry = `[${timestamp}]\n\nCHAT COMPLETIONS API REQUEST\n${JSON.stringify(sanitizedRequest, null, 2)}\n------------------------------------------------------\nCHAT COMPLETIONS API RESPONSE\n${JSON.stringify(sanitizedResponse, null, 2)}\n\n/====================================================\\\n\n`;
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silent failure
      // eslint-disable-next-line no-console
      console.error("Error logging Chat Completions API", error);
    }
  }
}

// Singleton instance
let apiLogger: ApiLogger | null = null;

// Function to get or create the API logger instance
export function getApiLogger(): ApiLogger {
  if (!apiLogger) {
    apiLogger = new ApiLogger();
  }
  return apiLogger;
}

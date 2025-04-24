// Clean approach for ApiLogger
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
  private disableResponseStorage: boolean;
  private pendingRequests: Map<string, {
    timestamp: string;
    request: ApiData;
    chatRequest?: ApiData | null;
    debugInfo?: string;
  }>;
  // Track which requests have already been logged to prevent duplicates
  private requestLogged: Set<string> = new Set();

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
    this.disableResponseStorage = false;
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

  // Set the disableResponseStorage flag
  setDisableResponseStorage(disabled: boolean): void {
    if (this.disableResponseStorage !== disabled && this.enabled) {
      this.disableResponseStorage = disabled;
      if (disabled) {
        try {
          fs.appendFileSync(
            this.logFile, 
            `[${getISOTimestamp()}]\n\n>>> --disable-response-storage mode active\n\n/====================================================\\\n\n`
          );
        } catch (error) {
          // Silent failure
          // eslint-disable-next-line no-console
          console.error("Error logging disable-response-storage mode", error);
        }
      }
    }
  }

  // Method to check if logging is enabled
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Log a request separately - to be matched with a response later
   * @param requestId Unique identifier for this request
   * @param request The API request data to log
   * @param chatRequest Optional translated chat request for non-OpenAI providers
   * @param debugInfo Debug string to identify where the call is coming from
   */
  logRequest(
    requestId: string, 
    request: ApiData, 
    chatRequest: ApiData | null = null,
    debugInfo: string = "unspecified"
  ): void {
    if (!this.enabled) {
      return;
    }

    // Prevent duplicate logging of the same request
    if (this.requestLogged.has(requestId)) {
      return;
    }
    this.requestLogged.add(requestId);

    try {
      const sanitizedRequest = sanitizeData(request);
      const sanitizedChatRequest = sanitizeData(chatRequest);
      const timestamp = getISOTimestamp();

      // Store the request for later matching with response
      this.pendingRequests.set(requestId, {
        timestamp,
        request,
        chatRequest,
        debugInfo
      });

      // Write request entry to log
      let logEntry = `[${timestamp}]\n\n`;
      
      // Add debug info
      logEntry += `DEBUG-CALLSITE: logRequest called from ${debugInfo} (requestId: ${requestId})\n\n`;
      
      // Add disabled storage note if applicable
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
      }
      
      logEntry += "RESPONSES FORMAT REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      
      // Include chat request if provided (for non-OpenAI providers)
      if (chatRequest) {
        logEntry += "------------------------------------------------------\n\n";
        logEntry += "CHAT COMPLETIONS FORMAT REQUEST (TRANSLATED)\n";
        logEntry += `${JSON.stringify(sanitizedChatRequest, null, 2)}\n`;
      }
      
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "RESPONSES FORMAT RESPONSE\n";
      logEntry += "Response will be logged separately after streaming completes\n\n";
      logEntry += "/====================================================\\\n\n";
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silent failure
      // eslint-disable-next-line no-console
      console.error("Error logging request", error);
    }
  }

  /**
   * Log a response for a previously logged request
   * @param requestId Unique identifier matching a previous request
   * @param chatResponse Optional Chat Completions API response (for non-OpenAI providers)
   * @param responsesResponse The final Responses API response
   * @param debugInfo Debug string to identify where the call is coming from
   */
  logResponse(
    requestId: string,
    chatResponse: ApiData | null, 
    responsesResponse: ApiData,
    debugInfo: string = "unspecified"
  ): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Retrieve the stored request
      const pendingRequest = this.pendingRequests.get(requestId);
      if (!pendingRequest) {
        // If no matching request is found, still log the response but with a note
        const timestamp = getISOTimestamp();
        const sanitizedChatResponse = sanitizeData(chatResponse);
        const sanitizedResponsesResponse = sanitizeData(responsesResponse);
        
        let logEntry = `[${timestamp}]\n\n`;
        logEntry += `DEBUG-CALLSITE: logResponse called from ${debugInfo} (requestId: ${requestId}) - NO MATCHING REQUEST FOUND\n\n`;
        logEntry += "!!! NO MATCHING REQUEST FOUND !!!\n\n";
        
        if (chatResponse) {
          logEntry += "CHAT COMPLETIONS FORMAT RESPONSE\n";
          logEntry += `${JSON.stringify(sanitizedChatResponse, null, 2)}\n`;
          logEntry += "------------------------------------------------------\n\n";
        }
        
        logEntry += "RESPONSES FORMAT RESPONSE";
        if (chatResponse) {
          logEntry += " (BACK-TRANSLATED)";
        }
        logEntry += "\n";
        logEntry += `${JSON.stringify(sanitizedResponsesResponse, null, 2)}\n`;
        logEntry += "\n/====================================================\\\n\n";
        
        fs.appendFileSync(this.logFile, logEntry);
        return;
      }
      
      // Log the completed API cycle with the stored request and new response
      const timestamp = getISOTimestamp();
      const sanitizedResponsesRequest = sanitizeData(pendingRequest.request);
      const sanitizedChatRequest = sanitizeData(pendingRequest.chatRequest);
      const sanitizedChatResponse = sanitizeData(chatResponse);
      const sanitizedResponsesResponse = sanitizeData(responsesResponse);
      
      let logEntry = `[${timestamp}]\n\n`;
      
      // Add debug info
      logEntry += `DEBUG-CALLSITE: logResponse called from ${debugInfo} (requestId: ${requestId}, requestLoggedFrom: ${pendingRequest.debugInfo || "unknown"})\n\n`;
      
      // Add disabled storage note if applicable
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
      }
      
      // 1. Responses format request (always included)
      logEntry += "RESPONSES FORMAT REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedResponsesRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      
      // 2 & 3. Chat Completions format (only if actually translated)
      if (pendingRequest.chatRequest) {
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
      
      // Remove the request from pending after logging
      this.pendingRequests.delete(requestId);
    } catch (error) {
      // Silent failure - don't disrupt normal operation
      // eslint-disable-next-line no-console
      console.error("Error logging response", error);
    }
  }

  /**
   * Log a complete API cycle (both request and response in one call)
   * This is maintained for backward compatibility
   * @param debugInfo Debug string to identify where the call is coming from
   */
  logApiCycle(
    responsesRequest: ApiData, 
    chatRequest: ApiData | null, 
    chatResponse: ApiData | null, 
    responsesResponse: ApiData,
    debugInfo: string = "unspecified"
  ): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Skip logging if we have a controller object instead of a real response
      if (responsesResponse && 
          typeof responsesResponse === 'object' && 
          responsesResponse.controller !== undefined) {
        // This is a stream controller, we'll log the request only and log response later
        const requestId = this.generateRequestId();
        this.logRequest(requestId, responsesRequest, chatRequest, `${debugInfo} -> logApiCycle -> logRequest`);
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedResponsesRequest = sanitizeData(responsesRequest);
      const sanitizedChatRequest = sanitizeData(chatRequest);
      const sanitizedChatResponse = sanitizeData(chatResponse);
      const sanitizedResponsesResponse = sanitizeData(responsesResponse);
      
      let logEntry = `[${timestamp}]\n\n`;
      
      // Add debug info
      logEntry += `DEBUG-CALLSITE: logApiCycle called from ${debugInfo}\n\n`;
      
      // Add disabled storage note if applicable
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
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
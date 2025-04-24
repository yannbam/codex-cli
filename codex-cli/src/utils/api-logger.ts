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
    chatRequest: ApiData | null;
    cmdContext?: string;
    completed?: boolean;
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
    this.disableResponseStorage = false; // Will be set via setDisableResponseStorage
    
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

  // Method to handle incomplete responses by logging a placeholder
  logIncompleteResponse(requestId: string, request: ApiData): void {
    if (!this.enabled || !requestId) {
      return;
    }

    try {
      const sanitizedRequest = sanitizeData(request);
      const timestamp = getISOTimestamp();

      // Don't log if we already have this request in progress
      if (this.pendingRequests.has(requestId)) {
        return;
      }

      // Store the request for potential later completion
      this.pendingRequests.set(requestId, {
        timestamp,
        request,
        chatRequest: null,
        completed: false
      });

      // Write placeholder entry to log
      let logEntry = `[${timestamp}]\n\n`;
      
      // Add disabled storage note if applicable
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
      }
      
      logEntry += "RESPONSES FORMAT REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "RESPONSES FORMAT RESPONSE\n";
      logEntry += "Response data pending - streaming in progress\n\n";
      logEntry += "/====================================================\\\n\n";
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silent failure
      // eslint-disable-next-line no-console
      console.error("Error logging incomplete response", error);
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
      // Check if the response is actually a controller or incomplete object
      const isStreamController = 
        responsesResponse === null || 
        typeof responsesResponse !== 'object' ||
        Object.keys(responsesResponse).length === 0 ||
        (Object.keys(responsesResponse).length === 1 && responsesResponse.controller !== undefined);

      // If we have an empty response or controller, don't log the full cycle yet
      if (isStreamController) {
        // Generate a unique ID for this request
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        this.logIncompleteResponse(requestId, responsesRequest);
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedResponsesRequest = sanitizeData(responsesRequest);
      const sanitizedChatRequest = sanitizeData(chatRequest);
      const sanitizedChatResponse = sanitizeData(chatResponse);
      const sanitizedResponsesResponse = sanitizeData(responsesResponse);
      
      let logEntry = `[${timestamp}]\n\n`;
      
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

  // Legacy method for compatibility - logs only Responses API data
  logResponsesApi(request: ApiData, response: ApiData | null): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Skip logging if we don't have a proper response yet (streaming case)
      if (!response || typeof response !== 'object' || 
          Object.keys(response).length === 0 ||
          (Object.keys(response).length === 1 && response.controller !== undefined)) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        this.logIncompleteResponse(requestId, request);
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      let logEntry = `[${timestamp}]\n\n`;
      
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
      }
      
      logEntry += "RESPONSES API REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n";
      logEntry += "RESPONSES API RESPONSE\n";
      logEntry += `${JSON.stringify(sanitizedResponse, null, 2)}\n\n`;
      logEntry += "/====================================================\\\n\n";
      
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
          Object.keys(response).length === 0 ||
          (Object.keys(response).length === 1 && response.controller !== undefined)) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        this.logIncompleteResponse(requestId, request);
        return;
      }

      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      let logEntry = `[${timestamp}]\n\n`;
      
      if (this.disableResponseStorage) {
        logEntry += `>>> Response storage disabled\n\n`;
      }
      
      logEntry += "CHAT COMPLETIONS API REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n";
      logEntry += "CHAT COMPLETIONS API RESPONSE\n";
      logEntry += `${JSON.stringify(sanitizedResponse, null, 2)}\n\n`;
      logEntry += "/====================================================\\\n\n";
      
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

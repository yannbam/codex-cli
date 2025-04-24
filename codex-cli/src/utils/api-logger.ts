// API Logger for tracking OpenAI API requests and responses
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Type for any API data with relaxed constraints
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = Record<string, unknown> | any;

/**
 * API Logger class for tracking Responses API and Chat Completions API
 * requests and responses with precise correlation between them.
 */
export class ApiLogger {
  private logFile: string;
  private enabled: boolean;
  private sessionId: string;
  private disableResponseStorage: boolean;
  private pendingRequests: Map<string, {
    timestamp: string;
    caller: string;
    responsesRequest?: ApiData;
    chatRequest?: ApiData;
  }>;

  constructor() {
    // Create logs directory in user's home folder
    const homeDir = os.homedir();
    const logsDir = path.join(homeDir, ".codex", "api-logs");
    
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Generate unique session ID based on timestamp
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const time = timeStr.replace(/:/g, '-'); // HH-MM-SS
    this.sessionId = `session-${date}--${time}`;
    
    // Setup log file
    this.logFile = path.join(logsDir, `api-${this.sessionId}.log`);
    this.enabled = process.env["LOG_API_RAW"] === "true";
    this.disableResponseStorage = false;
    this.pendingRequests = new Map();
    
    if (this.enabled) {
      try {
        fs.writeFileSync(this.logFile, `API REQUEST/RESPONSE LOG - SESSION: ${this.sessionId}\n\n`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error initializing API log file", error);
      }
    }
  }

  /**
   * Check if API logging is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set the disableResponseStorage flag
   * Required by agent-loop.ts
   */
  public setDisableResponseStorage(disabled: boolean): void {
    if (this.disableResponseStorage !== disabled && this.enabled) {
      this.disableResponseStorage = disabled;
      if (disabled) {
        try {
          let logEntry = `[${this.getTimestamp()}]\n\n`;
          logEntry += `>>> --disable-response-storage mode active\n\n`;
          logEntry += `/====================================================\\\n\n`;
          this.appendToLog(logEntry);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Error logging disable-response-storage mode", error);
        }
      }
    }
  }

  /**
   * Generate a unique request ID
   */
  public generateId(prefix: string = "req"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Sanitize API request/response data by removing sensitive information
   */
  private sanitizeData(data: ApiData): ApiData {
    if (!data) return data;
    
    let sanitized;
    try {
      sanitized = JSON.parse(JSON.stringify(data));
    } catch (e) {
      // If circular references exist, do a shallow clone
      sanitized = { ...data };
    }
    
    // Redact authorization headers
    if (sanitized.headers) {
      if (sanitized.headers.authorization) sanitized.headers.authorization = "[REDACTED]";
      if (sanitized.headers.Authorization) sanitized.headers.Authorization = "[REDACTED]";
    }
    
    // Redact API keys in default headers
    if (sanitized.defaultHeaders) {
      if (sanitized.defaultHeaders.authorization) sanitized.defaultHeaders.authorization = "[REDACTED]";
      if (sanitized.defaultHeaders.Authorization) sanitized.defaultHeaders.Authorization = "[REDACTED]";
    }
    
    // Redact top-level API key
    if (sanitized.apiKey) sanitized.apiKey = "[REDACTED]";
    
    return sanitized;
  }

  /**
   * Get current timestamp in ISO format
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Append content to the log file
   */
  private appendToLog(content: string): void {
    if (!this.enabled) return;
    
    try {
      fs.appendFileSync(this.logFile, content);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error writing to API log file", error);
    }
  }

  /**
   * Log OpenAI Responses API Request (direct OpenAI provider)
   * 
   * @param requestId Unique ID for the request for correlation
   * @param responsesRequest The Responses API request
   * @param caller String identifying exact call location
   */
  public logResponsesRequest(requestId: string, responsesRequest: ApiData, caller: string): void {
    if (!this.enabled) return;
    
    try {
      const timestamp = this.getTimestamp();
      const sanitizedRequest = this.sanitizeData(responsesRequest);
      
      // Store for correlation with response
      this.pendingRequests.set(requestId, {
        timestamp,
        caller,
        responsesRequest
      });
      
      let logEntry = `[${timestamp}]\n\n`;
      logEntry += `CALLER: ${caller} (requestId: ${requestId})\n\n`;
      logEntry += "RESPONSES API REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "RESPONSES API RESPONSE\n";
      logEntry += "Response will be logged separately after streaming completes\n\n";
      logEntry += "/====================================================\\\n\n";
      
      this.appendToLog(logEntry);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error logging Responses API request", error);
    }
  }

  /**
   * Log OpenAI Responses API Response (direct OpenAI provider)
   * 
   * @param requestId Unique ID matching the original request
   * @param responsesResponse The Responses API response
   * @param caller String identifying exact call location
   */
  public logResponsesResponse(requestId: string, responsesResponse: ApiData, caller: string): void {
    if (!this.enabled) return;
    
    try {
      const timestamp = this.getTimestamp();
      const pendingRequest = this.pendingRequests.get(requestId);
      const sanitizedResponse = this.sanitizeData(responsesResponse);
      
      if (!pendingRequest) {
        // No matching request found
        let logEntry = `[${timestamp}]\n\n`;
        logEntry += `CALLER: ${caller} (requestId: ${requestId})\n\n`;
        logEntry += "!!! NO MATCHING REQUEST FOUND !!!\n\n";
        logEntry += "RESPONSES API RESPONSE\n";
        logEntry += `${JSON.stringify(sanitizedResponse, null, 2)}\n\n`;
        logEntry += "/====================================================\\\n\n";
        this.appendToLog(logEntry);
        return;
      }
      
      const sanitizedRequest = this.sanitizeData(pendingRequest.responsesRequest);
      
      let logEntry = `[${timestamp}]\n\n`;
      logEntry += `CALLER: ${caller} (requestId: ${requestId}, requestCaller: ${pendingRequest.caller})\n\n`;
      logEntry += "RESPONSES API REQUEST\n";
      logEntry += `${JSON.stringify(sanitizedRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "RESPONSES API RESPONSE\n";
      logEntry += `${JSON.stringify(sanitizedResponse, null, 2)}\n\n`;
      logEntry += "/====================================================\\\n\n";
      
      this.appendToLog(logEntry);
      
      // Remove the request from pending after logging
      this.pendingRequests.delete(requestId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error logging Responses API response", error);
    }
  }

  /**
   * Log Translated Chat Completions API Request (non-OpenAI providers)
   * 
   * @param requestId Unique ID for the request for correlation
   * @param responsesRequest Original Responses API request
   * @param chatRequest Translated Chat Completions API request
   * @param caller String identifying exact call location
   */
  public logChatCompletionsRequest(
    requestId: string, 
    responsesRequest: ApiData, 
    chatRequest: ApiData, 
    caller: string
  ): void {
    if (!this.enabled) return;
    
    try {
      const timestamp = this.getTimestamp();
      const sanitizedResponsesRequest = this.sanitizeData(responsesRequest);
      const sanitizedChatRequest = this.sanitizeData(chatRequest);
      
      // Store for correlation with response
      this.pendingRequests.set(requestId, {
        timestamp,
        caller,
        responsesRequest,
        chatRequest
      });
      
      let logEntry = `[${timestamp}]\n\n`;
      logEntry += `CALLER: ${caller} (requestId: ${requestId})\n\n`;
      logEntry += "RESPONSES API REQUEST (ORIGINAL)\n";
      logEntry += `${JSON.stringify(sanitizedResponsesRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "CHAT COMPLETIONS API REQUEST (TRANSLATED)\n";
      logEntry += `${JSON.stringify(sanitizedChatRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "CHAT COMPLETIONS/RESPONSES API RESPONSE\n";
      logEntry += "Response will be logged separately after streaming completes\n\n";
      logEntry += "/====================================================\\\n\n";
      
      this.appendToLog(logEntry);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error logging Chat Completions API request", error);
    }
  }

  /**
   * Log Translated Chat Completions API Response (non-OpenAI providers)
   * 
   * @param requestId Unique ID matching the original request
   * @param chatResponse Original Chat Completions API response
   * @param responsesResponse Translated Responses API response
   * @param caller String identifying exact call location
   */
  public logChatCompletionsResponse(
    requestId: string, 
    chatResponse: ApiData, 
    responsesResponse: ApiData, 
    caller: string
  ): void {
    if (!this.enabled) return;
    
    try {
      const timestamp = this.getTimestamp();
      const pendingRequest = this.pendingRequests.get(requestId);
      const sanitizedChatResponse = this.sanitizeData(chatResponse);
      const sanitizedResponsesResponse = this.sanitizeData(responsesResponse);
      
      if (!pendingRequest) {
        // No matching request found
        let logEntry = `[${timestamp}]\n\n`;
        logEntry += `CALLER: ${caller} (requestId: ${requestId})\n\n`;
        logEntry += "!!! NO MATCHING REQUEST FOUND !!!\n\n";
        logEntry += "CHAT COMPLETIONS API RESPONSE\n";
        logEntry += `${JSON.stringify(sanitizedChatResponse, null, 2)}\n`;
        logEntry += "------------------------------------------------------\n\n";
        logEntry += "RESPONSES API RESPONSE (TRANSLATED)\n";
        logEntry += `${JSON.stringify(sanitizedResponsesResponse, null, 2)}\n\n`;
        logEntry += "/====================================================\\\n\n";
        this.appendToLog(logEntry);
        return;
      }
      
      const sanitizedResponsesRequest = this.sanitizeData(pendingRequest.responsesRequest);
      const sanitizedChatRequest = this.sanitizeData(pendingRequest.chatRequest);
      
      let logEntry = `[${timestamp}]\n\n`;
      logEntry += `CALLER: ${caller} (requestId: ${requestId}, requestCaller: ${pendingRequest.caller})\n\n`;
      logEntry += "RESPONSES API REQUEST (ORIGINAL)\n";
      logEntry += `${JSON.stringify(sanitizedResponsesRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "CHAT COMPLETIONS API REQUEST (TRANSLATED)\n";
      logEntry += `${JSON.stringify(sanitizedChatRequest, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "CHAT COMPLETIONS API RESPONSE\n";
      logEntry += `${JSON.stringify(sanitizedChatResponse, null, 2)}\n`;
      logEntry += "------------------------------------------------------\n\n";
      logEntry += "RESPONSES API RESPONSE (TRANSLATED)\n";
      logEntry += `${JSON.stringify(sanitizedResponsesResponse, null, 2)}\n\n`;
      logEntry += "/====================================================\\\n\n";
      
      this.appendToLog(logEntry);
      
      // Remove the request from pending after logging
      this.pendingRequests.delete(requestId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error logging Chat Completions API response", error);
    }
  }

  /**
   * Handle stream controller detection and fallback to request-only logging
   * 
   * @param responsesRequest The original Responses API request
   * @param responsesResponse The Responses API response (or controller)
   * @param caller String identifying exact call location
   * @returns requestId if a stream controller was detected, empty string otherwise
   */
  public handlePossibleStreamController(
    responsesRequest: ApiData,
    responsesResponse: ApiData,
    caller: string
  ): string {
    if (!this.enabled) return "";
    
    // Check if we have a stream controller instead of a real response
    if (responsesResponse && 
        typeof responsesResponse === 'object' && 
        responsesResponse.controller !== undefined) {
      // This is a stream controller, log only the request
      const requestId = this.generateId();
      this.logResponsesRequest(requestId, responsesRequest, `${caller} (stream controller detected)`);
      return requestId;
    }
    
    return ""; // Not a stream controller
  }
}

// Create singleton instance
let apiLoggerInstance: ApiLogger | null = null;

// Get or create the ApiLogger instance
export function getApiLogger(): ApiLogger {
  if (!apiLoggerInstance) {
    apiLoggerInstance = new ApiLogger();
  }
  return apiLoggerInstance;
}

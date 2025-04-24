import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Function to get the current timestamp in ISO format
function getISOTimestamp(): string {
  return new Date().toISOString();
}

// Function to get the date in YYYY-MM-DD format for filename
function getDateForFilename(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

// Define types for request and response objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = Record<string, unknown> | any;

// Function to sanitize API responses by removing potential API keys
function sanitizeData(data: ApiData | null): ApiData | null {
  if (!data) {
    return data;
  }
  
  const clone = JSON.parse(JSON.stringify(data));
  
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

// Class to handle API logging
export class ApiLogger {
  private responsesLogFile: string;
  private chatCompLogFile: string;
  private enabled: boolean;

  constructor() {
    const homeDir = os.homedir();
    const logDir = path.join(homeDir, ".codex");
    const dateStr = getDateForFilename();
    
    // Create the log directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.responsesLogFile = path.join(logDir, `api_responses_${dateStr}`);
    this.chatCompLogFile = path.join(logDir, `api_chatcomp_${dateStr}`);
    this.enabled = process.env["LOG_API_RAW"] === "true";
  }

  // Method to check if logging is enabled
  isEnabled(): boolean {
    return this.enabled;
  }

  // Method to log Responses API request and response
  logResponsesApi(request: ApiData, response: ApiData | null): void {
    if (!this.enabled) {
      return;
    }

    try {
      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      const logEntry = `[${timestamp}]\n\nREQUEST\n${JSON.stringify(sanitizedRequest, null, 2)}\n------------------------------------------------------\nRESPONSE\n${JSON.stringify(sanitizedResponse, null, 2)}\n\n/====================================================\\\n\n`;
      
      fs.appendFileSync(this.responsesLogFile, logEntry);
    } catch (error) {
      // Silent failure - don't disrupt normal operation
      // eslint-disable-next-line no-console
      console.error("Error logging Responses API", error);
    }
  }

  // Method to log Chat Completions API request and response
  logChatCompletionsApi(request: ApiData, response: ApiData | null): void {
    if (!this.enabled) {
      return;
    }

    try {
      const timestamp = getISOTimestamp();
      const sanitizedRequest = sanitizeData(request);
      const sanitizedResponse = sanitizeData(response);
      
      const logEntry = `[${timestamp}]\n\nREQUEST\n${JSON.stringify(sanitizedRequest, null, 2)}\n------------------------------------------------------\nRESPONSE\n${JSON.stringify(sanitizedResponse, null, 2)}\n\n/====================================================\\\n\n`;
      
      fs.appendFileSync(this.chatCompLogFile, logEntry);
    } catch (error) {
      // Silent failure - don't disrupt normal operation
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

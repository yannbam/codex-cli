#!/usr/bin/env node

/**
 * Simple test script to verify the API logging functionality
 * 
 * To use:
 * 1. Set LOG_API_RAW=true in your environment
 * 2. Run this script: node test-api-logging.js
 * 3. Check the log files in ~/.codex/api_responses_YYYY-MM-DD and ~/.codex/api_chatcomp_YYYY-MM-DD
 */

import { OpenAI } from 'openai';
import { getApiLogger } from '../codex-cli/src/utils/api-logger.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Set environment variable for testing
process.env.LOG_API_RAW = 'true';

// Create a simple OpenAI client
const openai = new OpenAI({
  apiKey: 'sk-fake-key-for-testing',
  baseURL: 'https://api.example.com/v1',
});

// Function to simulate a request/response for the Responses API
async function testResponsesApi() {
  console.log('Testing Responses API logging...');
  
  const request = {
    model: 'gpt-4',
    instructions: 'You are a helpful assistant.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello, how are you?' }]
      }
    ],
    stream: true,
    tools: [
      {
        type: 'function',
        name: 'test_function',
        description: 'A test function',
        parameters: {
          type: 'object',
          properties: {
            testParam: { type: 'string' }
          }
        }
      }
    ]
  };
  
  const response = {
    id: 'resp_123456789',
    model: 'gpt-4',
    created_at: Date.now() / 1000,
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: "I'm doing well, thank you for asking! How can I help you today?"
          }
        ]
      }
    ]
  };
  
  // Get the logger and log the request/response
  const apiLogger = getApiLogger();
  apiLogger.logResponsesApi(request, response);
  
  // Check if the log file was created
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = path.join(os.homedir(), '.codex', `api_responses_${dateStr}`);
  
  if (fs.existsSync(logFile)) {
    console.log(`✅ Log file created at: ${logFile}`);
    
    // Display first few lines of the log file
    const content = fs.readFileSync(logFile, 'utf8');
    console.log('\nFirst 10 lines of log file:');
    console.log(content.split('\n').slice(0, 10).join('\n'));
    console.log('...');
  } else {
    console.log(`❌ Log file not found at: ${logFile}`);
  }
}

// Function to simulate a request/response for the Chat Completions API
async function testChatCompletionsApi() {
  console.log('\nTesting Chat Completions API logging...');
  
  const request = {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Tell me a joke.' }
    ],
    temperature: 0.7,
    stream: false
  };
  
  const response = {
    id: 'chatcmpl_123456789',
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Why did the developer go broke? Because they lost their domain in a crash!'
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 19,
      completion_tokens: 16,
      total_tokens: 35
    }
  };
  
  // Get the logger and log the request/response
  const apiLogger = getApiLogger();
  apiLogger.logChatCompletionsApi(request, response);
  
  // Check if the log file was created
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = path.join(os.homedir(), '.codex', `api_chatcomp_${dateStr}`);
  
  if (fs.existsSync(logFile)) {
    console.log(`✅ Log file created at: ${logFile}`);
    
    // Display first few lines of the log file
    const content = fs.readFileSync(logFile, 'utf8');
    console.log('\nFirst 10 lines of log file:');
    console.log(content.split('\n').slice(0, 10).join('\n'));
    console.log('...');
  } else {
    console.log(`❌ Log file not found at: ${logFile}`);
  }
}

// Run the tests
async function runTests() {
  try {
    await testResponsesApi();
    await testChatCompletionsApi();
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\nError running tests:', error);
  }
}

runTests();

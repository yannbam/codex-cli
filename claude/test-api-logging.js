#!/usr/bin/env node

/**
 * Simple test script to show how to set LOG_API_RAW=true environment variable
 * to enable API request/response logging.
 * 
 * After running this script, the API logs will be available in:
 * ~/.codex/api-logs/api-session-YYYY-MM-DD--HH-MM-SS.log
 * 
 * The log files contain a complete API request/response cycle:
 * 1. Responses format request
 * 2. Translated chat completion format (non-OpenAI providers only)
 * 3. Chat completion format response (non-OpenAI providers only) 
 * 4. Responses format response (translated back or direct)
 */

// Just output instructions on how to test the API logging feature
console.log('\nAPI Logging Test Instructions');
console.log('===========================\n');
console.log('1. Set the environment variable to enable API logging:');
console.log('   export LOG_API_RAW=true\n');
console.log('2. Run codex with your regular OpenRouter or OpenAI commands:');
console.log('   codex "Tell me a joke"\n');
console.log('3. Check the log files:');
console.log('   ls -la ~/.codex/api-logs/');
console.log('   cat ~/.codex/api-logs/api-session-<timestamp>.log\n');
console.log('4. To disable logging:');
console.log('   unset LOG_API_RAW\n');


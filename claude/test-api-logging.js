#!/usr/bin/env node

/**
 * Simple test script to show how to set LOG_API_RAW=true environment variable
 * to enable API request/response logging.
 * 
 * After running this script, the api logs will be available at:
 * - ~/.codex/api_responses_YYYY-MM-DD (for Responses API)
 * - ~/.codex/api_chatcomp_YYYY-MM-DD (for Chat Completions API)
 */

// Just output instructions on how to test the API logging feature
console.log('\nAPI Logging Test Instructions');
console.log('===========================\n');
console.log('1. Set the environment variable to enable API logging:');
console.log('   export LOG_API_RAW=true\n');
console.log('2. Run codex with your regular OpenRouter or OpenAI commands:');
console.log('   codex "Tell me a joke"\n');
console.log('3. Check the log files:');
console.log('   cat ~/.codex/api_responses_YYYY-MM-DD');
console.log('   cat ~/.codex/api_chatcomp_YYYY-MM-DD\n');
console.log('4. To disable logging:');
console.log('   unset LOG_API_RAW\n');

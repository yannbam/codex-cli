# Codex-CLI Provider Support Analysis

## Overview

Codex-CLI was originally developed to work exclusively with the OpenAI API, but has since been extended to support multiple LLM providers. This analysis summarizes the current state of non-OpenAI provider support, implementation details, and potential issues.

## Current Provider Support

As of the latest commit, these providers are officially supported:

| Provider         | Base URL                                                | Environment Variable      |
| ---------------- | ------------------------------------------------------- | ------------------------- |
| OpenAI (default) | https://api.openai.com/v1                               | OPENAI_API_KEY            |
| OpenRouter       | https://openrouter.ai/api/v1                            | OPENROUTER_API_KEY        |
| Gemini (Google)  | https://generativelanguage.googleapis.com/v1beta/openai | GEMINI_API_KEY            |
| Ollama (local)   | http://localhost:11434/v1                               | OLLAMA_API_KEY (optional) |
| Mistral          | https://api.mistral.ai/v1                               | MISTRAL_API_KEY           |
| DeepSeek         | https://api.deepseek.com                                | DEEPSEEK_API_KEY          |
| xAI              | https://api.x.ai/v1                                     | XAI_API_KEY               |
| Groq             | https://api.groq.com/openai/v1                          | GROQ_API_KEY              |

## Notable Missing Providers

The following common providers are not included in the default configuration:

- Anthropic/Claude
- Azure OpenAI
- Cohere
- HuggingFace
- Anyscale

## Implementation Details

### Key Commits

1. **eafbc75** (April 20, 2025) - Initial support for multiple providers

   - Added transformation layer between Responses API and Completion API
   - Minimal changes to the existing codebase structure

2. **146a61b** (April 23, 2025) - Added custom provider configuration

   - Support for loading user-defined providers from config
   - Allow overriding default provider settings

3. **4261973** (April 23, 2025) - Bug fix for non-OpenAI providers

   - Fixed temperature and top_p parameter handling

4. **549fc65** - Remove API key requirement for Ollama
   - Special case for local Ollama installations

### Key Files

- `src/utils/providers.ts` - Contains the main provider definitions
- `src/utils/responses.ts` - Handles the transformation layer for non-OpenAI providers
- `src/utils/config.ts` - Manages provider configuration and environment variables

### Implementation Approach

The implementation takes a pragmatic approach:

1. Maintain the OpenAI API structure as the "canonical" interface
2. Create a translation layer for other providers to map to this interface
3. Use environment variables for API keys following a consistent naming pattern
4. Allow custom base URLs via environment variables or config

### User Configuration Options

1. **Command Line Interface**

   ```
   --provider, -p <provider>    Provider to use for completions (default: openai)
   ```

2. **Environment Variables**

   - `PROVIDER_API_KEY` for authentication (e.g., `MISTRAL_API_KEY`)
   - `PROVIDER_BASE_URL` for custom endpoints

3. **Custom Provider Configuration**
   - Users can define custom providers in their local config
   - Custom providers are merged with built-in providers

## Identified Issues

1. **Tool Call Formatting** (from `bugs/tool_use_name.txt`)

   - Error with Google/Gemini provider regarding tool_use.name pattern
   - The provider expects tool names to match `^[a-zA-Z0-9_-]{1,64}$`

2. **Parameter Handling**

   - Temperature and top_p parameters had incorrect defaults (fixed in commit 4261973)
   - Different providers may have different parameter requirements or limitations

3. **Model Selection**

   - Model listing and selection UI might not work consistently across providers
   - Default models may not be appropriate for all providers

4. **Error Handling**

   - Provider-specific error formats may not be handled correctly
   - Authentication and request errors could have provider-specific details

5. **Provider-Specific Features**
   - Some provider-specific capabilities might not be exposed through the current interface

## Recommendations

1. **Add support for more providers**

   - Anthropic/Claude integration would be particularly valuable
   - Azure OpenAI would benefit enterprise users

2. **Improve error handling**

   - Better provider-specific error messages
   - More robust fallback behavior

3. **Enhance provider configuration**

   - Provider-specific parameter validation
   - Default models appropriate for each provider

4. **Documentation**

   - Create provider-specific setup guides
   - Document limitations and differences between providers

5. **Testing**
   - Add tests specifically for non-OpenAI providers
   - Create a test matrix for provider compatibility

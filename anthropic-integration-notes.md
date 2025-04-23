# Anthropic/Claude Integration Notes

## Current Status

Anthropic's Claude models are not currently included in the default provider list for codex-cli. However, users can add Claude support by creating a custom provider configuration.

## Integration Considerations

### 1. API Differences

The Anthropic API differs from OpenAI's in several important ways:

- **Message Structure**:

  - Anthropic uses `system`, `user`, and `assistant` roles similar to OpenAI
  - Anthropic's API has a different structure for multi-modal content and tool use

- **Tool Calling Format**:

  - Anthropic's tool calling format is different from OpenAI's function calling
  - Claude uses XML tags for tool calls (`<function_calls>` etc.)

- **Response Structure**:

  - Anthropic's response format differs from OpenAI's completion and chat completion endpoints
  - Different token counting and usage information

- **Streaming**:
  - While both APIs support streaming, the event format differs

### 2. Parameters

Anthropic models use some different parameters:

- `temperature` (similar to OpenAI)
- `max_tokens` (similar to OpenAI's `max_tokens`)
- `top_p` (similar to OpenAI)
- `top_k` (not in OpenAI API)
- `anthropic_version` (required header not in OpenAI API)

### 3. Model Selection

The available models are different:

- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`
- `claude-3.5-sonnet-20240620`
- `claude-3.7-sonnet-20240219` (most recent as of Apr 2025)

### 4. Required Changes

To properly integrate Anthropic models, the following changes would be needed:

1. **Provider Configuration**:

   ```javascript
   anthropic: {
     name: "Anthropic",
     baseURL: "https://api.anthropic.com/v1",
     envKey: "ANTHROPIC_API_KEY",
   }
   ```

2. **API Transformation Layer**:

   - Create a mapping between OpenAI's chat completion format and Anthropic's message format
   - Handle the different tool calling formats
   - Transform streaming events appropriately

3. **Authentication**:

   - Add support for Anthropic's API key header format
   - Include the required `anthropic_version` header

4. **Error Handling**:
   - Add specific handling for Anthropic API error formats

## Implementation Proposal

### 1. Adding Basic Provider Support

Add Anthropic to the providers list:

```javascript
// In src/utils/providers.ts
anthropic: {
  name: "Anthropic",
  baseURL: "https://api.anthropic.com/v1",
  envKey: "ANTHROPIC_API_KEY",
},
```

### 2. Response Transformation

Extend the response transformation layer to handle Anthropic's message format:

```javascript
// In src/utils/responses.ts
async function transformAnthropicResponse(openai, input) {
  // Convert OpenAI format to Anthropic format
  const messages = input.data.map((item) => ({
    role: item.role,
    content: transformContentForAnthropic(item.content),
  }));

  // Make request to Anthropic API
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": getApiKey("anthropic"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      messages,
      temperature: input.temperature,
      max_tokens: input.max_tokens || 4096,
      // other parameters...
    }),
  });

  // Transform Anthropic response back to OpenAI format
  // ...
}
```

### 3. Tool Calling Adaptation

Implement special handling for tool calls:

```javascript
function transformToolCallsForAnthropic(tools) {
  // Convert OpenAI function definitions to Anthropic tool format
  // ...
}

function parseAnthropicToolCalls(content) {
  // Parse Anthropic XML tool calls into OpenAI function call format
  // ...
}
```

## Testing Plan

1. **Basic Chat**: Test basic conversation without tools
2. **Tool Calling**: Test with various tools to ensure proper transformation
3. **Error Handling**: Test error cases specific to Anthropic API
4. **Streaming**: Verify streaming works correctly with Anthropic models

## References

- Anthropic API Documentation: https://docs.anthropic.com/
- OpenAI API Documentation: https://platform.openai.com/docs/api-reference/

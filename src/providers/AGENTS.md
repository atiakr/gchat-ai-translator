# src/providers — translation providers

## Scope
- Requests for OpenAI (`openai.ts`), Anthropic (`anthropic.ts`), and OpenAI-compatible endpoints (`openaiCompatible.ts`), the shared Chat Completions caller (`chatCompletions.ts`), prompt and output schema (`prompt.ts`), response parsing (`parse.ts`), error classification (`errors.ts`), registry and connection test (`index.ts`), and token usage reporting (`usage.ts`).
- Out of scope: history, batching, retry, concurrency (engine); storing and reading keys (settings). This module never reads keys from storage; it uses only the `ProviderConfig` passed in.

## Invariants
- Every provider implements a single `TranslationProvider.translate(request, config)`, and the result array matches the input items in count and ids. Otherwise it throws `ProviderError('parse')`.
- If only one item is malformed, that item is filled with `{ translation: '', detectedLang: 'und', sameLanguage: false, failed: true }`. The whole batch does not fail.
- Errors are thrown only as one of the five `ProviderError` kinds: 401/403 → `auth`, 429 → `rate_limit`, 5xx/network → `server`, other 4xx/refusal → `bad_request`, malformed/truncated → `parse`.
- If an error message contains the key string, it is replaced with `[redacted]`. Keys are never logged.
- Anthropic requests contain no `thinking`, `temperature`, or `top_p`. OpenAI-family requests contain no token limit field.
- The connection test (`testConnection`) never throws.
- Token usage: as soon as a 2xx body is parsed as JSON, the provider reads `usage` (Chat Completions `prompt_tokens` / `completion_tokens`; Anthropic `input_tokens` / `output_tokens` plus cache tokens counted as input) and calls `reportUsage({ provider, model, usage })` **before** validating the translation output, so a truncated or malformed answer is still counted. A body without `usage` reports nothing. The listener is set by the background (`setUsageListener`); without one the report is dropped, and a throwing listener never affects the translation result.

## Implementation
- Plain `fetch`, no SDK. Structured output is tried first; if a 400 body mentions structured-output keywords, the same request is sent once more in prompt-JSON mode, and the fallback mode is remembered per provider (reset with `resetProviderState`).
- The target language goes into the prompt as both its code and English name. Extra instructions are appended only when non-empty.
- `detected_lang` normalization: lowercase, keep `zh-CN`/`zh-TW`, two letters otherwise, `und` when empty.

## Tests
- `testUtils.ts` mocks fetch to verify request URLs, headers, body shapes, and response parsing.
- Tests that must stay: request shape per provider, error classification per status code, structured-output fallback and its memory, item count mismatch / truncation / invalid JSON → `parse`, per-item failure, omitted auth header for the compatible provider with an empty key, key redaction, usage reported with the provider id and effective model (also on parse failure) and not reported when absent.

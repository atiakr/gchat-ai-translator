# src/engine — translation engine and background

## Scope
- Everything that runs in the background: translation history and sent-original history (`cache.ts`), hashing (`hash.ts`), batching queue (`queue.ts`), in-flight dedupe (`inflight.ts`), concurrency limit (`concurrency.ts`), retry (`retry.ts`), badge (`badge.ts`), assembly (`engine.ts`), message router, shortcuts, install hook, and broadcast (`background.ts`).
- Pure functions also used by the content script: limit judgement (`limits.ts`), shared types (`types.ts`), hashing.
- Out of scope: provider request shapes (providers), DOM (gchat), UI.

## Invariants
- When `canTranslate()` is false, no provider call happens. Off or daily token limit reached → every item is `error`/`bad_request`; no key or invalid key → `error`/`auth`.
- A history hit never calls the provider. Only `translate.retry` ignores history, and its result is written to history.
- For incoming translation, a translation equal to the original (ignoring surrounding whitespace) is treated as `same_language`. Outgoing translation returns it as is.
- If saving history fails, the translation result is still returned normally.
- Only `translated` and `same_language` are stored. Per-item failures (`failed`) are returned as `error`/`parse` and not stored.
- Concurrent requests with the same history key are merged into a single provider call.
- On an `auth` error, the provider is stored as having an invalid key and the badge is updated. A successful `provider.test` clears that provider's invalid-key state.
- `status.report` only updates the name of an existing room settings entry; it never creates a new one.
- Broadcasts (`settings.changed`) and shortcut forwarding go only to `https://chat.google.com/` tabs and never carry keys.
- In-memory state (queue, in-flight, semaphore) is designed to be lost on service worker restart. Settled results are written to storage immediately.

## Implementation
- `createEngine({ getProvider, now, sleep, limits })` takes its dependencies so tests can inject a fake provider and fake time. `startBackground()` registers handlers and listeners with real dependencies and returns a teardown function.
- The item id sent to the provider is the history key (unique within a batch, so the pre- and post-edit versions of one message never collide in the same batch).
- The instructions sent to the provider are the global extra instructions followed by the room's instructions (`combineInstructions`, blank parts dropped), read per call with the room id. That combined string is what goes into the history key hash and the batch group key, so changing a room's instructions misses old history.
- Batch group key = (room, target language, provider, model, instructions). A batch flushes at 10 items or 150 ms after its first item.
- History is stored as a map + order array in a single entry each, `local:translationCache` and `local:sentOriginals`; writes are serialized inside the module to avoid read-modify-write races. The options page's clear-history depends on these two key names.
- Badge priority: invalid key > no key > daily token limit reached (`budget`) > broken page structure.
- Token usage: `startBackground` registers the providers' usage listener. `recordUsage` adds the event to `local:usage` (settings module) and compares `dailyLimitReached()` before and after; only when the answer flips does it run the same change path as a settings change (broadcast `settings.changed` + badge). Every call therefore does not trigger a broadcast. The listener is removed on teardown. A tab left open past midnight keeps the `budget` state until it reloads or any settings change is broadcast.

## Tests
- Fake timers for the queue and retry, a fake provider for the engine, `fakeBrowser` + `vi.fn()` for the router.
- Tests that must stay: no calls when off or without a key, no call on history hit, dedupe to 1 call, retryable errors / count / backoff, oldest history evicted over the cap, base URL included in the key for the compatible provider, room instructions applied only to that room's incoming and outgoing calls, auth → invalid key + badge, no keys in broadcasts, no call when the daily token limit is reached, usage recorded and broadcast only when the limit is crossed.

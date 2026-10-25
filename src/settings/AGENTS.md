# src/settings — settings schema and storage

## Scope
- Types and defaults for global settings, per-room settings, keys, and status (`schema.ts`), migrating stored values to the current schema (`migrate.ts`), reading / writing / subscribing to storage and deciding whether translation is possible (`storage.ts`), and the token usage record (`usage.ts`: per-day, per-provider totals, local only).
- Out of scope: translation history (the engine's `cache.ts`), UI state.

## Invariants
- API keys are written only to `local:apiKeys`. No function writes a key to sync.
- Global settings are a single `sync:settings` entry; per-room settings are one `sync:room:<room id>` entry per room. Room fields: `incomingDisabled`, optional `name`, `outgoingLang`, `instructions`, and `enterTranslates` (missing = off; no migration, readers compare with `=== true`).
- A room's `instructions` is cut to `DEFAULTS.maxRoomInstructionsChars` on save so the room entry stays under the 8KB sync item limit; whitespace-only removes the field. Read it with `roomInstructions()`, which treats a missing or corrupt value as empty.
- `getGlobalSettings` always returns a complete, migrated value. Corrupt fields fall back to defaults (negative or zero limits, unknown provider ids, non-string languages, etc.).
- `setApiKey` trims surrounding whitespace before saving and clears that provider's invalid-key state.
- `canTranslate()`: globally off → `disabled`; no key for the active provider (for the compatible provider, no custom URL instead of no key) → `no_key`; invalid key → `invalid_key`; today's tokens (input + output, all providers) at or over `dailyTokenLimit` (when > 0) → `budget`; otherwise allowed. The `GateReason` union lives in `schema.ts`.
- Usage is stored in `local:usage` as `{ days: { 'YYYY-MM-DD': { provider: { inputTokens, outputTokens, calls } } } }`, keyed by this device's local date. Only the background writes it (`addUsage`); the popup and options read it. Writes prune days older than `DEFAULTS.usageRetentionDays`. Corrupt entries are dropped on read. Clearing translation history does not touch it.
- `dailyTokenLimit` is a non-negative integer (0 = no limit). `prices` are per-provider USD per 1M tokens, non-negative; 0 means unknown and hides the cost.
- Sync quota errors are rethrown as `SyncQuotaError`.

## Implementation
- When the schema changes, bump `SETTINGS_VERSION` and add a step to `migrateGlobalSettings`. Only known fields are carried over; everything else gets defaults. Current version is 3: v1 → v2 dropped `hideOriginal`; v2 → v3 added `dailyTokenLimit` and `prices`.
- `summarizeUsage(store, now)` gives today's and this month's totals per provider; `isDailyLimitReached` and `estimateCost` are pure so the options page, popup, gate, and badge all compute the same answer.
- Defaults come from `src/config/defaults.ts`.

## Tests
- `fakeBrowser` verifies storage areas (no keys in sync), separate per-room entries, migration, and every branch of the translation-possible check (including `budget` and its reset on the next day).
- `usage.test.ts`: aggregation per day and provider, retention pruning, serialized concurrent writes, today / month boundaries, limit judgement, cost estimate. Tests build timestamps with `new Date(y, m, d, 12)` so they do not depend on the time zone.

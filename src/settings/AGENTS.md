# src/settings — settings schema and storage

## Scope
- Types and defaults for global settings, per-room settings, keys, and status (`schema.ts`), migrating stored values to the current schema (`migrate.ts`), reading / writing / subscribing to storage and deciding whether translation is possible (`storage.ts`), and the token usage record (`usage.ts`: per-day, per-provider, per-model totals, local only).
- Out of scope: translation history (the engine's `cache.ts`), UI state.

## Invariants
- API keys are written only to `local:apiKeys`. No function writes a key to sync.
- Global settings are a single `sync:settings` entry; per-room settings are one `sync:room:<room id>` entry per room. Room fields: `incomingDisabled`, optional `name`, `outgoingLang`, `instructions`, and `enterTranslates` (missing = off; no migration, readers compare with `=== true`).
- A room's `instructions` is cut to `DEFAULTS.maxRoomInstructionsChars` on save so the room entry stays under the 8KB sync item limit; whitespace-only removes the field. Read it with `roomInstructions()`, which treats a missing or corrupt value as empty.
- `getGlobalSettings` always returns a complete, migrated value. Corrupt fields fall back to defaults (negative or zero limits, unknown provider ids, non-string languages, etc.).
- `setApiKey` trims surrounding whitespace before saving and clears that provider's invalid-key state.
- `canTranslate()`: globally off → `disabled`; no key for the active provider (for the compatible provider, no custom URL instead of no key) → `no_key`; invalid key → `invalid_key`; today's tokens (input + output, all providers) at or over `dailyTokenLimit` (when > 0) → `budget`; otherwise allowed. The `GateReason` union lives in `schema.ts`.
- Usage is stored in `local:usage` as `{ days: { 'YYYY-MM-DD': { provider: { model: { inputTokens, outputTokens, calls } } } } }`, keyed by this device's local date. Model names are trimmed and cut to `DEFAULTS.maxModelNameChars` (`normalizeModelName`). Records written before per-model storage (a provider value that is itself a totals object) are read as model `''` (shown as "model not recorded"); there is no storage migration. Only the background writes it (`addUsage`); the popup and options read it. Writes prune days older than `DEFAULTS.usageRetentionDays`. Corrupt entries are dropped on read. Clearing translation history does not touch it.
- `dailyTokenLimit` is a non-negative integer (0 = no limit). `prices` are the user's own per-model prices: `{ provider: { model: { input, output } } }`, USD per 1M tokens, non-negative, at most `DEFAULTS.maxCustomPricesPerProvider` models per provider. A model without one uses the built-in price table `src/config/prices.ts` (OpenAI and Anthropic only; the compatible provider has none). Input and output both 0 hides the cost.
- Sync quota errors are rethrown as `SyncQuotaError`.

## Implementation
- When the schema changes, bump `SETTINGS_VERSION` and add a step to `migrateGlobalSettings`. Only known fields are carried over; everything else gets defaults. Current version is 4: v1 → v2 dropped `hideOriginal`; v2 → v3 added `dailyTokenLimit` and `prices`; v3 → v4 turned per-provider prices into per-model prices, moving a non-zero provider price to that provider's stored (or default) model and dropping zero prices.
- `summarizeUsage(store, now)` gives today's and this month's rows (`{ provider, model, totals }`, provider order then most tokens first); `sumRows`, `isDailyLimitReached`, `resolvePrice` (custom first, then built-in), `rowCost`, and `totalCost` (sum of rows with a known price, null if none) are pure so the options page, popup, gate, and badge all compute the same answer.
- Defaults come from `src/config/defaults.ts`.

## Tests
- `fakeBrowser` verifies storage areas (no keys in sync), separate per-room entries, migration, and every branch of the translation-possible check (including `budget` and its reset on the next day).
- `usage.test.ts`: aggregation per day, provider, and model, reading pre-per-model records as model `''`, retention pruning, serialized concurrent writes, today / month boundaries, limit judgement, cost estimate, price resolution (custom over built-in, none for the compatible provider). `src/config/prices.test.ts`: lookup, date-suffixed snapshots, default and recommended models all have a price. Tests build timestamps with `new Date(y, m, d, 12)` so they do not depend on the time zone.

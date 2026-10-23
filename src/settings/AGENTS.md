# src/settings — settings schema and storage

## Scope
- Types and defaults for global settings, per-room settings, keys, and status (`schema.ts`), migrating stored values to the current schema (`migrate.ts`), reading / writing / subscribing to storage and deciding whether translation is possible (`storage.ts`).
- Out of scope: translation history (the engine's `cache.ts`), UI state.

## Invariants
- API keys are written only to `local:apiKeys`. No function writes a key to sync.
- Global settings are a single `sync:settings` entry; per-room settings are one `sync:room:<room id>` entry per room.
- `getGlobalSettings` always returns a complete, migrated value. Corrupt fields fall back to defaults (negative or zero limits, unknown provider ids, non-string languages, etc.).
- `setApiKey` trims surrounding whitespace before saving and clears that provider's invalid-key state.
- `canTranslate()`: globally off → `disabled`; no key for the active provider (for the compatible provider, no custom URL instead of no key) → `no_key`; invalid key → `invalid_key`; otherwise allowed.
- Sync quota errors are rethrown as `SyncQuotaError`.

## Implementation
- When the schema changes, bump `SETTINGS_VERSION` and add a step to `migrateGlobalSettings`. Only known fields are carried over; everything else gets defaults. Current version is 2: v1 → v2 dropped `hideOriginal`.
- Defaults come from `src/config/defaults.ts`.

## Tests
- `fakeBrowser` verifies storage areas (no keys in sync), separate per-room entries, migration, and every branch of the translation-possible check.

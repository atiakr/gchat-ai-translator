# GChat AI Translator

A Chrome extension (Manifest V3) that translates other people's messages in Google Chat (chat.google.com) in real time using the user's own LLM API key, and translates the user's own message for review before it is sent. It is a personal side project with no server: everything runs inside the user's browser, and it is meant to be published on the Chrome Web Store. Stack: WXT + React + TypeScript (strict), checked with Biome and Vitest.

## Project layout

```
gchat-ai-translator/
├── CLAUDE.md                         ← this file (entry point for Claude Code)
├── AGENTS.md                         ← same content (entry point for other coding agents)
├── docs/index.md                     ← public privacy policy (served by GitHub Pages)
├── entrypoints/                      ← WXT entry points (background, content, options, popup) — thin startup code
├── src/
│   ├── gchat/AGENTS.md               ← Google Chat DOM adapter (selectors live only here)
│   ├── providers/AGENTS.md           ← the three translation providers; prompt, parsing, error classification
│   ├── engine/AGENTS.md              ← history, queue, retry, badge, background router
│   ├── content/AGENTS.md             ← content script wiring (limit checks, status map, reporting)
│   ├── ui/AGENTS.md                  ← tokens, Shadow DOM, incoming/outgoing UI, options/popup components
│   ├── settings/AGENTS.md            ← settings schema and storage (keys are local-only)
│   ├── config/                       ← tunable values, language list, permission list
│   ├── messaging/                    ← message kinds and send/receive helpers
│   └── i18n/                         ← message lookup helper
├── public/_locales/{ko,en}/          ← every user-facing string
└── tests/                            ← DOM fixtures, manual checklist, test setup
```

## Core rules

- **API keys live only in `chrome.storage.local`, and translation providers are called only from the background.** Never send a key to the content script or write it to sync storage.
- **The manifest permission list is fixed:** `storage` + 3 host permissions + 3 optional host permissions. Do not add `<all_urls>` or any other permission without the user's approval. `src/config/manifest.test.ts` pins the list.
- **Google Chat DOM selectors live only in `src/gchat/selectors.ts`, and only selectors confirmed on the live page go there.** The adapter never throws.
- **Every user-facing string exists in both Korean and English in `_locales`.**
- **Never add an AI co-author trailer to commit messages.**

## Verification

Run all of these before committing; all must pass.

```
npm run typecheck
npm run lint
npm test
```

Changes that touch the Google Chat page should also be checked against `tests/manual-checklist.md` in a real browser.

## Before you start

- Always: the `AGENTS.md` of the module you are changing.
- When finding or fixing Google Chat page elements: `src/gchat/AGENTS.md` and `tests/fixtures/gchat/README.md`. Confirm a selector on the live page before adding it; never add a guessed one.
- When changing a provider request shape or model: `src/providers/AGENTS.md`. Anthropic requests never send `thinking` or `temperature`.
- When touching keys, permissions, or storage locations: `src/settings/AGENTS.md` and `src/config/permissions.ts`.
- When changing status, limit, or on/off behavior: `src/content/AGENTS.md` and `src/engine/AGENTS.md`.
- When adding a message kind: `src/messaging/protocol.ts` (the only place message kinds are defined).
- When writing a new string: add the key to `public/_locales/ko/messages.json` first (type checking generates the key type from it), then to `en`.

## When something goes wrong

Tell the user immediately if:
- An API key shows up in sync storage, the content script, logs, or error messages.
- A translation call happens while the extension is off or has no key, or the user's own message is translated automatically.
- The extension blocks typing, sending, or scrolling in Google Chat, or an extension error breaks the Google Chat page.
- Outgoing translation sends a message before confirmation (other than a plain Enter in a room where the user turned on quick translate), or sends it to a different conversation.
- The manifest permissions differ from the fixed list.

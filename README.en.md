# GChat AI Translator

A Chrome extension that **auto-translates incoming Google Chat (chat.google.com) messages with your own LLM API key**, and lets you **translate your own message before sending it, with a preview and confirmation**.

[한국어](README.md) · [Privacy Policy](PRIVACY.md) · MIT License

## Why

Google Chat's built-in auto-translation is only available to paid Gemini add-on customers. This extension brings the same experience to personal accounts and basic Workspace plans — **bring your own key (BYOK)**.

## Features

- **Incoming auto-translation**: every message from others visible in a room (new, historical, thread replies) gets a translation right under the original. Messages already in your target language are skipped; edited messages are re-translated.
- **Translate before sending**: a button next to the compose box or `Ctrl/Cmd+Shift+Enter` opens a preview where you can edit the translation and change the language; confirming sends it immediately. Your original text is shown faintly under the sent message (on this device only).
- **Choose your provider**: OpenAI, Claude (Anthropic), or any OpenAI-compatible endpoint (Gemini, OpenRouter, local models, …). Model names are free-form.
- **Cost guards**: batched requests, a local translation history that avoids repeat calls, a per-room auto-translation cap (default 200 messages), and skipping of very long messages (default > 2,000 characters).
- **Fine control**: global switch, per-room off, per-room outgoing language, in-place translation with a "See original" toggle, extra translation instructions ("formal tone", "keep product names in English").
- **Design**: a restrained Toss-style UI, automatic light/dark matching Google Chat, Korean and English UI.

## Install (developer mode)

```bash
git clone https://github.com/atiakr/gchat-ai-translator.git
cd gchat-ai-translator
npm install
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → pick the `.output/chrome-mv3` folder.
3. The settings page opens on first install: pick a provider, paste your API key, and press **Test connection**.
4. Open chat.google.com — incoming messages are translated automatically.

## Settings

| Setting | Description |
|---|---|
| Provider / model | OpenAI · Claude · OpenAI-compatible. Keys are stored per provider so switching is instant. |
| Target language | Language incoming messages are translated into (default Korean) |
| Outgoing language | Default language for translate-before-sending (default English); overridable per room |
| Extra instructions | Free-text instruction appended to every translation |
| Length cap / count cap | Cost guards for auto-translation |
| Clear translation history | Deletes translations and originals stored on this device |

The default shortcut is `Ctrl/Cmd+Shift+Enter` inside the compose box; you can bind an additional key at `chrome://extensions/shortcuts`.

## Privacy

Message text is sent **only to the translation service you chose**; API keys and the translation history stay **on this device**. There is no developer-operated server. See the [Privacy Policy](PRIVACY.md).

## Development

```bash
npm run dev        # dev mode with live reload
npm run typecheck  # TypeScript
npm run lint       # Biome lint + format check
npm test           # Vitest unit tests
npm run build      # production build → .output/chrome-mv3
npm run zip        # zip for store submission
```

Google Chat's DOM is undocumented and may change. All element-matching rules live in `src/gchat/selectors.ts`; when the structure changes and nothing can be found, the extension icon shows a warning badge.

## Roadmap

- Chat inside Gmail
- Home / mentions / search views
- Per-message manual translate button
- Mention- and formatting-preserving outgoing translation
- Chrome Web Store release

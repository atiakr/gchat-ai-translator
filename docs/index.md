# GChat AI Translator 개인정보 처리방침 / Privacy Policy

최종 수정일 / Last updated: 2026-10-23

## 한국어

GChat AI Translator("확장 프로그램")는 Google Chat(chat.google.com) 메시지를 사용자가 직접 입력한 LLM API 키로 번역하는 Chrome 확장 프로그램입니다.

### 수집하지 않는 것
- 확장 프로그램 개발자는 **어떤 데이터도 수집·전송·보관하지 않습니다.** 개발자가 운영하는 서버는 없습니다.
- 사용 통계, 식별자, 계정 정보도 수집하지 않습니다.

### 외부로 전송되는 것
- 번역을 위해 **메시지 본문 텍스트**가 사용자가 설정한 번역 서비스(OpenAI, Anthropic, 또는 사용자가 직접 입력한 OpenAI 호환 주소)로 전송됩니다. 전송은 사용자의 API 키로, 사용자의 브라우저에서 직접 이루어집니다.
- 해당 서비스의 데이터 처리 방식은 각 서비스의 약관과 개인정보 처리방침을 따릅니다.

### 이 기기에 저장되는 것
- API 키는 이 기기의 브라우저 저장소(`chrome.storage.local`)에만 저장되며 Google 계정 동기화 대상이 아닙니다.
- 번역 결과와 원문, 그리고 보내기 전 번역 기능으로 보낸 메시지의 원문이 번역 기록으로 이 기기에 저장됩니다(호출 비용 절감용). 설정 화면의 **"번역 기록 지우기"** 로 언제든 삭제할 수 있습니다.
- 대상 언어, 대화방별 설정 등 나머지 설정은 Chrome 의 계정 동기화 저장소(`chrome.storage.sync`)에 저장됩니다.

### 권한
- `storage`: 설정·키·기록 저장.
- `chat.google.com`: 메시지 화면 읽기와 번역문 표시.
- `api.openai.com`, `api.anthropic.com`: 번역 서비스 호출.
- 사용자가 OpenAI 호환 커스텀 주소를 입력하면 **그 주소에 한해** 추가 접속 권한을 요청합니다.

### 문의
GitHub 저장소 이슈: https://github.com/atiakr/gchat-ai-translator/issues

## English

GChat AI Translator ("the extension") is a Chrome extension that translates Google Chat (chat.google.com) messages using an LLM API key that you provide.

### What we do not collect
- The developer **does not collect, transmit, or store any data.** There is no developer-operated server.
- No usage analytics, identifiers, or account information are collected.

### What leaves your browser
- To translate, the **text of chat messages** is sent to the translation service you configured (OpenAI, Anthropic, or an OpenAI-compatible endpoint you entered). Requests are made directly from your browser with your own API key.
- Handling of that data is governed by the terms and privacy policy of the service you chose.

### What is stored on this device
- Your API keys are stored only in this device's browser storage (`chrome.storage.local`) and are never synced to your Google account.
- Translations, the original texts, and the originals of messages you sent via "translate before sending" are kept on this device as a translation history (to avoid repeated API calls). You can delete it any time with **"Clear translation history"** in the settings page.
- Other settings (target language, per-room settings, …) are stored in Chrome's account-synced storage (`chrome.storage.sync`).

### Permissions
- `storage`: settings, keys, and history.
- `chat.google.com`: reading the chat screen and showing translations.
- `api.openai.com`, `api.anthropic.com`: calling the translation services.
- If you enter a custom OpenAI-compatible URL, access is requested **for that origin only**.

### Contact
GitHub issues: https://github.com/atiakr/gchat-ai-translator/issues

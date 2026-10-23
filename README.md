# GChat AI Translator

Google Chat(chat.google.com)에서 **상대방 메시지를 내 LLM API 키로 실시간 자동 번역**하고, **보내기 전에 내 메시지를 번역해 확인 후 전송**하는 Chrome 확장 프로그램입니다.

[English](README.en.md) · [개인정보 처리방침](PRIVACY.md) · MIT License

## 왜 필요한가

Google Chat 의 공식 자동 번역은 유료 Gemini 부가기능 고객만 쓸 수 있습니다. 이 확장은 개인 계정·기본 플랜 사용자도 **자기 API 키(BYOK)** 로 같은 경험을 얻게 해 줍니다.

## 기능

- **수신 자동 번역**: 대화방 화면에 보이는 상대방 메시지(새 메시지·과거 메시지·스레드 답글)를 원문 아래에 번역해 붙입니다. 원문 언어가 대상 언어와 같으면 건너뜁니다. 수정된 메시지는 다시 번역합니다.
- **보내기 전 번역**: 입력창 옆 버튼 또는 `Ctrl/Cmd+Shift+Enter` → 미리보기에서 번역문을 고치고 언어를 바꾼 뒤 확인하면 바로 전송됩니다. 보낸 뒤 내 메시지 아래에 원문이 흐리게 표시됩니다(이 기기에서만).
- **번역 서비스 선택**: OpenAI, Claude(Anthropic), OpenAI 호환 커스텀 주소(Gemini·OpenRouter·로컬 모델 등). 모델 이름은 자유 입력.
- **비용 가드**: 여러 메시지를 한 번에 묶어 호출, 번역 기록 재사용, 대화방당 자동 번역 상한(기본 200건), 긴 메시지(기본 2,000자 초과) 건너뜀.
- **세밀한 제어**: 전체 스위치, 대화방별 끄기, 대화방별 발신 언어, 원문 자리를 대신하는 번역문과 [원문보기] 토글, 추가 번역 지시문("존댓말로", "제품명은 영어 그대로").
- **디자인**: 토스 스타일의 절제된 UI, Google Chat 라이트·다크 테마 자동 대응, 한국어·영어 UI.

## 설치 (개발자 모드)

```bash
git clone https://github.com/atiakr/gchat-ai-translator.git
cd gchat-ai-translator
npm install
npm run build
```

1. Chrome 에서 `chrome://extensions` 를 열고 **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다** → `.output/chrome-mv3` 폴더를 선택합니다.
3. 설치 직후 열리는 설정 화면에서 번역 서비스와 API 키를 입력하고 **연결 테스트**를 눌러 확인합니다.
4. chat.google.com 을 열면 상대방 메시지가 자동으로 번역됩니다.

## 설정

| 항목 | 설명 |
|---|---|
| 번역 서비스 / 모델 | OpenAI · Claude · OpenAI 호환. 서비스별 API 키는 따로 저장되어 전환이 즉시 됩니다. |
| 대상 언어 | 수신 메시지를 번역할 언어 (기본 한국어) |
| 보낼 때 언어 | 발신 번역 기본 언어 (기본 영어). 대화방별로 바꿀 수 있습니다. |
| 추가 번역 지시 | 모든 번역에 덧붙는 자유 지시문 |
| 길이 상한 / 건수 상한 | 자동 번역 비용 가드 |
| 번역 기록 지우기 | 이 기기에 저장된 번역·원문 기록 삭제 |

단축키는 입력창에서 `Ctrl/Cmd+Shift+Enter` 가 기본이며, `chrome://extensions/shortcuts` 에서 다른 키를 추가로 매길 수 있습니다.

## 개인정보

메시지 본문은 **사용자가 선택한 번역 서비스로만** 전송되고, API 키와 번역 기록은 **이 기기에만** 저장됩니다. 개발자가 운영하는 서버는 없습니다. 자세한 내용은 [개인정보 처리방침](PRIVACY.md)을 보세요.

## 개발

```bash
npm run dev        # 개발 모드 (수정 즉시 반영)
npm run typecheck  # 타입 검사
npm run lint       # Biome 린트·포맷 검사
npm test           # Vitest 단위 테스트
npm run build      # 프로덕션 빌드 → .output/chrome-mv3
npm run zip        # 스토어 제출용 zip
```

Google Chat 의 화면 구조는 비공개라 바뀔 수 있습니다. 화면 요소를 찾는 규칙은 `src/gchat/selectors.ts` 한 곳에만 있으며, 구조가 바뀌어 동작하지 않으면 확장 아이콘에 경고 배지가 표시됩니다.

## 로드맵

- Gmail 안 Chat 탭 지원
- 홈·멘션·검색 화면 지원
- 메시지별 수동 번역 버튼
- 멘션·서식을 보존한 발신 번역
- Chrome Web Store 공개

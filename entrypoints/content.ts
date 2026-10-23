import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContentController } from '../src/content/controller';

/**
 * Google Chat 은 URL 이 `/app/home` 에 머문 채 방을 바꾸는 SPA 라 WXT 의 URL 변경 감지는 쓰지 않는다.
 * 방 전환·새 메시지는 컨트롤러가 MutationObserver 틱으로 따라간다.
 */
export default defineContentScript({
  matches: ['https://chat.google.com/*'],
  runAt: 'document_idle',
  main() {
    const controller = createContentController();
    controller.start().catch((error: unknown) => {
      // 시작 실패가 Google Chat 화면에 번지지 않게 한다.
      console.warn('[gchat-ai-translator] content start failed', error);
    });
  },
});

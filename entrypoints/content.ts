import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['https://chat.google.com/*'],
  runAt: 'document_idle',
  main() {
    // 화면 감지·UI 삽입은 이후 작업에서 연결된다.
  },
});

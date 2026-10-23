import { defineConfig } from 'wxt';

// 권한·host 목록은 권한 고정 목록과 정확히 일치해야 하며 테스트(src/config/manifest.test.ts)로 고정된다.
export const HOST_PERMISSIONS = [
  'https://chat.google.com/*',
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
] as const;

export const OPTIONAL_HOST_PERMISSIONS = [
  'https://*/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
] as const;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ko',
    permissions: ['storage'],
    host_permissions: [...HOST_PERMISSIONS],
    optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],
    commands: {
      'translate-outgoing': {
        description: '__MSG_commandTranslateOutgoing__',
      },
    },
    action: {
      default_title: '__MSG_extName__',
    },
  },
});

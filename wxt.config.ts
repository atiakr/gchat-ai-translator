import { defineConfig } from 'wxt';
import { HOST_PERMISSIONS, OPTIONAL_HOST_PERMISSIONS, PERMISSIONS } from './src/config/permissions';

// 권한·host 목록은 src/config/permissions.ts 가 소유하고 테스트(manifest.test.ts)로 고정된다.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ko',
    permissions: [...PERMISSIONS],
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

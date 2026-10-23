/** manifest 권한 목록. 테스트(manifest.test.ts)로 고정된다. */
export const PERMISSIONS = ['storage'] as const;

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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOST_PERMISSIONS, OPTIONAL_HOST_PERMISSIONS, PERMISSIONS } from './permissions';

/** 권한 목록을 정확히 고정한다. */
describe('manifest permissions', () => {
  it('허용 목록은 권한 고정 목록과 정확히 일치한다', () => {
    expect([...PERMISSIONS]).toEqual(['storage']);
    expect([...HOST_PERMISSIONS]).toEqual([
      'https://chat.google.com/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
    ]);
    expect([...OPTIONAL_HOST_PERMISSIONS]).toEqual([
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ]);
    for (const p of [...HOST_PERMISSIONS, ...OPTIONAL_HOST_PERMISSIONS])
      expect(p).not.toBe('<all_urls>');
  });

  it('빌드된 manifest 가 있으면 그 내용도 같아야 한다', () => {
    const path = resolve(process.cwd(), '.output/chrome-mv3/manifest.json');
    if (!existsSync(path)) return;
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual([...PERMISSIONS]);
    expect(manifest.host_permissions).toEqual([...HOST_PERMISSIONS]);
    expect(manifest.optional_host_permissions).toEqual([...OPTIONAL_HOST_PERMISSIONS]);
    const commands = manifest.commands as Record<string, { suggested_key?: unknown }>;
    expect(commands['translate-outgoing']).toBeDefined();
    expect(commands['translate-outgoing']?.suggested_key).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    expect(JSON.stringify(manifest)).not.toContain('mail.google.com');
  });
});

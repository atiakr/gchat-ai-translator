import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import enMessages from '../../public/_locales/en/messages.json';
import koMessages from '../../public/_locales/ko/messages.json';
import config from '../../wxt.config';
import { HOST_PERMISSIONS, OPTIONAL_HOST_PERMISSIONS, PERMISSIONS } from './permissions';

/** manifest 권한은 고정 목록이다. 이 테스트가 정확한 목록을 고정한다. */

interface ManifestLike {
  default_locale?: string;
  permissions?: unknown;
  host_permissions?: unknown;
  optional_host_permissions?: unknown;
  commands?: Record<string, { suggested_key?: unknown }>;
}

function configManifest(): ManifestLike {
  const manifest = config.manifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest must be a plain object');
  return manifest as ManifestLike;
}

function assertManifest(manifest: ManifestLike): void {
  expect(manifest.permissions).toEqual([...PERMISSIONS]);
  expect(manifest.host_permissions).toEqual([...HOST_PERMISSIONS]);
  expect(manifest.optional_host_permissions).toEqual([...OPTIONAL_HOST_PERMISSIONS]);
  const commands = manifest.commands ?? {};
  expect(commands['translate-outgoing']).toBeDefined();
  expect(commands['translate-outgoing']?.suggested_key).toBeUndefined();
  expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  expect(JSON.stringify(manifest)).not.toContain('mail.google.com');
}

describe('manifest permissions', () => {
  it('허용 목록은 고정 목록과 정확히 일치한다', () => {
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

  it('wxt.config.ts 의 manifest 가 고정 목록을 그대로 쓴다(빌드 없이 검사)', () => {
    assertManifest(configManifest());
  });

  it('기본 언어는 영어이고 두 언어 파일의 키 집합이 같다', () => {
    expect(configManifest().default_locale).toBe('en');
    expect(Object.keys(koMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it('빌드된 manifest 가 있으면 그 내용도 같아야 한다', () => {
    const path = resolve(process.cwd(), '.output/chrome-mv3/manifest.json');
    if (!existsSync(path)) return;
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.default_locale).toBe('en');
    assertManifest(manifest as ManifestLike);
  });
});

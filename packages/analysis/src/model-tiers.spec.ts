import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_MANIFEST, selectModelTier, type ModelManifestEntry } from './model-tiers.js';

const GB = 1024;

describe('selectModelTier', () => {
  it('picks the highest tier that fits the free VRAM', () => {
    expect(selectModelTier(16 * GB).name).toBe('gpt-oss:20b');
    expect(selectModelTier(14 * GB).name).toBe('gpt-oss:20b');
    expect(selectModelTier(13 * GB).name).toBe('gemma3:12b');
    expect(selectModelTier(12 * GB).name).toBe('gemma3:12b');
    expect(selectModelTier(9 * GB).name).toBe('qwen3.5:9b');
    expect(selectModelTier(8 * GB).name).toBe('qwen3.5:9b');
  });

  it('falls back to the lowest tier under the smallest threshold', () => {
    expect(selectModelTier(0).name).toBe('qwen3.5:4b');
    expect(selectModelTier(2048).name).toBe('qwen3.5:4b');
  });

  it('respects an injected manifest override', () => {
    const custom: ModelManifestEntry[] = [
      { name: 'big', digest: 'TBD', minFreeVramMb: 20 * GB, license: 'x' },
      { name: 'small', digest: 'TBD', minFreeVramMb: 4 * GB, license: 'x' },
    ];
    expect(selectModelTier(24 * GB, custom).name).toBe('big');
    expect(selectModelTier(10 * GB, custom).name).toBe('small');
    expect(selectModelTier(0, custom).name).toBe('small');
  });

  it('tolerates an unsorted manifest by sorting internally', () => {
    const custom: ModelManifestEntry[] = [
      { name: 'small', digest: 'TBD', minFreeVramMb: 0, license: 'x' },
      { name: 'big', digest: 'TBD', minFreeVramMb: 14 * GB, license: 'x' },
    ];
    expect(selectModelTier(15 * GB, custom).name).toBe('big');
  });

  it('throws on an empty manifest', () => {
    expect(() => selectModelTier(16 * GB, [])).toThrow('empty');
  });

  it('pins qwen3.5:9b to the digest verified on the dev host', () => {
    const entry = DEFAULT_MODEL_MANIFEST.find((e) => e.name === 'qwen3.5:9b');
    expect(entry?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('keeps unpinned tiers marked TBD with licenses recorded', () => {
    for (const e of DEFAULT_MODEL_MANIFEST) {
      expect(e.license.length).toBeGreaterThan(0);
      expect(e.digest === 'TBD' || /^sha256:[0-9a-f]{64}$/.test(e.digest)).toBe(true);
    }
  });

  it('falls back to the lowest tier on non-finite or negative input', () => {
    expect(selectModelTier(NaN).name).toBe('qwen3.5:4b');
    expect(selectModelTier(-1).name).toBe('qwen3.5:4b');
    expect(selectModelTier(Infinity).name).toBe('gpt-oss:20b');
  });

  it('does not mutate the injected manifest', () => {
    const custom: ModelManifestEntry[] = [
      { name: 'small', digest: 'TBD', minFreeVramMb: 0, license: 'x' },
      { name: 'big', digest: 'TBD', minFreeVramMb: 14 * GB, license: 'x' },
    ];
    selectModelTier(15 * GB, custom);
    expect(custom.map((e) => e.name)).toEqual(['small', 'big']);
  });
});

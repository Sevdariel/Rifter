/**
 * Model tier map: selects the served model by free VRAM *at inference time*
 * (after the game ends — not at install or menu time). The manifest pins
 * name + digest per tier; digests marked `TBD` until models are pulled and
 * the eval harness picks final checkpoints. Each entry records its license
 * family — Qwen checkpoints are Apache-2.0, but license verification is part
 * of the pinning process because newer/derivative variants differ.
 *
 * VRAM probing itself is platform-specific (`nvidia-smi`, Metal) and lives
 * in `apps/api`; the package only owns the `VramProbe` contract and the pure
 * selection function.
 */

export interface ModelManifestEntry {
  /** Ollama model tag, e.g. `qwen3.5:9b`. */
  name: string;
  /**
   * Pinned model digest in OCI form `sha256:<hex>` — same format the report
   * metadata records via `ollamaModelDigest`. `TBD` until pulled and
   * eval-verified.
   */
  digest: string;
  /** Policy floor in MiB — free VRAM needed to select this tier, including headroom for context/KV cache beyond the raw served weights. */
  minFreeVramMb: number;
  /** License family of the checkpoint — verified at pin time. */
  license: string;
  /** Optional note for operators (expected size, fallback behavior). */
  note?: string;
}

export interface VramProbe {
  /** Free VRAM in MiB at call time; throws when detection is unavailable. */
  probeFreeVramMb(): Promise<number>;
}

const GB = 1024;

/**
 * Default tier map, highest VRAM first. Thresholds follow the issue spec:
 * >=14 GB flagship, ~12 GB mid, ~8 GB small (verified pulled locally),
 * below that a degraded small-model fallback.
 */
export const DEFAULT_MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    name: 'gpt-oss:20b',
    digest: 'TBD',
    minFreeVramMb: 14 * GB,
    license: 'Apache-2.0',
    note: 'Default tier on a 16 GB card (RTX 5080); requires ~13 GB served.',
  },
  {
    name: 'gemma3:12b',
    digest: 'TBD',
    minFreeVramMb: 12 * GB,
    license: 'Gemma Terms of Use',
    note: 'Mid tier; ~8 GB weights but the floor reserves headroom for context/KV cache and the vision projector. Gemma ToU permits commercial use with usage-policy obligations.',
  },
  {
    name: 'qwen3.5:9b',
    digest: 'sha256:56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90',
    minFreeVramMb: 8 * GB,
    license: 'Apache-2.0',
    note: 'Verified pulled and producing validated reports end-to-end.',
  },
  {
    name: 'qwen3.5:4b',
    digest: 'TBD',
    minFreeVramMb: 0,
    license: 'Apache-2.0',
    note: 'Degraded fallback for low-VRAM hosts; expect weaker coaching quality.',
  },
];

/**
 * Picks the highest manifest tier the free VRAM can serve. `manifest` is
 * injectable so ops can override tiers/digests without a code change.
 * Throws when the manifest is empty — a config fault, not a runtime data
 * problem.
 */
export function selectModelTier(
  freeVramMb: number,
  manifest: ModelManifestEntry[] = DEFAULT_MODEL_MANIFEST,
): ModelManifestEntry {
  if (manifest.length === 0) {
    throw new Error('model manifest is empty — no tier to select');
  }
  const sorted = [...manifest].sort((a, b) => b.minFreeVramMb - a.minFreeVramMb);
  return sorted.find((e) => freeVramMb >= e.minFreeVramMb) ?? sorted[sorted.length - 1]!;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { VramProbe } from "@rifter/analysis";

import type { ExecFile } from "./ollama.types";

const execFileAsync = promisify(execFile);

/**
 * Free VRAM via `nvidia-smi` — the probe the API supports on its
 * Windows/Linux dev hosts. Throws when the binary is absent or the output is
 * unparseable; callers fall back to the lowest manifest tier.
 */
export class NvidiaSmiVramProbe implements VramProbe {
  public constructor(private readonly execFileImpl: ExecFile = execFileAsync) {}

  public async probeFreeVramMb(): Promise<number> {
    const { stdout } = await this.execFileImpl("nvidia-smi", [
      "--query-gpu=memory.free",
      "--format=csv,noheader,nounits",
    ]);
    const freeMb = Number.parseInt(stdout.trim().split("\n")[0] ?? "", 10);
    if (!Number.isFinite(freeMb)) {
      throw new Error(`nvidia-smi returned unparseable memory.free: ${stdout.trim()}`);
    }
    return freeMb;
  }
}

/** Env override first (non-NVIDIA hosts), else the nvidia-smi probe. */
export function createVramProbe(forcedFreeVramMb?: number, execFileImpl?: ExecFile): VramProbe {
  if (forcedFreeVramMb !== undefined) {
    const fixed = forcedFreeVramMb;
    const envProbe: VramProbe = {
      probeFreeVramMb: () => Promise.resolve(fixed),
    };
    return envProbe;
  }
  const probe = new NvidiaSmiVramProbe(execFileImpl);
  return probe;
}

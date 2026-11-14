import { describe, expect, it, vi } from "vitest";

import { createVramProbe, NvidiaSmiVramProbe } from "./vram-probe";

describe("NvidiaSmiVramProbe", () => {
  it("parses the first GPU's free memory", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "14123\n" });
    const probe = new NvidiaSmiVramProbe(execFile);
    await expect(probe.probeFreeVramMb()).resolves.toBe(14123);
    expect(execFile).toHaveBeenCalledWith("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader,nounits"]);
  });

  it("uses the first GPU on multi-GPU output", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "14000\n6000\n" });
    const probe = new NvidiaSmiVramProbe(execFile);
    await expect(probe.probeFreeVramMb()).resolves.toBe(14000);
  });

  it("throws on unparseable output and on exec failure", async () => {
    const garbage = new NvidiaSmiVramProbe(vi.fn().mockResolvedValue({ stdout: "N/A\n" }));
    await expect(garbage.probeFreeVramMb()).rejects.toThrow("unparseable");
    const missing = new NvidiaSmiVramProbe(vi.fn().mockRejectedValue(new Error("spawn nvidia-smi ENOENT")));
    await expect(missing.probeFreeVramMb()).rejects.toThrow("ENOENT");
  });
});

describe("createVramProbe", () => {
  it("returns the env-forced value without probing", async () => {
    const probe = createVramProbe(9000);
    await expect(probe.probeFreeVramMb()).resolves.toBe(9000);
  });

  it("falls back to the nvidia-smi probe without an override", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "16000\n" });
    const probe = createVramProbe(undefined, execFile);
    await expect(probe.probeFreeVramMb()).resolves.toBe(16000);
  });
});

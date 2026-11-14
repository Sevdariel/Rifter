import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalysisError, DEFAULT_MODEL_MANIFEST, type VramProbe } from "@rifter/analysis";

import type { Env } from "../config/env.validation";
import { OllamaService } from "./ollama.service";

const PINNED = DEFAULT_MODEL_MANIFEST.find((e) => e.digest !== "TBD")!;
const LOWEST = DEFAULT_MODEL_MANIFEST[DEFAULT_MODEL_MANIFEST.length - 1]!;

function makeService(env: Partial<Env> = {}): OllamaService {
  const map: Record<string, unknown> = {
    OLLAMA_BASE_URL: "http://localhost:11434",
    ...env,
  };
  const config = { get: (key: string) => map[key] } as unknown as ConfigService<Env, true>;
  return new OllamaService(config);
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tagsResponse(models: { name: string; digest?: string }[]): Response {
  return Response.json({ models });
}

describe("OllamaService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detect reports reachability without touching models", async () => {
    stubFetch(() => new Response('{"version":"0.12.6"}'));
    await expect(makeService().detect()).resolves.toBe(true);

    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(makeService().detect()).resolves.toBe(false);
  });

  it("forced model skips tier selection and pinning", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/api/tags")) return tagsResponse([{ name: "custom:7b", digest: "abc" }]);
      throw new Error(`unexpected call ${url}`);
    });
    const resolved = await makeService({ OLLAMA_MODEL: "custom:7b" }).resolveModel();
    expect(resolved).toEqual({ name: "custom:7b", digest: "sha256:abc", pinned: false });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/pull"), expect.anything());
  });

  it("pulls a missing model before serving", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/tags")) return tagsResponse([]);
      if (url.endsWith("/api/pull")) return new Response("{}");
      throw new Error(`unexpected call ${url}`);
    });
    const resolved = await makeService({ OLLAMA_MODEL: "fresh:3b" }).resolveModel();
    expect(resolved.name).toBe("fresh:3b");
    expect(calls).toContain("POST http://localhost:11434/api/pull");
  });

  it("selects the pinned tier for the env-forced VRAM and verifies the digest", async () => {
    // qwen3.5:9b needs >= 8192 MiB free; serve the pinned digest (bare hex,
    // the /api/tags form — the client normalizes to OCI form).
    stubFetch((url) => {
      if (url.endsWith("/api/tags")) {
        return tagsResponse([{ name: PINNED.name, digest: PINNED.digest.replace("sha256:", "") }]);
      }
      throw new Error(`unexpected call ${url}`);
    });
    const resolved = await makeService({ OLLAMA_FREE_VRAM_MB: PINNED.minFreeVramMb }).resolveModel();
    expect(resolved).toEqual({ name: PINNED.name, digest: PINNED.digest, pinned: true });
  });

  it("fails closed when the served digest differs from the manifest pin", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/tags")) return tagsResponse([{ name: PINNED.name, digest: "deadbeef" }]);
      throw new Error(`unexpected call ${url}`);
    });
    await expect(makeService({ OLLAMA_FREE_VRAM_MB: PINNED.minFreeVramMb }).resolveModel()).rejects.toBeInstanceOf(
      AnalysisError,
    );
  });

  it("falls back to the lowest tier when the VRAM probe fails", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/tags")) return tagsResponse([{ name: LOWEST.name, digest: "aa" }]);
      throw new Error(`unexpected call ${url}`);
    });
    const service = makeService();
    // No OLLAMA_FREE_VRAM_MB and no nvidia-smi in the test env: inject a failing
    // probe directly to simulate both.
    const failingProbe: VramProbe = { probeFreeVramMb: () => Promise.reject(new Error("no gpu")) };
    (service as unknown as { vramProbe: VramProbe }).vramProbe = failingProbe;
    const resolved = await service.resolveModel();
    expect(resolved.name).toBe(LOWEST.name);
    expect(resolved.pinned).toBe(true);
  });

  it("clientConfig carries baseUrl, model, timeout, and the think flag", () => {
    const cfg = makeService().clientConfig("m:1");
    expect(cfg).toMatchObject({ baseUrl: "http://localhost:11434", model: "m:1", timeoutMs: 120_000, think: false });
    const thinking = makeService({ OLLAMA_THINK: true }).clientConfig("m:1");
    expect(thinking.think).toBe(true);
  });
});

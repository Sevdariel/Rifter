import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  AnalysisError,
  DEFAULT_MODEL_MANIFEST,
  ollamaModelDigest,
  selectModelTier,
  type OllamaClientConfig,
  type VramProbe,
} from "@rifter/analysis";

import type { Env } from "../config/env.validation";
import type { OllamaServiceConfig, OllamaTagsResponse, ResolvedModel } from "./ollama.types";
import { createVramProbe } from "./vram-probe";

const DETECT_TIMEOUT_MS = 5000;
const PULL_TIMEOUT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Ollama lifecycle: detect/attach on loopback, manifest-only pull,
 * verify-before-serve. The worker resolves a model per job — selection uses
 * free VRAM at inference time, never install-time state.
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly ollamaServiceConfig: OllamaServiceConfig;
  private readonly vramProbe: VramProbe;

  public constructor(private readonly configService: ConfigService<Env, true>) {
    const baseUrl = configService.get("OLLAMA_BASE_URL", { infer: true });
    const forcedFreeVramMb = configService.get("OLLAMA_FREE_VRAM_MB", { infer: true });
    const config: OllamaServiceConfig = {
      baseUrl,
      forcedModel: configService.get("OLLAMA_MODEL", { infer: true }),
      forcedFreeVramMb,
      pullTimeoutMs: PULL_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      think: configService.get("OLLAMA_THINK", { infer: true }) ?? false,
    };
    this.ollamaServiceConfig = config;
    this.vramProbe = createVramProbe(forcedFreeVramMb);
  }

  /** Cheap reachability check — `/api/version`, no model work. */
  public async detect(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.ollamaServiceConfig.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Picks the served model for the next job: env-forced tag, else the best
   * manifest tier the current free VRAM can serve. Pulls a missing model
   * (manifest names only) and verifies the served digest against the pin —
   * a swapped checkpoint fails the job instead of silently changing output.
   */
  public async resolveModel(): Promise<ResolvedModel> {
    const { forcedModel } = this.ollamaServiceConfig;
    if (forcedModel) {
      await this.ensurePresent(forcedModel);
      const digest = await this.digestOf(forcedModel);
      const resolved: ResolvedModel = { name: forcedModel, digest, pinned: false };
      return resolved;
    }

    const freeVramMb = await this.probeFreeVram();
    const entry = selectModelTier(freeVramMb, DEFAULT_MODEL_MANIFEST);
    this.logger.log(`selected model ${entry.name} (free VRAM ${freeVramMb} MiB)`);
    await this.ensurePresent(entry.name);
    const digest = await this.digestOf(entry.name);
    if (entry.digest !== "TBD" && digest !== entry.digest) {
      throw new AnalysisError(
        "ollama",
        `model ${entry.name} digest mismatch: manifest pins ${entry.digest}, Ollama serves ${digest ?? "none"}`,
      );
    }
    const resolved: ResolvedModel = { name: entry.name, digest, pinned: true };
    return resolved;
  }

  /** Generate-call config for `ollamaGenerateJson` — one per resolved model. */
  public clientConfig(modelName: string): OllamaClientConfig {
    const config: OllamaClientConfig = {
      baseUrl: this.ollamaServiceConfig.baseUrl,
      model: modelName,
      timeoutMs: this.ollamaServiceConfig.requestTimeoutMs,
      think: this.ollamaServiceConfig.think,
      fetchImpl: this.fetchImpl,
    };
    return config;
  }

  private async probeFreeVram(): Promise<number> {
    try {
      const freeMb = await this.vramProbe.probeFreeVramMb();
      return freeMb;
    } catch (error: unknown) {
      // Probe failure degrades to the lowest manifest tier rather than
      // blocking analysis on hosts without nvidia-smi.
      const label = error instanceof Error ? error.message : String(error);
      this.logger.warn(`VRAM probe failed (${label}); selecting the lowest model tier`);
      return 0;
    }
  }

  /** Manifest-only pull: only names the caller resolved may be fetched. */
  private async ensurePresent(name: string): Promise<void> {
    const res = await this.fetchImpl(`${this.ollamaServiceConfig.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(this.ollamaServiceConfig.requestTimeoutMs),
    });
    if (!res.ok) {
      throw new AnalysisError("ollama", `Ollama /api/tags failed with HTTP ${res.status}`);
    }
    const body = (await res.json()) as OllamaTagsResponse;
    const present = body.models?.some((m) => m.name === name || m.model === name || m.name === `${name}:latest`);
    if (present) return;

    this.logger.log(`pulling model ${name}`);
    const pull = await this.fetchImpl(`${this.ollamaServiceConfig.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.ollamaServiceConfig.pullTimeoutMs),
      body: JSON.stringify({ name, stream: false }),
    });
    if (!pull.ok) {
      throw new AnalysisError("ollama", `Ollama pull of ${name} failed with HTTP ${pull.status}: ${await pull.text()}`);
    }
  }

  private async digestOf(name: string): Promise<string | null> {
    const digest = await ollamaModelDigest({
      baseUrl: this.ollamaServiceConfig.baseUrl,
      model: name,
      timeoutMs: this.ollamaServiceConfig.requestTimeoutMs,
      fetchImpl: this.fetchImpl,
    });
    return digest;
  }

  private get fetchImpl(): typeof fetch {
    return this.ollamaServiceConfig.fetchImpl ?? globalThis.fetch;
  }
}

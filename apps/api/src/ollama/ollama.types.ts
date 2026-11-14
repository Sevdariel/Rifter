import type { OllamaClientConfig } from "@rifter/analysis";

/** Everything the worker needs to serve one analysis run. */
export interface ResolvedModel {
  /** Ollama model tag that is verified present and digest-checked. */
  name: string;
  /** Served digest from `/api/tags` (OCI form), null when Ollama did not report one. */
  digest: string | null;
  /** True when the name came from the pinned manifest; false for env-forced tags. */
  pinned: boolean;
}

/** Runtime knobs for the Ollama lifecycle; built from env in the module factory. */
export interface OllamaServiceConfig {
  baseUrl: string;
  /** Env-forced model tag — skips tier selection and manifest pinning. */
  forcedModel?: string;
  /** Env-forced free VRAM in MiB — skips the nvidia-smi probe. */
  forcedFreeVramMb?: number;
  /** Pulls download gigabytes — far above the per-request timeout. */
  pullTimeoutMs: number;
  requestTimeoutMs: number;
  /** `OLLAMA_THINK` — chain-of-thought capture for debug runs. */
  think: boolean;
  /** Injectable for recorded-response tests. */
  fetchImpl?: OllamaClientConfig["fetchImpl"];
}

/** `/api/tags` response — only the fields the lifecycle checks. */
export interface OllamaTagsResponse {
  models?: { name?: string; model?: string }[];
}

/** Promisified `execFile` shape — injectable so specs never spawn a process. */
export type ExecFile = (file: string, args: string[]) => Promise<{ stdout: string }>;

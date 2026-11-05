import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.validation";

const BASE = { API_AUTH_TOKEN: "test-token-123456" };

describe("validateEnv", () => {
  it("applies defaults and coerces PORT", () => {
    const env = validateEnv({ ...BASE, PORT: "3001" });
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3001);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:4200"]);
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
    expect(env.OLLAMA_THINK).toBe(false);
    expect(env.JOB_RETENTION_DAYS).toBe(30);
  });

  it("rejects an invalid PORT", () => {
    expect(() => validateEnv({ ...BASE, PORT: "not-a-port" })).toThrow();
  });

  it("requires API_AUTH_TOKEN with a minimum length", () => {
    expect(() => validateEnv({})).toThrow();
    expect(() => validateEnv({ API_AUTH_TOKEN: "short" })).toThrow();
  });

  it("splits CORS_ORIGINS into a trimmed list", () => {
    const env = validateEnv({ ...BASE, CORS_ORIGINS: " http://localhost:4200 , https://rifter.example " });
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:4200", "https://rifter.example"]);
  });

  it("enforces a loopback OLLAMA_BASE_URL", () => {
    for (const url of ["http://127.0.0.1:11434", "http://[::1]:11434", "http://localhost:11434"]) {
      expect(validateEnv({ ...BASE, OLLAMA_BASE_URL: url }).OLLAMA_BASE_URL).toBe(url);
    }
    for (const url of ["http://192.168.1.10:11434", "https://ollama.example.com", "http://0.0.0.0:11434"]) {
      expect(() => validateEnv({ ...BASE, OLLAMA_BASE_URL: url })).toThrow();
    }
  });

  it("parses OLLAMA_THINK only from explicit true", () => {
    expect(validateEnv({ ...BASE, OLLAMA_THINK: "true" }).OLLAMA_THINK).toBe(true);
    expect(validateEnv({ ...BASE, OLLAMA_THINK: "false" }).OLLAMA_THINK).toBe(false);
    expect(() => validateEnv({ ...BASE, OLLAMA_THINK: "yes" })).toThrow();
  });
});

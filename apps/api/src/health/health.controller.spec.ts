import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";
import { HealthModule } from "./health.module";

describe("HealthController", () => {
  it("returns ok from /health handler", async () => {
    const module = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    const controller = module.get(HealthController);
    await expect(controller.check()).resolves.toEqual({ status: "ok", db: "disabled" });
  });

  it("reports db up when the handle answers", async () => {
    const handle = { db: { execute: async () => [] }, client: {} };
    const controller = new HealthController(handle as never);
    await expect(controller.check()).resolves.toEqual({ status: "ok", db: "up" });
  });

  it("reports db down when the handle rejects", async () => {
    const handle = {
      db: { execute: async () => Promise.reject(new Error("refused")) },
      client: {},
    };
    const controller = new HealthController(handle as never);
    await expect(controller.check()).resolves.toEqual({ status: "ok", db: "down" });
  });
});

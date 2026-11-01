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
    expect(controller.check()).toEqual({ status: "ok" });
  });
});

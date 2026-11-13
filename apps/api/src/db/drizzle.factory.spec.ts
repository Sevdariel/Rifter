import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import type { Env } from "../config/env.validation";
import { drizzleFactory } from "./drizzle.factory";

const configWith = (url: string | undefined) => ({ get: () => url }) as unknown as ConfigService<Env, true>;

describe("drizzleFactory", () => {
  it("returns null without DATABASE_URL", () => {
    const handle = drizzleFactory(configWith(undefined));
    expect(handle).toBeNull();
  });

  it("returns a handle when DATABASE_URL is set", async () => {
    const handle = drizzleFactory(configWith("postgres://rifter:rifter@localhost:1/rifter"));
    expect(handle?.db).toBeDefined();
    await handle?.client.end();
  });
});

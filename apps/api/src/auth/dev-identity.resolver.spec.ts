import { describe, expect, it } from "vitest";

import { ApiException } from "../shared/errors";
import { DevIdentityResolver } from "./dev-identity.resolver";

const configWith = (puuid?: string) => ({ get: () => puuid }) as never;

describe("DevIdentityResolver", () => {
  it("resolves to DEV_PUUID", async () => {
    await expect(new DevIdentityResolver(configWith("abc-puuid")).resolve()).resolves.toEqual({
      puuid: "abc-puuid",
    });
  });

  it("fails closed when DEV_PUUID is unset", async () => {
    await expect(new DevIdentityResolver(configWith(undefined)).resolve()).rejects.toBeInstanceOf(ApiException);
  });
});

import { describe, expect, it } from "vitest";

import { createDatabase } from "./database";

describe("createDatabase", () => {
  it("returns a lazy handle without dialing out", async () => {
    const handle = createDatabase("postgres://rifter:rifter@localhost:1/rifter");
    expect(handle.db).toBeDefined();
    expect(handle.client).toBeDefined();
    await handle.client.end();
  });
});

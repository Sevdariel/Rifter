import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "./api-exception.filter";
import { ApiException, type ApiErrorBody } from "./errors";

function fakeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  const body = () => json.mock.calls[0]?.[0] as ApiErrorBody;
  return { host, status, body };
}

describe("ApiExceptionFilter", () => {
  const filter = new ApiExceptionFilter();

  it("maps ApiException to its code, message, and fields", () => {
    const { host, status, body } = fakeHost();
    filter.catch(ApiException.validation({ name: ["Required"] }), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(body()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed", fields: { name: ["Required"] } },
    });
  });

  it("maps framework HttpExceptions to generic per-status bodies", () => {
    const { host, status, body } = fakeHost();
    filter.catch(new HttpException("sensitive internals", HttpStatus.UNAUTHORIZED), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(body()).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
  });

  it("hides internals on unknown errors", () => {
    const { host, status, body } = fakeHost();
    filter.catch(new Error("db connection string leaked here"), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(body()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    expect(JSON.stringify(body())).not.toContain("db connection");
  });
});

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

import { ApiException, type ApiErrorBody } from "./errors";

const STATUS_FALLBACK: Record<number, { code: string; message: string }> = {
  [HttpStatus.BAD_REQUEST]: { code: "BAD_REQUEST", message: "Invalid request" },
  [HttpStatus.UNAUTHORIZED]: { code: "UNAUTHORIZED", message: "Authentication required" },
  [HttpStatus.FORBIDDEN]: { code: "FORBIDDEN", message: "Access denied" },
  [HttpStatus.NOT_FOUND]: { code: "NOT_FOUND", message: "Not found" },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: "TOO_MANY_REQUESTS", message: "Too many requests" },
};

/**
 * Global error contract: ApiException keeps its code/fields, framework
 * HttpExceptions map to generic per-status messages, anything else becomes a
 * logged 500. Internal details and stack traces never reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiException) {
      const body: ApiErrorBody = {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.fields ? { fields: exception.fields } : {}),
        },
      };
      res.status(exception.getStatus()).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const mapped = STATUS_FALLBACK[status] ?? { code: "REQUEST_FAILED", message: "Request failed" };
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`HTTP ${status}: ${exception.message}`, exception.stack);
      }
      res.status(status).json({ error: mapped } satisfies ApiErrorBody);
      return;
    }

    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : String(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } } satisfies ApiErrorBody);
  }
}

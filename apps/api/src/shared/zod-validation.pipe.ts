import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { ApiException } from "./errors";

/** Validates a request payload against a zod schema; rejects unknown-key/invalid bodies. */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length ? issue.path.map(String).join(".") : "_root";
        (fields[key] ??= []).push(issue.message);
      }
      throw ApiException.validation(fields);
    }
    return result.data;
  }
}

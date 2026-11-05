import { HttpException, HttpStatus } from "@nestjs/common";

/** Wire contract for every error response: `{error: {code, message, fields?}}`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

/** Domain failure carrying a stable error code for clients. */
export class ApiException extends HttpException {
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(code: string, message: string, status: HttpStatus, fields?: Record<string, string[]>) {
    super(message, status);
    this.code = code;
    this.fields = fields;
  }

  static validation(fields: Record<string, string[]>): ApiException {
    return new ApiException("VALIDATION_ERROR", "Request validation failed", HttpStatus.BAD_REQUEST, fields);
  }
}

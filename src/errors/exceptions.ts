import type { ErrorCode } from "./codes.js";

export class GenericHttpPluginError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    retryable = false
  ) {
    super(message);
    this.name = "GenericHttpPluginError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

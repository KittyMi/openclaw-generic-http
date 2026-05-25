import { ERROR_CODES } from "./codes.js";
import { GenericHttpPluginError } from "./exceptions.js";

export type GenericHttpTransportErrorCategory =
  | "config"
  | "network"
  | "timeout"
  | "remote-client"
  | "remote-server"
  | "invalid-response";

function createCategorizedError(
  code: typeof ERROR_CODES.INVALID_REQUEST | typeof ERROR_CODES.INTERNAL_ERROR,
  category: GenericHttpTransportErrorCategory,
  message: string,
  details: Record<string, unknown> = {},
  retryable = false
): GenericHttpPluginError {
  return new GenericHttpPluginError(
    code,
    message,
    {
      category,
      ...details
    },
    retryable
  );
}

export function createConfigError(
  message: string,
  details: Record<string, unknown> = {}
): GenericHttpPluginError {
  return createCategorizedError(
    ERROR_CODES.INVALID_REQUEST,
    "config",
    message,
    details,
    false
  );
}

export function createRemoteStatusError(
  operation: string,
  status: number,
  statusText: string
): GenericHttpPluginError {
  const category: GenericHttpTransportErrorCategory =
    status >= 500 ? "remote-server" : "remote-client";
  const retryable = status === 408 || status === 429 || status >= 500;
  return createCategorizedError(
    ERROR_CODES.INTERNAL_ERROR,
    category,
    `${operation} failed with ${status} ${statusText}`,
    {
      operation,
      status,
      statusText
    },
    retryable
  );
}

export function createInvalidResponseError(
  operation: string,
  details: Record<string, unknown> = {}
): GenericHttpPluginError {
  return createCategorizedError(
    ERROR_CODES.INTERNAL_ERROR,
    "invalid-response",
    `${operation} returned an invalid response payload`,
    {
      operation,
      ...details
    },
    false
  );
}

export function createTransportFailureError(
  operation: string,
  error: unknown
): GenericHttpPluginError {
  if (error instanceof GenericHttpPluginError) {
    return error;
  }

  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const category: GenericHttpTransportErrorCategory =
    error instanceof Error && error.name === "AbortError"
      ? "timeout"
      : "network";
  const retryable = category === "timeout" || category === "network";

  return createCategorizedError(
    ERROR_CODES.INTERNAL_ERROR,
    category,
    `${operation} failed before a valid response was received`,
    {
      operation,
      cause: `${errorName}: ${errorMessage}`
    },
    retryable
  );
}

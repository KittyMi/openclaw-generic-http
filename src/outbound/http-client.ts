import { GenericHttpPluginError } from "../errors/exceptions.js";
import {
  createConfigError,
  createInvalidResponseError,
  createRemoteStatusError,
  createTransportFailureError
} from "../errors/http.js";
import type { GenericHttpAccountConfig } from "../config/schema.js";
import { normalizeAttachment } from "../protocol/attachments.js";
import { serializeProtocolObject } from "../protocol/serializer.js";
import { signPayload } from "../security/signer.js";
import type { OutboundClient } from "./client.js";
import type {
  OutboundMessageRequest,
  OutboundMessageResult
} from "./mapper.js";

export interface HttpOutboundClientOptions {
  nowEpochSeconds?: () => number;
  nonceFactory?: () => string;
  fetchImpl?: typeof fetch;
}

function normalizeOutboundRequest(
  request: OutboundMessageRequest
): OutboundMessageRequest {
  return {
    ...request,
    message: {
      ...request.message,
      attachments: (request.message.attachments ?? []).map((attachment) =>
        normalizeAttachment(attachment)
      )
    }
  };
}

function createTimeoutSignal(timeoutMillis: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMillis);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true
  });
  return controller.signal;
}

function buildOutboundEndpoint(baseUrl: string): string {
  if (baseUrl.trim() === "") {
    throw createConfigError(
      "Outbound account config requires a non-empty baseUrl.",
      { field: "baseUrl" }
    );
  }

  return new URL("/outbound/messages", baseUrl).toString();
}

function buildOutboundHeaders(
  accountConfig: GenericHttpAccountConfig,
  request: OutboundMessageRequest,
  signature: string,
  timestamp: string,
  nonce: string
): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": accountConfig.apiKey ?? "",
    "x-generic-http-version": "1",
    "x-nonce": nonce,
    "x-request-id": request.requestId,
    "x-signature": signature,
    "x-timestamp": timestamp
  };
}

function parseOutboundResult(value: unknown): OutboundMessageResult {
  if (typeof value !== "object" || value === null) {
    throw createInvalidResponseError(
      "POST /outbound/messages",
      { responseType: typeof value }
    );
  }

  const result = value as Partial<OutboundMessageResult>;
  if (
    result.success !== true ||
    result.code !== "DELIVERED" ||
    typeof result.providerMessageId !== "string" ||
    typeof result.acceptedAt !== "string"
  ) {
    throw createInvalidResponseError(
      "POST /outbound/messages",
      {
        response: value
      }
    );
  }

  return {
    success: true,
    code: "DELIVERED",
    providerMessageId: result.providerMessageId,
    acceptedAt: result.acceptedAt,
    metadata:
      typeof result.metadata === "object" && result.metadata !== null
        ? result.metadata
        : {}
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof GenericHttpPluginError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TypeError";
  }

  return false;
}

/**
 * Minimal HTTP transport for the generic bridge outbound path.
 *
 * The caller hands over a normalized outbound request, this client signs the
 * serialized body with the account secret, and then posts it to the configured
 * third-party bridge endpoint.
 */
export class HttpOutboundClient implements OutboundClient {
  private readonly accountConfig: GenericHttpAccountConfig;
  private readonly nowEpochSeconds: () => number;
  private readonly nonceFactory: () => string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    accountConfig: GenericHttpAccountConfig,
    options: HttpOutboundClientOptions = {}
  ) {
    this.accountConfig = accountConfig;
    this.nowEpochSeconds =
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.nonceFactory = options.nonceFactory ?? (() => crypto.randomUUID());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    const endpoint = buildOutboundEndpoint(this.accountConfig.baseUrl);
    const normalizedRequest = normalizeOutboundRequest(request);
    const rawBody = serializeProtocolObject(normalizedRequest);
    const timestamp = String(this.nowEpochSeconds());
    const nonce = this.nonceFactory();
    const signingSecret =
      this.accountConfig.outboundSecret ?? this.accountConfig.signingSecret;

    if (signingSecret === undefined || signingSecret.trim() === "") {
      throw createConfigError(
        "Outbound account config requires signingSecret or outboundSecret.",
        {
          accountId: request.accountId
        }
      );
    }

    const path = new URL(endpoint).pathname;
    const signature = signPayload(signingSecret, {
      method: "POST",
      path,
      timestamp,
      nonce,
      rawBody
    });

    const maxAttempts = Math.max(1, (this.accountConfig.maxRetries ?? 0) + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(endpoint, {
          method: "POST",
          headers: buildOutboundHeaders(
            this.accountConfig,
            normalizedRequest,
            signature,
            timestamp,
            nonce
          ),
          body: rawBody,
          signal: createTimeoutSignal(this.accountConfig.readTimeoutMillis ?? 10000)
        });

        if (!response.ok) {
          throw createRemoteStatusError(
            "POST /outbound/messages",
            response.status,
            response.statusText
          );
        }

        return parseOutboundResult(await response.json());
      } catch (error) {
        if (attempt >= maxAttempts || !shouldRetry(error)) {
          if (error instanceof GenericHttpPluginError) {
            throw error;
          }

          throw createTransportFailureError(
            "POST /outbound/messages",
            error
          );
        }
      }
    }

    throw createTransportFailureError(
      "POST /outbound/messages",
      new Error(
        `Outbound HTTP transport exhausted retries without returning a delivery result for account ${request.accountId}.`
      )
    );
  }
}

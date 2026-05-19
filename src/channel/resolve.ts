import { randomUUID } from "node:crypto";

import type { GenericHttpAccountConfig } from "../config/schema.js";
import { serializeProtocolObject } from "../protocol/serializer.js";
import { signPayload } from "../security/signer.js";

export interface ResolveRequest {
  accountId?: string | null;
  kind: "conversation" | "sender";
  query: string;
}

export interface ResolveResult {
  id: string;
  name: string;
  kind: ResolveRequest["kind"];
}

export interface ResolveResponse {
  success: true;
  results: ResolveResult[];
}

export interface ResolveAccountOptions {
  fetchImpl?: typeof fetch;
  nowEpochSeconds?: () => number;
  nonceFactory?: () => string;
  requestIdFactory?: () => string;
}

function buildSignedHeaders(
  accountConfig: GenericHttpAccountConfig,
  method: string,
  path: string,
  rawBody: string,
  timestamp: string,
  nonce: string,
  requestId: string
): Record<string, string> {
  const signingSecret =
    accountConfig.outboundSecret ?? accountConfig.signingSecret ?? "";
  const signature = signPayload(signingSecret, {
    method,
    path,
    timestamp,
    nonce,
    rawBody
  });

  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-request-id": requestId,
    "x-generic-http-version": "1",
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-signature": signature,
    "x-api-key": accountConfig.apiKey ?? ""
  };
}

/**
 * Minimal local resolve fallback.
 *
 * The first runtime loop has no external lookup client yet, so if callers
 * already have a stable ID they can pass it through this method and still get a
 * protocol-shaped resolve response.
 */
export function resolveLocally(request: ResolveRequest): ResolveResponse {
  const query = request.query.trim();
  if (query === "") {
    return {
      success: true,
      results: []
    };
  }

  return {
    success: true,
    results: [
      {
        id: query,
        name: query,
        kind: request.kind
      }
    ]
  };
}

export async function resolveRemotely(
  accountConfig: GenericHttpAccountConfig,
  request: ResolveRequest,
  options: ResolveAccountOptions = {}
): Promise<ResolveResponse> {
  const query = request.query.trim();
  if (query === "") {
    return {
      success: true,
      results: []
    };
  }

  const resolvedOptions: Required<ResolveAccountOptions> = {
    fetchImpl: options.fetchImpl ?? fetch,
    nowEpochSeconds:
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000)),
    nonceFactory: options.nonceFactory ?? (() => randomUUID()),
    requestIdFactory: options.requestIdFactory ?? (() => randomUUID())
  };
  const endpoint = new URL("/resolve", accountConfig.baseUrl);
  const rawBody = serializeProtocolObject({
    accountId: request.accountId ?? undefined,
    kind: request.kind,
    query
  });
  const timestamp = String(resolvedOptions.nowEpochSeconds());
  const nonce = resolvedOptions.nonceFactory();
  const requestId = resolvedOptions.requestIdFactory();
  const headers = buildSignedHeaders(
    accountConfig,
    "POST",
    endpoint.pathname,
    rawBody,
    timestamp,
    nonce,
    requestId
  );

  const response = await resolvedOptions.fetchImpl(endpoint.toString(), {
    method: "POST",
    headers,
    body: rawBody
  });
  if (!response.ok) {
    throw new Error(
      `POST /resolve failed with ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    success?: boolean;
    results?: Array<{ id?: string; name?: string; kind?: ResolveRequest["kind"] }>;
  };
  if (payload.success !== true || !Array.isArray(payload.results)) {
    throw new Error("POST /resolve returned an invalid response payload");
  }

  return {
    success: true,
    results: payload.results
      .filter(
        (item) =>
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          (item.kind === "conversation" || item.kind === "sender")
      )
      .map((item) => ({
        id: item.id as string,
        name: item.name as string,
        kind: item.kind as ResolveRequest["kind"]
      }))
  };
}

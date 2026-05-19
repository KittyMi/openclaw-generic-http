import { randomUUID } from "node:crypto";

import type { GenericHttpAccountConfig } from "../config/schema.js";
import { serializeProtocolObject } from "../protocol/serializer.js";
import { signPayload } from "../security/signer.js";

export interface ProbeCheckResult {
  name: string;
  status: "OK" | "ERROR";
  detail?: string;
}

export interface ProbeResult {
  success: true;
  status: "OK" | "ERROR";
  accountId: string;
  checks: ProbeCheckResult[];
}

export interface ProbeAccountOptions {
  fetchImpl?: typeof fetch;
  nowEpochSeconds?: () => number;
  nonceFactory?: () => string;
  requestIdFactory?: () => string;
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function buildLocalChecks(accountConfig: GenericHttpAccountConfig): ProbeCheckResult[] {
  return [
    {
      name: "base-url",
      status: hasValue(accountConfig.baseUrl) ? "OK" : "ERROR",
      detail: hasValue(accountConfig.baseUrl)
        ? accountConfig.baseUrl
        : "baseUrl is not configured"
    },
    {
      name: "signing-secret",
      status:
        hasValue(accountConfig.outboundSecret) || hasValue(accountConfig.signingSecret)
          ? "OK"
          : "ERROR",
      detail:
        hasValue(accountConfig.outboundSecret) || hasValue(accountConfig.signingSecret)
          ? "available"
          : "signingSecret or outboundSecret is required"
    },
    {
      name: "inbound-secret",
      status:
        hasValue(accountConfig.inboundSecret) || hasValue(accountConfig.signingSecret)
          ? "OK"
          : "ERROR",
      detail:
        hasValue(accountConfig.inboundSecret) || hasValue(accountConfig.signingSecret)
          ? "available"
          : "signingSecret or inboundSecret is required"
    }
  ];
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

function buildErrorCheck(name: string, detail: string): ProbeCheckResult {
  return {
    name,
    status: "ERROR",
    detail
  };
}

async function runRemoteHealthCheck(
  accountConfig: GenericHttpAccountConfig,
  options: Required<ProbeAccountOptions>
): Promise<ProbeCheckResult> {
  const endpoint = new URL("/health", accountConfig.baseUrl);
  const timestamp = String(options.nowEpochSeconds());
  const nonce = options.nonceFactory();
  const requestId = options.requestIdFactory();
  const headers = buildSignedHeaders(
    accountConfig,
    "GET",
    endpoint.pathname,
    "",
    timestamp,
    nonce,
    requestId
  );

  try {
    const response = await options.fetchImpl(endpoint.toString(), {
      method: "GET",
      headers
    });
    if (!response.ok) {
      return buildErrorCheck(
        "health",
        `GET /health failed with ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as {
      success?: boolean;
      status?: string;
      service?: string;
    };
    if (payload.success !== true || payload.status !== "UP") {
      return buildErrorCheck(
        "health",
        "GET /health returned an invalid success/status payload"
      );
    }

    return {
      name: "health",
      status: "OK",
      detail: payload.service ?? "remote health check passed"
    };
  } catch (error) {
    return buildErrorCheck(
      "health",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function runRemoteProbeCheck(
  accountId: string,
  accountConfig: GenericHttpAccountConfig,
  options: Required<ProbeAccountOptions>
): Promise<ProbeCheckResult> {
  const endpoint = new URL("/probe", accountConfig.baseUrl);
  const rawBody = serializeProtocolObject({ accountId });
  const timestamp = String(options.nowEpochSeconds());
  const nonce = options.nonceFactory();
  const requestId = options.requestIdFactory();
  const headers = buildSignedHeaders(
    accountConfig,
    "POST",
    endpoint.pathname,
    rawBody,
    timestamp,
    nonce,
    requestId
  );

  try {
    const response = await options.fetchImpl(endpoint.toString(), {
      method: "POST",
      headers,
      body: rawBody
    });
    if (!response.ok) {
      return buildErrorCheck(
        "probe-api",
        `POST /probe failed with ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as {
      success?: boolean;
      status?: string;
      checks?: Array<{ name?: string; status?: string }>;
    };
    if (payload.success !== true || typeof payload.status !== "string") {
      return buildErrorCheck(
        "probe-api",
        "POST /probe returned an invalid success/status payload"
      );
    }

    return {
      name: "probe-api",
      status: payload.status === "OK" ? "OK" : "ERROR",
      detail:
        Array.isArray(payload.checks) && payload.checks.length > 0
          ? payload.checks
              .map((check) => `${check.name ?? "unknown"}=${check.status ?? "unknown"}`)
              .join(", ")
          : "remote probe completed"
    };
  } catch (error) {
    return buildErrorCheck(
      "probe-api",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function probeAccountConfig(
  accountId: string,
  accountConfig: GenericHttpAccountConfig,
  options: ProbeAccountOptions = {}
): Promise<ProbeResult> {
  const checks = buildLocalChecks(accountConfig);
  if (checks.some((check) => check.status === "ERROR")) {
    return {
      success: true,
      status: "ERROR",
      accountId,
      checks
    };
  }

  const resolvedOptions: Required<ProbeAccountOptions> = {
    fetchImpl: options.fetchImpl ?? fetch,
    nowEpochSeconds:
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000)),
    nonceFactory: options.nonceFactory ?? (() => randomUUID()),
    requestIdFactory: options.requestIdFactory ?? (() => randomUUID())
  };

  checks.push(await runRemoteHealthCheck(accountConfig, resolvedOptions));
  checks.push(await runRemoteProbeCheck(accountId, accountConfig, resolvedOptions));

  return {
    success: true,
    status: checks.every((check) => check.status === "OK") ? "OK" : "ERROR",
    accountId,
    checks
  };
}

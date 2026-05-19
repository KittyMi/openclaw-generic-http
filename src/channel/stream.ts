import { randomUUID } from "node:crypto";

import type { InboundMessageRequestDto } from "../protocol/dto.js";
import { serializeProtocolObject } from "../protocol/serializer.js";
import { signPayload } from "../security/signer.js";
import { mapInboundMessage, type NormalizedInboundMessageEvent } from "../inbound/mapper.js";
import { validateInboundMessage } from "../inbound/validator.js";
import type { GenericHttpAccountConfig } from "../config/schema.js";

export interface StreamPullOptions {
  fetchImpl?: typeof fetch;
  nowEpochSeconds?: () => number;
  nonceFactory?: () => string;
  requestIdFactory?: () => string;
  limit?: number;
}

export interface StreamAckOptions {
  fetchImpl?: typeof fetch;
  nowEpochSeconds?: () => number;
  nonceFactory?: () => string;
  requestIdFactory?: () => string;
}

export interface PulledInboundMessage {
  eventId: string;
  accountId: string;
  receivedAt: string;
  request: InboundMessageRequestDto;
  normalizedEvent: NormalizedInboundMessageEvent;
}

export interface PullInboundMessagesResult {
  success: true;
  accountId: string;
  items: PulledInboundMessage[];
}

export interface AckInboundMessagesResult {
  success: true;
  accountId: string;
  ackedEventIds: string[];
}

type RequiredStreamOptions = Required<
  Pick<
    StreamPullOptions,
    "fetchImpl" | "nowEpochSeconds" | "nonceFactory" | "requestIdFactory"
  >
>;

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
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "x-request-id": requestId,
    "x-generic-http-version": "1",
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-signature": signature,
    "x-api-key": accountConfig.apiKey ?? ""
  };
}

function resolveRequiredOptions(
  options: StreamPullOptions | StreamAckOptions
): RequiredStreamOptions {
  return {
    fetchImpl: options.fetchImpl ?? fetch,
    nowEpochSeconds:
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000)),
    nonceFactory: options.nonceFactory ?? (() => randomUUID()),
    requestIdFactory: options.requestIdFactory ?? (() => randomUUID())
  };
}

function parseSseEvents(raw: string): Array<{ event: string; data: string }> {
  const chunks = raw
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== "");

  return chunks.map((chunk) => {
    const lines = chunk.split(/\r?\n/);
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    return {
      event: eventName,
      data: dataLines.join("\n")
    };
  });
}

export async function pullInboundMessages(
  accountId: string,
  accountConfig: GenericHttpAccountConfig,
  options: StreamPullOptions = {}
): Promise<PullInboundMessagesResult> {
  const resolvedOptions = resolveRequiredOptions(options);
  const endpoint = new URL("/stream/inbound", accountConfig.baseUrl);
  endpoint.searchParams.set("accountId", accountId);
  endpoint.searchParams.set("limit", String(options.limit ?? 10));

  const timestamp = String(resolvedOptions.nowEpochSeconds());
  const nonce = resolvedOptions.nonceFactory();
  const requestId = resolvedOptions.requestIdFactory();
  const headers = buildSignedHeaders(
    accountConfig,
    "GET",
    endpoint.pathname,
    "",
    timestamp,
    nonce,
    requestId
  );

  const response = await resolvedOptions.fetchImpl(endpoint.toString(), {
    method: "GET",
    headers
  });
  if (!response.ok) {
    throw new Error(
      `GET /stream/inbound failed with ${response.status} ${response.statusText}`
    );
  }

  const rawSse = await response.text();
  const items = parseSseEvents(rawSse)
    .filter((entry) => entry.event === "inbound-message")
    .map((entry) => JSON.parse(entry.data) as {
      eventId: string;
      accountId: string;
      receivedAt: string;
      request: InboundMessageRequestDto;
    })
    .map((entry) => {
      validateInboundMessage(entry.request);
      return {
        eventId: entry.eventId,
        accountId: entry.accountId,
        receivedAt: entry.receivedAt,
        request: entry.request,
        normalizedEvent: mapInboundMessage(entry.request)
      };
    });

  return {
    success: true,
    accountId,
    items
  };
}

export async function ackInboundMessages(
  accountId: string,
  eventIds: string[],
  accountConfig: GenericHttpAccountConfig,
  options: StreamAckOptions = {}
): Promise<AckInboundMessagesResult> {
  const normalizedEventIds = eventIds
    .map((eventId) => eventId.trim())
    .filter((eventId) => eventId !== "");
  const resolvedOptions = resolveRequiredOptions(options);
  const endpoint = new URL("/stream/acks", accountConfig.baseUrl);
  const rawBody = serializeProtocolObject({
    accountId,
    eventIds: normalizedEventIds
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
      `POST /stream/acks failed with ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    success?: boolean;
    accountId?: string;
    ackedEventIds?: string[];
  };
  if (
    payload.success !== true ||
    payload.accountId !== accountId ||
    !Array.isArray(payload.ackedEventIds)
  ) {
    throw new Error("POST /stream/acks returned an invalid response payload");
  }

  return {
    success: true,
    accountId,
    ackedEventIds: payload.ackedEventIds.filter(
      (eventId): eventId is string => typeof eventId === "string"
    )
  };
}

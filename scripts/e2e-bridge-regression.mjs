import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";

import { createGenericHttpChannelLifecycle } from "../dist/channel/lifecycle.js";
import { verifyPayload } from "../dist/security/verifier.js";

const API_KEY = "test-api-key";
const SIGNING_SECRET = "test-signing-secret";
const ACCOUNT_ID = "default";
const EVENT_ID = "evt-e2e-1";
const MESSAGE_ID = "msg-e2e-1";

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function assertSignedRequest(request, rawBody) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const timestamp = String(request.headers["x-timestamp"] ?? "");
  const nonce = String(request.headers["x-nonce"] ?? "");
  const signature = String(request.headers["x-signature"] ?? "");
  const apiKey = String(request.headers["x-api-key"] ?? "");

  assert.equal(apiKey, API_KEY, "bridge should receive the configured API key");
  assert.ok(timestamp.length > 0, "bridge should receive x-timestamp");
  assert.ok(nonce.length > 0, "bridge should receive x-nonce");
  assert.ok(signature.length > 0, "bridge should receive x-signature");
  assert.equal(
    verifyPayload(signature, SIGNING_SECRET, {
      method: request.method ?? "GET",
      path: url.pathname,
      timestamp,
      nonce,
      rawBody
    }),
    true,
    `signature should verify for ${request.method} ${url.pathname}`
  );
}

async function main() {
  const state = {
    ackedEventIds: [],
    outboundBodies: [],
    lifecycleEvents: [],
    probeCount: 0,
    resolveCount: 0
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const rawBody = await readRawBody(request);
    assertSignedRequest(request, rawBody);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        success: true,
        status: "UP",
        service: "generic-http-e2e-bridge",
        version: "test"
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/probe") {
      state.probeCount += 1;
      sendJson(response, 200, {
        success: true,
        status: "OK",
        accountId: ACCOUNT_ID,
        checks: [
          { name: "auth", status: "OK" },
          { name: "outbound-api", status: "OK" }
        ]
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/resolve") {
      state.resolveCount += 1;
      const payload = JSON.parse(rawBody);
      sendJson(response, 200, {
        success: true,
        results: [
          {
            id: `resolved:${payload.query}`,
            name: payload.query,
            kind: payload.kind
          }
        ]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/stream/inbound") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        [
          "event: inbound-message",
          `data: ${JSON.stringify({
            eventId: EVENT_ID,
            accountId: ACCOUNT_ID,
            receivedAt: "2026-05-19T12:00:00Z",
            request: {
              eventId: EVENT_ID,
              accountId: ACCOUNT_ID,
              conversation: {
                conversationId: "room-e2e",
                type: "room",
                title: "E2E Room"
              },
              threadId: "thread-e2e",
              sender: {
                id: "user-e2e",
                name: "Regression User",
                type: "user"
              },
              message: {
                messageId: MESSAGE_ID,
                text: "hello from bridge"
              },
              occurredAt: "2026-05-19T12:00:00Z",
              idempotencyKey: "idem-e2e-1"
            }
          })}`,
          "",
          ""
        ].join("\n")
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/stream/acks") {
      const payload = JSON.parse(rawBody);
      if (Array.isArray(payload.eventIds) && payload.eventIds.length > 0) {
        state.ackedEventIds.push(...payload.eventIds);
      } else if (typeof payload.lastEventId === "string" && payload.lastEventId.length > 0) {
        state.ackedEventIds.push(payload.lastEventId);
      }
      sendJson(response, 200, {
        success: true,
        accountId: payload.accountId,
        ackedEventIds:
          Array.isArray(payload.eventIds) && payload.eventIds.length > 0
            ? payload.eventIds
            : payload.lastEventId
              ? [payload.lastEventId]
              : []
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/outbound/messages") {
      state.outboundBodies.push(JSON.parse(rawBody));
      sendJson(response, 200, {
        success: true,
        code: "DELIVERED",
        providerMessageId: "provider-e2e-1",
        acceptedAt: "2026-05-19T12:00:01Z",
        metadata: {
          transport: "local-http-server"
        }
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine local bridge address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const lifecycle = createGenericHttpChannelLifecycle(
    {
      enabled: true,
      defaultAccount: ACCOUNT_ID,
      accounts: {
        [ACCOUNT_ID]: {
          baseUrl,
          apiKey: API_KEY,
          signingSecret: SIGNING_SECRET,
          readTimeoutMillis: 3000
        }
      }
    },
    {
      async dispatchInboundEvent(event) {
        state.lifecycleEvents.push(event);
      }
    },
    {
      streamIngressPollIntervalMillis: 50
    }
  );

  try {
    const probe = await lifecycle.plugin.probe(ACCOUNT_ID);
    assert.equal(probe.status, "OK");
    assert.equal(state.probeCount, 1);

    const resolved = await lifecycle.plugin.resolve({
      accountId: ACCOUNT_ID,
      kind: "conversation",
      query: "support-room"
    });
    assert.deepEqual(resolved.results[0], {
      id: "resolved:support-room",
      name: "support-room",
      kind: "conversation"
    });
    assert.equal(state.resolveCount, 1);

    await lifecycle.start(ACCOUNT_ID);
    lifecycle.stop();

    assert.equal(state.lifecycleEvents.length, 1);
    assert.equal(state.lifecycleEvents[0]?.eventId, EVENT_ID);
    assert.deepEqual(state.ackedEventIds, [EVENT_ID]);

    const delivery = await lifecycle.plugin.sendOutboundMessage({
      requestId: "req-e2e-1",
      accountId: ACCOUNT_ID,
      conversationId: "room-e2e",
      conversationType: "room",
      threadId: "thread-e2e",
      messageId: "out-e2e-1",
      text: "pong from plugin",
      attachments: [
        {
          name: "report.pdf",
          contentType: "application/pdf",
          url: "https://cdn.example.com/report.pdf"
        },
        {
          contentType: "image/png",
          contentBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
          altText: "chart"
        }
      ],
      metadata: {
        regression: true
      }
    });

    assert.equal(delivery.code, "DELIVERED");
    assert.equal(state.outboundBodies.length, 1);
    assert.equal(state.outboundBodies[0]?.message?.text, "pong from plugin");
    assert.equal(state.outboundBodies[0]?.conversation?.conversationId, "room-e2e");
    assert.equal(state.outboundBodies[0]?.message?.attachments?.length, 2);
    assert.equal(state.outboundBodies[0]?.message?.attachments?.[0]?.kind, "file");
    assert.equal(state.outboundBodies[0]?.message?.attachments?.[1]?.kind, "image");
  } finally {
    lifecycle.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      });
    });
  }

  console.log("e2e bridge regression passed");
}

await main();

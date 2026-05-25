import { describe, expect, it } from "vitest";

import { GenericHttpPluginError } from "../errors/exceptions.js";
import { ERROR_CODES } from "../errors/codes.js";
import { HttpOutboundClient } from "./http-client.js";

describe("HttpOutboundClient", () => {
  it("retries retryable HTTP failures and eventually succeeds", async () => {
    let attempt = 0;
    const client = new HttpOutboundClient(
      {
        baseUrl: "https://bridge.example.com",
        apiKey: "test-api-key",
        signingSecret: "test-signing-secret",
        readTimeoutMillis: 1000,
        maxRetries: 1
      },
      {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "nonce-001",
        fetchImpl: async () => {
          attempt += 1;
          if (attempt === 1) {
            return new Response("retry later", {
              status: 503,
              statusText: "Service Unavailable"
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              code: "DELIVERED",
              providerMessageId: "provider-001",
              acceptedAt: "2026-05-17T15:00:01.000Z",
              metadata: {
                transport: "http"
              }
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }
      }
    );

    const result = await client.send({
      requestId: "req_001",
      accountId: "default",
      conversation: {
        conversationId: "room_123",
        type: "dm"
      },
      threadId: null,
      message: {
        messageId: "msg_001",
        text: "hello",
        attachments: [],
        replyToMessageId: null
      },
      metadata: {}
    });

    expect(attempt).toBe(2);
    expect(result.code).toBe("DELIVERED");
    expect(result.providerMessageId).toBe("provider-001");
  });

  it("fails immediately for non-retryable HTTP status codes", async () => {
    const client = new HttpOutboundClient(
      {
        baseUrl: "https://bridge.example.com",
        apiKey: "test-api-key",
        signingSecret: "test-signing-secret",
        readTimeoutMillis: 1000,
        maxRetries: 2
      },
      {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "nonce-002",
        fetchImpl: async () =>
          new Response("bad request", {
            status: 400,
            statusText: "Bad Request"
          })
      }
    );

    await expect(
      client.send({
        requestId: "req_002",
        accountId: "default",
        conversation: {
          conversationId: "room_123",
          type: "dm"
        },
        threadId: null,
        message: {
          messageId: "msg_002",
          text: "hello",
          attachments: [],
          replyToMessageId: null
        },
        metadata: {}
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INTERNAL_ERROR,
      retryable: false,
      details: {
        category: "remote-client",
        operation: "POST /outbound/messages",
        status: 400
      }
    } satisfies Partial<GenericHttpPluginError>);
  });

  it("classifies retryable network failures as network transport errors", async () => {
    const client = new HttpOutboundClient(
      {
        baseUrl: "https://bridge.example.com",
        apiKey: "test-api-key",
        signingSecret: "test-signing-secret",
        readTimeoutMillis: 1000,
        maxRetries: 0
      },
      {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "nonce-005",
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        }
      }
    );

    await expect(
      client.send({
        requestId: "req_005",
        accountId: "default",
        conversation: {
          conversationId: "room_123",
          type: "dm"
        },
        threadId: null,
        message: {
          messageId: "msg_005",
          text: "hello",
          attachments: [],
          replyToMessageId: null
        },
        metadata: {}
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INTERNAL_ERROR,
      retryable: true,
      details: {
        category: "network",
        operation: "POST /outbound/messages"
      }
    } satisfies Partial<GenericHttpPluginError>);
  });

  it("sends file and image attachments in the outbound payload", async () => {
    let capturedBody = "";
    let capturedHeaders: Record<string, string> | undefined;
    const client = new HttpOutboundClient(
      {
        baseUrl: "https://bridge.example.com",
        apiKey: "test-api-key",
        signingSecret: "test-signing-secret",
        readTimeoutMillis: 1000,
        maxRetries: 0
      },
      {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "nonce-003",
        fetchImpl: async (_, init) => {
          capturedBody = String(init?.body ?? "");
          capturedHeaders = init?.headers as Record<string, string> | undefined;
          return new Response(
            JSON.stringify({
              success: true,
              code: "DELIVERED",
              providerMessageId: "provider-attachments",
              acceptedAt: "2026-05-17T15:00:01.000Z",
              metadata: {}
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }
      }
    );

    await client.send({
      requestId: "req_003",
      accountId: "default",
      conversation: {
        conversationId: "room_123",
        type: "dm"
      },
      threadId: null,
      message: {
        messageId: "msg_003",
        text: "attachments",
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
        replyToMessageId: null
      },
      metadata: {}
    });

    const payload = JSON.parse(capturedBody);
    expect(payload.message.attachments).toHaveLength(2);
    expect(payload.message.attachments[0].kind).toBe("file");
    expect(payload.message.attachments[1].kind).toBe("image");
    expect(payload.message.attachments[1].contentBase64).toBe("ZmFrZS1pbWFnZS1ieXRlcw==");
    expect(capturedHeaders).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": "test-api-key",
      "x-generic-http-version": "1",
      "x-nonce": "nonce-003",
      "x-request-id": "req_003",
      "x-signature": expect.any(String),
      "x-timestamp": "1715958000"
    });
  });

  it("rejects oversized attachments before sending", async () => {
    const client = new HttpOutboundClient(
      {
        baseUrl: "https://bridge.example.com",
        apiKey: "test-api-key",
        signingSecret: "test-signing-secret",
        readTimeoutMillis: 1000,
        maxRetries: 0
      },
      {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "nonce-004",
        fetchImpl: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    await expect(
      client.send({
        requestId: "req_004",
        accountId: "default",
        conversation: {
          conversationId: "room_123",
          type: "dm"
        },
        threadId: null,
        message: {
          messageId: "msg_004",
          text: "big file",
          attachments: [
            {
              name: "video.mp4",
              contentType: "video/mp4",
              url: "https://cdn.example.com/video.mp4",
              sizeBytes: 30 * 1024 * 1024
            }
          ],
          replyToMessageId: null
        },
        metadata: {}
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_REQUEST
    } satisfies Partial<GenericHttpPluginError>);
  });
});

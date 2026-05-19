import { describe, expect, it } from "vitest";

import { createGenericHttpChannelPlugin } from "./plugin.js";

describe("createGenericHttpChannelPlugin", () => {
  it("should expose runtime status, remote probe, and remote resolve", async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];
    const plugin = createGenericHttpChannelPlugin({
      enabled: true,
      defaultAccount: "acct-1",
      accounts: {
        "acct-1": {
          baseUrl: "https://bridge.example.com",
          signingSecret: "secret"
        }
      }
    }, {
      probeOptions: {
        nowEpochSeconds: () => 1715958000,
        nonceFactory: () => "probe-nonce",
        requestIdFactory: () => "probe-request-id",
        fetchImpl: async (input, init) => {
          requests.push({
            url: String(input),
            method: String(init?.method ?? "GET"),
            body: String(init?.body ?? "")
          });

          if (String(input).endsWith("/health")) {
            return new Response(
              JSON.stringify({
                success: true,
                status: "UP",
                service: "generic-http-bridge"
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              status: "OK",
              checks: [
                { name: "auth", status: "OK" },
                { name: "outbound-api", status: "OK" }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      },
      resolveOptions: {
        nowEpochSeconds: () => 1715958001,
        nonceFactory: () => "resolve-nonce",
        requestIdFactory: () => "resolve-request-id",
        fetchImpl: async (input, init) => {
          requests.push({
            url: String(input),
            method: String(init?.method ?? "GET"),
            body: String(init?.body ?? "")
          });

          return new Response(
            JSON.stringify({
              success: true,
              results: [
                {
                  id: "room_123",
                  name: "support-room",
                  kind: "conversation"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    });

    expect(plugin.status()).toEqual({
      enabled: true,
      defaultAccount: "acct-1",
      accounts: ["acct-1"]
    });
    expect(plugin.capabilities()).toEqual({
      textInbound: true,
      textOutbound: true,
      attachments: true,
      threading: true,
      replies: true,
      deliveryReceipt: false
    });
    await expect(plugin.probe()).resolves.toEqual({
      success: true,
      status: "OK",
      accountId: "acct-1",
      checks: [
        {
          name: "base-url",
          status: "OK",
          detail: "https://bridge.example.com"
        },
        {
          name: "signing-secret",
          status: "OK",
          detail: "available"
        },
        {
          name: "inbound-secret",
          status: "OK",
          detail: "available"
        },
        {
          name: "health",
          status: "OK",
          detail: "generic-http-bridge"
        },
        {
          name: "probe-api",
          status: "OK",
          detail: "auth=OK, outbound-api=OK"
        }
      ]
    });
    await expect(
      plugin.resolve({
        accountId: "acct-1",
        kind: "conversation",
        query: "support-room"
      })
    ).resolves.toEqual({
      success: true,
      results: [
        {
          id: "room_123",
          name: "support-room",
          kind: "conversation"
        }
      ]
    });
    expect(requests).toEqual([
      {
        url: "https://bridge.example.com/health",
        method: "GET",
        body: ""
      },
      {
        url: "https://bridge.example.com/probe",
        method: "POST",
        body: "{\"accountId\":\"acct-1\"}"
      },
      {
        url: "https://bridge.example.com/resolve",
        method: "POST",
        body: "{\"accountId\":\"acct-1\",\"kind\":\"conversation\",\"query\":\"support-room\"}"
      }
    ]);
  });

  it("should use the configured outbound client factory", async () => {
    const deliveries: Array<{ messageId: string; conversationId: string }> = [];
    const plugin = createGenericHttpChannelPlugin(
      {
        enabled: true,
        defaultAccount: "acct-1",
        accounts: {
          "acct-1": {
            baseUrl: "https://bridge.example.com",
            apiKey: "test-api-key",
            signingSecret: "test-signing-secret"
          }
        }
      },
      {
        outboundClientFactory: () => ({
          async send(request) {
            deliveries.push({
              messageId: request.message.messageId,
              conversationId: request.conversation.conversationId
            });

            return {
              success: true,
              code: "DELIVERED",
              providerMessageId: `provider-${request.message.messageId}`,
              acceptedAt: "2026-05-18T00:00:00Z",
              metadata: {}
            };
          }
        })
      }
    );

    const outboundResult = await plugin.sendOutboundMessage({
      requestId: "req-out-001",
      accountId: "acct-1",
      conversationId: "room_123",
      conversationType: "room",
      threadId: "thread_001",
      messageId: "out_001",
      text: "reply"
    });

    expect(outboundResult).toEqual({
      success: true,
      code: "DELIVERED",
      providerMessageId: "provider-out_001",
      acceptedAt: "2026-05-18T00:00:00Z",
      metadata: {}
    });
    expect(deliveries).toEqual([
      {
        messageId: "out_001",
        conversationId: "room_123"
      }
    ]);
  });

  it("should fall back to local resolve when the remote endpoint is unavailable", async () => {
    const plugin = createGenericHttpChannelPlugin(
      {
        enabled: true,
        defaultAccount: "acct-1",
        accounts: {
          "acct-1": {
            baseUrl: "https://bridge.example.com",
            signingSecret: "test-signing-secret"
          }
        }
      },
      {
        resolveOptions: {
          fetchImpl: async () => new Response("not found", { status: 404 })
        }
      }
    );

    await expect(
      plugin.resolve({
        accountId: "acct-1",
        kind: "sender",
        query: "user_123"
      })
    ).resolves.toEqual({
      success: true,
      results: [
        {
          id: "user_123",
          name: "user_123",
          kind: "sender"
        }
      ]
    });
  });

  it("should expose stopped stream-ingress status before startup", () => {
    const plugin = createGenericHttpChannelPlugin({
      enabled: true,
      defaultAccount: "acct-1",
      accounts: {
        "acct-1": {
          baseUrl: "https://bridge.example.com",
          signingSecret: "test-signing-secret"
        }
      }
    });

    expect(plugin.streamIngressStatus()).toEqual({
      running: false,
      accountId: null
    });
  });
});

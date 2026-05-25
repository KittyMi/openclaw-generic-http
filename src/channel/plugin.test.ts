import { describe, expect, it, vi } from "vitest";

import { createGenericHttpChannelPlugin } from "./plugin.js";

describe("createGenericHttpChannelPlugin", () => {
  it("should include long-poll waitSeconds when pulling inbound messages", async () => {
    const requests: string[] = [];
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
        streamPullOptions: {
          fetchImpl: async (input) => {
            requests.push(String(input));
            return new Response("event: end\ndata: {\"accountId\":\"acct-1\",\"count\":0}\n\n", {
              status: 200,
              headers: { "content-type": "text/event-stream" }
            });
          }
        }
      }
    );

    await plugin.pullInboundMessages("acct-1");

    expect(requests).toEqual([
      "https://bridge.example.com/stream/inbound?accountId=acct-1&limit=10&waitSeconds=25"
    ]);
  });

  it("should use cursor-style ack when an entire pulled batch succeeds", async () => {
    const ackBodies: string[] = [];
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
        onInboundStreamMessage() {
          return;
        },
        streamPullOptions: {
          fetchImpl: async () =>
            new Response(
              [
                "event: inbound-message",
                'data: {"eventId":"evt-ok-1","accountId":"acct-1","receivedAt":"2026-05-21T00:00:00Z","request":{"eventId":"evt-ok-1","accountId":"acct-1","conversation":{"conversationId":"room-1","type":"room"},"sender":{"id":"user-1","type":"user"},"message":{"messageId":"msg-ok-1","text":"first"}}}',
                "",
                "event: inbound-message",
                'data: {"eventId":"evt-ok-2","accountId":"acct-1","receivedAt":"2026-05-21T00:00:01Z","request":{"eventId":"evt-ok-2","accountId":"acct-1","conversation":{"conversationId":"room-1","type":"room"},"sender":{"id":"user-2","type":"user"},"message":{"messageId":"msg-ok-2","text":"second"}}}',
                ""
              ].join("\n"),
              { status: 200, headers: { "content-type": "text/event-stream" } }
            ),
          nowEpochSeconds: () => 1715958000,
          nonceFactory: () => "pull-nonce",
          requestIdFactory: () => "pull-request-id"
        },
        streamAckOptions: {
          fetchImpl: async (_, init) => {
            ackBodies.push(String(init?.body ?? ""));
            return new Response(
              JSON.stringify({
                success: true,
                accountId: "acct-1",
                ackedEventIds: ["evt-ok-1", "evt-ok-2"]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          },
          nowEpochSeconds: () => 1715958001,
          nonceFactory: () => "ack-nonce",
          requestIdFactory: () => "ack-request-id"
        },
        streamIngressPollIntervalMillis: 60_000
      }
    );

    await plugin.startStreamIngress("acct-1");
    plugin.stopStreamIngress();

    expect(ackBodies).toEqual([
      '{"accountId":"acct-1","eventIds":[],"lastEventId":"evt-ok-2"}'
    ]);
  });

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
      accountId: null,
      activeAccountIds: [],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {}
    });
  });

  it("should apply exponential backoff after pull failures and reset after a later success", async () => {
    const scheduledDelays: number[] = [];
    const scheduledCallbacks: Array<() => void> = [];
    const onInboundStreamError = vi.fn();
    let pullAttempts = 0;
    let resolveRecoveryCompleted: (() => void) | undefined;
    const recoveryCompleted = new Promise<void>((resolve) => {
      resolveRecoveryCompleted = resolve;
    });
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
        onInboundStreamError,
        onInboundStreamMessage() {
          return;
        },
        streamPullOptions: {
          fetchImpl: async () => {
            pullAttempts += 1;
            if (pullAttempts === 1) {
              return new Response("bridge unavailable", {
                status: 503,
                statusText: "Service Unavailable"
              });
            }

            return new Response(
              [
                "event: inbound-message",
                'data: {"eventId":"evt-ok-1","accountId":"acct-1","receivedAt":"2026-05-21T00:00:00Z","request":{"eventId":"evt-ok-1","accountId":"acct-1","conversation":{"conversationId":"room-1","type":"room"},"sender":{"id":"user-1","type":"user"},"message":{"messageId":"msg-ok-1","text":"recovered"}}}',
                ""
              ].join("\n"),
              { status: 200, headers: { "content-type": "text/event-stream" } }
            );
          }
        },
        streamAckOptions: {
          fetchImpl: async () => {
            resolveRecoveryCompleted?.();
            return new Response(
              JSON.stringify({
                success: true,
                accountId: "acct-1",
                ackedEventIds: ["evt-ok-1"]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
        },
        streamIngressPollIntervalMillis: 1_000,
        streamIngressBackoffMultiplier: 2,
        streamIngressMaxBackoffMillis: 10_000,
        streamIngressJitterRatio: 0,
        setTimeoutImpl(callback, delayMillis) {
          scheduledDelays.push(delayMillis);
          scheduledCallbacks.push(callback);
          return setTimeout(() => undefined, delayMillis);
        },
        clearTimeoutImpl: clearTimeout
      }
    );

    await plugin.startStreamIngress("acct-1");

    expect(onInboundStreamError).toHaveBeenCalledTimes(1);
    expect(onInboundStreamError.mock.calls[0]?.[0]).toMatchObject({
      phase: "pull",
      accountId: "acct-1",
      consecutiveFailures: 1,
      retryDelayMillis: 1_000,
      error: {
        code: "INTERNAL_ERROR",
        retryable: true,
        details: {
          category: "remote-server",
          operation: "GET /stream/inbound",
          status: 503
        }
      }
    });
    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: "acct-1",
      activeAccountIds: ["acct-1"],
      consecutiveFailures: 1,
      nextRetryDelayMillis: 1_000,
      circuitState: "closed",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 1,
          nextRetryDelayMillis: 1_000,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        }
      }
    });
    expect(scheduledDelays).toEqual([1_000]);

    scheduledCallbacks[0]?.();
    await recoveryCompleted;
    await vi.waitFor(() => {
      expect(scheduledDelays).toHaveLength(2);
    });

    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: "acct-1",
      activeAccountIds: ["acct-1"],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 0,
          nextRetryDelayMillis: 0,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        }
      }
    });
    expect(scheduledDelays).toEqual([1_000, 1_000]);

    plugin.stopStreamIngress();
  });

  it("should start independent stream loops for all configured accounts when no accountId is provided", async () => {
    const requests: string[] = [];
    const plugin = createGenericHttpChannelPlugin(
      {
        enabled: true,
        defaultAccount: "acct-1",
        accounts: {
          "acct-1": {
            baseUrl: "https://bridge-one.example.com",
            signingSecret: "secret-1"
          },
          "acct-2": {
            baseUrl: "https://bridge-two.example.com",
            signingSecret: "secret-2"
          }
        }
      },
      {
        streamPullOptions: {
          fetchImpl: async (input) => {
            requests.push(String(input));
            return new Response("event: end\ndata: {\"count\":0}\n\n", {
              status: 200,
              headers: { "content-type": "text/event-stream" }
            });
          }
        }
      }
    );

    await plugin.startStreamIngress();

    expect(requests).toEqual([
      "https://bridge-one.example.com/stream/inbound?accountId=acct-1&limit=10&waitSeconds=25",
      "https://bridge-two.example.com/stream/inbound?accountId=acct-2&limit=10&waitSeconds=25"
    ]);
    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: null,
      activeAccountIds: ["acct-1", "acct-2"],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 0,
          nextRetryDelayMillis: 0,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        },
        "acct-2": {
          running: true,
          consecutiveFailures: 0,
          nextRetryDelayMillis: 0,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        }
      }
    });

    plugin.stopStreamIngress();
    expect(plugin.streamIngressStatus()).toEqual({
      running: false,
      accountId: null,
      activeAccountIds: [],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {}
    });
  });

  it("should open the circuit after repeated failures and recover after cooldown", async () => {
    const scheduledDelays: number[] = [];
    const scheduledCallbacks: Array<() => void> = [];
    const onInboundStreamError = vi.fn();
    let currentNowMillis = 1_000;
    let pullAttempts = 0;
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
        onInboundStreamError,
        streamPullOptions: {
          fetchImpl: async () => {
            pullAttempts += 1;
            if (pullAttempts <= 2) {
              return new Response("bridge unavailable", {
                status: 503,
                statusText: "Service Unavailable"
              });
            }
            return new Response("event: end\ndata: {\"count\":0}\n\n", {
              status: 200,
              headers: { "content-type": "text/event-stream" }
            });
          }
        },
        streamIngressPollIntervalMillis: 1_000,
        streamIngressBackoffMultiplier: 2,
        streamIngressMaxBackoffMillis: 10_000,
        streamIngressJitterRatio: 0,
        streamIngressCircuitBreakerThreshold: 2,
        streamIngressCircuitBreakerCooldownMillis: 5_000,
        nowMillis: () => currentNowMillis,
        setTimeoutImpl(callback, delayMillis) {
          scheduledDelays.push(delayMillis);
          scheduledCallbacks.push(callback);
          return setTimeout(() => undefined, delayMillis);
        },
        clearTimeoutImpl: clearTimeout
      }
    );

    await plugin.startStreamIngress("acct-1");

    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: "acct-1",
      activeAccountIds: ["acct-1"],
      consecutiveFailures: 1,
      nextRetryDelayMillis: 1_000,
      circuitState: "closed",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 1,
          nextRetryDelayMillis: 1_000,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        }
      }
    });

    scheduledCallbacks[0]?.();
    await vi.waitFor(() => {
      expect(scheduledDelays).toHaveLength(2);
    });

    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: "acct-1",
      activeAccountIds: ["acct-1"],
      consecutiveFailures: 2,
      nextRetryDelayMillis: 5_000,
      circuitState: "open",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 2,
          nextRetryDelayMillis: 5_000,
          circuitState: "open",
          circuitOpenUntilMillis: 6_000
        }
      }
    });

    currentNowMillis = 2_000;
    scheduledCallbacks[1]?.();
    await vi.waitFor(() => {
      expect(scheduledDelays).toHaveLength(3);
    });
    expect(scheduledDelays[2]).toBe(4_000);
    expect(pullAttempts).toBe(2);

    currentNowMillis = 6_000;
    scheduledCallbacks[2]?.();
    await vi.waitFor(() => {
      expect(scheduledDelays).toHaveLength(4);
    });

    expect(plugin.streamIngressStatus()).toEqual({
      running: true,
      accountId: "acct-1",
      activeAccountIds: ["acct-1"],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {
        "acct-1": {
          running: true,
          consecutiveFailures: 0,
          nextRetryDelayMillis: 0,
          circuitState: "closed",
          circuitOpenUntilMillis: null
        }
      }
    });
    expect(pullAttempts).toBe(3);

    plugin.stopStreamIngress();
  });

  it("should continue dispatching later inbound items when one event fails", async () => {
    const ackBodies: string[] = [];
    const onInboundStreamError = vi.fn();
    const deliveredEventIds: string[] = [];
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
        onInboundStreamMessage(item) {
          if (item.eventId === "evt-fail") {
            throw new Error("dispatch failed");
          }
          deliveredEventIds.push(item.eventId);
        },
        onInboundStreamError,
        streamPullOptions: {
          fetchImpl: async () =>
            new Response(
              [
                "event: inbound-message",
                'data: {"eventId":"evt-fail","accountId":"acct-1","receivedAt":"2026-05-21T00:00:00Z","request":{"eventId":"evt-fail","accountId":"acct-1","conversation":{"conversationId":"room-1","type":"room"},"sender":{"id":"user-1","type":"user"},"message":{"messageId":"msg-fail","text":"fail me"}}}',
                "",
                "event: inbound-message",
                'data: {"eventId":"evt-ok","accountId":"acct-1","receivedAt":"2026-05-21T00:00:01Z","request":{"eventId":"evt-ok","accountId":"acct-1","conversation":{"conversationId":"room-1","type":"room"},"sender":{"id":"user-2","type":"user"},"message":{"messageId":"msg-ok","text":"continue"}}}',
                ""
              ].join("\n"),
              { status: 200, headers: { "content-type": "text/event-stream" } }
            ),
          nowEpochSeconds: () => 1715958000,
          nonceFactory: () => "pull-nonce",
          requestIdFactory: () => "pull-request-id"
        },
        streamAckOptions: {
          fetchImpl: async (_, init) => {
            ackBodies.push(String(init?.body ?? ""));
            return new Response(
              JSON.stringify({
                success: true,
                accountId: "acct-1",
                ackedEventIds: ["evt-ok"]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          },
          nowEpochSeconds: () => 1715958001,
          nonceFactory: () => "ack-nonce",
          requestIdFactory: () => "ack-request-id"
        },
        streamIngressPollIntervalMillis: 60_000
      }
    );

    await plugin.startStreamIngress("acct-1");
    plugin.stopStreamIngress();

    expect(deliveredEventIds).toEqual(["evt-ok"]);
    expect(ackBodies).toEqual(['{"accountId":"acct-1","eventIds":["evt-ok"]}']);
    expect(onInboundStreamError).toHaveBeenCalledTimes(1);
    expect(onInboundStreamError.mock.calls[0]?.[0]).toMatchObject({
      phase: "dispatch",
      accountId: "acct-1",
      eventId: "evt-fail"
    });
  });

  it("should abort an in-flight pull when stopping stream ingress without reporting an error", async () => {
    const onInboundStreamError = vi.fn();
    let capturedSignal: AbortSignal | undefined;
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
        onInboundStreamError,
        streamPullOptions: {
          fetchImpl: async (_, init) =>
            await new Promise<Response>((_, reject) => {
              capturedSignal = init?.signal as AbortSignal | undefined;
              const abortError = new Error("request aborted");
              abortError.name = "AbortError";
              capturedSignal?.addEventListener(
                "abort",
                () => reject(abortError),
                { once: true }
              );
            })
        }
      }
    );

    const startPromise = plugin.startStreamIngress("acct-1");
    await vi.waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    plugin.stopStreamIngress("acct-1");
    await startPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(onInboundStreamError).not.toHaveBeenCalled();
    expect(plugin.streamIngressStatus()).toEqual({
      running: false,
      accountId: null,
      activeAccountIds: [],
      consecutiveFailures: 0,
      nextRetryDelayMillis: 0,
      circuitState: "closed",
      perAccount: {}
    });
  });
});

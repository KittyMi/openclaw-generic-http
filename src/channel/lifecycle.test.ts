import { describe, expect, it, vi } from "vitest";

import { createGenericHttpChannelLifecycle } from "./lifecycle.js";

describe("createGenericHttpChannelLifecycle", () => {
  it("dispatches normalized inbound events through the host lifecycle", async () => {
    const dispatchedEventIds: string[] = [];
    const lifecycle = createGenericHttpChannelLifecycle(
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
        dispatchInboundEvent(event) {
          dispatchedEventIds.push(event.eventId);
        }
      },
      {
        streamPullOptions: {
          fetchImpl: async () =>
            new Response(
              [
                "event: inbound-message",
                'data: {"eventId":"evt_001","accountId":"acct-1","receivedAt":"2026-05-18T08:00:00Z","request":{"eventId":"evt_001","accountId":"acct-1","conversation":{"conversationId":"room_123","type":"room"},"sender":{"id":"user_123","type":"user"},"message":{"messageId":"msg_001","text":"hello from lifecycle"}}}',
                ""
              ].join("\n"),
              { status: 200, headers: { "content-type": "text/event-stream" } }
            ),
          nowEpochSeconds: () => 1715958000,
          nonceFactory: () => "pull-nonce",
          requestIdFactory: () => "pull-request-id"
        },
        streamAckOptions: {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                success: true,
                accountId: "acct-1",
                ackedEventIds: ["evt_001"]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            ),
          nowEpochSeconds: () => 1715958001,
          nonceFactory: () => "ack-nonce",
          requestIdFactory: () => "ack-request-id"
        }
      }
    );

    await lifecycle.start("acct-1");
    lifecycle.stop();

    expect(dispatchedEventIds).toEqual(["evt_001"]);
    expect(lifecycle.plugin.streamIngressStatus()).toEqual({
      running: false,
      accountId: null
    });
  });

  it("forwards stream loop errors to the host error handler", async () => {
    const onStreamError = vi.fn();
    const lifecycle = createGenericHttpChannelLifecycle(
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
        dispatchInboundEvent() {
          throw new Error("should not dispatch");
        },
        onStreamError
      },
      {
        streamPullOptions: {
          fetchImpl: async () =>
            new Response("bridge unavailable", {
              status: 503,
              statusText: "Service Unavailable"
            }),
          nowEpochSeconds: () => 1715958000,
          nonceFactory: () => "pull-nonce",
          requestIdFactory: () => "pull-request-id"
        },
        streamIngressPollIntervalMillis: 60_000
      }
    );

    await lifecycle.start("acct-1");
    lifecycle.stop();

    expect(onStreamError).toHaveBeenCalledTimes(1);
    expect(onStreamError.mock.calls[0]?.[0]).toMatchObject({
      phase: "pull",
      accountId: "acct-1"
    });
    expect(
      String(onStreamError.mock.calls[0]?.[0]?.error)
    ).toContain("GET /stream/inbound failed");
  });
});

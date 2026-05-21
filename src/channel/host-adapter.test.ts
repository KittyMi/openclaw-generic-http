import { describe, expect, it, vi } from "vitest";

import { createGenericHttpHostAdapter } from "./host-adapter.js";

describe("createGenericHttpHostAdapter", () => {
  it("exposes host lifecycle methods on top of the plugin runtime", async () => {
    const dispatchedEventIds: string[] = [];
    const adapter = createGenericHttpHostAdapter(
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
                'data: {"eventId":"evt_host_001","accountId":"acct-1","receivedAt":"2026-05-18T08:30:00Z","request":{"eventId":"evt_host_001","accountId":"acct-1","conversation":{"conversationId":"room_123","type":"room"},"sender":{"id":"user_123","type":"user"},"message":{"messageId":"msg_host_001","text":"hello from host adapter"}}}',
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
                ackedEventIds: ["evt_host_001"]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            ),
          nowEpochSeconds: () => 1715958001,
          nonceFactory: () => "ack-nonce",
          requestIdFactory: () => "ack-request-id"
        }
      }
    );

    expect(adapter.status()).toEqual({
      enabled: true,
      defaultAccount: "acct-1",
      accounts: ["acct-1"]
    });

    await adapter.activate("acct-1");
    adapter.deactivate();

    expect(dispatchedEventIds).toEqual(["evt_host_001"]);
    expect(adapter.plugin.streamIngressStatus()).toEqual({
      running: false,
      accountId: null
    });
  });

  it("forwards stream errors through the host handler", async () => {
    const onStreamError = vi.fn();
    const adapter = createGenericHttpHostAdapter(
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

    await adapter.activate("acct-1");
    adapter.deactivate();

    expect(onStreamError).toHaveBeenCalledTimes(1);
    expect(onStreamError.mock.calls[0]?.[0]).toMatchObject({
      phase: "pull",
      accountId: "acct-1"
    });
  });
});

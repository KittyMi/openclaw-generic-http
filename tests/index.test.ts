import { describe, expect, it } from "vitest";

import defaultPluginEntry, {
  activate,
  openClawGenericHttpChannelPlugin,
  register,
  registerPlugin
} from "../src/index.js";

describe("registerPlugin", () => {
  it("returns a host-oriented plugin registration shape", () => {
    const registration = registerPlugin();

    expect(registration.pluginId).toBe("openclaw-generic-http");
    expect(registration.channelName).toBe("generic-http");
    expect(registration.defaultPlugin.name).toBe("generic-http");
    expect(registration.channels).toEqual([
      {
        name: "generic-http",
        displayName: "Generic HTTP",
        configSchemaFile: "./openclaw.config.schema.json"
      }
    ]);
    expect(registration.configSchema.properties.accounts).toBeDefined();

    const adapter = registration.createHostAdapter(
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
          return undefined;
        }
      }
    );

    expect(adapter.status()).toEqual({
      enabled: true,
      defaultAccount: "acct-1",
      accounts: ["acct-1"]
    });
  });

  it("exports the OpenClaw runtime registration entrypoints", () => {
    const registered: Array<{ plugin: unknown }> = [];

    register({
      registerChannel(registration) {
        registered.push(registration as { plugin: unknown });
      }
    });

    expect(activate).toBe(register);
    expect(defaultPluginEntry.id).toBe("openclaw-generic-http");
    expect(registered).toHaveLength(1);
    expect(registered[0]).toEqual(
      expect.objectContaining({
        plugin: expect.objectContaining({
          id: "generic-http"
        })
      })
    );
  });

  it("builds distinct OpenClaw session routes from account, conversation, and thread", () => {
    const routeA = openClawGenericHttpChannelPlugin.messaging.resolveInboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-a",
      conversationId: "room-123",
      conversationType: "room",
      threadId: "thread-1"
    });
    const routeB = openClawGenericHttpChannelPlugin.messaging.resolveInboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-b",
      conversationId: "room-123",
      conversationType: "room",
      threadId: "thread-1"
    });
    const routeC = openClawGenericHttpChannelPlugin.messaging.resolveInboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-a",
      conversationId: "room-123",
      conversationType: "room",
      threadId: "thread-2"
    });

    expect(routeA?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-a:channel:room-123:thread:thread-1"
    );
    expect(routeB?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-b:channel:room-123:thread:thread-1"
    );
    expect(routeC?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-a:channel:room-123:thread:thread-2"
    );
    expect(routeA?.sessionKey).not.toBe(routeB?.sessionKey);
    expect(routeA?.sessionKey).not.toBe(routeC?.sessionKey);
  });

  it("uses the same composite routing rule for outbound session routes", () => {
    const route = openClawGenericHttpChannelPlugin.messaging.resolveOutboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-a",
      target: "room:room-123",
      threadId: "thread-1"
    });

    expect(route?.baseSessionKey).toBe("agent:agent-1:generic-http:acct-a:channel:room-123");
    expect(route?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-a:channel:room-123:thread:thread-1"
    );
  });

  it("keeps the same five-part session rule when threadId is absent", () => {
    const inboundRoute = openClawGenericHttpChannelPlugin.messaging.resolveInboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-a",
      conversationId: "room-123",
      conversationType: "room"
    });
    const outboundRoute = openClawGenericHttpChannelPlugin.messaging.resolveOutboundSessionRoute({
      agentId: "agent-1",
      accountId: "acct-a",
      target: "room:room-123"
    });

    expect(inboundRoute?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-a:channel:room-123:thread:__root__"
    );
    expect(outboundRoute?.sessionKey).toBe(
      "agent:agent-1:generic-http:acct-a:channel:room-123:thread:__root__"
    );
    expect(inboundRoute?.threadId).toBe("__root__");
    expect(outboundRoute?.threadId).toBe("__root__");
  });

  it("rejects channel config when defaultAccount does not match a configured account", () => {
    expect(
      openClawGenericHttpChannelPlugin.configSchema.validate({
        enabled: true,
        defaultAccount: "online_001",
        accounts: {
          online: {
            baseUrl: "https://bridge.example.com"
          }
        }
      })
    ).toEqual({
      ok: false,
      errors: ["generic-http defaultAccount must reference a configured account."]
    });
  });

  it("exposes default-account binding details in the OpenClaw account snapshot", () => {
    const account = openClawGenericHttpChannelPlugin.config.resolveAccount(
      {
        channels: {
          "generic-http": {
            enabled: true,
            defaultAccount: "online_001",
            accounts: {
              online_001: {
                baseUrl: "https://bridge.example.com",
                signingSecret: "test-signing-secret"
              }
            }
          }
        }
      },
      "online_001"
    );

    expect(
      openClawGenericHttpChannelPlugin.config.describeAccount(account)
    ).toEqual({
      accountId: "online_001",
      defaultAccountId: "online_001",
      isDefault: true,
      name: "Default account",
      enabled: true,
      configured: true,
      baseUrl: "https://bridge.example.com",
      configuration: {
        baseUrlConfigured: true,
        apiKeyConfigured: false,
        signingSecretConfigured: true,
        inboundSecretConfigured: true,
        outboundSecretConfigured: true,
        readyForStream: true,
        readyForOutbound: true,
        status: "OK",
        issues: []
      }
    });
    expect(
      openClawGenericHttpChannelPlugin.status.buildAccountSnapshot({
        account
      })
    ).toMatchObject({
      accountId: "online_001",
      defaultAccountId: "online_001",
      isDefault: true,
      configured: true,
      baseUrl: "https://bridge.example.com",
      configuration: {
        status: "OK",
        readyForStream: true,
        readyForOutbound: true
      }
    });
  });

  it("reports degraded configuration details when a required transport field is missing", () => {
    const account = openClawGenericHttpChannelPlugin.config.resolveAccount(
      {
        channels: {
          "generic-http": {
            enabled: true,
            defaultAccount: "online_001",
            accounts: {
              online_001: {
                baseUrl: "https://bridge.example.com"
              }
            }
          }
        }
      },
      "online_001"
    );

    expect(
      openClawGenericHttpChannelPlugin.status.buildAccountSnapshot({
        account
      })
    ).toMatchObject({
      accountId: "online_001",
      configuration: {
        signingSecretConfigured: false,
        readyForStream: false,
        readyForOutbound: false,
        status: "DEGRADED",
        issues: ["signingSecret is missing"]
      }
    });
  });

  it("uses the configured default account for outbound delivery when the caller omits accountId", async () => {
    const originalFetch = globalThis.fetch;
    const outboundBodies: string[] = [];

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/outbound/messages")) {
        outboundBodies.push(String(init?.body ?? ""));
        return new Response(
          JSON.stringify({
            success: true,
            code: "DELIVERED",
            providerMessageId: "provider-default-account",
            acceptedAt: "2026-05-21T00:00:00Z",
            metadata: {}
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    try {
      await openClawGenericHttpChannelPlugin.outbound.sendText({
        cfg: {
          channels: {
            "generic-http": {
              enabled: true,
              defaultAccount: "online_001",
              accounts: {
                online_001: {
                  baseUrl: "https://bridge.example.com",
                  signingSecret: "test-signing-secret"
                }
              }
            }
          }
        },
        to: "room:room-123",
        text: "hello default account"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(outboundBodies).toHaveLength(1);
    expect(JSON.parse(outboundBodies[0] ?? "{}")).toMatchObject({
      accountId: "online_001",
      conversation: {
        conversationId: "room-123",
        type: "room"
      },
      message: {
        text: "hello default account"
      }
    });
  });

  it("starts gateway stream ingress and dispatches inbound events through OpenClaw runtime", async () => {
    const originalFetch = globalThis.fetch;
    const outboundBodies: string[] = [];
    const ackBodies: string[] = [];
    const errorEventBodies: string[] = [];
    const statusPatches: Array<Record<string, unknown>> = [];
    const dispatchedTurns: Array<Record<string, unknown>> = [];
    const abortController = new AbortController();

    globalThis.fetch = async (input, init) => {
      const url = String(input);

      if (url.includes("/stream/inbound?")) {
        return new Response(
          [
            "event: inbound-message",
            `data: ${JSON.stringify({
              eventId: "evt-1",
              accountId: "acct-1",
              receivedAt: "2026-05-19T08:00:00Z",
              request: {
                eventId: "evt-1",
                accountId: "acct-1",
                conversation: {
                  conversationId: "room-123",
                  type: "room",
                  title: "项目群"
                },
                threadId: "thread-1",
                sender: {
                  id: "user-1",
                  name: "张三",
                  type: "user"
                },
                message: {
                  messageId: "msg-1",
                  attachments: [
                    {
                      name: "报价单.xlsx",
                      contentType:
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      url: "https://cdn.example.com/quote.xlsx",
                      sizeBytes: 56320
                    }
                  ]
                },
                occurredAt: "2026-05-19T08:00:00Z"
              }
            })}`,
            "",
            "event: inbound-message",
            `data: ${JSON.stringify({
              eventId: "evt-2",
              accountId: "acct-1",
              receivedAt: "2026-05-19T08:00:02Z",
              request: {
                eventId: "evt-2",
                accountId: "acct-1",
                conversation: {
                  conversationId: "room-123",
                  type: "room",
                  title: "项目群"
                },
                threadId: "thread-1",
                sender: {
                  id: "user-2",
                  name: "李四",
                  type: "user"
                },
                message: {
                  messageId: "msg-2",
                  text: "follow up"
                },
                occurredAt: "2026-05-19T08:00:02Z"
              }
            })}`,
            "",
            ""
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" }
          }
        );
      }

      if (url.endsWith("/stream/acks")) {
        ackBodies.push(String(init?.body ?? ""));
        abortController.abort();
        return new Response(
          JSON.stringify({
            success: true,
            accountId: "acct-1",
            ackedEventIds: ["evt-2"]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url.endsWith("/webhooks/inbound/events")) {
        errorEventBodies.push(String(init?.body ?? ""));
        return new Response(
          JSON.stringify({
            success: true,
            code: "ACCEPTED",
            requestId: "req-error-1",
            eventId: "evt-plugin-error-1",
            deduplicated: false,
            message: "accepted"
          }),
          {
            status: 202,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url.endsWith("/outbound/messages")) {
        outboundBodies.push(String(init?.body ?? ""));
        if (outboundBodies.length === 1) {
          return new Response("upstream unavailable", {
            status: 503,
            statusText: "Service Unavailable"
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            code: "DELIVERED",
            providerMessageId: "provider-1",
            acceptedAt: "2026-05-19T08:00:01Z",
            metadata: {}
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    try {
      await openClawGenericHttpChannelPlugin.gateway.startAccount({
        cfg: {
          channels: {
            "generic-http": {
              enabled: true,
              defaultAccount: "acct-1",
              accounts: {
                "acct-1": {
                  baseUrl: "https://bridge.example.com",
                  signingSecret: "test-signing-secret"
                }
              }
            }
          }
        },
        accountId: "acct-1",
        account: {
          accountId: "acct-1",
          defaultAccountId: "acct-1",
          isDefault: true,
          enabled: true,
          name: "Default account",
          configured: true,
          config: {
            baseUrl: "https://bridge.example.com",
            signingSecret: "test-signing-secret"
          }
        },
        abortSignal: abortController.signal,
        setStatus(next) {
          statusPatches.push(next);
        },
        channelRuntime: {
          routing: {
            resolveAgentRoute() {
              return {
                agentId: "agent-1",
                accountId: "acct-1",
                sessionKey: "legacy-session",
                mainSessionKey: "legacy-main",
                lastRoutePolicy: "session"
              };
            }
          },
          session: {
            resolveStorePath() {
              return "session-store";
            },
            recordInboundSession: {}
          },
          reply: {
            dispatchReplyWithBufferedBlockDispatcher: {},
            finalizeInboundContext(params: Record<string, unknown>) {
              return params;
            }
          },
          turn: {
            async runAssembled(params: Record<string, unknown>) {
              dispatchedTurns.push(params);
              const delivery = params.delivery as {
                deliver: (
                  payload: Record<string, unknown>
                ) => Promise<Record<string, unknown> | void>;
              };
              const result = await delivery.deliver({
                text: "pong",
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
                ]
              });
              expect(result).toEqual({ visibleReplySent: true });
            }
          }
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedTurns).toHaveLength(2);
    expect(dispatchedTurns[0]?.routeSessionKey).toBe(
      "agent:agent-1:generic-http:acct-1:channel:room-123:thread:thread-1"
    );
    expect(dispatchedTurns[0]?.replyOptions).toEqual({
      sourceReplyDeliveryMode: "automatic"
    });
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.ConversationLabel).toBe(
      "项目群 / thread-1"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.Body).toContain(
      "用户发送了附件"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.Body).toContain(
      "报价单.xlsx"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.BodyForAgent).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.OriginalBody).toBe("");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.AttachmentCount).toBe(1);
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.MessageAttachments).toEqual([
      {
        name: "报价单.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        url: "https://cdn.example.com/quote.xlsx",
        sizeBytes: 56320
      }
    ]);
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.From).toBe(
      "项目群 / thread-1"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.To).toBe(
      "room:room-123"
    );
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.SenderId).toBe("user-1");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.SenderName).toBe("张三");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.GroupSubject).toBe("项目群");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.TopicName).toBe("thread-1");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.MessageThreadId).toBe("thread-1");
    expect((dispatchedTurns[0]?.ctxPayload as Record<string, unknown>)?.OriginatingTo).toBe(
      "room:room-123"
    );
    expect(outboundBodies).toHaveLength(2);
    expect(JSON.parse(outboundBodies[1] ?? "{}")).toMatchObject({
      accountId: "acct-1",
      threadId: "thread-1",
      conversation: {
        conversationId: "room-123",
        type: "room"
      },
      message: {
        text: "pong",
        attachments: [
          {
            kind: "file",
            name: "report.pdf",
            contentType: "application/pdf",
            url: "https://cdn.example.com/report.pdf"
          },
          {
            kind: "image",
            contentType: "image/png",
            contentBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
            altText: "chart"
          }
        ]
      }
    });
    expect(ackBodies).toEqual(['{"accountId":"acct-1","eventIds":["evt-2"]}']);
    expect(errorEventBodies).toHaveLength(1);
    expect(JSON.parse(errorEventBodies[0] ?? "{}")).toMatchObject({
      eventType: "plugin.dispatch.error",
      accountId: "acct-1",
      conversation: {
        conversationId: "room-123",
        type: "room"
      },
      sender: {
        id: "openclaw-generic-http",
        type: "system"
      },
      message: {
        metadata: {
          errorCategory: "remote-server",
          errorOperation: "POST /outbound/messages",
          errorStatus: 503,
          retryable: true
        }
      },
      metadata: {
        errorCategory: "remote-server",
        errorOperation: "POST /outbound/messages",
        errorStatus: 503,
        retryable: true
      }
    });
    expect(JSON.parse(errorEventBodies[0] ?? "{}").message?.text).toContain(
      "generic-http dispatch error"
    );
    expect(JSON.parse(errorEventBodies[0] ?? "{}").message?.text).toContain(
      "category=remote-server"
    );
    expect(JSON.parse(errorEventBodies[0] ?? "{}").message?.text).toContain(
      "status=503"
    );
    expect(JSON.parse(errorEventBodies[0] ?? "{}").message?.text).toContain(
      "retryable=true"
    );
    expect(
      statusPatches.some((patch) => patch.running === true)
    ).toBe(true);
    expect(
      statusPatches.some((patch) => patch.lastInboundAt !== undefined)
    ).toBe(true);
    expect(
      statusPatches.some(
        (patch) =>
          typeof patch.lastError === "string" &&
          patch.lastError.includes("category=remote-server") &&
          patch.lastError.includes("status=503") &&
          patch.lastError.includes("retryable=true")
      )
    ).toBe(true);
    expect(
      statusPatches.some((patch) => patch.running === false)
    ).toBe(true);
  });
});

import { randomUUID } from "node:crypto";

import {
  createGenericHttpChannelLifecycle,
  type GenericHttpChannelLifecycle
} from "./channel/lifecycle.js";
import { createGenericHttpChannelPlugin } from "./channel/plugin.js";
import type { NormalizedInboundMessageEvent } from "./inbound/mapper.js";
import type { GenericHttpPluginConfig } from "./config/schema.js";

const CHANNEL_ID = "generic-http";
const CHANNEL_SECTION = "generic-http";
const DEFAULT_ACCOUNT_ID = "default";
const ROOT_THREAD_ID = "__root__";

type OpenClawConfigLike = {
  channels?: Record<string, unknown>;
};

type OpenClawPluginApiLike = {
  registrationMode?: string;
  registerChannel: (registration: { plugin: unknown } | unknown) => void;
};

type OpenClawRoutePeerLike = {
  kind: "direct" | "group" | "channel";
  id: string;
};

type OpenClawResolvedRouteLike = {
  agentId: string;
  accountId: string;
  sessionKey: string;
  mainSessionKey?: string;
  lastRoutePolicy?: "main" | "session";
};

type OpenClawChannelRuntimeLike = {
  routing: {
    resolveAgentRoute: (params: {
      cfg: OpenClawConfigLike;
      channel: string;
      accountId?: string | null;
      peer?: OpenClawRoutePeerLike | null;
      parentPeer?: OpenClawRoutePeerLike | null;
    }) => OpenClawResolvedRouteLike;
  };
  session: {
    resolveStorePath: (store: string | undefined, opts: { agentId: string }) => string;
    recordInboundSession: unknown;
  };
  reply: {
    dispatchReplyWithBufferedBlockDispatcher: unknown;
    finalizeInboundContext?: (params: Record<string, unknown>) => Record<string, unknown>;
  };
  turn: {
    runAssembled: (params: Record<string, unknown>) => Promise<unknown>;
  };
};

type OpenClawGatewayContextLike = {
  cfg: OpenClawConfigLike;
  accountId: string;
  account: GenericHttpResolvedAccount;
  abortSignal: AbortSignal;
  log?: {
    info?: (message: string) => void;
    error?: (message: string) => void;
  };
  setStatus: (next: Record<string, unknown>) => void;
  channelRuntime?: unknown;
};

type ChannelAccountRuntimeLike = {
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastTransportActivityAt?: number | null;
  probe?: unknown;
  lastProbeAt?: number | null;
};

type GenericHttpResolvedAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  config: GenericHttpPluginConfig["accounts"][string];
};

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function readChannelSection(cfg: OpenClawConfigLike): Partial<GenericHttpPluginConfig> {
  const rawSection = cfg?.channels?.[CHANNEL_SECTION];
  if (rawSection && typeof rawSection === "object" && !Array.isArray(rawSection)) {
    return cloneConfig(rawSection as Partial<GenericHttpPluginConfig>);
  }
  return {};
}

function createRuntime(cfg: OpenClawConfigLike) {
  return createGenericHttpChannelPlugin(readChannelSection(cfg));
}

const gatewayLifecycles = new Map<string, GenericHttpChannelLifecycle>();

function resolveAccountSnapshot(
  cfg: OpenClawConfigLike,
  accountId?: string | null
): GenericHttpResolvedAccount {
  const runtime = createRuntime(cfg);
  const resolved = runtime.config;
  const normalizedAccountId =
    typeof accountId === "string" && accountId.trim() !== ""
      ? accountId.trim()
      : resolved.defaultAccount;
  const account = resolved.accounts[normalizedAccountId];

  return {
    accountId: normalizedAccountId,
    enabled: resolved.enabled,
    name:
      normalizedAccountId === resolved.defaultAccount
        ? "Default account"
        : normalizedAccountId,
    configured: typeof account?.baseUrl === "string" && account.baseUrl.trim() !== "",
    config: account ?? resolved.accounts[DEFAULT_ACCOUNT_ID]
  };
}

type ParsedTarget = {
  conversationId: string;
  conversationType: "dm" | "group" | "room";
  chatType: "direct" | "group" | "channel";
};

function chatTypeForConversationType(
  conversationType: "dm" | "group" | "room" | "ticket"
): ParsedTarget["chatType"] {
  if (conversationType === "group") {
    return "group";
  }
  if (conversationType === "room" || conversationType === "ticket") {
    return "channel";
  }
  return "direct";
}

function parseTarget(raw: string): ParsedTarget | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  const strippedProviderPrefix = trimmed.replace(/^generic-http:/i, "").trim();
  if (strippedProviderPrefix === "") {
    return null;
  }

  if (/^(dm|direct):/i.test(strippedProviderPrefix)) {
    return {
      conversationId: strippedProviderPrefix.replace(/^(dm|direct):/i, "").trim(),
      conversationType: "dm",
      chatType: "direct"
    };
  }

  if (/^group:/i.test(strippedProviderPrefix)) {
    return {
      conversationId: strippedProviderPrefix.replace(/^group:/i, "").trim(),
      conversationType: "group",
      chatType: "group"
    };
  }

  if (/^(channel|room):/i.test(strippedProviderPrefix)) {
    return {
      conversationId: strippedProviderPrefix.replace(/^(channel|room):/i, "").trim(),
      conversationType: "room",
      chatType: "channel"
    };
  }

  return {
    conversationId: strippedProviderPrefix,
    conversationType: "dm",
    chatType: "direct"
  };
}

function normalizeTarget(raw: string): string | undefined {
  const parsed = parseTarget(raw);
  if (!parsed || parsed.conversationId === "") {
    return undefined;
  }
  return `${parsed.chatType}:${parsed.conversationId}`;
}

function buildBaseSessionKey(params: {
  agentId: string;
  accountId: string;
  chatType: ParsedTarget["chatType"];
  conversationId: string;
}): string {
  return [
    "agent",
    params.agentId,
    CHANNEL_ID,
    params.accountId,
    params.chatType,
    params.conversationId
  ].join(":");
}

function normalizeSessionThreadId(
  threadId?: string | number | null
): string {
  if (threadId === null || threadId === undefined) {
    return ROOT_THREAD_ID;
  }

  const normalized = String(threadId).trim();
  return normalized === "" ? ROOT_THREAD_ID : normalized;
}

function toRoutePeer(
  conversationId: string,
  conversationType: "dm" | "group" | "room" | "ticket"
): OpenClawRoutePeerLike {
  return {
    kind: chatTypeForConversationType(conversationType),
    id: conversationId
  };
}

function toTargetRef(
  conversationId: string,
  conversationType: "dm" | "group" | "room" | "ticket"
): string {
  if (conversationType === "group") {
    return `group:${conversationId}`;
  }
  if (conversationType === "room" || conversationType === "ticket") {
    return `room:${conversationId}`;
  }
  return `dm:${conversationId}`;
}

function parseOccurredAtMillis(occurredAt?: string | null): number | undefined {
  if (typeof occurredAt !== "string" || occurredAt.trim() === "") {
    return undefined;
  }

  const parsed = Date.parse(occurredAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  return "unknown generic-http gateway error";
}

function normalizeDisplayText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function buildConversationLabel(params: {
  conversationId: string;
  conversationType: "dm" | "group" | "room" | "ticket";
  conversationTitle?: string | null;
  threadId?: string | null;
}): string {
  const title = normalizeDisplayText(params.conversationTitle);
  const threadId = normalizeDisplayText(params.threadId);
  const baseLabel = title ?? params.conversationId;

  if (!threadId) {
    return baseLabel;
  }

  return `${baseLabel} / ${threadId}`;
}

function requireChannelRuntime(
  value: unknown
): OpenClawChannelRuntimeLike {
  if (
    value &&
    typeof value === "object" &&
    "routing" in value &&
    "session" in value &&
    "reply" in value &&
    "turn" in value
  ) {
    return value as OpenClawChannelRuntimeLike;
  }

  throw new Error(
    "OpenClaw channelRuntime is unavailable; generic-http stream ingress cannot dispatch inbound messages"
  );
}

function finalizeInboundContextForRuntime(
  runtime: OpenClawChannelRuntimeLike,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (typeof runtime.reply.finalizeInboundContext === "function") {
    return runtime.reply.finalizeInboundContext(payload);
  }
  return payload;
}

async function deliverOutboundReply(params: {
  cfg: OpenClawConfigLike;
  accountId: string;
  conversationId: string;
  conversationType: "dm" | "group" | "room" | "ticket";
  threadId?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const text = typeof params.payload.text === "string" ? params.payload.text : "";
  const mediaUrls: string[] = [];
  const rawMediaUrls = params.payload.mediaUrls;

  if (Array.isArray(rawMediaUrls)) {
    for (const mediaUrl of rawMediaUrls) {
      if (typeof mediaUrl === "string" && mediaUrl.trim() !== "") {
        mediaUrls.push(mediaUrl);
      }
    }
  } else if (
    typeof params.payload.mediaUrl === "string" &&
    params.payload.mediaUrl.trim() !== ""
  ) {
    mediaUrls.push(params.payload.mediaUrl);
  }

  if (mediaUrls.length === 0) {
    if (text.trim() === "") {
      return;
    }
    await openClawGenericHttpChannelPlugin.outbound.sendText({
      cfg: params.cfg,
      to: toTargetRef(params.conversationId, params.conversationType),
      text,
      threadId: params.threadId,
      accountId: params.accountId
    });
    return;
  }

  for (const [index, mediaUrl] of mediaUrls.entries()) {
    await openClawGenericHttpChannelPlugin.outbound.sendMedia({
      cfg: params.cfg,
      to: toTargetRef(params.conversationId, params.conversationType),
      text: index === 0 ? text : "",
      mediaUrl,
      threadId: params.threadId,
      accountId: params.accountId
    });
  }
}

async function dispatchInboundEventToOpenClaw(params: {
  ctx: OpenClawGatewayContextLike;
  event: NormalizedInboundMessageEvent;
}): Promise<void> {
  const runtime = requireChannelRuntime(params.ctx.channelRuntime);
  const route = runtime.routing.resolveAgentRoute({
    cfg: params.ctx.cfg,
    channel: CHANNEL_ID,
    accountId: params.event.accountId,
    peer: toRoutePeer(params.event.conversationId, params.event.conversationType as "dm" | "group" | "room" | "ticket")
  });
  const sessionRoute =
    openClawGenericHttpChannelPlugin.messaging.resolveInboundSessionRoute({
      agentId: route.agentId,
      accountId: params.event.accountId,
      conversationId: params.event.conversationId,
      conversationType:
        params.event.conversationType as "dm" | "group" | "room" | "ticket",
      threadId: params.event.threadId
    });
  const targetRef = toTargetRef(
    params.event.conversationId,
    params.event.conversationType as "dm" | "group" | "room" | "ticket"
  );
  const senderName = normalizeDisplayText(params.event.senderName) ?? params.event.senderId;
  const conversationLabel = buildConversationLabel({
    conversationId: params.event.conversationId,
    conversationType:
      params.event.conversationType as "dm" | "group" | "room" | "ticket",
    conversationTitle: params.event.conversationTitle,
    threadId: params.event.threadId
  });
  const routeSessionKey = sessionRoute?.sessionKey ?? route.sessionKey;
  const storePath = runtime.session.resolveStorePath(undefined, {
    agentId: route.agentId
  });
  const chatType = chatTypeForConversationType(
    params.event.conversationType as "dm" | "group" | "room" | "ticket"
  );
  const groupSubject =
    chatType === "direct"
      ? undefined
      : normalizeDisplayText(params.event.conversationTitle) ?? params.event.conversationId;
  const inboundFrom = chatType === "direct" ? senderName : conversationLabel;
  const ctxPayload = finalizeInboundContextForRuntime(runtime, {
    Body: params.event.text ?? "",
    BodyForAgent: params.event.text ?? "",
    RawBody: params.event.text ?? "",
    CommandBody: params.event.text ?? "",
    From: inboundFrom,
    To: targetRef,
    SessionKey: routeSessionKey,
    AccountId: params.event.accountId,
    ChatType: chatType,
    ConversationLabel: conversationLabel,
    GroupSubject: groupSubject,
    TopicName: normalizeDisplayText(params.event.threadId),
    MessageThreadId: params.event.threadId ?? undefined,
    SenderName: senderName,
    SenderId: params.event.senderId,
    Provider: CHANNEL_ID,
    Surface: "stream",
    MessageSid: params.event.messageId,
    MessageSidFull: params.event.messageId,
    ReplyToId: params.event.replyToMessageId ?? undefined,
    Timestamp: parseOccurredAtMillis(params.event.occurredAt),
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: targetRef,
    CommandAuthorized: false,
    WasMentioned: chatType === "direct" ? undefined : true,
    UntrustedStructuredContext: [
      {
        kind: "generic-http",
        eventId: params.event.eventId,
        idempotencyKey: params.event.idempotencyKey,
        metadata: params.event.metadata
      }
    ]
  });

  await runtime.turn.runAssembled({
    cfg: params.ctx.cfg,
    channel: CHANNEL_ID,
    accountId: params.event.accountId,
    agentId: route.agentId,
    routeSessionKey,
    storePath,
    ctxPayload,
    recordInboundSession: runtime.session.recordInboundSession,
    dispatchReplyWithBufferedBlockDispatcher:
      runtime.reply.dispatchReplyWithBufferedBlockDispatcher,
    delivery: {
      deliver: async (payload: Record<string, unknown>) => {
        await deliverOutboundReply({
          cfg: params.ctx.cfg,
          accountId: params.event.accountId,
          conversationId: params.event.conversationId,
          conversationType:
            params.event.conversationType as "dm" | "group" | "room" | "ticket",
          threadId: params.event.threadId,
          payload
        });
        return { visibleReplySent: true };
      }
    },
    replyOptions: {
      sourceReplyDeliveryMode: "automatic"
    },
    messageId: params.event.messageId
  });
}

function inferAttachmentKind(mediaUrl: string): "image" | "file" {
  const pathname = new URL(mediaUrl).pathname.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(pathname)) {
    return "image";
  }
  return "file";
}

function toAttachments(
  mediaUrl?: string
): Array<{ kind: "image" | "file"; url: string }> | undefined {
  if (typeof mediaUrl !== "string" || mediaUrl.trim() === "") {
    return undefined;
  }
  return [
    {
      kind: inferAttachmentKind(mediaUrl),
      url: mediaUrl
    }
  ];
}

function nowRequestId(): string {
  return randomUUID();
}

function buildOpenClawChannelPlugin() {
  return {
    id: CHANNEL_ID,
    meta: {
      id: CHANNEL_ID,
      label: "Generic HTTP",
      selectionLabel: "Generic HTTP",
      docsPath: "/channels/generic-http",
      blurb:
        "Bridge external systems into OpenClaw through webhook ingress and stream polling."
    },
    capabilities: {
      chatTypes: ["direct", "group", "channel", "thread"],
      media: true,
      threads: true
    },
    reload: {
      configPrefixes: ["channels.generic-http"]
    },
    configSchema: {
      validate(value: unknown) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          return {
            ok: false,
            errors: ["channels.generic-http must be an object"]
          };
        }
        return { ok: true, value: value as object };
      }
    },
    config: {
      listAccountIds(cfg: OpenClawConfigLike) {
        return createRuntime(cfg).status().accounts;
      },
      resolveAccount(cfg: OpenClawConfigLike, accountId?: string | null) {
        return resolveAccountSnapshot(cfg, accountId);
      },
      defaultAccountId(cfg: OpenClawConfigLike) {
        return createRuntime(cfg).status().defaultAccount;
      },
      isEnabled(account: GenericHttpResolvedAccount) {
        return account.enabled;
      },
      isConfigured(account: GenericHttpResolvedAccount) {
        return account.configured;
      },
      describeAccount(account: GenericHttpResolvedAccount) {
        return {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
          baseUrl: account.config.baseUrl
        };
      },
      setAccountEnabled(params: {
        cfg: OpenClawConfigLike;
        accountId: string;
        enabled: boolean;
      }) {
        const next = cloneConfig(params.cfg ?? {});
        const channels = (next.channels ??= {});
        const section = ((channels[CHANNEL_SECTION] ??= {}) as {
          enabled?: boolean;
          defaultAccount?: string;
          accounts?: Record<string, GenericHttpPluginConfig["accounts"][string]>;
        });
        const accounts = (section.accounts ??= {});
        const account = (accounts[params.accountId] ??= { baseUrl: "" });
        section.enabled = params.enabled;
        accounts[params.accountId] = account;
        section.defaultAccount = section.defaultAccount ?? params.accountId;
        return next;
      }
    },
    setup: {
      resolveAccountId(params: { cfg: OpenClawConfigLike; accountId?: string }) {
        if (typeof params.accountId === "string" && params.accountId.trim() !== "") {
          return params.accountId.trim();
        }
        return createRuntime(params.cfg).status().defaultAccount;
      },
      validateInput(params: {
        input: {
          baseUrl?: string;
          url?: string;
          token?: string;
          secret?: string;
        };
      }) {
        const baseUrl = params.input.baseUrl ?? params.input.url;
        if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
          return "baseUrl is required";
        }
        try {
          new URL(baseUrl);
        } catch {
          return "baseUrl must be a valid absolute URL";
        }
        return null;
      },
      applyAccountConfig(params: {
        cfg: OpenClawConfigLike;
        accountId: string;
        input: {
          baseUrl?: string;
          url?: string;
          token?: string;
          secret?: string;
        };
      }) {
        const next = cloneConfig(params.cfg ?? {});
        const channels = (next.channels ??= {});
        const section = ((channels[CHANNEL_SECTION] ??= {}) as {
          enabled?: boolean;
          defaultAccount?: string;
          accounts?: Record<string, GenericHttpPluginConfig["accounts"][string]>;
        });
        const accounts = (section.accounts ??= {});
        const previous = accounts[params.accountId] ?? { baseUrl: "" };
        const baseUrl =
          params.input.baseUrl ?? params.input.url ?? previous.baseUrl ?? "";

        accounts[params.accountId] = {
          ...previous,
          baseUrl,
          apiKey: params.input.token ?? previous.apiKey,
          signingSecret: params.input.secret ?? previous.signingSecret
        };
        section.enabled = true;
        section.defaultAccount = section.defaultAccount ?? params.accountId;
        return next;
      }
    },
    status: {
      defaultRuntime: {
        accountId: DEFAULT_ACCOUNT_ID,
        running: false,
        connected: false,
        lastStartAt: null,
        lastStopAt: null,
        lastError: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        lastTransportActivityAt: null
      },
      async probeAccount(params: {
        account: GenericHttpResolvedAccount;
        cfg: OpenClawConfigLike;
      }) {
        return await createRuntime(params.cfg).probe(params.account.accountId);
      },
      buildAccountSnapshot(params: {
        account: GenericHttpResolvedAccount;
        runtime?: ChannelAccountRuntimeLike;
        probe?: { status?: string };
      }) {
        const runtime = params.runtime;
        return {
          accountId: params.account.accountId,
          name: params.account.name,
          enabled: params.account.enabled,
          configured: params.account.configured,
          baseUrl: params.account.config.baseUrl,
          running: runtime?.running ?? false,
          connected: runtime?.connected ?? false,
          lastStartAt: runtime?.lastStartAt ?? null,
          lastStopAt: runtime?.lastStopAt ?? null,
          lastError: runtime?.lastError ?? null,
          lastInboundAt: runtime?.lastInboundAt ?? null,
          lastOutboundAt: runtime?.lastOutboundAt ?? null,
          lastTransportActivityAt: runtime?.lastTransportActivityAt ?? null,
          probe: params.probe,
          lastProbeAt: Date.now()
        };
      }
    },
    gateway: {
      async startAccount(ctx: OpenClawGatewayContextLike) {
        const existing = gatewayLifecycles.get(ctx.accountId);
        existing?.stop();
        existing?.close();

        const lifecycle = createGenericHttpChannelLifecycle(
          readChannelSection(ctx.cfg),
          {
            async dispatchInboundEvent(event) {
              const activityAt = parseOccurredAtMillis(event.occurredAt) ?? Date.now();
              ctx.setStatus({
                accountId: ctx.accountId,
                connected: true,
                lastInboundAt: activityAt,
                lastTransportActivityAt: Date.now(),
                lastError: null
              });
              await dispatchInboundEventToOpenClaw({ ctx, event });
            },
            async onStreamError(error) {
              const message = normalizeErrorMessage(error);
              ctx.log?.error?.(`[${ctx.accountId}] ${message}`);
              ctx.setStatus({
                accountId: ctx.accountId,
                connected: false,
                lastError: message
              });
            }
          }
        );

        gatewayLifecycles.set(ctx.accountId, lifecycle);
        ctx.log?.info?.(`[${ctx.accountId}] starting generic-http stream ingress`);
        ctx.setStatus({
          accountId: ctx.accountId,
          running: true,
          connected: true,
          lastStartAt: Date.now(),
          lastError: null
        });

        try {
          await lifecycle.start(ctx.accountId);
          await new Promise<void>((resolve) => {
            if (ctx.abortSignal.aborted) {
              resolve();
              return;
            }
            ctx.abortSignal.addEventListener("abort", () => resolve(), {
              once: true
            });
          });
        } finally {
          lifecycle.stop();
          lifecycle.close();
          gatewayLifecycles.delete(ctx.accountId);
          ctx.setStatus({
            accountId: ctx.accountId,
            running: false,
            connected: false,
            lastStopAt: Date.now()
          });
        }
      },
      async stopAccount(ctx: OpenClawGatewayContextLike) {
        const lifecycle = gatewayLifecycles.get(ctx.accountId);
        if (!lifecycle) {
          return;
        }
        lifecycle.stop();
        lifecycle.close();
        gatewayLifecycles.delete(ctx.accountId);
        ctx.setStatus({
          accountId: ctx.accountId,
          running: false,
          connected: false,
          lastStopAt: Date.now()
        });
      }
    },
    resolver: {
      async resolveTargets(params: {
        cfg: OpenClawConfigLike;
        accountId?: string | null;
        inputs: string[];
        kind: "user" | "group";
      }) {
        const runtime = createRuntime(params.cfg);
        return await Promise.all(
          params.inputs.map(async (input) => {
            const response = await runtime.resolve({
              accountId: params.accountId,
              kind: params.kind === "user" ? "sender" : "conversation",
              query: input
            });
            const first = response.results[0];
            if (!first) {
              return {
                input,
                resolved: false,
                note: "No match returned by remote resolve endpoint"
              };
            }
            return {
              input,
              resolved: true,
              id: first.id,
              name: first.name
            };
          })
        );
      }
    },
    messaging: {
      targetPrefixes: ["generic-http", "gh"],
      normalizeTarget,
      parseExplicitTarget(params: { raw: string }) {
        const parsed = parseTarget(params.raw);
        if (!parsed) {
          return null;
        }
        return {
          to: parsed.conversationId,
          chatType: parsed.chatType
        };
      },
      inferTargetChatType(params: { to: string }) {
        const parsed = parseTarget(params.to);
        return parsed?.chatType;
      },
      resolveOutboundSessionRoute(params: {
        agentId: string;
        accountId?: string | null;
        target: string;
        threadId?: string | number | null;
      }) {
        const parsed = parseTarget(params.target);
        if (!parsed) {
          return null;
        }
        const accountId =
          typeof params.accountId === "string" && params.accountId.trim() !== ""
            ? params.accountId.trim()
            : DEFAULT_ACCOUNT_ID;
        const baseSessionKey = buildBaseSessionKey({
          agentId: params.agentId,
          accountId,
          chatType: parsed.chatType,
          conversationId: parsed.conversationId
        });
        const normalizedThreadId = normalizeSessionThreadId(params.threadId);

        return {
          sessionKey: `${baseSessionKey}:thread:${normalizedThreadId}`,
          baseSessionKey,
          peer: {
            kind: parsed.chatType,
            id: parsed.conversationId
          },
          chatType: parsed.chatType,
          from: `${CHANNEL_ID}:${parsed.conversationId}`,
          to: `${CHANNEL_ID}:${parsed.conversationId}`,
          threadId: normalizedThreadId
        };
      },
      resolveInboundSessionRoute(params: {
        agentId: string;
        accountId?: string | null;
        conversationId: string;
        conversationType: "dm" | "group" | "room" | "ticket";
        threadId?: string | number | null;
      }) {
        const normalizedConversationId = params.conversationId.trim();
        if (normalizedConversationId === "") {
          return null;
        }
        const accountId =
          typeof params.accountId === "string" && params.accountId.trim() !== ""
            ? params.accountId.trim()
            : DEFAULT_ACCOUNT_ID;
        const chatType = chatTypeForConversationType(params.conversationType);
        const baseSessionKey = buildBaseSessionKey({
          agentId: params.agentId,
          accountId,
          chatType,
          conversationId: normalizedConversationId
        });
        const normalizedThreadId = normalizeSessionThreadId(params.threadId);

        return {
          sessionKey: `${baseSessionKey}:thread:${normalizedThreadId}`,
          baseSessionKey,
          peer: {
            kind: chatType,
            id: normalizedConversationId
          },
          chatType,
          from: `${CHANNEL_ID}:${normalizedConversationId}`,
          to: `${CHANNEL_ID}:${normalizedConversationId}`,
          threadId: normalizedThreadId
        };
      }
    },
    outbound: {
      deliveryMode: "direct",
      async sendText(ctx: {
        cfg: OpenClawConfigLike;
        to: string;
        text: string;
        threadId?: string | number | null;
        accountId?: string | null;
      }) {
        const parsed = parseTarget(ctx.to);
        if (!parsed) {
          throw new Error("generic-http target is required");
        }
        const runtime = createRuntime(ctx.cfg);
        const result = await runtime.sendOutboundMessage({
          requestId: nowRequestId(),
          accountId: ctx.accountId ?? DEFAULT_ACCOUNT_ID,
          conversationId: parsed.conversationId,
          conversationType: parsed.conversationType,
          threadId:
            ctx.threadId === null || ctx.threadId === undefined
              ? null
              : String(ctx.threadId),
          messageId: nowRequestId(),
          text: ctx.text
        });
        return {
          channel: CHANNEL_ID,
          messageId: result.providerMessageId,
          conversationId: parsed.conversationId,
          timestamp: Date.parse(result.acceptedAt),
          meta: result.metadata
        };
      },
      async sendMedia(ctx: {
        cfg: OpenClawConfigLike;
        to: string;
        text: string;
        mediaUrl?: string;
        threadId?: string | number | null;
        accountId?: string | null;
      }) {
        const parsed = parseTarget(ctx.to);
        if (!parsed) {
          throw new Error("generic-http target is required");
        }
        const runtime = createRuntime(ctx.cfg);
        const result = await runtime.sendOutboundMessage({
          requestId: nowRequestId(),
          accountId: ctx.accountId ?? DEFAULT_ACCOUNT_ID,
          conversationId: parsed.conversationId,
          conversationType: parsed.conversationType,
          threadId:
            ctx.threadId === null || ctx.threadId === undefined
              ? null
              : String(ctx.threadId),
          messageId: nowRequestId(),
          text: ctx.text,
          attachments: toAttachments(ctx.mediaUrl)
        });
        return {
          channel: CHANNEL_ID,
          messageId: result.providerMessageId,
          conversationId: parsed.conversationId,
          timestamp: Date.parse(result.acceptedAt),
          meta: result.metadata
        };
      }
    }
  };
}

export const openClawGenericHttpChannelPlugin = buildOpenClawChannelPlugin();

export const openClawGenericHttpPluginEntry = {
  id: "openclaw-generic-http",
  name: "Generic HTTP",
  description: "Generic HTTP channel plugin for OpenClaw",
  configSchema: {
    validate(value: unknown) {
      if (value === undefined) {
        return { ok: true, value: {} };
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {
          ok: false,
          errors: ["plugin config must be an object"]
        };
      }
      return { ok: true, value: value as object };
    }
  },
  register(api: OpenClawPluginApiLike): void {
    if (api.registrationMode === "cli-metadata") {
      return;
    }
    api.registerChannel({
      plugin: openClawGenericHttpChannelPlugin
    });
  }
};

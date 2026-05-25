import { randomUUID } from "node:crypto";

import {
  createGenericHttpChannelLifecycle,
  type GenericHttpChannelLifecycle
} from "./channel/lifecycle.js";
import {
  createGenericHttpChannelPlugin,
  type GenericHttpStreamErrorContext
} from "./channel/plugin.js";
import { DEFAULT_ACCOUNT_ID, loadConfig } from "./config/loader.js";
import { GenericHttpPluginError } from "./errors/exceptions.js";
import type { NormalizedInboundMessageEvent } from "./inbound/mapper.js";
import type { AttachmentDto } from "./protocol/dto.js";
import type { GenericHttpPluginConfig } from "./config/schema.js";
import { serializeProtocolObject } from "./protocol/serializer.js";
import { signPayload } from "./security/signer.js";

const CHANNEL_ID = "generic-http";
const CHANNEL_SECTION = "generic-http";
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
  lastErrorCategory?: string | null;
  lastErrorRetryable?: boolean | null;
  lastErrorOperation?: string | null;
  lastErrorStatus?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastTransportActivityAt?: number | null;
  probe?: unknown;
  lastProbeAt?: number | null;
};

type GenericHttpResolvedAccount = {
  accountId: string;
  defaultAccountId: string;
  isDefault: boolean;
  enabled: boolean;
  name?: string;
  configured: boolean;
  config: GenericHttpPluginConfig["accounts"][string];
};

type GenericHttpAccountConfigurationDiagnostic = {
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  signingSecretConfigured: boolean;
  inboundSecretConfigured: boolean;
  outboundSecretConfigured: boolean;
  readyForStream: boolean;
  readyForOutbound: boolean;
  status: "OK" | "DEGRADED";
  issues: string[];
};

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function hasConfiguredValue(value?: string | null): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function buildAccountConfigurationDiagnostic(
  account: GenericHttpResolvedAccount
): GenericHttpAccountConfigurationDiagnostic {
  const baseUrlConfigured = hasConfiguredValue(account.config.baseUrl);
  const apiKeyConfigured = hasConfiguredValue(account.config.apiKey);
  const signingSecretConfigured = hasConfiguredValue(account.config.signingSecret);
  const inboundSecretConfigured =
    hasConfiguredValue(account.config.inboundSecret) || signingSecretConfigured;
  const outboundSecretConfigured =
    hasConfiguredValue(account.config.outboundSecret) || signingSecretConfigured;
  const issues: string[] = [];

  if (!baseUrlConfigured) {
    issues.push("baseUrl is missing");
  }
  if (!signingSecretConfigured) {
    issues.push("signingSecret is missing");
  }

  const readyForStream = baseUrlConfigured && inboundSecretConfigured;
  const readyForOutbound = baseUrlConfigured && outboundSecretConfigured;

  return {
    baseUrlConfigured,
    apiKeyConfigured,
    signingSecretConfigured,
    inboundSecretConfigured,
    outboundSecretConfigured,
    readyForStream,
    readyForOutbound,
    status: issues.length === 0 ? "OK" : "DEGRADED",
    issues
  };
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
  const isDefault = normalizedAccountId === resolved.defaultAccount;

  return {
    accountId: normalizedAccountId,
    defaultAccountId: resolved.defaultAccount,
    isDefault,
    enabled: resolved.enabled,
    name: isDefault ? "Default account" : normalizedAccountId,
    configured: typeof account?.baseUrl === "string" && account.baseUrl.trim() !== "",
    config: account ?? {
      baseUrl: ""
    }
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

function normalizeErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim() !== "") {
    return error.name;
  }
  return typeof error;
}

function readErrorDetailsValue(
  error: unknown,
  key: string
): unknown {
  if (
    error instanceof GenericHttpPluginError &&
    error.details &&
    Object.prototype.hasOwnProperty.call(error.details, key)
  ) {
    return error.details[key];
  }
  return undefined;
}

function normalizeErrorCategory(error: unknown): string | null {
  const value = readErrorDetailsValue(error, "category");
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeErrorOperation(error: unknown): string | null {
  const value = readErrorDetailsValue(error, "operation");
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeErrorStatus(error: unknown): number | null {
  const value = readErrorDetailsValue(error, "status");
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeErrorRetryable(error: unknown): boolean | null {
  if (error instanceof GenericHttpPluginError) {
    return error.retryable;
  }
  return null;
}

function buildRuntimeIssueSummary(context: GenericHttpStreamErrorContext): string {
  const suffix =
    context.phase === "dispatch" && context.eventId
      ? ` event=${context.eventId}`
      : context.phase === "ack" && context.ackedEventIds
        ? ` acked=${context.ackedEventIds.join(",")}`
        : "";
  const category = normalizeErrorCategory(context.error);
  const status = normalizeErrorStatus(context.error);
  const retryable = normalizeErrorRetryable(context.error);
  const structuredSuffix = [
    category ? `category=${category}` : null,
    status !== null ? `status=${status}` : null,
    retryable !== null ? `retryable=${retryable}` : null
  ]
    .filter((value): value is string => value !== null)
    .join(" ");
  const prefix = structuredSuffix === "" ? "" : ` ${structuredSuffix}`;
  return `generic-http ${context.phase} error:${suffix}${prefix} ${normalizeErrorMessage(context.error)}`;
}

function buildRuntimeIssueHeaders(params: {
  account: GenericHttpResolvedAccount;
  path: string;
  rawBody: string;
  timestamp: string;
  nonce: string;
  requestId: string;
}): Record<string, string> {
  const signingSecret =
    params.account.config.outboundSecret ?? params.account.config.signingSecret ?? "";
  const signature = signPayload(signingSecret, {
    method: "POST",
    path: params.path,
    timestamp: params.timestamp,
    nonce: params.nonce,
    rawBody: params.rawBody
  });

  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": params.account.config.apiKey ?? "",
    "x-generic-http-version": "1",
    "x-nonce": params.nonce,
    "x-request-id": params.requestId,
    "x-signature": signature,
    "x-timestamp": params.timestamp
  };
}

async function reportRuntimeIssueToPlatform(params: {
  ctx: OpenClawGatewayContextLike;
  issue: GenericHttpStreamErrorContext;
}): Promise<void> {
  const eventId = `evt-plugin-error-${randomUUID()}`;
  const messageId = `msg-plugin-error-${randomUUID()}`;
  const requestId = `req-plugin-error-${randomUUID()}`;
  const path = "/webhooks/inbound/events";
  const occurredAt = new Date().toISOString();
  const normalizedEvent = params.issue.item?.normalizedEvent;
  const eventType = `plugin.${params.issue.phase}.error`;
  const payload = {
    eventId,
    eventType,
    accountId: params.ctx.accountId,
    conversation: normalizedEvent
      ? {
          conversationId: normalizedEvent.conversationId,
          type: normalizedEvent.conversationType,
          title: normalizedEvent.conversationTitle
        }
      : {
          conversationId: `generic-http-runtime:${params.ctx.accountId}`,
          type: "ticket",
          title: "Generic HTTP Runtime"
        },
    threadId: normalizedEvent?.threadId ?? null,
    sender: {
      id: "openclaw-generic-http",
      name: "Generic HTTP Plugin",
      type: "system"
    },
      message: {
        messageId,
        text: buildRuntimeIssueSummary(params.issue),
        metadata: {
          phase: params.issue.phase,
          errorName: normalizeErrorName(params.issue.error),
          errorMessage: normalizeErrorMessage(params.issue.error),
          errorCategory: normalizeErrorCategory(params.issue.error),
          errorOperation: normalizeErrorOperation(params.issue.error),
          errorStatus: normalizeErrorStatus(params.issue.error),
          retryable: normalizeErrorRetryable(params.issue.error),
          sourceEventId: params.issue.eventId ?? normalizedEvent?.eventId ?? null,
          ackedEventIds: params.issue.ackedEventIds ?? [],
          pluginAccountId: params.ctx.accountId
        }
      },
    occurredAt,
    idempotencyKey: `plugin-error:${params.ctx.accountId}:${params.issue.phase}:${params.issue.eventId ?? requestId}`,
    metadata: {
      provider: CHANNEL_ID,
      source: "openclaw-generic-http",
      phase: params.issue.phase,
      errorName: normalizeErrorName(params.issue.error),
      errorCategory: normalizeErrorCategory(params.issue.error),
      errorOperation: normalizeErrorOperation(params.issue.error),
      errorStatus: normalizeErrorStatus(params.issue.error),
      retryable: normalizeErrorRetryable(params.issue.error)
    }
  };
  const rawBody = serializeProtocolObject(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const endpoint = new URL(path, params.ctx.account.config.baseUrl).toString();
  const headers = buildRuntimeIssueHeaders({
    account: params.ctx.account,
    path,
    rawBody,
    timestamp,
    nonce,
    requestId
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: rawBody
  });

  if (!response.ok) {
    throw new Error(
      `POST /webhooks/inbound/events failed with ${response.status} ${response.statusText}`
    );
  }
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

function describeInboundAttachment(attachment: AttachmentDto, index: number): string {
  const kind = attachment.kind ?? inferAttachmentKind(attachment);
  const name = normalizeOptionalText(attachment.name) ?? `未命名${kind === "image" ? "图片" : "文件"}#${index + 1}`;
  const contentType = normalizeOptionalText(attachment.contentType);
  const sizeBytes =
    typeof attachment.sizeBytes === "number" && Number.isFinite(attachment.sizeBytes)
      ? attachment.sizeBytes
      : undefined;
  const segments = [name];

  if (contentType) {
    segments.push(contentType);
  }
  if (sizeBytes !== undefined) {
    segments.push(`${sizeBytes} bytes`);
  }

  return segments.join(" | ");
}

function buildInboundAttachmentSummary(attachments: AttachmentDto[]): string {
  if (attachments.length === 0) {
    return "";
  }

  const imageCount = attachments.filter((attachment) => {
    const kind = attachment.kind ?? inferAttachmentKind(attachment);
    return kind === "image";
  }).length;
  const fileCount = attachments.length - imageCount;
  const counters: string[] = [];

  if (imageCount > 0) {
    counters.push(`${imageCount} 张图片`);
  }
  if (fileCount > 0) {
    counters.push(`${fileCount} 个文件`);
  }

  const details = attachments
    .map((attachment, index) => `- ${describeInboundAttachment(attachment, index)}`)
    .join("\n");

  return `用户发送了附件：${counters.join("，") || `${attachments.length} 个附件`}\n${details}`;
}

function buildInboundAgentText(
  text: string | null,
  attachments: AttachmentDto[]
): string {
  const normalizedText = normalizeOptionalText(text);
  const attachmentSummary = buildInboundAttachmentSummary(attachments);

  if (normalizedText && attachmentSummary) {
    return `${normalizedText}\n\n${attachmentSummary}`;
  }
  if (normalizedText) {
    return normalizedText;
  }
  return attachmentSummary;
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
  const attachments = collectOutboundAttachments(params.payload);

  if (attachments.length === 0) {
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

  await openClawGenericHttpChannelPlugin.outbound.sendRich({
    cfg: params.cfg,
    to: toTargetRef(params.conversationId, params.conversationType),
    text,
    attachments,
    threadId: params.threadId,
    accountId: params.accountId
  });
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
  const inboundAgentText = buildInboundAgentText(
    params.event.text,
    params.event.attachments
  );
  const ctxPayload = finalizeInboundContextForRuntime(runtime, {
    Body: inboundAgentText,
    BodyForAgent: inboundAgentText,
    RawBody: inboundAgentText,
    CommandBody: inboundAgentText,
    OriginalBody: params.event.text ?? "",
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
    MessageAttachments: params.event.attachments,
    AttachmentCount: params.event.attachments.length,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: targetRef,
    CommandAuthorized: false,
    WasMentioned: chatType === "direct" ? undefined : true,
    UntrustedStructuredContext: [
      {
        kind: "generic-http",
        eventId: params.event.eventId,
        idempotencyKey: params.event.idempotencyKey,
        metadata: params.event.metadata,
        attachments: params.event.attachments
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

function inferAttachmentKind(source: {
  url?: string;
  contentType?: string;
}): "image" | "file" {
  if (typeof source.contentType === "string" && source.contentType.startsWith("image/")) {
    return "image";
  }

  if (typeof source.url === "string" && source.url.trim() !== "") {
    const pathname = new URL(source.url).pathname.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(pathname)) {
      return "image";
    }
  }

  return "file";
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function toLegacyMediaAttachment(mediaUrl?: string): AttachmentDto | null {
  const normalizedUrl = normalizeOptionalText(mediaUrl);
  if (!normalizedUrl) {
    return null;
  }

  return {
    kind: inferAttachmentKind({ url: normalizedUrl }),
    url: normalizedUrl
  };
}

function normalizeOutboundAttachment(value: unknown): AttachmentDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const url = normalizeOptionalText(raw.url);
  const contentBase64 = normalizeOptionalText(raw.contentBase64);
  if (!url && !contentBase64) {
    return null;
  }

  const contentType = normalizeOptionalText(raw.contentType);
  const kindValue = normalizeOptionalText(raw.kind);
  const kind =
    kindValue === "image" || kindValue === "file"
      ? kindValue
      : inferAttachmentKind({ url, contentType });
  const sizeBytes =
    typeof raw.sizeBytes === "number" && Number.isFinite(raw.sizeBytes)
      ? raw.sizeBytes
      : undefined;
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  return {
    kind,
    id: normalizeOptionalText(raw.id),
    name: normalizeOptionalText(raw.name),
    contentType,
    url,
    contentBase64,
    sizeBytes,
    caption: normalizeOptionalText(raw.caption) ?? null,
    altText: normalizeOptionalText(raw.altText) ?? null,
    previewUrl: normalizeOptionalText(raw.previewUrl),
    metadata
  };
}

function collectOutboundAttachments(payload: Record<string, unknown>): AttachmentDto[] {
  const attachments: AttachmentDto[] = [];
  const rawAttachments = payload.attachments;

  if (Array.isArray(rawAttachments)) {
    for (const attachment of rawAttachments) {
      const normalized = normalizeOutboundAttachment(attachment);
      if (normalized) {
        attachments.push(normalized);
      }
    }
  }

  const rawMediaUrls = payload.mediaUrls;
  if (Array.isArray(rawMediaUrls)) {
    for (const mediaUrl of rawMediaUrls) {
      const normalized = toLegacyMediaAttachment(
        typeof mediaUrl === "string" ? mediaUrl : undefined
      );
      if (normalized) {
        attachments.push(normalized);
      }
    }
  } else {
    const normalized = toLegacyMediaAttachment(
      typeof payload.mediaUrl === "string" ? payload.mediaUrl : undefined
    );
    if (normalized) {
      attachments.push(normalized);
    }
  }

  return attachments;
}

function toAttachments(mediaUrl?: string): AttachmentDto[] | undefined {
  const attachment = toLegacyMediaAttachment(mediaUrl);
  return attachment ? [attachment] : undefined;
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
        try {
          loadConfig(value as Partial<GenericHttpPluginConfig>);
        } catch (error) {
          if (error instanceof GenericHttpPluginError) {
            return {
              ok: false,
              errors: [error.message]
            };
          }
          throw error;
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
        const configuration = buildAccountConfigurationDiagnostic(account);
        return {
          accountId: account.accountId,
          defaultAccountId: account.defaultAccountId,
          isDefault: account.isDefault,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
          baseUrl: account.config.baseUrl,
          configuration
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
        lastErrorCategory: null,
        lastErrorRetryable: null,
        lastErrorOperation: null,
        lastErrorStatus: null,
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
        const configuration = buildAccountConfigurationDiagnostic(params.account);
        return {
          accountId: params.account.accountId,
          defaultAccountId: params.account.defaultAccountId,
          isDefault: params.account.isDefault,
          name: params.account.name,
          enabled: params.account.enabled,
          configured: params.account.configured,
          baseUrl: params.account.config.baseUrl,
          configuration,
          running: runtime?.running ?? false,
          connected: runtime?.connected ?? false,
          lastStartAt: runtime?.lastStartAt ?? null,
          lastStopAt: runtime?.lastStopAt ?? null,
          lastError: runtime?.lastError ?? null,
          lastErrorCategory: runtime?.lastErrorCategory ?? null,
          lastErrorRetryable: runtime?.lastErrorRetryable ?? null,
          lastErrorOperation: runtime?.lastErrorOperation ?? null,
          lastErrorStatus: runtime?.lastErrorStatus ?? null,
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
                lastError: null,
                lastErrorCategory: null,
                lastErrorRetryable: null,
                lastErrorOperation: null,
                lastErrorStatus: null
              });
              await dispatchInboundEventToOpenClaw({ ctx, event });
            },
            async onStreamError(error) {
              const message = buildRuntimeIssueSummary(error);
              ctx.log?.error?.(`[${ctx.accountId}] ${message}`);
              ctx.setStatus({
                accountId: ctx.accountId,
                connected: false,
                lastError: message,
                lastErrorCategory: normalizeErrorCategory(error),
                lastErrorRetryable: normalizeErrorRetryable(error),
                lastErrorOperation: normalizeErrorOperation(error),
                lastErrorStatus: normalizeErrorStatus(error)
              });
              void reportRuntimeIssueToPlatform({
                ctx,
                issue: error
              }).catch((reportError) => {
                ctx.log?.error?.(
                  `[${ctx.accountId}] failed to report runtime issue: ${normalizeErrorMessage(reportError)}`
                );
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
          lastError: null,
          lastErrorCategory: null,
          lastErrorRetryable: null,
          lastErrorOperation: null,
          lastErrorStatus: null
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
        const accountId =
          typeof ctx.accountId === "string" && ctx.accountId.trim() !== ""
            ? ctx.accountId.trim()
            : runtime.status().defaultAccount;
        const result = await runtime.sendOutboundMessage({
          requestId: nowRequestId(),
          accountId,
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
        const accountId =
          typeof ctx.accountId === "string" && ctx.accountId.trim() !== ""
            ? ctx.accountId.trim()
            : runtime.status().defaultAccount;
        const result = await runtime.sendOutboundMessage({
          requestId: nowRequestId(),
          accountId,
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
      },
      async sendRich(ctx: {
        cfg: OpenClawConfigLike;
        to: string;
        text?: string;
        attachments?: AttachmentDto[];
        threadId?: string | number | null;
        accountId?: string | null;
      }) {
        const parsed = parseTarget(ctx.to);
        if (!parsed) {
          throw new Error("generic-http target is required");
        }
        const runtime = createRuntime(ctx.cfg);
        const accountId =
          typeof ctx.accountId === "string" && ctx.accountId.trim() !== ""
            ? ctx.accountId.trim()
            : runtime.status().defaultAccount;
        const result = await runtime.sendOutboundMessage({
          requestId: nowRequestId(),
          accountId,
          conversationId: parsed.conversationId,
          conversationType: parsed.conversationType,
          threadId:
            ctx.threadId === null || ctx.threadId === undefined
              ? null
              : String(ctx.threadId),
          messageId: nowRequestId(),
          text: ctx.text ?? "",
          attachments: ctx.attachments
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

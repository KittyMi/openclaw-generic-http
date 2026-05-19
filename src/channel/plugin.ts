import { loadConfig } from "../config/loader.js";
import type { GenericHttpPluginConfig } from "../config/schema.js";
import {
  HttpOutboundClient,
  type HttpOutboundClientOptions,
  type OutboundClient
} from "../outbound/client.js";
import { handleOutboundMessage } from "../outbound/controller.js";
import type {
  InternalOutboundMessage,
  OutboundMessageResult
} from "../outbound/mapper.js";
import {
  getGenericHttpCapabilities,
  type GenericHttpCapabilities
} from "./capabilities.js";
import {
  listConfiguredAccountIds,
  resolveConfiguredAccount
} from "./account.js";
import {
  probeAccountConfig,
  type ProbeAccountOptions,
  type ProbeResult
} from "./probe.js";
import {
  resolveRemotely,
  resolveLocally,
  type ResolveAccountOptions,
  type ResolveRequest,
  type ResolveResponse
} from "./resolve.js";
import {
  ackInboundMessages,
  pullInboundMessages,
  type AckInboundMessagesResult,
  type PullInboundMessagesResult,
  type StreamAckOptions,
  type StreamPullOptions
} from "./stream.js";

type OutboundClientFactory = (
  config: GenericHttpPluginConfig,
  accountId: string
) => OutboundClient;

export interface GenericHttpChannelPluginStatus {
  enabled: boolean;
  defaultAccount: string;
  accounts: string[];
}

export interface GenericHttpChannelPluginRuntimeOptions {
  outboundClientFactory?: OutboundClientFactory;
  outboundClientOptions?: HttpOutboundClientOptions;
  probeOptions?: ProbeAccountOptions;
  resolveOptions?: ResolveAccountOptions;
  streamPullOptions?: StreamPullOptions;
  streamAckOptions?: StreamAckOptions;
  streamIngressPollIntervalMillis?: number;
  onInboundStreamMessage?: (
    message: PullInboundMessagesResult["items"][number]
  ) => Promise<void> | void;
  onInboundStreamError?: (error: unknown) => Promise<void> | void;
}

export interface GenericHttpStreamIngressStatus {
  running: boolean;
  accountId: string | null;
}

export interface GenericHttpChannelPlugin {
  name: string;
  config: GenericHttpPluginConfig;
  status(): GenericHttpChannelPluginStatus;
  capabilities(): GenericHttpCapabilities;
  probe(accountId?: string | null): Promise<ProbeResult>;
  resolve(request: ResolveRequest): Promise<ResolveResponse>;
  pullInboundMessages(accountId?: string | null): Promise<PullInboundMessagesResult>;
  ackInboundMessages(
    accountId: string,
    eventIds: string[]
  ): Promise<AckInboundMessagesResult>;
  startStreamIngress(accountId?: string | null): Promise<void>;
  stopStreamIngress(): void;
  streamIngressStatus(): GenericHttpStreamIngressStatus;
  sendOutboundMessage(
    message: InternalOutboundMessage
  ): Promise<OutboundMessageResult>;
  close(): void;
}

function createDefaultOutboundClientFactory(
  options: HttpOutboundClientOptions = {}
): OutboundClientFactory {
  return (config, accountId) => {
    const account = resolveConfiguredAccount(config, accountId);
    return new HttpOutboundClient(account.config, options);
  };
}

export function createGenericHttpChannelPlugin(
  rawConfig: Partial<GenericHttpPluginConfig> = {},
  options: GenericHttpChannelPluginRuntimeOptions = {}
): GenericHttpChannelPlugin {
  const config = loadConfig(rawConfig);
  const outboundClientFactory: OutboundClientFactory =
    options.outboundClientFactory ??
    createDefaultOutboundClientFactory(options.outboundClientOptions);
  const streamIngressPollIntervalMillis =
    options.streamIngressPollIntervalMillis ?? 1000;
  let streamIngressRunning = false;
  let streamIngressAccountId: string | null = null;
  let streamIngressTimer: ReturnType<typeof setTimeout> | undefined;

  function clearStreamIngressTimer(): void {
    if (streamIngressTimer !== undefined) {
      clearTimeout(streamIngressTimer);
      streamIngressTimer = undefined;
    }
  }

  async function runStreamIngressCycle(accountId: string): Promise<void> {
    if (!streamIngressRunning || streamIngressAccountId !== accountId) {
      return;
    }

    try {
      const pulled = await pullInboundMessages(
        accountId,
        resolveConfiguredAccount(config, accountId).config,
        options.streamPullOptions
      );
      const ackedEventIds: string[] = [];

      for (const item of pulled.items) {
        await options.onInboundStreamMessage?.(item);
        ackedEventIds.push(item.eventId);
      }

      if (ackedEventIds.length > 0) {
        await ackInboundMessages(
          accountId,
          ackedEventIds,
          resolveConfiguredAccount(config, accountId).config,
          options.streamAckOptions
        );
      }
    } catch (error) {
      await options.onInboundStreamError?.(error);
    } finally {
      if (streamIngressRunning && streamIngressAccountId === accountId) {
        streamIngressTimer = setTimeout(() => {
          void runStreamIngressCycle(accountId);
        }, streamIngressPollIntervalMillis);
      }
    }
  }

  return {
    name: "generic-http",
    config,
    status() {
      return {
        enabled: config.enabled,
        defaultAccount: config.defaultAccount,
        accounts: listConfiguredAccountIds(config)
      };
    },
    capabilities() {
      return getGenericHttpCapabilities();
    },
    probe(accountId) {
      const account = resolveConfiguredAccount(config, accountId);
      return probeAccountConfig(
        account.accountId,
        account.config,
        options.probeOptions
      );
    },
    async resolve(request) {
      const account = resolveConfiguredAccount(config, request.accountId);
      try {
        return await resolveRemotely(account.config, request, options.resolveOptions);
      } catch {
        return resolveLocally(request);
      }
    },
    async pullInboundMessages(accountId) {
      const account = resolveConfiguredAccount(config, accountId);
      return await pullInboundMessages(
        account.accountId,
        account.config,
        options.streamPullOptions
      );
    },
    async ackInboundMessages(accountId, eventIds) {
      const account = resolveConfiguredAccount(config, accountId);
      return await ackInboundMessages(
        account.accountId,
        eventIds,
        account.config,
        options.streamAckOptions
      );
    },
    async startStreamIngress(accountId) {
      const account = resolveConfiguredAccount(config, accountId);
      streamIngressRunning = true;
      streamIngressAccountId = account.accountId;
      clearStreamIngressTimer();
      await runStreamIngressCycle(account.accountId);
    },
    stopStreamIngress() {
      streamIngressRunning = false;
      streamIngressAccountId = null;
      clearStreamIngressTimer();
    },
    streamIngressStatus() {
      return {
        running: streamIngressRunning,
        accountId: streamIngressRunning ? streamIngressAccountId : null
      };
    },
    async sendOutboundMessage(message) {
      const account = resolveConfiguredAccount(config, message.accountId);
      const client = outboundClientFactory(config, account.accountId);
      const response = await handleOutboundMessage(client, message);
      return response.result;
    },
    close() {
      streamIngressRunning = false;
      streamIngressAccountId = null;
      clearStreamIngressTimer();
    }
  };
}

export const genericHttpChannelPlugin = createGenericHttpChannelPlugin();

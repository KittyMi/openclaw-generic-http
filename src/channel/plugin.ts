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
  type PulledInboundMessage,
  type PullInboundMessagesResult,
  type StreamAckOptions,
  type StreamPullOptions
} from "./stream.js";
import { GenericHttpPluginError } from "../errors/exceptions.js";

type OutboundClientFactory = (
  config: GenericHttpPluginConfig,
  accountId: string
) => OutboundClient;

export interface GenericHttpChannelPluginStatus {
  enabled: boolean;
  defaultAccount: string;
  accounts: string[];
}

export interface GenericHttpStreamErrorContext {
  phase: "pull" | "dispatch" | "ack";
  accountId: string;
  error: unknown;
  eventId?: string;
  receivedAt?: string;
  ackedEventIds?: string[];
  item?: PulledInboundMessage;
  consecutiveFailures?: number;
  retryDelayMillis?: number;
}

export interface GenericHttpChannelPluginRuntimeOptions {
  outboundClientFactory?: OutboundClientFactory;
  outboundClientOptions?: HttpOutboundClientOptions;
  probeOptions?: ProbeAccountOptions;
  resolveOptions?: ResolveAccountOptions;
  streamPullOptions?: StreamPullOptions;
  streamAckOptions?: StreamAckOptions;
  streamIngressPollIntervalMillis?: number;
  streamIngressBackoffMultiplier?: number;
  streamIngressMaxBackoffMillis?: number;
  streamIngressJitterRatio?: number;
  streamIngressCircuitBreakerThreshold?: number;
  streamIngressCircuitBreakerCooldownMillis?: number;
  nowMillis?: () => number;
  random?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  onInboundStreamMessage?: (
    message: PullInboundMessagesResult["items"][number]
  ) => Promise<void> | void;
  onInboundStreamError?: (
    context: GenericHttpStreamErrorContext
  ) => Promise<void> | void;
}

export interface GenericHttpStreamIngressStatus {
  running: boolean;
  accountId: string | null;
  activeAccountIds: string[];
  consecutiveFailures: number;
  nextRetryDelayMillis: number;
  circuitState: "closed" | "open" | "half-open";
  perAccount: Record<
    string,
    {
      running: boolean;
      consecutiveFailures: number;
      nextRetryDelayMillis: number;
      circuitState: "closed" | "open" | "half-open";
      circuitOpenUntilMillis: number | null;
    }
  >;
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
  stopStreamIngress(accountId?: string | null): void;
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
  const streamPullOptions: StreamPullOptions = {
    waitSeconds: 25,
    ...options.streamPullOptions
  };
  const streamIngressPollIntervalMillis =
    options.streamIngressPollIntervalMillis ?? 1000;
  const streamIngressBackoffMultiplier = Math.max(
    1,
    options.streamIngressBackoffMultiplier ?? 2
  );
  const streamIngressMaxBackoffMillis = Math.max(
    streamIngressPollIntervalMillis,
    options.streamIngressMaxBackoffMillis ?? 30_000
  );
  const streamIngressJitterRatio = Math.min(
    1,
    Math.max(0, options.streamIngressJitterRatio ?? 0.25)
  );
  const streamIngressCircuitBreakerThreshold = Math.max(
    1,
    options.streamIngressCircuitBreakerThreshold ?? 5
  );
  const streamIngressCircuitBreakerCooldownMillis = Math.max(
    streamIngressPollIntervalMillis,
    options.streamIngressCircuitBreakerCooldownMillis ?? 30_000
  );
  const nowMillis = options.nowMillis ?? Date.now;
  const random = options.random ?? Math.random;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  interface StreamIngressRuntimeState {
    running: boolean;
    timer?: ReturnType<typeof setTimeout>;
    consecutiveFailures: number;
    nextRetryDelayMillis: number;
    circuitState: "closed" | "open" | "half-open";
    circuitOpenUntilMillis: number | null;
    activeRequestController?: AbortController;
  }

  const streamIngressStates = new Map<string, StreamIngressRuntimeState>();

  function getOrCreateStreamIngressState(
    accountId: string
  ): StreamIngressRuntimeState {
    let state = streamIngressStates.get(accountId);
    if (state === undefined) {
      state = {
        running: false,
        consecutiveFailures: 0,
        nextRetryDelayMillis: 0,
        circuitState: "closed",
        circuitOpenUntilMillis: null
      };
      streamIngressStates.set(accountId, state);
    }
    return state;
  }

  function clearStreamIngressTimer(state: StreamIngressRuntimeState): void {
    if (state.timer !== undefined) {
      clearTimeoutImpl(state.timer);
      state.timer = undefined;
    }
  }

  function abortActiveRequest(state: StreamIngressRuntimeState): void {
    state.activeRequestController?.abort();
    state.activeRequestController = undefined;
  }

  function beginAbortableRequest(state: StreamIngressRuntimeState): AbortSignal {
    abortActiveRequest(state);
    const controller = new AbortController();
    state.activeRequestController = controller;
    return controller.signal;
  }

  function completeAbortableRequest(
    state: StreamIngressRuntimeState,
    signal: AbortSignal
  ): void {
    if (state.activeRequestController?.signal === signal) {
      state.activeRequestController = undefined;
    }
  }

  function computeStreamIngressBackoffDelay(consecutiveFailures: number): number {
    if (consecutiveFailures <= 0) {
      return 0;
    }

    const baseDelay = Math.min(
      streamIngressMaxBackoffMillis,
      Math.round(
        streamIngressPollIntervalMillis *
          Math.pow(streamIngressBackoffMultiplier, consecutiveFailures - 1)
      )
    );
    const jitterFloor = 1 - streamIngressJitterRatio;
    const jitteredDelay =
      streamIngressJitterRatio === 0
        ? baseDelay
        : Math.round(baseDelay * (jitterFloor + streamIngressJitterRatio * random()));
    return Math.min(streamIngressMaxBackoffMillis, Math.max(0, jitteredDelay));
  }

  function markStreamIngressFailure(state: StreamIngressRuntimeState): number {
    state.consecutiveFailures += 1;
    const shouldOpenCircuit =
      state.consecutiveFailures >= streamIngressCircuitBreakerThreshold;
    if (shouldOpenCircuit) {
      state.circuitState = "open";
      state.circuitOpenUntilMillis =
        nowMillis() + streamIngressCircuitBreakerCooldownMillis;
      state.nextRetryDelayMillis = streamIngressCircuitBreakerCooldownMillis;
      return state.nextRetryDelayMillis;
    }

    state.nextRetryDelayMillis = computeStreamIngressBackoffDelay(state.consecutiveFailures);
    return state.nextRetryDelayMillis;
  }

  function resetStreamIngressBackoff(state: StreamIngressRuntimeState): void {
    state.consecutiveFailures = 0;
    state.nextRetryDelayMillis = 0;
    state.circuitState = "closed";
    state.circuitOpenUntilMillis = null;
  }

  function shouldShortCircuitAccount(state: StreamIngressRuntimeState): boolean {
    if (state.circuitState !== "open") {
      return false;
    }

    const openUntilMillis = state.circuitOpenUntilMillis ?? 0;
    if (nowMillis() >= openUntilMillis) {
      state.circuitState = "half-open";
      state.circuitOpenUntilMillis = null;
      return false;
    }

    state.nextRetryDelayMillis = Math.max(0, openUntilMillis - nowMillis());
    return true;
  }

  function shouldSuppressAbortedError(
    state: StreamIngressRuntimeState,
    error: unknown
  ): boolean {
    return (
      !state.running &&
      error instanceof GenericHttpPluginError &&
      error.details?.category === "timeout"
    );
  }

  async function runStreamIngressCycle(accountId: string): Promise<void> {
    const state = streamIngressStates.get(accountId);
    if (state === undefined || !state.running) {
      return;
    }

    let nextDelayMillis = state.nextRetryDelayMillis;
    try {
      if (shouldShortCircuitAccount(state)) {
        nextDelayMillis = state.nextRetryDelayMillis;
        return;
      }

      const accountConfig = resolveConfiguredAccount(config, accountId).config;
      let pulled: PullInboundMessagesResult;
      try {
        const pullSignal = beginAbortableRequest(state);
        pulled = await pullInboundMessages(
          accountId,
          accountConfig,
          {
            ...streamPullOptions,
            signal: pullSignal
          }
        );
        completeAbortableRequest(state, pullSignal);
      } catch (error) {
        if (state.activeRequestController?.signal.aborted) {
          state.activeRequestController = undefined;
        }
        if (shouldSuppressAbortedError(state, error)) {
          return;
        }
        nextDelayMillis = markStreamIngressFailure(state);
        await options.onInboundStreamError?.({
          phase: "pull",
          accountId,
          error,
          consecutiveFailures: state.consecutiveFailures,
          retryDelayMillis: nextDelayMillis
        });
        return;
      }

      const ackedEventIds: string[] = [];

      for (const item of pulled.items) {
        try {
          await options.onInboundStreamMessage?.(item);
          ackedEventIds.push(item.eventId);
        } catch (error) {
          await options.onInboundStreamError?.({
            phase: "dispatch",
            accountId,
            eventId: item.eventId,
            receivedAt: item.receivedAt,
            item,
            error
          });
        }
      }

      if (ackedEventIds.length > 0) {
        const lastEventId =
          pulled.items.length > 0 && ackedEventIds.length === pulled.items.length
            ? ackedEventIds[ackedEventIds.length - 1] ?? null
            : null;
        try {
          const ackSignal = beginAbortableRequest(state);
          await ackInboundMessages(
            accountId,
            lastEventId ? [] : ackedEventIds,
            accountConfig,
            {
              ...options.streamAckOptions,
              signal: ackSignal
            },
            lastEventId
          );
          completeAbortableRequest(state, ackSignal);
        } catch (error) {
          if (state.activeRequestController?.signal.aborted) {
            state.activeRequestController = undefined;
          }
          if (shouldSuppressAbortedError(state, error)) {
            return;
          }
          nextDelayMillis = markStreamIngressFailure(state);
          await options.onInboundStreamError?.({
            phase: "ack",
            accountId,
            ackedEventIds: ackedEventIds.slice(),
            error,
            consecutiveFailures: state.consecutiveFailures,
            retryDelayMillis: nextDelayMillis
          });
          return;
        }
      }

      resetStreamIngressBackoff(state);
    } finally {
      abortActiveRequest(state);
      if (state.running) {
        state.timer = setTimeoutImpl(() => {
          void runStreamIngressCycle(accountId);
        }, nextDelayMillis);
      }
    }
  }

  async function startAccountStreamIngress(accountId: string): Promise<void> {
    const state = getOrCreateStreamIngressState(accountId);
    state.running = true;
    resetStreamIngressBackoff(state);
    clearStreamIngressTimer(state);
    await runStreamIngressCycle(accountId);
  }

  function stopAccountStreamIngress(accountId: string): void {
    const state = streamIngressStates.get(accountId);
    if (state === undefined) {
      return;
    }
    state.running = false;
    abortActiveRequest(state);
    resetStreamIngressBackoff(state);
    clearStreamIngressTimer(state);
    streamIngressStates.delete(accountId);
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
        streamPullOptions
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
      if (typeof accountId === "string" && accountId.trim() !== "") {
        const account = resolveConfiguredAccount(config, accountId);
        await startAccountStreamIngress(account.accountId);
        return;
      }

      await Promise.all(
        listConfiguredAccountIds(config).map((configuredAccountId) =>
          startAccountStreamIngress(configuredAccountId)
        )
      );
    },
    stopStreamIngress(accountId) {
      if (typeof accountId === "string" && accountId.trim() !== "") {
        const account = resolveConfiguredAccount(config, accountId);
        stopAccountStreamIngress(account.accountId);
        return;
      }

      for (const configuredAccountId of Array.from(streamIngressStates.keys())) {
        stopAccountStreamIngress(configuredAccountId);
      }
    },
    streamIngressStatus() {
      const activeAccountIds = Array.from(streamIngressStates.entries())
        .filter(([, state]) => state.running)
        .map(([accountId]) => accountId);
      const primaryAccountId =
        activeAccountIds.length === 1 ? activeAccountIds[0] ?? null : null;
      const primaryState =
        primaryAccountId === null
          ? undefined
          : streamIngressStates.get(primaryAccountId);
      const perAccount = Object.fromEntries(
        activeAccountIds.map((activeAccountId) => {
          const state = streamIngressStates.get(activeAccountId);
          return [
            activeAccountId,
            {
              running: state?.running ?? false,
              consecutiveFailures: state?.consecutiveFailures ?? 0,
              nextRetryDelayMillis: state?.nextRetryDelayMillis ?? 0,
              circuitState: state?.circuitState ?? "closed",
              circuitOpenUntilMillis: state?.circuitOpenUntilMillis ?? null
            }
          ];
        })
      );

      return {
        running: activeAccountIds.length > 0,
        accountId: primaryAccountId,
        activeAccountIds,
        consecutiveFailures: primaryState?.consecutiveFailures ?? 0,
        nextRetryDelayMillis: primaryState?.nextRetryDelayMillis ?? 0,
        circuitState: primaryState?.circuitState ?? "closed",
        perAccount
      };
    },
    async sendOutboundMessage(message) {
      const account = resolveConfiguredAccount(config, message.accountId);
      const client = outboundClientFactory(config, account.accountId);
      const response = await handleOutboundMessage(client, message);
      return response.result;
    },
    close() {
      for (const configuredAccountId of Array.from(streamIngressStates.keys())) {
        stopAccountStreamIngress(configuredAccountId);
      }
    }
  };
}

export const genericHttpChannelPlugin = createGenericHttpChannelPlugin();

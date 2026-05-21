import type { GenericHttpPluginConfig } from "../config/schema.js";
import type { NormalizedInboundMessageEvent } from "../inbound/mapper.js";
import {
  createGenericHttpChannelPlugin,
  type GenericHttpChannelPlugin,
  type GenericHttpStreamErrorContext,
  type GenericHttpChannelPluginRuntimeOptions
} from "./plugin.js";

export interface GenericHttpChannelLifecycleHandlers {
  dispatchInboundEvent(
    event: NormalizedInboundMessageEvent
  ): Promise<void> | void;
  onStreamError?(context: GenericHttpStreamErrorContext): Promise<void> | void;
}

export interface GenericHttpChannelLifecycle {
  plugin: GenericHttpChannelPlugin;
  start(accountId?: string | null): Promise<void>;
  stop(): void;
  close(): void;
}

/**
 * Bridge the protocol runtime into a host lifecycle shape. The host provides
 * the event dispatcher and decides when the stream loop should start or stop.
 */
export function createGenericHttpChannelLifecycle(
  rawConfig: Partial<GenericHttpPluginConfig>,
  handlers: GenericHttpChannelLifecycleHandlers,
  options: Omit<
    GenericHttpChannelPluginRuntimeOptions,
    "onInboundStreamMessage" | "onInboundStreamError"
  > = {}
): GenericHttpChannelLifecycle {
  const plugin = createGenericHttpChannelPlugin(rawConfig, {
    ...options,
    async onInboundStreamMessage(item) {
      await handlers.dispatchInboundEvent(item.normalizedEvent);
    },
    async onInboundStreamError(error) {
      await handlers.onStreamError?.(error);
    }
  });

  return {
    plugin,
    start(accountId) {
      return plugin.startStreamIngress(accountId);
    },
    stop() {
      plugin.stopStreamIngress();
    },
    close() {
      plugin.close();
    }
  };
}

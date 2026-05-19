import type { GenericHttpPluginConfig } from "../config/schema.js";
import type { NormalizedInboundMessageEvent } from "../inbound/mapper.js";
import {
  createGenericHttpChannelLifecycle,
  type GenericHttpChannelLifecycle,
  type GenericHttpChannelLifecycleHandlers
} from "./lifecycle.js";
import type { GenericHttpCapabilities } from "./capabilities.js";
import type {
  GenericHttpChannelPlugin,
  GenericHttpChannelPluginRuntimeOptions,
  GenericHttpChannelPluginStatus
} from "./plugin.js";
import type { InternalOutboundMessage, OutboundMessageResult } from "../outbound/mapper.js";
import type { ProbeResult } from "./probe.js";
import type { ResolveRequest, ResolveResponse } from "./resolve.js";

export interface GenericHttpHostAdapterHandlers
  extends GenericHttpChannelLifecycleHandlers {}

export interface GenericHttpHostAdapter {
  readonly plugin: GenericHttpChannelPlugin;
  readonly lifecycle: GenericHttpChannelLifecycle;
  activate(accountId?: string | null): Promise<void>;
  deactivate(): void;
  dispose(): void;
  status(): GenericHttpChannelPluginStatus;
  capabilities(): GenericHttpCapabilities;
  probe(accountId?: string | null): Promise<ProbeResult>;
  resolve(request: ResolveRequest): Promise<ResolveResponse>;
  sendOutboundMessage(
    message: InternalOutboundMessage
  ): Promise<OutboundMessageResult>;
}

/**
 * Adapt the generic HTTP runtime to a host-friendly contract with explicit
 * activate/deactivate lifecycle methods and delegated inbound event dispatch.
 */
export function createGenericHttpHostAdapter(
  rawConfig: Partial<GenericHttpPluginConfig>,
  handlers: GenericHttpHostAdapterHandlers,
  options: Omit<
    GenericHttpChannelPluginRuntimeOptions,
    "onInboundStreamMessage" | "onInboundStreamError"
  > = {}
): GenericHttpHostAdapter {
  const lifecycle = createGenericHttpChannelLifecycle(rawConfig, handlers, options);

  return {
    plugin: lifecycle.plugin,
    lifecycle,
    activate(accountId) {
      return lifecycle.start(accountId);
    },
    deactivate() {
      lifecycle.stop();
    },
    dispose() {
      lifecycle.close();
    },
    status() {
      return lifecycle.plugin.status();
    },
    capabilities() {
      return lifecycle.plugin.capabilities();
    },
    probe(accountId) {
      return lifecycle.plugin.probe(accountId);
    },
    resolve(request) {
      return lifecycle.plugin.resolve(request);
    },
    sendOutboundMessage(message) {
      return lifecycle.plugin.sendOutboundMessage(message);
    }
  };
}

export type { NormalizedInboundMessageEvent };

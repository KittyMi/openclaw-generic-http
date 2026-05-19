import { genericHttpChannelPlugin } from "./channel/plugin.js";
import { genericHttpHostConfigSchema } from "./config/host-config-schema.js";
import { openClawGenericHttpPluginEntry } from "./openclaw-entry.js";
export { createGenericHttpChannelLifecycle } from "./channel/lifecycle.js";
export type {
  GenericHttpChannelLifecycle,
  GenericHttpChannelLifecycleHandlers
} from "./channel/lifecycle.js";
export { createGenericHttpHostAdapter } from "./channel/host-adapter.js";
export type {
  GenericHttpHostAdapter,
  GenericHttpHostAdapterHandlers
} from "./channel/host-adapter.js";

export {
  createGenericHttpChannelPlugin,
  genericHttpChannelPlugin
} from "./channel/plugin.js";
export {
  openClawGenericHttpChannelPlugin,
  openClawGenericHttpPluginEntry
} from "./openclaw-entry.js";
export type {
  GenericHttpChannelPlugin,
  GenericHttpChannelPluginRuntimeOptions,
  GenericHttpChannelPluginStatus
} from "./channel/plugin.js";
import {
  createGenericHttpHostAdapter,
  type GenericHttpHostAdapter,
  type GenericHttpHostAdapterHandlers
} from "./channel/host-adapter.js";
import type { GenericHttpPluginConfig } from "./config/schema.js";
import type { GenericHttpChannelPluginRuntimeOptions } from "./channel/plugin.js";

export interface GenericHttpPluginChannelDescriptor {
  name: "generic-http";
  displayName: "Generic HTTP";
  configSchemaFile: "./openclaw.config.schema.json";
}

export interface GenericHttpPluginRegistration {
  pluginId: "openclaw-generic-http";
  channelName: "generic-http";
  defaultPlugin: typeof genericHttpChannelPlugin;
  channels: [GenericHttpPluginChannelDescriptor];
  configSchema: typeof genericHttpHostConfigSchema;
  createHostAdapter(
    rawConfig: Partial<GenericHttpPluginConfig>,
    handlers: GenericHttpHostAdapterHandlers,
    options?: Omit<
      GenericHttpChannelPluginRuntimeOptions,
      "onInboundStreamMessage" | "onInboundStreamError"
    >
  ): GenericHttpHostAdapter;
}

export function registerPlugin(): GenericHttpPluginRegistration {
  return {
    pluginId: "openclaw-generic-http",
    channelName: "generic-http",
    defaultPlugin: genericHttpChannelPlugin,
    channels: [
      {
        name: "generic-http",
        displayName: "Generic HTTP",
        configSchemaFile: "./openclaw.config.schema.json"
      }
    ],
    configSchema: genericHttpHostConfigSchema,
    createHostAdapter(rawConfig, handlers, options) {
      return createGenericHttpHostAdapter(rawConfig, handlers, options);
    }
  };
}

export function register(api: {
  registerChannel: (registration: unknown) => void;
  registrationMode?: string;
}): void {
  openClawGenericHttpPluginEntry.register(api);
}

export const activate = register;

export default openClawGenericHttpPluginEntry;

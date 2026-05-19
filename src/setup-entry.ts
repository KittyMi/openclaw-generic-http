import { openClawGenericHttpChannelPlugin } from "./openclaw-entry.js";

export interface GenericHttpSetupFieldDescriptor {
  key: string;
  title: string;
  required: boolean;
  description: string;
  secret?: boolean;
}

export interface GenericHttpSetupStepDescriptor {
  id: string;
  title: string;
  description: string;
}

export interface GenericHttpSetupRegistration {
  pluginId: "openclaw-generic-http";
  channelName: "generic-http";
  title: string;
  summary: string;
  configSchemaFile: "./openclaw.config.schema.json";
  accountFields: GenericHttpSetupFieldDescriptor[];
  steps: GenericHttpSetupStepDescriptor[];
}

export function registerSetup(): GenericHttpSetupRegistration {
  return {
    pluginId: "openclaw-generic-http",
    channelName: "generic-http",
    title: "Generic HTTP Channel Setup",
    summary:
      "Configure a bridge/relay account, wire third-party webhooks into bridge ingress, and consume inbound events through stream polling.",
    configSchemaFile: "./openclaw.config.schema.json",
    accountFields: [
      {
        key: "baseUrl",
        title: "Bridge Base URL",
        required: true,
        description:
          "Base URL of the bridge or relay service that exposes health, probe, stream, resolve, and outbound endpoints."
      },
      {
        key: "apiKey",
        title: "API Key",
        required: false,
        description:
          "Optional shared credential sent on signed requests when the bridge requires API key authentication.",
        secret: true
      },
      {
        key: "signingSecret",
        title: "Signing Secret",
        required: false,
        description:
          "Shared secret used to sign stream, probe, resolve, and outbound requests from the plugin.",
        secret: true
      },
      {
        key: "inboundSecret",
        title: "Inbound Secret",
        required: false,
        description:
          "Optional dedicated secret used by the bridge when validating third-party webhook ingress.",
        secret: true
      },
      {
        key: "outboundSecret",
        title: "Outbound Secret",
        required: false,
        description:
          "Optional dedicated secret used when outbound message signing is separated from other transport signing.",
        secret: true
      }
    ],
    steps: [
      {
        id: "configure-account",
        title: "Configure bridge account",
        description:
          "Add at least one account with baseUrl and the shared credentials required by the bridge or relay."
      },
      {
        id: "wire-webhook-ingress",
        title: "Wire webhook ingress",
        description:
          "Send third-party inbound events to POST /webhooks/inbound/messages on the bridge instead of calling a local OpenClaw URL."
      },
      {
        id: "activate-stream-ingress",
        title: "Activate stream ingress",
        description:
          "Let the host activate the plugin so it can poll GET /stream/inbound and acknowledge processed messages through POST /stream/acks."
      },
      {
        id: "verify-outbound-delivery",
        title: "Verify outbound delivery",
        description:
          "Confirm the bridge accepts POST /outbound/messages and that the external system returns successful delivery responses."
      }
    ]
  };
}

export const genericHttpSetupEntry = {
  plugin: openClawGenericHttpChannelPlugin,
  registerSetup
};

export default genericHttpSetupEntry;

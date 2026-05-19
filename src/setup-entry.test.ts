import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import genericHttpSetupEntry, { registerSetup } from "./setup-entry.js";

describe("registerSetup", () => {
  it("returns structured setup metadata for bridge and stream ingress", () => {
    const setup = registerSetup();

    expect(setup.pluginId).toBe("openclaw-generic-http");
    expect(setup.channelName).toBe("generic-http");
    expect(setup.configSchemaFile).toBe("./openclaw.config.schema.json");
    expect(setup.accountFields).toEqual([
      expect.objectContaining({
        key: "baseUrl",
        required: true
      }),
      expect.objectContaining({
        key: "apiKey",
        secret: true
      }),
      expect.objectContaining({
        key: "signingSecret",
        secret: true
      }),
      expect.objectContaining({
        key: "inboundSecret",
        secret: true
      }),
      expect.objectContaining({
        key: "outboundSecret",
        secret: true
      })
    ]);
    expect(setup.steps).toEqual([
      expect.objectContaining({
        id: "configure-account"
      }),
      expect.objectContaining({
        id: "wire-webhook-ingress"
      }),
      expect.objectContaining({
        id: "activate-stream-ingress"
      }),
      expect.objectContaining({
        id: "verify-outbound-delivery"
      })
    ]);
  });

  it("stays aligned with the static plugin manifest setup metadata", () => {
    const setup = registerSetup();
    const manifest = JSON.parse(
      readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8")
    ) as {
      id: string;
      setup: {
        channelName: string;
        title: string;
        summary: string;
        configSchema: string;
        accountFields: unknown[];
        steps: unknown[];
      };
    };

    expect(manifest.id).toBe(setup.pluginId);
    expect(manifest.setup).toEqual({
      channelName: setup.channelName,
      title: setup.title,
      summary: setup.summary,
      configSchema: setup.configSchemaFile,
      accountFields: setup.accountFields,
      steps: setup.steps
    });
  });

  it("exports a setup plugin object for OpenClaw setup runtime loading", () => {
    expect(genericHttpSetupEntry.plugin).toEqual(
      expect.objectContaining({
        id: "generic-http",
        meta: expect.objectContaining({
          label: "Generic HTTP"
        }),
        setup: expect.any(Object)
      })
    );
    expect(genericHttpSetupEntry.registerSetup).toBe(registerSetup);
  });
});

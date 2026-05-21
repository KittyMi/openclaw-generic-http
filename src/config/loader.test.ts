import { describe, expect, it } from "vitest";

import { GenericHttpPluginError } from "../errors/exceptions.js";
import { DEFAULT_ACCOUNT_ID, loadConfig } from "./loader.js";

describe("loadConfig", () => {
  it("keeps an unconfigured plugin runtime empty instead of materializing a default account", () => {
    expect(loadConfig()).toEqual({
      enabled: false,
      defaultAccount: DEFAULT_ACCOUNT_ID,
      accounts: {}
    });
  });

  it("rejects a configured account set when defaultAccount does not match a real account", () => {
    expect(() =>
      loadConfig({
        enabled: true,
        defaultAccount: "online_001",
        accounts: {
          online: {
            baseUrl: "https://bridge.example.com"
          }
        }
      })
    ).toThrowError(GenericHttpPluginError);
    expect(() =>
      loadConfig({
        enabled: true,
        defaultAccount: "online_001",
        accounts: {
          online: {
            baseUrl: "https://bridge.example.com"
          }
        }
      })
    ).toThrow(/defaultAccount must reference a configured account/i);
  });

  it("normalizes a configured default account without inventing fallback runtime accounts", () => {
    expect(
      loadConfig({
        enabled: true,
        defaultAccount: "online_001",
        accounts: {
          online_001: {
            baseUrl: "https://bridge.example.com"
          }
        }
      })
    ).toEqual({
      enabled: true,
      defaultAccount: "online_001",
      accounts: {
        online_001: {
          baseUrl: "https://bridge.example.com",
          apiKey: undefined,
          signingSecret: undefined,
          inboundSecret: undefined,
          outboundSecret: undefined,
          connectTimeoutMillis: 5000,
          readTimeoutMillis: 10000,
          maxRetries: 0
        }
      }
    });
  });
});

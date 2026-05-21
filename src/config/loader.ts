import type {
  GenericHttpAccountConfig,
  GenericHttpPluginConfig
} from "./schema.js";
import { ERROR_CODES } from "../errors/codes.js";
import { GenericHttpPluginError } from "../errors/exceptions.js";

export const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_CONNECT_TIMEOUT_MILLIS = 5000;
const DEFAULT_READ_TIMEOUT_MILLIS = 10000;

export function normalizeAccountConfig(
  account: Partial<GenericHttpAccountConfig>
): GenericHttpAccountConfig {
  return {
    baseUrl: account.baseUrl ?? "",
    apiKey: account.apiKey,
    signingSecret: account.signingSecret,
    inboundSecret: account.inboundSecret,
    outboundSecret: account.outboundSecret,
    connectTimeoutMillis:
      account.connectTimeoutMillis ?? DEFAULT_CONNECT_TIMEOUT_MILLIS,
    readTimeoutMillis:
      account.readTimeoutMillis ?? DEFAULT_READ_TIMEOUT_MILLIS,
    maxRetries: account.maxRetries ?? 0
  };
}

/**
 * Normalize partially-hydrated config input into the runtime shape expected by
 * the plugin. The plugin can then rely on explicit defaults instead of
 * scattering fallback behavior across transport, validation, and routing code.
 */
export function loadConfig(
  rawConfig: Partial<GenericHttpPluginConfig> = {}
): GenericHttpPluginConfig {
  const defaultAccount =
    typeof rawConfig.defaultAccount === "string" &&
    rawConfig.defaultAccount.trim() !== ""
      ? rawConfig.defaultAccount.trim()
      : DEFAULT_ACCOUNT_ID;
  const rawAccounts = rawConfig.accounts ?? {};
  const normalizedAccounts: Record<string, GenericHttpAccountConfig> = {};

  Object.entries(rawAccounts).forEach(([accountId, accountConfig]) => {
    const normalizedAccountId = accountId.trim();
    if (normalizedAccountId === "") {
      throw new GenericHttpPluginError(
        ERROR_CODES.INVALID_REQUEST,
        "generic-http account IDs must not be empty.",
        { accountId }
      );
    }
    normalizedAccounts[normalizedAccountId] = normalizeAccountConfig(accountConfig);
  });

  if (
    Object.keys(normalizedAccounts).length > 0 &&
    normalizedAccounts[defaultAccount] === undefined
  ) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      "generic-http defaultAccount must reference a configured account.",
      {
        defaultAccount,
        configuredAccountIds: Object.keys(normalizedAccounts)
      }
    );
  }

  return {
    enabled: rawConfig.enabled ?? false,
    defaultAccount,
    accounts: normalizedAccounts
  };
}

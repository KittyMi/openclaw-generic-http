import type {
  GenericHttpAccountConfig,
  GenericHttpPluginConfig
} from "./schema.js";

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_CONNECT_TIMEOUT_MILLIS = 5000;
const DEFAULT_READ_TIMEOUT_MILLIS = 10000;

function normalizeAccountConfig(
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
  const defaultAccount = rawConfig.defaultAccount ?? DEFAULT_ACCOUNT_ID;
  const rawAccounts = rawConfig.accounts ?? {};
  const normalizedAccounts: Record<string, GenericHttpAccountConfig> = {};

  Object.entries(rawAccounts).forEach(([accountId, accountConfig]) => {
    normalizedAccounts[accountId] = normalizeAccountConfig(accountConfig);
  });

  // Always materialize the declared default account so downstream routing code
  // does not need a separate existence fallback.
  if (normalizedAccounts[defaultAccount] === undefined) {
    normalizedAccounts[defaultAccount] = normalizeAccountConfig({});
  }

  return {
    enabled: rawConfig.enabled ?? false,
    defaultAccount,
    accounts: normalizedAccounts
  };
}

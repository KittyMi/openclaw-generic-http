import type {
  GenericHttpAccountConfig,
  GenericHttpPluginConfig
} from "../config/schema.js";
import { ERROR_CODES } from "../errors/codes.js";
import { GenericHttpPluginError } from "../errors/exceptions.js";

export interface ResolvedGenericHttpAccount {
  accountId: string;
  config: GenericHttpAccountConfig;
}

export function listConfiguredAccountIds(
  config: GenericHttpPluginConfig
): string[] {
  return Object.keys(config.accounts);
}

export function resolveConfiguredAccount(
  config: GenericHttpPluginConfig,
  accountId?: string | null
): ResolvedGenericHttpAccount {
  const normalizedAccountId =
    typeof accountId === "string" && accountId.trim() !== ""
      ? accountId.trim()
      : config.defaultAccount;

  const resolvedConfig = config.accounts[normalizedAccountId];
  if (resolvedConfig === undefined) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      "Unknown accountId for generic-http channel runtime.",
      { accountId: normalizedAccountId }
    );
  }

  return {
    accountId: normalizedAccountId,
    config: resolvedConfig
  };
}

/**
 * Per-account runtime configuration for the generic HTTP channel.
 *
 * Keep this shape close to the public docs so operators can map config files,
 * CLI setup, and runtime behavior without translating between models.
 */
export interface GenericHttpAccountConfig {
  /**
   * Base URL of the third-party bridge service that receives outbound calls
   * and exposes health/probe endpoints.
   */
  baseUrl: string;

  /**
   * Shared API credential used for basic transport authentication.
   */
  apiKey?: string;

  /**
   * Shared secret used to sign outbound requests and verify inbound requests.
   */
  signingSecret?: string;

  /**
   * Optional dedicated secret for inbound validation when callers should not
   * share the same secret used for outbound plugin requests.
   */
  inboundSecret?: string;

  /**
   * Optional dedicated secret for outbound signing when rotation or separation
   * of trust domains is required.
   */
  outboundSecret?: string;

  /**
   * Connection timeout for outbound HTTP calls, in milliseconds.
   */
  connectTimeoutMillis?: number;

  /**
   * Read timeout for outbound HTTP calls, in milliseconds.
   */
  readTimeoutMillis?: number;

  /**
   * Maximum retry attempts for retryable outbound transport failures.
   */
  maxRetries?: number;
}

export interface GenericHttpPluginConfig {
  enabled: boolean;
  defaultAccount: string;
  accounts: Record<string, GenericHttpAccountConfig>;
}

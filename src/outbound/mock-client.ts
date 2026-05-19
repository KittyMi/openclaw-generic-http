import type { OutboundClient } from "./client.js";
import type {
  OutboundMessageRequest,
  OutboundMessageResult
} from "./mapper.js";

export interface MockOutboundClientOptions {
  nowIsoString?: () => string;
  providerMessageIdPrefix?: string;
}

/**
 * Simple in-memory outbound client for local demos and tests. It lets the
 * plugin exercise the full outbound mapping/sender/controller flow before a
 * real HTTP transport is introduced.
 */
export class MockOutboundClient implements OutboundClient {
  readonly requests: OutboundMessageRequest[] = [];

  private readonly nowIsoString: () => string;
  private readonly providerMessageIdPrefix: string;

  constructor(options: MockOutboundClientOptions = {}) {
    this.nowIsoString = options.nowIsoString ?? (() => new Date().toISOString());
    this.providerMessageIdPrefix = options.providerMessageIdPrefix ?? "mock";
  }

  async send(request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    this.requests.push(request);

    return {
      success: true,
      code: "DELIVERED",
      providerMessageId: `${this.providerMessageIdPrefix}-${request.message.messageId}`,
      acceptedAt: this.nowIsoString(),
      metadata: {
        transport: "mock"
      }
    };
  }
}

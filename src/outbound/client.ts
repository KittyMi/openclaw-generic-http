import type { OutboundMessageRequest, OutboundMessageResult } from "./mapper.js";

export interface OutboundClient {
  send(request: OutboundMessageRequest): Promise<OutboundMessageResult>;
}

export { HttpOutboundClient } from "./http-client.js";
export type { HttpOutboundClientOptions } from "./http-client.js";

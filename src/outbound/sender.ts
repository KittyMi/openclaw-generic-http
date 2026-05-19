import type { OutboundClient } from "./client.js";
import {
  mapOutboundMessage,
  type InternalOutboundMessage,
  type OutboundMessageResult
} from "./mapper.js";

export async function sendOutboundMessage(
  client: OutboundClient,
  message: InternalOutboundMessage
): Promise<OutboundMessageResult> {
  const request = mapOutboundMessage(message);
  return client.send(request);
}

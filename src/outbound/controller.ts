import { GenericHttpPluginError } from "../errors/exceptions.js";
import type { OutboundClient } from "./client.js";
import {
  type InternalOutboundMessage,
  type OutboundMessageResult
} from "./mapper.js";
import { sendOutboundMessage } from "./sender.js";

export interface OutboundHandlingSuccess {
  result: OutboundMessageResult;
}

export interface OutboundHandlingError {
  success: false;
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export function buildOutboundErrorResponse(
  requestId: string,
  error: unknown
): OutboundHandlingError {
  if (error instanceof GenericHttpPluginError) {
    return {
      success: false,
      code: error.code,
      message: error.message,
      requestId,
      details: error.details,
      retryable: error.retryable
    };
  }

  return {
    success: false,
    code: "INTERNAL_ERROR",
    message: "Unexpected outbound message handling failure.",
    requestId,
    retryable: true
  };
}

export async function handleOutboundMessage(
  client: OutboundClient,
  message: InternalOutboundMessage
): Promise<OutboundHandlingSuccess> {
  // The outbound control path mirrors inbound: normalize the internal message,
  // delegate delivery to the transport client, and return a protocol-shaped
  // result for the caller or HTTP layer.
  const result = await sendOutboundMessage(client, message);
  return { result };
}

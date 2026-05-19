import type {
  AttachmentDto,
  ConversationDto,
  MessageDto
} from "../protocol/dto.js";
import { normalizeAttachment } from "../protocol/attachments.js";

export interface OutboundMessageRequest {
  requestId: string;
  accountId: string;
  conversation: ConversationDto;
  threadId: string | null;
  message: MessageDto;
  metadata: Record<string, unknown>;
}

export interface OutboundMessageResult {
  success: true;
  code: "DELIVERED";
  providerMessageId: string;
  acceptedAt: string;
  metadata: Record<string, unknown>;
}

export interface InternalOutboundMessage {
  requestId: string;
  accountId: string;
  conversationId: string;
  conversationType: ConversationDto["type"];
  threadId?: string | null;
  messageId: string;
  text?: string | null;
  attachments?: AttachmentDto[];
  replyToMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

export function mapOutboundMessage(
  message: InternalOutboundMessage
): OutboundMessageRequest {
  return {
    requestId: message.requestId,
    accountId: message.accountId,
    conversation: {
      conversationId: message.conversationId,
      type: message.conversationType
    },
    threadId: message.threadId ?? null,
    message: {
      messageId: message.messageId,
      text: message.text ?? null,
      attachments: (message.attachments ?? []).map((attachment) =>
        normalizeAttachment(attachment)
      ),
      replyToMessageId: message.replyToMessageId ?? null
    },
    metadata: message.metadata ?? {}
  };
}

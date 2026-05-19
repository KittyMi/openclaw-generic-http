import type { AttachmentDto, InboundMessageRequestDto } from "../protocol/dto.js";

export interface NormalizedInboundMessageEvent {
  eventId: string;
  eventType: "message.created";
  accountId: string;
  conversationId: string;
  conversationType: string;
  conversationTitle: string | null;
  threadId: string | null;
  senderId: string;
  senderName: string | null;
  senderType: string;
  messageId: string;
  text: string | null;
  attachments: AttachmentDto[];
  replyToMessageId: string | null;
  occurredAt: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}

export function mapInboundMessage(
  request: InboundMessageRequestDto
): NormalizedInboundMessageEvent {
  return {
    eventId: request.eventId,
    eventType: "message.created",
    accountId: request.accountId,
    conversationId: request.conversation.conversationId,
    conversationType: request.conversation.type,
    conversationTitle: request.conversation.title ?? null,
    threadId: request.threadId ?? null,
    senderId: request.sender.id,
    senderName: request.sender.name ?? null,
    senderType: request.sender.type,
    messageId: request.message.messageId,
    text: request.message.text ?? null,
    attachments: request.message.attachments ?? [],
    replyToMessageId: request.message.replyToMessageId ?? null,
    occurredAt: request.occurredAt ?? null,
    idempotencyKey: request.idempotencyKey ?? null,
    // Keep metadata object-shaped for downstream handlers even when omitted.
    metadata: request.metadata ?? {}
  };
}

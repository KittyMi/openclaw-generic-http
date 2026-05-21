export interface ConversationDto {
  conversationId: string;
  type: ConversationType;
  title?: string | null;
  metadata?: Record<string, unknown>;
}

export type ConversationType = "dm" | "group" | "room" | "ticket";

export type SenderType = "user" | "bot" | "system";
export type AttachmentKind = "file" | "image";

export interface SenderDto {
  id: string;
  name?: string | null;
  type: SenderType;
  metadata?: Record<string, unknown>;
}

export interface AttachmentDto {
  kind?: AttachmentKind;
  id?: string;
  name?: string;
  contentType?: string;
  url?: string;
  contentBase64?: string;
  sizeBytes?: number;
  caption?: string | null;
  altText?: string | null;
  previewUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageDto {
  messageId: string;
  text?: string | null;
  attachments?: AttachmentDto[];
  replyToMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface InboundMessageRequestDto {
  eventId: string;
  eventType?: string;
  accountId: string;
  conversation: ConversationDto;
  threadId?: string | null;
  sender: SenderDto;
  message: MessageDto;
  occurredAt?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

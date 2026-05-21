import { ERROR_CODES } from "../errors/codes.js";
import { GenericHttpPluginError } from "../errors/exceptions.js";
import { normalizeAttachment } from "../protocol/attachments.js";
import type {
  AttachmentDto,
  AttachmentKind,
  ConversationDto,
  InboundMessageRequestDto,
  MessageDto,
  SenderDto
} from "../protocol/dto.js";
type InboundMessageRequest = InboundMessageRequestDto;

const CONVERSATION_TYPES = new Set(["dm", "group", "room", "ticket"]);
const SENDER_TYPES = new Set(["user", "bot", "system"]);
const ATTACHMENT_KINDS = new Set<AttachmentKind>(["file", "image"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GenericHttpPluginError(
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      `Field "${field}" must be a non-empty string.`,
      { field }
    );
  }
}

function validateOptionalString(value: unknown, field: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      `Field "${field}" must be a string when provided.`,
      { field }
    );
  }
}

function validateMetadata(value: unknown, field: string): void {
  if (value !== undefined && value !== null && !isRecord(value)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      `Field "${field}" must be an object when provided.`,
      { field }
    );
  }
}

function validateConversation(conversation: unknown): asserts conversation is ConversationDto {
  if (!isRecord(conversation)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      'Field "conversation" must be an object.',
      { field: "conversation" }
    );
  }

  requireNonEmptyString(conversation.conversationId, "conversation.conversationId");
  requireNonEmptyString(conversation.type, "conversation.type");
  if (!CONVERSATION_TYPES.has(conversation.type)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      'Field "conversation.type" must be one of: dm, group, room, ticket.',
      { field: "conversation.type" }
    );
  }

  validateOptionalString(conversation.title, "conversation.title");
  validateMetadata(conversation.metadata, "conversation.metadata");
}

function validateSender(sender: unknown): asserts sender is SenderDto {
  if (!isRecord(sender)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      'Field "sender" must be an object.',
      { field: "sender" }
    );
  }

  requireNonEmptyString(sender.id, "sender.id");
  requireNonEmptyString(sender.type, "sender.type");
  if (!SENDER_TYPES.has(sender.type)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      'Field "sender.type" must be one of: user, bot, system.',
      { field: "sender.type" }
    );
  }

  validateOptionalString(sender.name, "sender.name");
  validateMetadata(sender.metadata, "sender.metadata");
}

function validateAttachment(attachment: unknown, index: number): asserts attachment is AttachmentDto {
  if (!isRecord(attachment)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      `Field "message.attachments[${index}]" must be an object.`,
      { field: `message.attachments[${index}]` }
    );
  }

  if (
    attachment.kind !== undefined &&
    (typeof attachment.kind !== "string" ||
      !ATTACHMENT_KINDS.has(attachment.kind as AttachmentKind))
  ) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      `Field "message.attachments[${index}].kind" must be one of: file, image.`,
      { field: `message.attachments[${index}].kind` }
    );
  }

  validateOptionalString(attachment.id, `message.attachments[${index}].id`);
  validateOptionalString(attachment.name, `message.attachments[${index}].name`);
  validateOptionalString(attachment.contentType, `message.attachments[${index}].contentType`);
  validateOptionalString(attachment.url, `message.attachments[${index}].url`);
  validateOptionalString(
    attachment.contentBase64,
    `message.attachments[${index}].contentBase64`
  );
  validateOptionalString(attachment.caption, `message.attachments[${index}].caption`);
  validateOptionalString(attachment.altText, `message.attachments[${index}].altText`);
  validateOptionalString(attachment.previewUrl, `message.attachments[${index}].previewUrl`);
  if (attachment.sizeBytes !== undefined && typeof attachment.sizeBytes !== "number") {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      `Field "message.attachments[${index}].sizeBytes" must be a number when provided.`,
      { field: `message.attachments[${index}].sizeBytes` }
    );
  }

  if (
    (attachment.url === undefined || attachment.url === "") &&
    (attachment.contentBase64 === undefined || attachment.contentBase64 === "")
  ) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      `Attachment "message.attachments[${index}]" must include either url or contentBase64.`,
      { field: `message.attachments[${index}]` }
    );
  }
  normalizeAttachment(attachment);

  validateMetadata(attachment.metadata, `message.attachments[${index}].metadata`);
}

function validateMessage(message: unknown): asserts message is MessageDto {
  if (!isRecord(message)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      'Field "message" must be an object.',
      { field: "message" }
    );
  }

  requireNonEmptyString(message.messageId, "message.messageId");
  validateOptionalString(message.text, "message.text");
  validateOptionalString(message.replyToMessageId, "message.replyToMessageId");
  validateMetadata(message.metadata, "message.metadata");

  if (message.attachments !== undefined) {
    if (!Array.isArray(message.attachments)) {
      throw new GenericHttpPluginError(
        ERROR_CODES.INVALID_FIELD_FORMAT,
        'Field "message.attachments" must be an array when provided.',
        { field: "message.attachments" }
      );
    }

    message.attachments.forEach((attachment, index) => validateAttachment(attachment, index));
  }

  if (
    (message.text === undefined || message.text === null || message.text === "") &&
    (message.attachments === undefined || message.attachments.length === 0)
  ) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      'Field "message" must include non-empty text or at least one attachment.',
      { field: "message" }
    );
  }
}

function validateOccurredAt(occurredAt: unknown): void {
  validateOptionalString(occurredAt, "occurredAt");
  if (typeof occurredAt === "string" && Number.isNaN(Date.parse(occurredAt))) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_FIELD_FORMAT,
      'Field "occurredAt" must be a valid date-time string.',
      { field: "occurredAt" }
    );
  }
}

export function validateInboundMessage(
  request: InboundMessageRequest
): asserts request is InboundMessageRequestDto {
  if (!isRecord(request)) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      "Inbound message request must be an object."
    );
  }

  requireNonEmptyString(request.eventId, "eventId");
  requireNonEmptyString(request.accountId, "accountId");
  validateConversation(request.conversation);
  validateOptionalString(request.threadId, "threadId");
  validateSender(request.sender);
  validateMessage(request.message);
  validateOccurredAt(request.occurredAt);
  validateOptionalString(request.idempotencyKey, "idempotencyKey");
  validateMetadata(request.metadata, "metadata");
}

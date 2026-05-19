import { ERROR_CODES } from "../errors/codes.js";
import { GenericHttpPluginError } from "../errors/exceptions.js";
import type { AttachmentDto, AttachmentKind } from "./dto.js";

export const DEFAULT_MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

function inferAttachmentKind(attachment: AttachmentDto): AttachmentKind {
  if (attachment.kind !== undefined) {
    return attachment.kind;
  }

  if (attachment.contentType?.startsWith("image/") === true) {
    return "image";
  }

  return "file";
}

function normalizeAttachmentName(attachment: AttachmentDto): string | undefined {
  if (attachment.name === undefined) {
    return undefined;
  }

  const normalized = attachment.name.trim();
  return normalized === "" ? undefined : normalized;
}

export interface NormalizeAttachmentOptions {
  maxAttachmentSizeBytes?: number;
}

/**
 * Centralize attachment shaping rules so inbound validation and outbound
 * serialization do not drift apart when file/image support evolves.
 */
export function normalizeAttachment(
  attachment: AttachmentDto,
  options: NormalizeAttachmentOptions = {}
): AttachmentDto {
  const normalized: AttachmentDto = {
    kind: inferAttachmentKind(attachment),
    id: attachment.id,
    name: normalizeAttachmentName(attachment),
    contentType: attachment.contentType,
    url: attachment.url,
    contentBase64: attachment.contentBase64,
    sizeBytes: attachment.sizeBytes,
    caption: attachment.caption ?? null,
    altText: attachment.altText ?? null,
    previewUrl: attachment.previewUrl,
    metadata: attachment.metadata ?? {}
  };

  const maxAttachmentSizeBytes =
    options.maxAttachmentSizeBytes ?? DEFAULT_MAX_ATTACHMENT_SIZE_BYTES;

  if (
    normalized.sizeBytes !== undefined &&
    normalized.sizeBytes > maxAttachmentSizeBytes
  ) {
    throw new GenericHttpPluginError(
      ERROR_CODES.INVALID_REQUEST,
      "Attachment size exceeds the supported maximum.",
      {
        maxAttachmentSizeBytes,
        sizeBytes: normalized.sizeBytes
      }
    );
  }

  if (normalized.kind === "image") {
    if (
      normalized.contentType !== undefined &&
      !normalized.contentType.startsWith("image/")
    ) {
      throw new GenericHttpPluginError(
        ERROR_CODES.INVALID_FIELD_FORMAT,
        "Image attachment contentType must start with image/.",
        {
          field: "contentType",
          contentType: normalized.contentType
        }
      );
    }
  }

  return normalized;
}

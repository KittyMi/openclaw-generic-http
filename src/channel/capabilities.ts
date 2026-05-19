export interface GenericHttpCapabilities {
  textInbound: boolean;
  textOutbound: boolean;
  attachments: boolean;
  threading: boolean;
  replies: boolean;
  deliveryReceipt: boolean;
}

export const DEFAULT_GENERIC_HTTP_CAPABILITIES: GenericHttpCapabilities = {
  textInbound: true,
  textOutbound: true,
  attachments: true,
  threading: true,
  replies: true,
  deliveryReceipt: false
};

export function getGenericHttpCapabilities(): GenericHttpCapabilities {
  return { ...DEFAULT_GENERIC_HTTP_CAPABILITIES };
}

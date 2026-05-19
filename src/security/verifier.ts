import { timingSafeEqual } from "node:crypto";

import { signPayload, type SignatureInput } from "./signer.js";

function normalizeHex(value: string): Buffer | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  return Buffer.from(value.toLowerCase(), "hex");
}

export function verifyPayload(
  expectedSignature: string,
  secret: string,
  input: SignatureInput
): boolean {
  const provided = normalizeHex(expectedSignature);
  if (provided === null) {
    return false;
  }

  const computed = normalizeHex(signPayload(secret, input));
  if (computed === null || provided.length !== computed.length) {
    return false;
  }

  // Avoid leaking signature match information through early-return timing.
  return timingSafeEqual(provided, computed);
}

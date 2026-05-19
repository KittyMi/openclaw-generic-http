import { createHash, createHmac } from "node:crypto";

export interface SignatureInput {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  rawBody?: string | null;
}

export function sha256Hex(rawBody?: string | null): string {
  return createHash("sha256").update(rawBody ?? "", "utf8").digest("hex");
}

export function buildCanonicalString(input: SignatureInput): string {
  // Keep canonicalization byte-for-byte aligned with the published protocol spec
  // so every SDK and plugin implementation produces the same signature.
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    sha256Hex(input.rawBody)
  ].join("\n");
}

export function signPayload(secret: string, input: SignatureInput): string {
  return createHmac("sha256", secret)
    .update(buildCanonicalString(input), "utf8")
    .digest("hex");
}

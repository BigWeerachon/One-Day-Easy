import { createHmac, timingSafeEqual } from "node:crypto";
/** ตรวจ x-line-signature = base64(HMAC-SHA256(channelSecret, rawBody)) */
export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const got = Buffer.from(signature, "base64");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

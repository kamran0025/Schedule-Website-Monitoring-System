import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function verifyApiKey(apiKey: string, hash: string): boolean {
  const candidate = Buffer.from(hashApiKey(apiKey), "hex");
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

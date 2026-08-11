import emailjs, { EmailJSResponseStatus } from "@emailjs/nodejs";

import { env } from "../config/env.js";

// Thrown for failures a retry can't fix: bad service/template ID, a
// recipient EmailJS itself refused, or malformed template params. The
// worker treats this as permanent. Anything else (network error, 5xx,
// EmailJS rate limiting) is left to bubble up so BullMQ's retry/backoff
// (Phase 6) gets a chance at it.
export class EmailDeliveryError extends Error {}

// Shared by both single-article digests (below) and listing digests
// (listingDigestEmail.ts) - both just fill in the same dashboard-managed
// EmailJS template with different values.
export async function sendTemplateEmail(templateParams: Record<string, string>): Promise<void> {
  try {
    await emailjs.send(env.emailjsServiceId, env.emailjsTemplateId, templateParams, {
      publicKey: env.emailjsPublicKey,
      privateKey: env.emailjsPrivateKey,
    });
  } catch (error) {
    // Missing service/public/template ID rejects with a plain string, not
    // an Error - always a configuration problem, never transient.
    if (typeof error === "string") {
      throw new EmailDeliveryError(error);
    }
    if (error instanceof EmailJSResponseStatus) {
      if (error.status === 429 || error.status >= 500) {
        throw new Error(`EmailJS delivery failed (${error.status}): ${error.text}`, { cause: error });
      }
      throw new EmailDeliveryError(`EmailJS rejected the digest (${error.status}): ${error.text}`);
    }
    throw error;
  }
}

export interface DigestEmailInput {
  toEmail: string;
  title: string;
  summary: string;
  sourceUrl: string;
  runDate: Date;
}

function buildTemplateParams(input: DigestEmailInput): Record<string, string> {
  const title = input.title || input.sourceUrl;
  return {
    to_email: input.toEmail,
    subject: `Update: ${title}`,
    title,
    summary: input.summary,
    source_url: input.sourceUrl,
    run_date: input.runDate.toISOString(),
  };
}

export async function sendDigestEmail(input: DigestEmailInput): Promise<void> {
  await sendTemplateEmail(buildTemplateParams(input));
}

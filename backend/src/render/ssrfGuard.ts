import dns from "node:dns/promises";

import ipaddr from "ipaddr.js";

export class InvalidUrlError extends Error {}
export class SsrfBlockedError extends Error {}

// Only IPs in ipaddr.js's "unicast" range are routable public addresses.
// Every other range (loopback, private, linkLocal incl. the 169.254.169.254
// cloud metadata address, uniqueLocal, carrierGradeNat, reserved, etc.) is
// blocked by default rather than enumerated, so we fail closed on ranges we
// didn't think of.
function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  const addr = ipaddr.process(ip);
  return addr.range() === "unicast";
}

export function parseRenderableUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidUrlError(`"${value}" is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError(`URL protocol must be http or https, got "${parsed.protocol}"`);
  }
  return parsed;
}

// Resolves the hostname and rejects it if ANY resolved address is
// non-public. Call this for the initial URL and again for every redirect
// hop, since DNS can answer differently between checks.
export async function assertPublicHostname(hostname: string): Promise<void> {
  // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); ipaddr.js
  // expects the bare address.
  const literal =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (ipaddr.isValid(literal)) {
    if (!isPublicIp(literal)) {
      throw new SsrfBlockedError(`"${hostname}" resolves to a blocked IP range`);
    }
    return;
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`Unable to resolve hostname "${hostname}"`);
  }

  if (records.length === 0) {
    throw new SsrfBlockedError(`Hostname "${hostname}" did not resolve to any address`);
  }

  for (const { address } of records) {
    if (!isPublicIp(address)) {
      throw new SsrfBlockedError(`"${hostname}" resolves to blocked address ${address}`);
    }
  }
}

export async function assertRenderableUrl(value: string): Promise<URL> {
  const parsed = parseRenderableUrl(value);
  await assertPublicHostname(parsed.hostname);
  return parsed;
}

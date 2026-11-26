import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function inCidr4(ipInt: number, baseIp: string, prefixLen: number): boolean {
  const baseInt = ipv4ToInt(baseIp);
  if (baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * Returns true if an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, CGNAT, documentation, or non-routable range (SSRF protection).
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const version = isIP(ip);

  if (version === 4) {
    const ipInt = ipv4ToInt(ip);
    if (ipInt === null) return true;
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8],       // Current network
      ["10.0.0.0", 8],      // RFC 1918 private
      ["100.64.0.0", 10],   // Carrier-grade NAT (RFC 6598)
      ["127.0.0.0", 8],     // Loopback
      ["169.254.0.0", 16],  // Link-local & AWS/GCP/Azure metadata
      ["172.16.0.0", 12],   // RFC 1918 private
      ["192.0.0.0", 24],    // IETF protocol assignments
      ["192.0.2.0", 24],    // TEST-NET-1
      ["192.168.0.0", 16],  // RFC 1918 private
      ["198.18.0.0", 15],   // Benchmark testing
      ["198.51.100.0", 24], // TEST-NET-2
      ["203.0.113.0", 24],  // TEST-NET-3
      ["224.0.0.0", 4],     // Multicast
      ["240.0.0.0", 4],     // Reserved / broadcast
    ];
    return blockedRanges.some(([base, prefix]) => inCidr4(ipInt, base, prefix));
  }

  if (version === 6) {
    // Unspecified & loopback
    if (ip === "::" || ip === "::1" || ip === "0:0:0:0:0:0:0:0" || ip === "0:0:0:0:0:0:0:1") {
      return true;
    }

    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice("::ffff:".length);
      if (isIP(mapped) === 4) {
        return isPrivateOrReservedIp(mapped);
      }
      const hexParts = mapped.split(":");
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
          const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          return isPrivateOrReservedIp(v4);
        }
      }
      return true;
    }

    // Unique local addresses (fc00::/7 -> fc.. or fd..)
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    // Link-local (fe80::/10 -> fe8., fe9., fea., feb.)
    if (/^fe[89ab]/.test(ip)) return true;
    // Multicast (ff00::/8)
    if (ip.startsWith("ff")) return true;

    return false;
  }

  // Unrecognized IP format: fail closed
  return true;
}

export interface UrlValidationResult {
  ok: true;
  normalizedUrl: string;
  hostname: string;
}

export interface UrlValidationError {
  ok: false;
  error: string;
}

/**
 * Validates and normalizes a user-supplied monitoring URL, blocking non-HTTP(S)
 * schemes, credentials, loopback/private IPs, and internal Docker/cluster hosts.
 */
export function validateMonitorUrl(
  rawInput: unknown
): UrlValidationResult | UrlValidationError {
  if (typeof rawInput !== "string") {
    return { ok: false, error: "URL must be a string" };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: "URL is required" };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: `URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid URL format (include https:// or http://)" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// URLs are supported" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) {
    return { ok: false, error: "URL must contain a valid hostname" };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return { ok: false, error: "Internal or localhost URLs are not allowed" };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, error: "Private or reserved IP addresses are not allowed" };
    }
  } else {
    // Reject single-label hostnames (e.g., Docker Compose service names like `postgres`, `redis`)
    if (!hostname.includes(".")) {
      return { ok: false, error: "Hostname must be a public domain name" };
    }
  }

  // Strip fragment; keep origin + pathname + query
  parsed.hash = "";
  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    hostname,
  };
}

/**
 * Resolves DNS for a validated URL and rejects any host whose A/AAAA records
 * point to a private, loopback, or link-local IP (prevents DNS rebinding SSRF).
 */
export async function assertPublicDns(hostname: string): Promise<void> {
  if (isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Blocked private IP target: ${hostname}`);
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error(`DNS lookup returned no addresses for ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error(
        `Blocked SSRF target: ${hostname} resolved to private IP ${record.address}`
      );
    }
  }
}

import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { signSessionToken, verifySessionToken } from "../lib/auth.ts";
import { isPrivateOrReservedIp, validateMonitorUrl } from "../lib/urlGuard.ts";
import { computeWebsiteMetrics } from "../lib/metrics.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

async function run() {
  await test("password hashing uses salted scrypt and verifies correctly", async () => {
    const h1 = await hashPassword("Sup3rS3cret!");
    const h2 = await hashPassword("Sup3rS3cret!");
    assert.ok(h1.startsWith("scrypt$"));
    assert.notEqual(h1, h2, "Same password must produce distinct salted hashes");
    assert.equal(await verifyPassword("Sup3rS3cret!", h1), true);
    assert.equal(await verifyPassword("wrong-pass", h1), false);
    assert.equal(await verifyPassword("Sup3rS3cret!", "plaintext-password"), false);
  });

  await test("JWT session signing and verification enforces secret and payload", () => {
    const prev = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "unit-test-secret-key-32-chars-min";
    try {
      const token = signSessionToken({ userId: "u-123", username: "rony" });
      const decoded = verifySessionToken(token);
      assert.deepEqual(decoded, { userId: "u-123", username: "rony" });
      assert.equal(verifySessionToken(token + "tampered"), null);
    } finally {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
    }
  });

  await test("SSRF guard accepts valid public http/https URLs and strips fragments", () => {
    const res = validateMonitorUrl("https://example.com/health?v=1#section");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.normalizedUrl, "https://example.com/health?v=1");
      assert.equal(res.hostname, "example.com");
    }
  });

  await test("SSRF guard blocks localhost, private IPs, cloud metadata, and Docker hosts", () => {
    const blocked = [
      "http://localhost:3000/api/getAllWebsites",
      "http://127.0.0.1:5432",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/internal",
      "http://172.16.0.1/",
      "http://192.168.1.1/admin",
      "http://[::1]:3000/",
      "http://[::ffff:127.0.0.1]/",
      "http://postgres:5432",
      "http://redis:6379",
      "http://service.internal/health",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "not-a-valid-url",
      "",
    ];

    for (const candidate of blocked) {
      const result = validateMonitorUrl(candidate);
      assert.equal(result.ok, false, `Expected URL to be blocked: ${candidate}`);
    }
  });

  await test("isPrivateOrReservedIp classifies public vs private IPv4 and IPv6", () => {
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("100.64.0.1"), true);
    assert.equal(isPrivateOrReservedIp("::1"), true);
    assert.equal(isPrivateOrReservedIp("fe80::1"), true);
    assert.equal(isPrivateOrReservedIp("fc00::1"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:192.168.0.1"), true);
    assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false);
  });

  await test("computeWebsiteMetrics handles empty and populated tick history", () => {
    assert.deepEqual(computeWebsiteMetrics([]), {
      latestStatus: "pending",
      latestLatencyMs: null,
      uptimePercent: null,
      avgLatencyMs: null,
      totalChecks: 0,
    });

    const summary = computeWebsiteMetrics([
      { id: "3", status: "up", res_time_ms: 120, region_id: "bd", createdAt: "2026-11-26T10:02:00Z" },
      { id: "2", status: "down", res_time_ms: 5000, region_id: "ind", createdAt: "2026-11-26T10:01:00Z" },
      { id: "1", status: "up", res_time_ms: 180, region_id: "bd", createdAt: "2026-11-26T10:00:00Z" },
    ]);

    assert.equal(summary.latestStatus, "up");
    assert.equal(summary.latestLatencyMs, 120);
    assert.equal(summary.uptimePercent, 66.7);
    assert.equal(summary.avgLatencyMs, 1767);
    assert.equal(summary.totalChecks, 3);
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void run();

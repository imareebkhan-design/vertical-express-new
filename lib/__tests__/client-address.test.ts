import test from "node:test";
import assert from "node:assert/strict";
import { clientAddress, trustedProxyHops } from "@/lib/client-address";

const h = (xff?: string, extra: Record<string, string> = {}) => {
  const m = new Map(Object.entries({ ...(xff === undefined ? {} : { "x-forwarded-for": xff }), ...extra }));
  return { get: (k: string) => m.get(k.toLowerCase()) ?? null };
};

test("behind the load balancer the client is the entry before the balancer's own", () => {
  assert.equal(clientAddress(h("198.51.100.4, 34.120.0.1")), "198.51.100.4");
});

test("entries the caller sent ahead of the platform's are ignored, however many", () => {
  assert.equal(clientAddress(h("203.0.113.77, 198.51.100.4, 34.120.0.1")), "198.51.100.4");
  assert.equal(clientAddress(h("1.1.1.1,2.2.2.2,3.3.3.3, 198.51.100.4,34.120.0.1")), "198.51.100.4");
});

test("x-real-ip is never read: the platform does not set it, so only a caller can", () => {
  assert.equal(clientAddress(h("198.51.100.4, 34.120.0.1", { "x-real-ip": "203.0.113.8" })), "198.51.100.4");
  assert.equal(clientAddress(h(undefined, { "x-real-ip": "203.0.113.8" })), "anonymous");
});

test("rotating the forged entry does not change the bucket", () => {
  const keys = new Set(["9.9.9.1", "9.9.9.2", "9.9.9.3"].map((f) => clientAddress(h(`${f}, 198.51.100.4, 34.120.0.1`))));
  assert.deepEqual([...keys], ["198.51.100.4"]);
});

test("the number of platform hops is configurable and counted from the right", () => {
  assert.equal(clientAddress(h("198.51.100.4, 34.120.0.1, 10.0.0.9"), 2), "198.51.100.4");
  assert.equal(clientAddress(h("198.51.100.4"), 0), "198.51.100.4");
});

test("a list shorter than the platform would produce (local, tests) uses its last entry", () => {
  assert.equal(clientAddress(h("127.0.0.1")), "127.0.0.1");
  assert.equal(clientAddress(h("")), "anonymous");
  assert.equal(clientAddress(h()), "anonymous");
});

test("IPv6 is kept, lower-cased; anything that is not an address is not used as a key", () => {
  assert.equal(clientAddress(h("2401:4900:8845:8A2A::1, 34.120.0.1")), "2401:4900:8845:8a2a::1");
  assert.equal(clientAddress(h("not-an-address'; drop, 34.120.0.1")), "anonymous");
  assert.equal(clientAddress(h(`${"1".repeat(200)}, 34.120.0.1`)), "anonymous");
});

test("TRUSTED_PROXY_HOPS: unset or nonsense means 1", () => {
  assert.equal(trustedProxyHops({}), 1);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" }), 2);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" }), 0);
  for (const bad of ["-1", "abc", "1.5", "99", ""]) assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: bad }), 1, bad);
});

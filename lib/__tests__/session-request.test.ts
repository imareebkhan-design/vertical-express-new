import assert from "node:assert/strict";
import test from "node:test";
import { sessionRequestRefusal } from "@/lib/auth/session-request";
import { POST, DELETE } from "@/app/api/auth/session/route";

const request = (method = "POST", overrides: Record<string, string> = {}) => new Request("http://internal:8080/api/auth/session", {
  method,
  headers: { host: "internal:8080", "x-forwarded-host": "shop.example", "x-forwarded-proto": "https", origin: "https://shop.example", "content-type": "application/json", ...overrides },
  ...(method === "POST" ? { body: '{"idToken":"attacker-token","x":"="}' } : {}),
});

test("session accepts same-origin JSON through trusted ingress, including charset", () => {
  assert.equal(sessionRequestRefusal(request()), null);
  assert.equal(sessionRequestRefusal(request("POST", { "content-type": "Application/JSON; charset=utf-8" })), null);
  assert.equal(sessionRequestRefusal(request("DELETE", { "content-type": "" })), null);
  assert.equal(sessionRequestRefusal(new Request("http://localhost:3000/api/auth/session", {
    method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
  })), null);
});

test("session refuses missing, opaque, malformed, foreign and scheme-mismatched origins", () => {
  for (const origin of ["", "null", "not a URL", "https://attacker.example", "http://shop.example", "https://shop.example.attacker.example", "https://shop.example:444", "https://shop.example/path"]) {
    for (const method of ["POST", "DELETE"]) assert.equal(sessionRequestRefusal(request(method, { origin })), 403, `${method} ${origin}`);
  }
  assert.equal(sessionRequestRefusal(request("POST", { "sec-fetch-site": "cross-site" })), 403);
  assert.equal(sessionRequestRefusal(request("POST", { "x-forwarded-host": "shop.example, attacker.example" })), 403);
  assert.equal(sessionRequestRefusal(request("POST", { "x-forwarded-proto": "https,http" })), 403);
});

test("session refuses form-compatible POST types even on the same origin", () => {
  for (const type of ["", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/jsonp"]) {
    assert.equal(sessionRequestRefusal(request("POST", { "content-type": type })), 415);
  }
});

test("real session handlers reject CSRF before Firebase, database or cookies are consulted", async () => {
  for (const method of ["POST", "DELETE"]) {
    const response = await (method === "POST" ? POST : DELETE)(request(method, { origin: "https://attacker.example", "content-type": "text/plain" }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const plain = await POST(request("POST", { "content-type": "text/plain" }));
  assert.equal(plain.status, 415);
  assert.equal(plain.headers.get("set-cookie"), null);
});

test("ordinary same-origin DELETE still clears the browser cookie without Firebase", async () => {
  const response = await DELETE(request("DELETE"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /__session=;/);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";
import { parseOrigins } from "../src/cors-options.mjs";

const ALLOWED = "http://localhost:5173";
const BLOCKED = "http://evil.example";

async function withServer(run) {
  const server = createApp({ allowedOrigins: [ALLOWED] }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const json = (body) => ({
  headers: { "Content-Type": "application/json", Origin: ALLOWED },
  body: JSON.stringify(body),
});

test("full CRUD cycle uses the right method and status code for each step", () => withServer(async (base) => {
  const list = await fetch(`${base}/api/incidents`);
  assert.equal(list.status, 200);
  const { items, count } = await list.json();
  assert.equal(count, 3);
  assert.equal(items.length, 3);

  const created = await fetch(`${base}/api/incidents`, { method: "POST", ...json({ title: "Projector offline", service: "d2l" }) });
  assert.equal(created.status, 201);
  const incident = await created.json();
  assert.equal(created.headers.get("location"), `/api/incidents/${incident.id}`);
  assert.equal(incident.status, "investigating");

  const one = await fetch(`${base}${created.headers.get("location")}`);
  assert.deepEqual(await one.json(), incident);

  const replaced = await fetch(`${base}/api/incidents/${incident.id}`, { method: "PUT",
    ...json({ title: "Projector offline in CDM 220", service: "d2l", status: "monitoring" }) });
  assert.equal(replaced.status, 200);
  assert.equal((await replaced.json()).title, "Projector offline in CDM 220");

  const patched = await fetch(`${base}/api/incidents/${incident.id}`, { method: "PATCH", ...json({ status: "resolved" }) });
  const patchedBody = await patched.json();
  assert.equal(patchedBody.status, "resolved");
  assert.equal(patchedBody.title, "Projector offline in CDM 220", "PATCH keeps other fields");

  const filtered = await (await fetch(`${base}/api/incidents?status=resolved&q=projector`)).json();
  assert.deepEqual(filtered.items.map((row) => row.id), [incident.id]);

  const deleted = await fetch(`${base}/api/incidents/${incident.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), "");
  assert.equal((await fetch(`${base}/api/incidents/${incident.id}`)).status, 404);
}));

test("validation, unknown ids, bad JSON and unknown routes return one JSON error shape", () => withServer(async (base) => {
  const cases = [
    [fetch(`${base}/api/incidents`, { method: "POST", ...json({ title: "x", service: "wifi" }) }), 400, "validation_failed"],
    [fetch(`${base}/api/incidents`, { method: "POST", ...json({ title: "Valid title", service: "pizza" }) }), 400, "validation_failed"],
    [fetch(`${base}/api/incidents`, { method: "POST", ...json([1, 2]) }), 400, "validation_failed"],
    [fetch(`${base}/api/incidents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" }), 400, "invalid_json"],
    [fetch(`${base}/api/incidents`, { method: "POST", ...json({ title: "x".repeat(20_000) }) }), 413, "too_large"],
    [fetch(`${base}/api/incidents?status=broken`), 400, "validation_failed"],
    [fetch(`${base}/api/incidents/nope`), 404, "not_found"],
    [fetch(`${base}/api/incidents/nope`, { method: "PATCH", ...json({ status: "resolved" }) }), 404, "not_found"],
    [fetch(`${base}/api/nothing-here`), 404, "not_found"],
  ];
  for (const [pending, status, code] of cases) {
    const res = await pending;
    assert.equal(res.status, status, `${res.url} → ${status}`);
    const body = await res.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
  }
  const id = (await (await fetch(`${base}/api/incidents`)).json()).items[0].id;
  const badPatch = await fetch(`${base}/api/incidents/${id}`, { method: "PATCH", ...json({ status: "done" }) });
  assert.equal(badPatch.status, 400);
}));

test("CORS: an allowed origin gets headers; a blocked origin gets none", () => withServer(async (base) => {
  const allowed = await fetch(`${base}/api/incidents`, { headers: { Origin: ALLOWED } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), ALLOWED);
  assert.match(allowed.headers.get("access-control-expose-headers"), /Location/);
  assert.match(allowed.headers.get("vary"), /Origin/);

  const blocked = await fetch(`${base}/api/incidents`, { headers: { Origin: BLOCKED } });
  assert.equal(blocked.status, 200, "the server still answers — the browser is what blocks");
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);

  const noOrigin = await fetch(`${base}/api/healthz`);
  assert.deepEqual(await noOrigin.json(), { ok: true });
}));

test("CORS preflight: OPTIONS advertises methods, headers and max-age only to allowed origins", () => withServer(async (base) => {
  const preflight = (origin) => fetch(`${base}/api/incidents/abc`, { method: "OPTIONS", headers: {
    Origin: origin,
    "Access-Control-Request-Method": "PATCH",
    "Access-Control-Request-Headers": "content-type,x-request-id",
  } });
  const ok = await preflight(ALLOWED);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), ALLOWED);
  assert.match(ok.headers.get("access-control-allow-methods"), /PATCH/);
  assert.match(ok.headers.get("access-control-allow-headers"), /X-Request-Id/);
  assert.equal(ok.headers.get("access-control-max-age"), "600");

  const denied = await preflight(BLOCKED);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal(denied.headers.get("access-control-allow-methods"), null);
  assert.equal(denied.status, 204, "refused preflights get an empty answer, not a route");
}));

test("CORS headers are on error responses too, so the browser can show them", () => withServer(async (base) => {
  const invalid = await fetch(`${base}/api/incidents`, {
    method: "POST", headers: { Origin: ALLOWED, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Hi", service: "wifi" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("access-control-allow-origin"), ALLOWED);
  assert.equal((await invalid.json()).error.code, "validation_failed");

  const missing = await fetch(`${base}/api/nope`, { headers: { Origin: ALLOWED } });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("access-control-allow-origin"), ALLOWED);
  assert.ok((await missing.json()).error.message);
}));

test("request ids are echoed so the browser and server logs can be matched", () => withServer(async (base) => {
  const res = await fetch(`${base}/api/healthz`, { headers: { "X-Request-Id": "demo-123" } });
  assert.equal(res.headers.get("x-request-id"), "demo-123");
  const generated = await fetch(`${base}/api/healthz`);
  assert.match(generated.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);

  // Even responses that never reach a route carry one: preflights and bad JSON.
  const preflight = await fetch(`${base}/api/incidents`, { method: "OPTIONS",
    headers: { Origin: BLOCKED, "Access-Control-Request-Method": "POST" } });
  assert.ok(preflight.headers.get("x-request-id"));
  const badJson = await fetch(`${base}/api/incidents`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(badJson.status, 400);
  assert.ok(badJson.headers.get("x-request-id"));
}));

test("CORS_ORIGINS parsing trims entries and falls back to the Vite defaults", () => {
  assert.deepEqual(parseOrigins(" http://a.test , http://b.test ,"), ["http://a.test", "http://b.test"]);
  assert.deepEqual(parseOrigins(undefined), ["http://localhost:5173", "http://127.0.0.1:5173"]);
});

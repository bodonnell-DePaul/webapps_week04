// Runs the REAL axios endpoint functions against the REAL Express app.
// (Node has no CORS — the browser check is covered by the backend tests.)
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
// @ts-expect-error — plain ESM backend module without type declarations
import { createApp } from "../../backend/src/app.mjs";
import { ApiError, api, onActivity, toApiError, type Activity } from "../src/api/client.ts";
import {
  createIncident, deleteIncident, getIncident, listIncidents, replaceIncident, updateStatus,
} from "../src/api/incidents.ts";

let server: Server;
const seen: string[] = [];

before(async () => {
  server = createApp({ log: (line: string) => seen.push(line) }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  api.defaults.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function rejection(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error as ApiError; }
  assert.fail("expected the request to fail");
}

test("every endpoint function sends the right method and unwraps response.data", async () => {
  const before = await listIncidents();
  assert.equal(before.length, 3);

  const { incident, location } = await createIncident({ title: "Elevator stuck", service: "shuttle" });
  assert.equal(location, `/api/incidents/${incident.id}`);
  assert.equal((await getIncident(incident.id)).title, "Elevator stuck");

  const replaced = await replaceIncident({ ...incident, title: "Elevator stuck in Lewis", status: "monitoring" });
  assert.equal(replaced.status, "monitoring");

  const patched = await updateStatus(incident.id, "resolved");
  assert.equal(patched.title, "Elevator stuck in Lewis");

  const resolved = await listIncidents({ status: "resolved", q: "elevator" });
  assert.deepEqual(resolved.map((row) => row.id), [incident.id]);

  await deleteIncident(incident.id);
  assert.equal((await listIncidents()).length, 3);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(seen.some((line) => line.startsWith(`${method} /api/incidents`)), `server saw ${method}`);
  }
});

test("HTTP errors become ApiError with status and the server's error code", async () => {
  const notFound = await rejection(getIncident("missing"));
  assert.ok(notFound instanceof ApiError);
  assert.equal(notFound.kind, "http");
  assert.equal(notFound.status, 404);
  assert.equal(notFound.code, "not_found");
  assert.ok(notFound.requestId, "the server's X-Request-Id is kept for support");

  assert.equal(toApiError(notFound), notFound, "normalizing twice keeps the HTTP details");

  const invalid = await rejection(createIncident({ title: "x", service: "wifi" }));
  assert.equal(invalid.status, 400);
  assert.match(invalid.message, /title must be/);
});

test("AbortController cancels, the timeout fires, and a dead server is a network error", async () => {
  const controller = new AbortController();
  const pending = listIncidents({ delayMs: 2000 }, controller.signal);
  controller.abort();
  assert.equal((await rejection(pending)).kind, "canceled");

  const original = api.defaults.timeout;
  api.defaults.timeout = 200;
  try {
    assert.equal((await rejection(listIncidents({ delayMs: 1000 }))).kind, "timeout");
  } finally {
    api.defaults.timeout = original;
  }

  const baseURL = api.defaults.baseURL;
  api.defaults.baseURL = "http://127.0.0.1:9/api"; // nothing listens on the discard port
  try {
    assert.equal((await rejection(listIncidents())).kind, "network");
  } finally {
    api.defaults.baseURL = baseURL;
  }
});

test("interceptors add a request id the server echoes, and report every call", async () => {
  const log: Activity[] = [];
  const stop = onActivity((entry) => log.push(entry));
  const response = await api.get("/healthz");
  await rejection(getIncident("missing"));
  stop();
  const sent = response.config.headers.get("X-Request-Id");
  assert.match(String(sent), /^[0-9a-f-]{36}$/);
  assert.equal(response.headers["x-request-id"], sent);
  assert.deepEqual(log.map((entry) => [entry.method, entry.status]), [["GET", 200], ["GET", 404]]);
});

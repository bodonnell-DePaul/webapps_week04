#!/usr/bin/env node
// deploy-sim.mjs — CSC 436 Week 4, lab step 5.
//
// A deliberately tiny model of a deploy pipeline with the four gates from Block C:
//   1. build + record an immutable digest
//   2. deploy that digest
//   3. gate on a health check THAT VERIFIES WHICH DIGEST ANSWERED
//   4. roll back to the previous digest if the gate fails
//
// It runs a real HTTP server on 127.0.0.1 and makes real HTTP requests to it, so the
// health gate is a genuine network check, not a simulation of one.
//
// Usage:
//   node deploy-sim.mjs             deploy a healthy release
//   node deploy-sim.mjs --broken    deploy a release whose /healthz never goes green
//   node deploy-sim.mjs --rolling   healthy release, ROLLING cutover: the old instance
//                                   keeps answering 200 for the first few polls
//   node deploy-sim.mjs --port 8099
//
// No dependencies. Node 20+.

import { createServer } from "node:http";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const BROKEN = args.includes("--broken");
const ROLLING = args.includes("--rolling");
const PORT = Number(args[args.indexOf("--port") + 1]) || 8088;
const HOST = "127.0.0.1";
const RETRIES = 6;
const DELAY_MS = 700;

const log = (stage, msg) => console.log(`[${String(stage).padEnd(9)}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digestOf = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
const short = (d) => d.slice(0, 17) + "\u2026";

// The "cluster": whatever release is currently live.
let live = { release: "v1.0.0", digest: digestOf("v1.0.0"), healthy: true };

// A rolling deploy does not cut over instantly. Until this many requests have been
// served, the load balancer still routes to the OLD instance — which is perfectly
// healthy, and will happily answer 200 to a naive health check.
let rollingRequestsLeft = 0;
let pending = null;

const server = createServer((req, res) => {
  if (pending) {
    if (rollingRequestsLeft > 0) rollingRequestsLeft -= 1;
    else { live = pending; pending = null; }
  }

  if (req.url === "/healthz") {
    const ok = live.healthy;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    // The digest is the load-bearing field. A health endpoint that reports only
    // {"status":"ok"} cannot tell the caller WHICH release answered.
    res.end(JSON.stringify({ status: ok ? "ok" : "unhealthy", release: live.release, digest: live.digest }));
    return;
  }
  if (req.url === "/version") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(live));
    return;
  }
  res.writeHead(404).end();
});

// The gate asks TWO questions: is it healthy, and is it the release I just deployed?
// It prints the verdict a status-only gate would have reached, so you can see the
// difference on the same request.
async function healthGate(expectedDigest) {
  for (let i = 1; i <= RETRIES; i++) {
    try {
      const r = await fetch(`http://${HOST}:${PORT}/healthz`);
      const body = await r.json();
      const statusOk = r.ok;
      const digestOk = body.digest === expectedDigest;
      const verdict = statusOk && digestOk ? "PASS"
        : !statusOk ? "FAIL unhealthy"
        : "WAIT old release answering";
      log("gate", `attempt ${i}/${RETRIES}: HTTP ${r.status} digest=${short(body.digest)} | ` +
        `status-only gate: ${statusOk ? "PASS" : "FAIL"} | digest gate: ${verdict}`);
      if (statusOk && digestOk) return true;
    } catch (e) {
      log("gate", `attempt ${i}/${RETRIES}: connection failed (${e.cause?.code ?? e.message})`);
    }
    await sleep(DELAY_MS);
  }
  log("gate", `all ${RETRIES} attempts failed -> FAIL`);
  return false;
}

await new Promise((r) => server.listen(PORT, HOST, r));

log("cluster", `live release ${live.release} digest ${live.digest}`);
log("cluster", `serving /healthz on http://${HOST}:${PORT}`);
if (ROLLING) log("cluster", "ROLLING cutover: the old instance keeps serving during rollout");
console.log();

// --- gate 1: tests -----------------------------------------------------------
log("test", "SIMULATED build/test gate: no npm tests or container build run here");
log("model", "digests hash release labels, not OCI manifests; only the HTTP health checks are live");

// --- gate 2: build and record the immutable digest ---------------------------
const next = BROKEN ? "v1.1.0-bad" : "v1.1.0";
const nextDigest = digestOf(next);
const previousDigest = live.digest;
log("build", `built ${next}`);
log("build", `digest ${nextDigest}   <- this is what gets deployed, not the tag`);
log("build", `previous digest recorded for rollback: ${previousDigest}`);
console.log();

// --- deploy ------------------------------------------------------------------
log("deploy", `rolling out ${nextDigest}`);
const target = { release: next, digest: nextDigest, healthy: !BROKEN };
if (ROLLING) { rollingRequestsLeft = 3; pending = target; } else { live = target; }
await sleep(400);

// --- gate 3: health, verified against the digest we just deployed ------------
console.log();
const healthy = await healthGate(nextDigest);
console.log();

// --- gate 4: rollback --------------------------------------------------------
let exitCode = 0;
if (healthy) {
  log("result", `DEPLOY SUCCEEDED. live digest ${live.digest}`);
} else {
  log("rollback", `health gate failed; rolling back to ${previousDigest}`);
  pending = null;
  rollingRequestsLeft = 0;
  live = { release: "v1.0.0", digest: previousDigest, healthy: true };
  await sleep(400);
  const recovered = await healthGate(previousDigest);
  const v = await (await fetch(`http://${HOST}:${PORT}/version`)).json();
  console.log();
  log("result", `DEPLOY FAILED and was ROLLED BACK. live digest ${v.digest} (${v.release})`);
  log("result", recovered ? "service is serving again" : "ROLLBACK ALSO FAILED - page a human");
  exitCode = 1; // a failed deploy must fail the pipeline, even though rollback worked
}

server.close();
console.log(`\npipeline exit code: ${exitCode}`);
process.exit(exitCode);

# HW4 — Connect It: Your Frontend, Your API, Over HTTPS

**CSC 436 — Web Application Systems** · 100 points · Individual (your own CampusPulse
project) · Due before Week 5.

> **The point of this assignment, in one sentence.** Make your React frontend talk to
> your own API through one well-built axios client, have that API answer with correct
> status codes and an exact CORS policy, put both live on your own domain over HTTPS —
> and prove every claim with evidence you captured, not screenshots of green checkmarks.

---

## 1. Where this fits

This is **Gate 2 — Live and secure** of the CampusPulse final project, and it is the
homework for all three Week 4 blocks:

| Lecture block | What this homework asks you to do with it |
| --- | --- |
| **A — HTTP and TLS: the big picture** | Inspect *your own* certificate chain (Windows PowerShell or macOS `openssl`) and see which HTTP version your users actually get |
| **B — Calling your API with axios** | One configured axios client, one typed function per endpoint, one `ApiError`, cancellation |
| **C — Express and CORS** | Routes, status codes, one error shape, and an exact origin allowlist — then the deploy, budget alert and rollback |

Everything you build here is reused, not thrown away:

| What you build here | Where it comes back |
| --- | --- |
| Public HTTPS deployment (frontend + API) | Week 5 caching, CDN and Core Web Vitals — needs a real origin |
| The axios client and `ApiError` | Every later feature; Week 7 live updates; Week 8 adds the auth header in one place |
| The CORS allowlist | Week 9 formalizes CORS and security headers on top of it |
| Pipeline with digest and rollback | Week 7 onward — every later change deploys through it |
| Health endpoint | Week 10 Game Day — the probe is how you detect the fault |
| Budget alert | The rest of the course, and your bank account |

**You will not do this work twice.** Week 5 assumes this exact system.

**Starting points — use them.** The
[CampusPulse full-stack sample](samples/campuspulse-fullstack/README.md) is the code
from Blocks B and C: an Express API with CORS and a React + axios frontend, with tests.
You may build on it, port its ideas to your HW3 stack, or write your own. The
[local-to-staging deployment runbook](../../docs/deployment-runbook.md) is the concrete
no-personal-card deployment path (course-provisioned Linux/Docker + Caddy + your own or
assigned Cloudflare DNS). Read-only public operation is required until authorization is
taught in Week 8; **HTTPS is not access control**.

---

## 2. Prerequisites

Have all of these **before** you start.

- [ ] **A domain you control** (HW1) with DNS you can edit (HW2).
- [ ] **Your HW3 work:** a containerized backend exposing a health endpoint, and a
      React + TypeScript build. (Any backend language is fine — see below.)
- [ ] **Node.js 20.19+** and npm, for the frontend and (if you use it) the sample API.
- [ ] **A GitHub repository** for the project, with Actions enabled.
- [ ] **A hosting account** where you can deploy a container, or the course environment.
- [ ] **`curl`.** Windows 10/11 ships `curl.exe`; in Windows PowerShell type `curl.exe`,
      because `curl` there is an alias for `Invoke-WebRequest`.
- [ ] **A way to inspect TLS — either one is fine:**
  - **Windows (no OpenSSL needed):** PowerShell 5.1 or 7 and
    [`samples/tls-inspect.ps1`](samples/tls-inspect.ps1), which uses only .NET classes
    that ship with Windows. `certutil` is built in too.
  - **macOS / Linux:** `openssl` (LibreSSL on stock macOS is fine), or the same
    `tls-inspect.ps1` under PowerShell 7.

> **Backend agnosticism.** Express is what the lecture used, but any language and
> framework is accepted — FastAPI, ASP.NET Core, Spring, Go, anything. You are graded on
> **observable behavior at the network boundary**: methods, status codes, headers, CORS
> and the error body. Nobody will read your framework.

---

## 3. Tasks

Do them in this order. Tasks 1–3 run entirely on `localhost`; get them right before you
deploy, so that when something breaks in Task 4 you are debugging one unknown, not five.

### Task 0 — Configure a cloud budget alert. **Do this first.** 🚨

**This is a graded gate. A submission without it cannot receive credit for any
cloud-hosted work.**

1. In your provider's billing console, create a monthly budget that would genuinely
   alarm you — for most students **$5–$20**.
2. Add alert thresholds at **50%, 80% and 100%**.
3. Send the notification to an email address **you actually read**.
4. Screenshot the *configured* budget showing amount, thresholds and destination.

Provider docs: [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html)
· [Azure cost alerts](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/cost-mgt-alerts-monitor-usage-spending)
· [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets)

> **A budget is a notification, not a cap.** No mainstream cloud stops spending when you
> hit it. If your platform has no budget feature, a hard spending limit, a prepaid
> account with no card, or the course-managed quota (see the runbook) is the accepted
> substitute. Evidence of *some* ceiling is required either way.

⏱ **~15 minutes.**

---

### Task 1 — An API with an honest HTTP contract

Build (or extend) the CampusPulse incidents API so it has **at least** these routes. The
names may differ; the behavior may not.

| Method and path | Success | Must also handle |
| --- | --- | --- |
| `GET /api/incidents?status=&q=` | `200` with `{ items, count }` | Filters applied server-side; unknown `status` → `400` |
| `GET /api/incidents/:id` | `200` with the incident | Unknown id → `404` |
| `POST /api/incidents` | **`201`** with the body **and a `Location` header** | Missing/invalid fields → `400` |
| `PATCH /api/incidents/:id` | `200` with the updated incident | Invalid status → `400`; unknown id → `404` |
| `PUT /api/incidents/:id` | `200` with the replaced incident | Same as PATCH |
| `DELETE /api/incidents/:id` | **`204` with no body** | Unknown id → `404` |
| `GET /api/healthz` (or `/healthz`) | `200` with a small JSON body | Must include the running version — see Task 5 |

Requirements:

1. **One error shape, everywhere.** Every 4xx/5xx — validation, unknown id, unknown
   route, malformed JSON, and unexpected exceptions — returns the same JSON, for example
   `{"error":{"code":"not_found","message":"..."}}`. A 500 must **not** leak a stack trace
   or SQL text to the client; log it on the server instead.
2. **Read-only in public.** Gate 2 requires that a public deployment refuses
   unauthenticated mutations, and you do not have authentication until Week 8. Add a
   switch driven by configuration (for example `ALLOW_WRITES=false`) so that, in
   production, `POST`/`PUT`/`PATCH`/`DELETE` return **`403`** in your error shape
   (`"code":"read_only"`). Locally and in staging you may leave writes on.
3. **A request id.** Echo an incoming `X-Request-Id` or generate one, and return it on
   every response — including preflights and malformed-JSON `400`s, so register it
   **before** CORS and the JSON parser. Your frontend will display it when something
   fails.

**Evidence.** A `curl -i` transcript (status line, the headers that matter, body) for
**every row** of the table, including **one failure case per row**, captured against
`localhost`. Plus your automated tests' output — the sample's
`backend/test/api.test.mjs` shows the pattern.

```console
curl -i http://localhost:3001/api/incidents?status=resolved
curl -i -X POST http://localhost:3001/api/incidents \
     -H "Content-Type: application/json" -d '{"title":"Wi-Fi down in CDM","service":"wifi"}'
curl -i -X DELETE http://localhost:3001/api/incidents/<id>
curl -i -X PATCH  http://localhost:3001/api/incidents/does-not-exist \
     -H "Content-Type: application/json" -d '{"status":"resolved"}'
```

> **Windows PowerShell note.** Use `curl.exe`, and quote JSON as
> `-d '{\"title\":\"Wi-Fi down\",\"service\":\"wifi\"}'` in 5.1, or put the body in a
> file and use `-d "@body.json"`. `Invoke-RestMethod` is also acceptable evidence if it
> shows the status code and headers (`-StatusCodeVariable` / `-ResponseHeadersVariable`
> in PowerShell 7).

⏱ **~2 hours** (less if you start from the sample).

---

### Task 2 — An exact CORS policy, proven from both sides

Your frontend and API will be on **different origins** at least locally
(`http://localhost:5173` → `http://localhost:3001`), and possibly in production
(`https://app.<domain>` → `https://api.<domain>`). Configure CORS so that:

1. The allowed origins come from **configuration** (for example
   `CORS_ORIGINS=https://app.example.edu,http://localhost:5173`), are compared
   **exactly** — scheme, host and port — and are **never** `*` or a reflected
   `Origin`.
2. Preflight (`OPTIONS`) is answered for the methods and request headers your client
   actually sends (`Content-Type`, `X-Request-Id`), with a sensible `Access-Control-Max-Age`.
3. `Location` and `X-Request-Id` are listed in `Access-Control-Expose-Headers`, so your
   axios code can read them.
4. **Error responses carry CORS headers too.** If your CORS middleware runs after the
   route that threw, the browser hides your carefully shaped `400` behind a generic
   "Network Error". Register CORS **first**.
5. Responses vary on `Origin` (`Vary: Origin`) so a cache never serves one origin's
   answer to another.

**Evidence — capture all four:**

- (a) A preflight from an **allowed** origin, with its `Access-Control-Allow-*` headers.
- (b) The same preflight from a **disallowed** origin, showing **no**
      `Access-Control-Allow-Origin`.
- (c) A **plain `curl` GET** with the disallowed `Origin` header that **succeeds** with
      data — and two sentences on why that is not a bug.
- (d) **Break and fix in the browser.** Remove your frontend's origin from the
      allowlist, reload, and screenshot DevTools (Console **and** the Network row for
      the failed request). Then restore it and screenshot the working preflight + real
      request pair. Name the exact header whose absence caused the failure.

```console
curl -i -X OPTIONS http://localhost:3001/api/incidents/abc \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: PATCH" \
     -H "Access-Control-Request-Headers: content-type,x-request-id"
```

The [worked example in §6](#6-worked-example--the-depth-expected-for-one-artifact) is
artifact (a)–(c) done to full-credit depth.

> **The idea to own:** CORS is enforced by the **browser**, on behalf of the user,
> against other origins' scripts. It is not a firewall. `curl`, Postman and attackers'
> scripts ignore it entirely — which is why Task 1's read-only switch exists.

⏱ **~1 hour.**

---

### Task 3 — One axios client, used everywhere

Wire your React frontend to the API through **one** module, as in Block B
(`frontend/src/api/client.ts` and `incidents.ts` in the sample).

1. **One configured instance.** `axios.create` with `baseURL` from build-time config
   (for example `import.meta.env.VITE_API_URL`), a **timeout** (the sample uses 4000 ms),
   and `Accept: application/json`. No component calls `axios.get` directly, and no
   component builds a URL by string concatenation.
2. **One typed function per endpoint** — `listIncidents(filters, signal)`,
   `getIncident`, `createIncident`, `updateStatus`, `replaceIncident`,
   `deleteIncident`, `checkHealth`. Query strings go through axios `params`, not
   template strings.
3. **Interceptors.** A request interceptor that adds `X-Request-Id`; a response
   interceptor (or a single `toApiError` function) that turns **every** failure into one
   `ApiError` with a `kind` of exactly one of **`http`**, **`network`**, **`timeout`**
   or **`canceled`**, plus `status`, `code`, `message` and the server's `requestId`
   (read from the `X-Request-Id` response header) where they exist.
4. **Read what the server told you.** After `createIncident`, read the new resource's
   URL from the `Location` header (which only works because of Task 2's exposed headers).
   Show the server's `error.message` for `http` errors, a "can't reach the server" message
   for `network`, a retry hint for `timeout` — and **nothing at all** for `canceled`.
5. **Cancellation.** The list request runs in a `useEffect` with an `AbortController`
   whose `signal` is passed to axios, and the cleanup aborts it. Typing quickly in a
   search box must not let an old response overwrite a newer one.
6. **Failures keep the user's work.** If a create fails with `400` or `403`, the form
   keeps what the user typed.

**Evidence** — screenshots or a short screen recording (≤ 2 minutes) showing, in the UI
**and** the DevTools Network panel:

- a successful create (`201`, with the `Location` you read);
- an `http` error (`400` or `403`) displaying the server's message and request id;
- a `timeout` (use a slow endpoint, e.g. the sample's `delayMs` query, or DevTools
  throttling) and a `network` error (stop the API);
- a request shown as **(canceled)** in Network after fast typing or navigation, with no
  error shown to the user.

Also submit at least one **automated frontend test** of your `ApiError`
classification (the sample's `frontend/test/` uses Node's built-in test runner through
`tsx`; Vitest is equally fine).

⏱ **~2 hours 30 minutes.**

---

### Task 4 — Put the whole system live on your own domain over HTTPS

1. Deploy your API container and your built frontend. Choose **same origin**
   (`https://<domain>/` + `https://<domain>/api`) **or** **two origins**
   (`https://app.<domain>` + `https://api.<domain>`). Document the choice and **one
   consequence** of it for CORS and for your certificate's SANs.
2. Point DNS at it and obtain a certificate for every name you serve. A managed
   platform or Caddy obtains and renews it for you; that is fine and expected.
3. Production configuration:
   - `CORS_ORIGINS` contains **only** your production frontend origin (no `localhost`);
   - the frontend's `VITE_API_URL` is an **`https://`** URL (an `http://` API from an
     `https://` page is blocked as **mixed content** — say what you would see if you got
     this wrong);
   - writes are off (Task 1.2);
   - staging and production are separate URLs with separate configuration (the runbook's
     staging step is fine).
4. From a machine that is **not** your server:

```console
curl -sSI https://<your-domain>/ | head -5
curl -sS  https://<your-api-origin>/api/healthz
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://<your-api-origin>/api/incidents \
     -H "Content-Type: application/json" -d "{}"
curl -sS -o /dev/null -D - -X OPTIONS https://<your-api-origin>/api/incidents \
     -H "Origin: https://<your-frontend-origin>" -H "Access-Control-Request-Method: POST"
```

The first two must succeed with **no TLS warnings and no `--insecure` / `-k`**. The
third must print `403`. The fourth must show `Access-Control-Allow-Origin` set to your
production frontend origin. (Same origin? Run it anyway, and explain why the browser
never sends it for you.)

5. Open the live frontend in a browser, filter the list, and screenshot the Network panel
   with the **Protocol** column turned on (right-click a column header → Protocol).

> **Protect your weekend.** This task carries the time variance. A managed platform
> (Azure Container Apps, Render, Fly.io, Railway, Cloud Run, App Runner) or a VM with
> [Caddy](https://caddyserver.com/docs/automatic-https) is strongly recommended. Hand-rolled
> Nginx + certbot is allowed but budget 4–6 hours. **You are not graded on which path you
> pick.** If provisioning is blocked, use the course recovery environment.

⏱ **~3 hours** on a managed path.

---

### Task 5 — A pipeline that deploys a digest, a gate that notices, a rollback

Build a GitHub Actions workflow that:

1. runs your backend **and** frontend tests and fails the run if either fails;
2. builds the frontend with the production `VITE_API_URL`, builds and pushes the API
   image, and **records the image digest** (`sha256:…`) in the job summary;
3. deploys **that digest** — not `:latest`. Platform-native commands
   (`az containerapp update --image …@sha256:…`, `gcloud run deploy --image …`,
   `flyctl deploy --image …`) are fine;
4. **gates on health and on the exact deployed release identity.** Make your health
   endpoint report the running version, e.g. `{"ok":true,"version":"<git-sha>"}`, pass
   that value in as configuration, and have the gate parse the JSON and wait (bounded) for
   **that** value. A gate that accepts any `200` passes on the *old* instance during a
   rolling deploy — run `node weeks/week04/samples/deploy-sim.mjs --rolling` to watch it
   happen.

Then **break it on purpose**: record the live version, deploy a release whose health
check fails, show the gate **failing the pipeline**, roll back to the recorded
version/digest, and prove the old one is serving again. Report the time from "gate
failed" to "serving again".

Docs: [Deploy with GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy) ·
[Using secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

⏱ **~3 hours.**

---

### Task 6 — Inspect your own TLS and HTTP version

This is Block A, pointed at your own site. Use **whichever platform you have**; both
earn full marks.

**Windows (PowerShell 5.1 or 7 — no OpenSSL):**

```powershell
cd weeks\week04\samples
.\tls-inspect.ps1 <your-domain>
.\tls-inspect.ps1 <your-domain> -SaveCertificate mysite.cer
certutil -dump mysite.cer          # every field, including the SAN extension
curl.exe -sS -o NUL -w "version=%{http_version} code=%{http_code}\n" https://<your-domain>/
```

> If PowerShell refuses to run the script, allow it for this window only:
> `Set-ExecutionPolicy -Scope Process Bypass`. You can also double-click the padlock in
> Edge/Chrome → *Connection is secure* → *Certificate is valid* to see the same chain.

**macOS / Linux (reference):**

```bash
openssl s_client -connect <your-domain>:443 -servername <your-domain> \
  -showcerts -alpn h2,http/1.1 </dev/null 2>&1 \
  | grep -E 'depth=|^ [0-9] s:|^   [iv]:|Verification|ALPN protocol'
openssl s_client -connect <your-domain>:443 -servername <your-domain> </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
curl -sS -o /dev/null -w 'version=%{http_version} code=%{http_code}\n' https://<your-domain>/
```

Submit the raw output and an annotation, in your own words, of:

- the leaf's **issuer** and the chain from leaf to root. On macOS, `-showcerts` lists
  what your **server sent**, so say which certificates were sent and which root came
  from **your device's trust store**. On Windows, `tls-inspect.ps1` shows the chain
  **Windows built**, which may include intermediates it fetched or cached; name the
  root that came from the Windows store and say why the script alone cannot prove which
  intermediates the server sent;
- the **SANs**, and whether they cover every hostname you serve (including the API
  origin if it is separate);
- **NotAfter** and the days remaining, and **who renews it** (your platform, Caddy,
  certbot) — with one piece of evidence that renewal is automatic (provider screen,
  Caddy log line, or `certbot renew --dry-run`);
- the **verdict** (`PolicyErrors : None` / `Verification: OK`) and one failure it would
  have caught;
- the **HTTP version** your browser used (Task 4 screenshot) versus what `curl` used, and
  one sentence on why they may differ (HTTP/2 multiplexing, HTTP/3 over QUIC, `alt-svc`).

Also confirm your HW2 **CAA** record still permits the CA that issued this certificate
(one line: `Resolve-DnsName <domain> -Type CAA` on Windows, `dig +short CAA <domain>` on
macOS).

> **Windows vs. OpenSSL differences are expected, not errors.** Windows builds the chain
> itself and may show the root (and even a cross-signed root) at extra depths; OpenSSL
> prints only what the server sent plus the trust anchor. Windows may also fetch a missing
> intermediate on its own (AIA), so a chain Windows accepts can still fail in Firefox or
> OpenSSL. Compare with [`tls-inspect-captures.txt`](samples/tls-inspect-captures.txt).

⏱ **~45 minutes.**

---

### Task 7 — An expiry alert that has actually fired

1. Schedule a check that runs **from outside your host** — a GitHub Actions workflow with
   `schedule:` plus `workflow_dispatch:` is the expected solution. It must fail when the
   live connection would not be accepted (bad chain, wrong name, untrusted) **or** fewer
   than ~21 days remain. On an `ubuntu-latest` runner:

```bash
HEALTH_URL=https://<api-host>/api/healthz          # your API's health route
curl -sSf --max-time 10 "$HEALTH_URL" >/dev/null || exit 1     # chain + name + trust
for H in <frontend-host> <api-host>; do          # one name if same origin
  curl -sSf --max-time 10 -o /dev/null "https://$H/" || exit 1
  openssl s_client -connect "$H:443" -servername "$H" -verify_hostname "$H" \
    -verify_return_error </dev/null 2>/dev/null \
    | openssl x509 -noout -checkend $((21*24*3600)) || exit 1   # expiry
done
```

   With two origins, check **both** hostnames: each has its own certificate (or SAN)
   and either can expire.

   A `windows-latest` runner may instead run `tls-inspect.ps1` and fail when
   `PolicyErrors` is not `None` or `DaysLeft` is below your threshold.
2. **Make it fire.** Raise the threshold (e.g. to 200 days), run it, and capture the
   **notification you received** (the GitHub failure email or similar). Restore the real
   threshold and show the green run.
3. One sentence each: why a cron job on the monitored host is not acceptable, and how you
   would notice if the schedule silently stopped running.

> **The received notification is the evidence.** A configured-but-never-fired alert
> scores zero on this task.

⏱ **~1 hour.**

---

### Task 8 — Critique an AI-suggested "fix" for CORS or TLS

Ask an AI assistant to fix a CORS error or a TLS error you reproduced (locally, or against
`badssl.com` — never by weakening production). Assistants reliably suggest one of:

- **CORS:** `app.use(cors())` with no options, `origin: "*"` (or `origin: true`, which
  reflects any origin) **together with** `credentials: true`, a browser extension that
  "disables CORS", or proxying everything through a dev server and calling it fixed;
- **TLS:** `curl -k`, `rejectUnauthorized: false` / `httpsAgent` with verification off,
  `NODE_TLS_REJECT_UNAUTHORIZED=0`, PowerShell `-SkipCertificateCheck`, or a
  `ServerCertificateValidationCallback` that returns `$true`.

Submit:

1. the prompt and the verbatim suggestion;
2. **what it actually does** — for CORS, which origins it now lets read your responses;
   for TLS, which check it disables (expiry, chain, hostname, trust anchor);
3. the **evidence** that identified the real cause (your preflight dump, your
   `tls-inspect` verdict or `openssl` error);
4. the **real fix** you applied, and its evidence.

> **Two nuances that earn the top marks.** A dev-server proxy is a legitimate
> *development* choice — it is only wrong when it hides that production has no CORS
> policy. And "add the certificate to the trust store" is correct for a verified private
> CA root in a scoped store, and wrong for an unknown leaf. If your suggestion is one of
> these, say which version you got.

No-personal-AI route: use the
[HW4 supplied draft](../../docs/non-ai-review-artifacts.md#hw4---cors-and-release-draft)
instead; it earns the same marks.

⏱ **~30 minutes.**

---

## 4. Required evidence artifacts

| # | Artifact | From |
| --- | --- | --- |
| 1 | Budget alert screenshot: amount, thresholds, destination | Task 0 |
| 2 | `curl -i` transcript for every route, one failure per route | Task 1 |
| 3 | Backend test output | Task 1 |
| 4 | Allowed preflight, refused preflight, curl-with-bad-Origin | Task 2 |
| 5 | CORS break-and-fix DevTools screenshots, with the missing header named | Task 2 |
| 6 | UI + Network evidence of 201/Location, http, timeout, network, canceled | Task 3 |
| 7 | Frontend test output for `ApiError` classification | Task 3 |
| 8 | Live-site `curl` checks (HTTPS, health, `403` on write, an allowed preflight from the production origin) + Protocol-column screenshot | Task 4 |
| 9 | Topology note: same-origin vs two origins, and its consequence | Task 4 |
| 10 | Workflow YAML, a green run link, and the recorded digest | Task 5 |
| 11 | Failed gate run, rollback, recovery time | Task 5 |
| 12 | Raw TLS inspection output (Windows or macOS) + annotation + renewal evidence + CAA line | Task 6 |
| 13 | Expiry check workflow + **the notification you received** | Task 7 |
| 14 | AI suggestion, its real effect, your evidence, your fix | Task 8 |
| 15 | AI-use log | Evidence standard |
| 16 | Redaction attestation | Evidence standard |

---

## 5. The eight-part evidence standard

Every submission carries all eight. See
[`docs/evidence-standard.md`](../../docs/evidence-standard.md).

1. **Commit SHA or release tag** — exactly what was tested.
2. **Reproduction commands** plus exported configuration (environment variable *names*
   and non-secret values, workflow YAML).
3. **Raw sanitized evidence** — header dumps, DevTools screenshots, TLS output, run logs.
4. **Annotated interpretation** in your own words.
5. **At least one deliberate failure and its diagnosis** — Task 2(d), Task 5's broken
   release and Task 7's fired alert all qualify. Name the one you are submitting.
6. **AI-use log** — what you generated, accepted, rejected, and how you verified it.
7. **One challenged AI claim** — Task 8.
8. **Redaction attestation** — no live secrets, tokens, cookies, API keys or private keys.

> **Redaction this week.** Your **certificate** is public (every visitor receives it and
> it is in CT logs) — do not redact it. Your **private key** must never appear; if it
> does, that artifact scores zero and you resubmit with rotation evidence. Redact cloud
> credentials, deploy tokens and any `secrets.*` values that leaked into a log.
> **Replace, do not crop** — keep the shape.

---

## 6. Worked example — the depth expected for one artifact

This is artifact #4 (Task 2 a–c), done to full-credit standard against the sample API.
Note that the annotation is longer than the evidence.

> ### Artifact 4 — preflight, allowed and refused
>
> Captured 2026-10-01 against the sample API on `localhost:3001`, started with
> `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Output verbatim except
> `Date`/`Keep-Alive` lines removed.
>
> ```console
> $ curl -i -X OPTIONS http://localhost:3001/api/incidents/abc \
>     -H "Origin: http://localhost:5173" \
>     -H "Access-Control-Request-Method: PATCH" \
>     -H "Access-Control-Request-Headers: content-type,x-request-id"
> HTTP/1.1 204 No Content
> Access-Control-Allow-Origin: http://localhost:5173
> Vary: Origin
> Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE
> Access-Control-Allow-Headers: Content-Type,X-Request-Id
> Access-Control-Max-Age: 600
> Access-Control-Expose-Headers: Location,X-Request-Id
> Content-Length: 0
>
> $ curl -i -X OPTIONS http://localhost:3001/api/incidents/abc \
>     -H "Origin: https://evil.example" \
>     -H "Access-Control-Request-Method: PATCH" \
>     -H "Access-Control-Request-Headers: content-type,x-request-id"
> HTTP/1.1 204 No Content
> Connection: keep-alive
>
> $ curl -i "http://localhost:3001/api/incidents?status=resolved" -H "Origin: https://evil.example"
> HTTP/1.1 200 OK
> X-Request-Id: 7fd1d604-c8c3-4ec9-9b5f-a8cd91b14deb
> Content-Type: application/json; charset=utf-8
>
> {"items":[{"id":"bf1fb737-…","title":"Synthetic shuttle tracker offline","service":"shuttle","status":"resolved",…}],"count":1}
> ```
>
> ### Annotation
>
> **Allowed preflight.** The browser asks, before sending a `PATCH` with a JSON body and
> my `X-Request-Id` header, whether `http://localhost:5173` may do that. The server
> answers with that **exact** origin echoed from its allowlist — not `*` — plus the
> methods and headers it accepts. `Max-Age: 600` lets the browser skip this question for
> ten minutes, which is why I tick *Disable cache* in DevTools when I change the
> allowlist; otherwise I am testing the old answer.
>
> **Refused preflight.** Same question from `https://evil.example`: still `204`, but **no**
> `Access-Control-Allow-Origin`. The status code is not the refusal — the missing header
> is. A browser receiving this never sends the `PATCH`, and the page's script sees only
> "Network Error"; the reason appears in the Console, not in JavaScript.
>
> **`curl` with the bad origin gets the data.** `200` and a full body. That is not a hole
> in my CORS policy: CORS asks the *browser* to protect a *user* from other sites' scripts
> reading responses with that user's ambient credentials. `curl` has no user and no other
> site, so it ignores CORS. This is exactly why my production deployment returns `403` on
> writes until Week 8 — CORS would not have stopped a script from calling `DELETE`.
>
> **`Vary: Origin`.** Because the answer depends on who asks, a shared cache must key on
> `Origin`. Without it, a CDN could hand the `evil.example` answer (no ACAO) to my real
> frontend and break it — a Week 5 problem I am avoiding now.
>
> **What this does not prove.** These are `localhost` captures over HTTP/1.1. Artifact 8
> repeats the allowed preflight against production over HTTPS, where my
> `CORS_ORIGINS` contains only `https://app.campuspulse.example`.

**What makes that full credit:** every claim is tied to a line of evidence, it explains
the counter-intuitive result instead of hiding it, and it names what it does not prove.

---

## 7. Rubric — 100 points

Each row is evaluated 60% domain content and 40% evidence, as in the syllabus. The same
release artifacts may be referenced by Gate 2 and the final. Do not infer fabrication
merely because an external service or dependency changed.

### Part A — Connect it (40)

| # | Criterion | Pts |
| --- | --- | ---: |
| A1 | API routes use the **right method and status code** (201 + `Location`, 204 with no body, 400 vs 404), with a failure case shown for each; tests pass. | 10 |
| A2 | **One error shape** on every error path, no stack traces leaked; request id on every response; production **read-only switch returns 403**. | 6 |
| A3 | **CORS:** exact allowlist from configuration (no `*`/reflection), preflight evidence allowed vs refused, exposed `Location`/`X-Request-Id`, CORS headers on error responses, `Vary: Origin`. | 10 |
| A4 | **axios client:** one instance (`baseURL`, timeout), one typed function per endpoint, `params` for queries, interceptor for the request id; no direct axios calls in components. | 6 |
| A5 | **`ApiError`** distinguishes http/network/timeout/canceled, with UI + Network evidence for each; `AbortController` cleanup; form input kept on failure; a frontend test. | 8 |

### Part B — Ship it (35)

| # | Criterion | Pts |
| --- | --- | ---: |
| B1 | **Cost control configured (GATE).** Budget alert/thresholds/destination, or the accepted course-managed quota/ceiling evidence. | 8 |
| B2 | Frontend and API **live on your own domain over HTTPS**, no TLS warnings, no `-k`; production `CORS_ORIGINS` and `https://` API URL; staging separate; topology note. | 12 |
| B3 | Pipeline runs both test suites, records the **image digest**, and deploys that digest. | 7 |
| B4 | Health gate checks the **deployed version**, visibly **fails** the broken release; rollback **executed** with proof and a timing number. | 8 |

### Part C — Trust it (15)

| # | Criterion | Pts |
| --- | --- | ---: |
| C1 | TLS inspection of **your** domain (Windows or macOS) with annotated chain (sent vs trust store), SANs vs names served, expiry, renewal owner + evidence, verdict, CAA line. | 7 |
| C2 | HTTP version observed in the browser and in `curl`, with a correct one-paragraph interpretation. | 3 |
| C3 | Scheduled expiry/handshake check run from outside the host that **actually fired**, with the received notification. | 5 |

### Part D — Judgment (10)

| # | Criterion | Pts |
| --- | --- | ---: |
| D1 | CORS break-and-fix diagnosis that names the missing header and explains curl vs browser. | 3 |
| D2 | AI CORS/TLS critique: the suggestion, what it really permits or disables, the evidence, the real fix. | 5 |
| D3 | AI-use log and redaction attestation, both complete. | 2 |

**Total: 100.**

### Automatic deductions

| Condition | Effect |
| --- | --- |
| No budget alert | Zero on B1 **and** no credit for cloud-hosted work until supplied |
| A private key or live secret appears in the submission | Zero on that artifact + resubmission with rotation evidence |
| Production API accepts unauthenticated writes | Zero on A2's read-only portion and Gate 2 not passed until fixed |
| `Access-Control-Allow-Origin: *` or reflected origin in production | Zero on A3 |
| Alert configured but never fired | Zero on C3 |
| Rollback described but not executed | Zero on B4 |
| Evidence that cannot be reproduced from your own commands | Request provenance and diagnose environmental drift; fabrication requires evidence of fabrication, not failure alone |

---

## 8. Time estimate

| Task | Estimate |
| --- | ---: |
| 0 — Budget alert | 15 min |
| 1 — API contract | 2 h |
| 2 — CORS, both sides | 1 h |
| 3 — axios client | 2 h 30 min |
| 4 — Live over HTTPS | 3 h |
| 5 — Pipeline, gate, rollback | 3 h |
| 6 — TLS + HTTP version inspection | 45 min |
| 7 — Expiry alert, made to fire | 1 h |
| 8 — AI CORS/TLS critique | 30 min |
| Write-up and annotation | 1 h 15 min |
| **Total** | **~15 h** |

This is the course's integration peak, not the ordinary weekly budget. Starting from the
CampusPulse full-stack sample removes most of Tasks 1–3's time (it does **not** include
the `ALLOW_WRITES` switch or a version in its health response — you add both); starting from the
deployment runbook removes most of Task 4's. If provisioning is blocked, use the course
environment and request recovery — do not spend another unbounded evening on account or
billing setup.

**Suggested schedule over two weeks:**

| When | Do |
| --- | --- |
| Day 1 (1 h) | Task 0, then start the deploy path (account, DNS) so waits happen in the background |
| Days 2–3 (4 h) | Tasks 1–2 on localhost — API, error shape, CORS evidence |
| Day 4 (2.5 h) | Task 3 — axios client and its error states |
| Days 5–6 (3 h) | Task 4 — live over HTTPS, production CORS, read-only |
| Days 7–8 (3 h) | Task 5 — pipeline, broken release, rollback |
| Day 9 (2.5 h) | Tasks 6–8 and the write-up |

---

## 9. Submission

One PDF or Markdown file, plus a repository link.

```
csc436-hw4-<lastname>.pdf                      # or .md
csc436-hw4-<lastname>-evidence/
  ├── 01-budget-alert.png
  ├── 02-api-curl.txt
  ├── 03-backend-tests.txt
  ├── 04-cors-preflights.txt
  ├── 05-cors-break-fix/           (screenshots)
  ├── 06-axios-states/             (screenshots or ≤2 min video)
  ├── 07-frontend-tests.txt
  ├── 08-live-checks.txt + protocol.png
  ├── 09-topology.md
  ├── 10-workflow.yml + run link
  ├── 11-gate-rollback.txt
  ├── 12-tls-inspect.txt
  ├── 13-expiry-alert/             (workflow + notification)
  └── 14-ai-critique.md
```

The write-up must open with: your frontend URL, your API base URL, the **commit SHA** the
evidence was captured at, the capture date, and your redaction attestation.

---

## 10. What good looks like, and what will lose points

| ✅ Good | ❌ Loses points |
| --- | --- |
| "Preflight from `evil.example` returned 204 but no `Access-Control-Allow-Origin`; that missing header is the refusal." | "CORS is configured. ✅" |
| `CORS_ORIGINS=https://app.campuspulse.example` in production. | `origin: "*"`, `origin: true`, or `localhost` left in the production list. |
| `createIncident` returns the new id read from `Location`. | Re-fetching the whole list after every create because the header was unreadable. |
| A timeout shows "The server is slow — try again"; a canceled request shows nothing. | Every failure shows "Something went wrong", or a canceled request flashes an error. |
| `POST` to production returns `403 {"error":{"code":"read_only",…}}`. | "CORS stops other sites from writing to my API." |
| "Windows showed four depths because it built the chain itself; my server sent two." | "The certificate is valid. ✅" |
| The **email you received** when the expiry alert fired. | A screenshot of the alert configuration page. |
| A health gate that waits for the new version to answer. | A health gate that accepts any 200 — the old instance's. |
| "The model suggested `origin: true` with credentials; that lets any site read a logged-in user's data. I listed my one origin instead." | "The AI helped me fix CORS." |

---

## 11. The non-generatable component

**A model can write your Express routes, your CORS options and your axios client — and you
should let it.** What it cannot do:

- **See what your browser refused.** The preflight your browser actually sent, and the
  header that was missing from the answer, exist only in your DevTools.
- **Tell you what your chain looks like.** It has never connected to your host; asked, it
  will describe a *plausible* chain, confidently.
- **Prove control of your domain** or get a certificate issued for it.
- **Receive your alert**, or **watch your health gate stop a bad release**. Those are
  facts about your running system at a moment in time.
- **Judge the trade.** `origin: "*"` and `-k` genuinely do make the error go away.
  Knowing that the error *was the only thing telling you the truth* is the skill this
  week grades.

Every task above has its correctness oracle outside the file the model is editing — in a
browser, a CA, a trust store, a scheduler or a billing system. That is the delegation line
from Week 1.

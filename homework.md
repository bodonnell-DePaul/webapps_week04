# HW4 — Connect It: Your HW3 App, Your Own API, Over HTTPS

**CSC 436 — Web Application Systems** · 100 points · Individual · Due before Week 5.

> **The point of this assignment, in one sentence.** Take the client-only ticket
> workbench you built in HW3, give it a real API that enforces the same data contract,
> call that API through one well-built axios client across an exact CORS policy, put both
> live over HTTPS — and prove every claim with evidence you captured yourself.

---

## 1. Where this fits

**HW3 drew a line; HW4 crosses it on purpose.** In
[HW3 — Evidence Before Action](https://github.com/bodonnell-DePaul/webapps_week03/blob/main/homework/README.md)
your app had *no backend, no API and no network calls*: it read a local CSV, validated it
against the
[data and behavior contract](https://github.com/bodonnell-DePaul/webapps_week03/blob/main/homework/DATA-CONTRACT.md),
and derived every metric in the browser. This week the same tickets move behind an HTTP
API, and the same contract becomes the API's contract. What you already got right in HW3
— validation, *unknown is not zero*, metrics over the whole matching set — is what you
now enforce on the server and prove over the wire.

This is **Gate 2 — Live and secure** of the final project, and the homework for all three
Week 4 blocks:

| Lecture block | What this homework asks you to do with it |
| --- | --- |
| **A — HTTP and TLS: the big picture** | Inspect the certificate on *your* live site (Windows PowerShell or macOS `openssl`) and see which HTTP version your users actually get |
| **B — Calling your API with axios** | One configured axios client, one typed function per endpoint, one `ApiError`, cancellation — replacing HW3's local file read |
| **C — Express and CORS** | A tickets API with correct methods and status codes, one error shape, and an exact origin allowlist — then deploy it |

What you build here comes back later:

| What you build here | Where it comes back |
| --- | --- |
| Public HTTPS frontend + API | Week 5 caching, CDN and Core Web Vitals — needs a real origin |
| The axios client and `ApiError` | Every later feature; Week 8 adds the auth header in one place |
| The CORS allowlist | Week 9 formalizes CORS and security headers on top of it |
| The health endpoint | Later reliability work — the probe is how you detect a fault |

**Starting points — use them.**

- **Your own HW3 repository.** Its CSV parser, validation and metric functions are the
  most valuable code you have this week: move them into a shared module that the API
  imports, rather than writing the rules a second time.
- **HW3's data files** — [`homework/data/`](https://github.com/bodonnell-DePaul/webapps_week03/tree/main/homework/data)
  in the Week 3 repository. The API loads `campus-tickets.csv`; your tests use
  `verification.csv` and `edge-cases.csv`.
- **The [CampusPulse full-stack sample](samples/campuspulse-fullstack/README.md)** from
  Blocks B and C: an Express API with CORS and a React + axios frontend, with tests. It
  serves *incidents*, not tickets — **port its patterns, not its routes**.
- **Week 3's [`useFetch` hook](https://github.com/bodonnell-DePaul/webapps_week03/blob/main/full-react-demo/src/hooks/useFetch.ts)**
  showed the loading → data/error cycle with a `cancelled` flag. This week you replace
  the flag with a real `AbortController` and `fetch` with axios.

Read-only public operation is required until authorization is taught in Week 8;
**HTTPS is not access control**.

---

## 2. Prerequisites

- [ ] **Your HW3 app** — the React + TypeScript + Vite workbench, with its three
      automated tests passing. If parts of HW3 were incomplete, fix the import/metrics
      code first: this assignment grades the contract over HTTP, and a wrong metric is
      still wrong when it travels over the network.
- [ ] **Node.js 24** and npm, as in HW3.
- [ ] **A GitHub repository** for this work (a new branch or a new repository is fine).
- [ ] **A free hosting account for a Node web service and a static site.** Any platform
      that gives you an **HTTPS hostname** works — for example Render, Azure App Service
      / Static Web Apps, Railway, Fly.io, Netlify, Vercel, Cloudflare Pages, or GitHub
      Pages for the frontend. **No personal domain is required.** If you arranged a
      domain or an assigned subdomain earlier in the course, you may use it instead.
- [ ] **`curl`.** Windows 10/11 ships `curl.exe`; in Windows PowerShell type `curl.exe`,
      because `curl` there is an alias for `Invoke-WebRequest`.
- [ ] **A way to inspect TLS — either one is fine:**
  - **Windows (no OpenSSL needed):** PowerShell 5.1 or 7 and
    [`samples/tls-inspect.ps1`](samples/tls-inspect.ps1), which uses only .NET classes
    that ship with Windows. `certutil` is built in too. Example output from a Windows
    machine is in [`samples/tls-inspect-captures.txt`](samples/tls-inspect-captures.txt).
  - **macOS / Linux:** `openssl` (LibreSSL on stock macOS is fine), or the same
    `tls-inspect.ps1` under PowerShell 7.

> **Backend agnosticism.** Express is what Block C used, and it lets you reuse your HW3
> TypeScript directly, so it is the recommended path. Any language is accepted — FastAPI,
> ASP.NET Core, Spring, Go. You are graded on **observable behavior at the network
> boundary**: methods, status codes, headers, CORS, the error body, and whether the
> numbers obey the HW3 contract.

---

## 3. Tasks

Do them in order. Tasks 1–3 run entirely on `localhost`; get them right before you deploy,
so that when something breaks in Task 4 you are debugging one unknown, not five.

### Task 0 — Put a ceiling on cost. **Do this first.**

Use a free tier that needs **no payment card**, or, if your platform requires one, create
a monthly budget alert (**$5–$20**, thresholds at 50/80/100%, sent to an email you read).
Screenshot either the plan page showing *free / no card on file* or the configured budget.
A budget is a notification, not a cap.

⏱ **~10 minutes.**

---

### Task 1 — A tickets API that enforces the HW3 contract

At start-up the API reads **one** CSV (default `campus-tickets.csv`; overridable with an
environment variable such as `DATA_FILE`, so your tests can load `verification.csv`) and
validates it with **the HW3 contract rules** — the same parser and checks as your HW3
import. Rejected records are logged with their counts; they are not served. Tickets then
live **in memory**: a restart resets them to the file. (No database yet — that is a later
week, and it matches HW3's no-persistence rule.)

Build at least these routes. Names may differ; the behavior may not.

| Method and path | Success | Must also handle |
| --- | --- | --- |
| `GET /api/tickets?search=&zone=&status=&sort=&page=` | `200` `{ items, page, pageSize: 50, matchingCount, totalPages }` | Unknown `zone`/`status`/`sort`, or `page` that is not a whole number ≥ 1 → `400` |
| `GET /api/summary?search=&zone=&status=` | `200` `{ asOf, filters, metrics, byZone }` | Same `400`s as above |
| `GET /api/tickets/:id` | `200` with the ticket | Not `T-` + five digits → `400`; unknown id → `404` |
| `POST /api/tickets` | **`201`** with the ticket **and a `Location` header** | Fails contract validation → `400` with *every* reason; duplicate `ticket_id` → **`409`** |
| `PATCH /api/tickets/:id` | `200` with the updated ticket | Body may set `closed_on` and/or `estimated_hours`; invalid value → `400`; unknown id → `404` |
| `DELETE /api/tickets/:id` | **`204` with no body** | Unknown id → `404` |
| `GET /api/healthz` | `200` `{ ok, version, acceptedCount, rejectedCount }` | — |

**The contract, server-side.** Everything in sections 2, 4 and 5 of the
[data contract](https://github.com/bodonnell-DePaul/webapps_week03/blob/main/homework/DATA-CONTRACT.md)
now applies to the API:

- **Filters and sort** (contract §4): case-insensitive search on `ticket_id` or
  `summary`; `zone` and `status` exact or `all`; filters combine with AND; `opened-asc`
  (default) and `hours-desc` with unknown estimates last and ticket ID as the tie-break;
  never sort the stored array in place; page size **50**.
- **Metrics** (contract §5) are computed over the **entire matching set**, never one page,
  as of the fixed reference date **2026-04-01**: `matchingCount`, `openCount`,
  `overdueOpenCount`, `knownOpenHours`, `knownOpenCount`, `unknownOpenCount`.
  `byZone` is always North, Central, South, in that order, including zero groups.
- **Unknown is not zero.** An empty `estimated_hours` is JSON `null`, not `0`, and
  `knownOpenHours` never silently counts it. `0` is a known estimate.
- **Writes obey the same field rules** (contract §2) as an import. A `POST` with
  `opened_on: "2026-02-30"`, a `summary` of 241 characters, or `estimated_hours: "-1"` is
  a `400` that names the field, exactly as your HW3 import report did for a CSV record.
- `/api/summary` uses the **same field names and shapes** as HW3's `analysis.json`
  (`asOf`, `filters`, `metrics`, `byZone`), so your existing summary components can
  render it with minimal change.

Requirements:

1. **One error shape, everywhere.** Every 4xx/5xx — validation, unknown id, unknown
   route, malformed JSON, and unexpected exceptions — returns the same JSON, for example
   `{"error":{"code":"invalid_ticket","message":"...","details":[...]}}`. A 500 must
   **not** leak a stack trace to the client; log it on the server instead.
2. **Read-only in public.** You do not have authentication until Week 8. Add a switch
   driven by configuration (for example `ALLOW_WRITES=false`) so that, in production,
   `POST`/`PATCH`/`DELETE` return **`403`** in your error shape (`"code":"read_only"`).
   Locally you leave writes on.
3. **A request id.** Echo an incoming `X-Request-Id` or generate one, and return it on
   every response — including preflights and malformed-JSON `400`s, so register it
   **before** CORS and the JSON parser.
4. **Three named backend tests**, in the spirit of HW3's three:
   1. with `verification.csv` loaded, `GET /api/summary` returns **the six metrics you
      predicted by hand in HW3** (all records, and `zone=North&status=open`), with blank
      and zero estimates kept distinct;
   2. a `POST` that breaks a contract rule returns `400` with the field named, and a
      duplicate id returns `409`;
   3. a CORS preflight from an allowed origin is answered and one from a disallowed
      origin is not (Task 2).

**Evidence.** A `curl -i` transcript for **every row** of the table, including **one
failure case per row**, captured against `localhost`, and the test output.

```console
curl -i "http://localhost:3001/api/tickets?zone=South&status=open&sort=hours-desc"
curl -i "http://localhost:3001/api/summary?zone=North&status=open"
curl -i "http://localhost:3001/api/tickets?zone=West"
curl -i -X POST http://localhost:3001/api/tickets -H "Content-Type: application/json" \
     -d '{"ticket_id":"T-00999","zone":"North","category":"Access","priority":"High","opened_on":"2026-03-31","closed_on":null,"estimated_hours":null,"summary":"Door sensor offline"}'
curl -i -X PATCH http://localhost:3001/api/tickets/T-00999 -H "Content-Type: application/json" \
     -d '{"closed_on":"2026-03-30"}'
curl -i -X DELETE http://localhost:3001/api/tickets/T-00999
```

The `PATCH` above should fail — `closed_on` is before `opened_on`. Say which contract
rule it breaks.

> **Windows PowerShell note.** Use `curl.exe`. Quoting JSON in PowerShell 5.1 is
> painful: put the body in a file and use `-d "@body.json"`. `Invoke-RestMethod` is also
> acceptable evidence if it shows the status code and headers (`-StatusCodeVariable` /
> `-ResponseHeadersVariable` in PowerShell 7).

⏱ **~3 hours** — less if your HW3 validation and metric functions are already pure and
importable.

---

### Task 2 — An exact CORS policy, proven from both sides

Your frontend and API are on **different origins** locally (`http://localhost:5173` →
`http://localhost:3001`) and almost certainly in production too (for example
`https://<you>.github.io` → `https://<your-api>.onrender.com`). Configure CORS so that:

1. The allowed origins come from **configuration** (for example
   `CORS_ORIGINS=https://<you>.github.io,http://localhost:5173`), are compared
   **exactly** — scheme, host and port — and are **never** `*` or a reflected `Origin`.
2. Preflight (`OPTIONS`) is answered for the methods and request headers your client
   actually sends (`Content-Type`, `X-Request-Id`), with a sensible
   `Access-Control-Max-Age`.
3. `Location` and `X-Request-Id` are listed in `Access-Control-Expose-Headers`, so your
   axios code can read them.
4. **Error responses carry CORS headers too.** If CORS runs after the route that threw,
   the browser hides your carefully shaped `400` behind a generic "Network Error".
   Register CORS **before** your routes.
5. Responses vary on `Origin` (`Vary: Origin`) so a cache never serves one origin's
   answer to another.

**Evidence — capture all four:**

- (a) A preflight from an **allowed** origin, with its `Access-Control-Allow-*` headers.
- (b) The same preflight from a **disallowed** origin, showing **no**
      `Access-Control-Allow-Origin`.
- (c) A **plain `curl` GET** with the disallowed `Origin` header that **succeeds** with
      data — and two sentences on why that is not a bug.
- (d) **Break and fix in the browser.** Remove your frontend's origin from the
      allowlist, reload, and screenshot DevTools (Console **and** the Network row for the
      failed request). Restore it and screenshot the working preflight + real request
      pair. Name the exact header whose absence caused the failure.

```console
curl -i -X OPTIONS http://localhost:3001/api/tickets/T-00001 \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: PATCH" \
     -H "Access-Control-Request-Headers: content-type,x-request-id"
```

> **The idea to own:** CORS is enforced by the **browser**, on behalf of the user,
> against other origins' scripts. It is not a firewall. `curl`, Postman and attackers'
> scripts ignore it entirely — which is why Task 1's read-only switch exists.

⏱ **~1 hour.**

---

### Task 3 — Connect your HW3 app through one axios client

Your HW3 app read a local file. Add an **API mode** in which the same screens are driven
by the API through **one** module, as in Block B (`frontend/src/api/client.ts` in the
sample). You may keep HW3's local-CSV import as a second mode or remove it; the API mode
is what is graded.

1. **One configured instance.** `axios.create` with `baseURL` from build-time config
   (`import.meta.env.VITE_API_URL`), a **timeout**, and `Accept: application/json`. No
   component calls `axios.get` directly, and no component builds a URL by string
   concatenation.
2. **One typed function per endpoint** — `listTickets(query, signal)`,
   `getSummary(filters, signal)`, `getTicket`, `createTicket`, `updateTicket`,
   `deleteTicket`, `checkHealth` — returning the same `Ticket` and metric types your HW3
   code already defines. Query strings go through axios `params`.
3. **Validate what arrives.** HW3 taught that a TypeScript type does not decode data. A
   response is external input: check at least that `estimated_hours` is a number or
   `null` and that `byZone` has the three zones before rendering it.
4. **Interceptors.** A request interceptor adds `X-Request-Id`; a response interceptor
   (or one `toApiError` function) turns **every** failure into one `ApiError` with a
   `kind` of exactly **`http`**, **`network`**, **`timeout`** or **`canceled`**, plus
   `status`, `code`, `message`, `details` and the server's `requestId` where they exist.
5. **The HW3 screens, now server-driven.** Search, zone, status, sort and Previous/Next
   send their values as query parameters; the summary and the zone table come from
   `/api/summary`; the page of rows comes from `/api/tickets`. Your HW3 rules still hold
   in the UI — known effort shown **with coverage**, an empty result explained with a way
   to reset filters, Reset filters keeps the sort.
6. **Cancellation.** The list and summary requests run in a `useEffect` with an
   `AbortController` whose `signal` is passed to axios, and the cleanup aborts them.
   Typing quickly in the search box must not let an old response overwrite a newer one.
   (This replaces the `cancelled` flag in Week 3's `useFetch`.)
7. **A small create form and a "close ticket" action.** After `createTicket`, read the
   new ticket's URL from the `Location` header. On a `400`, show each server reason next
   to its field; on `403` or `409`, show the server's message — and in every failure
   case **keep what the user typed**.
8. **Say the right thing.** The server's `message` for `http`; "can't reach the server"
   for `network`; a retry hint for `timeout`; **nothing at all** for `canceled`.

**Evidence** — screenshots or a short screen recording (≤ 2 minutes) showing the UI
**and** the DevTools Network panel:

- the summary numbers for `verification.csv` in API mode matching your HW3 prediction;
- a successful create (`201`, with the `Location` you read);
- an `http` error (`400` with field reasons, or `403`) and its request id;
- a `timeout` (DevTools throttling, or a deliberately slow route) and a `network` error
  (stop the API);
- a request shown as **(canceled)** in Network after fast typing, with no error shown.

Also submit at least one **automated frontend test** of your `ApiError` classification
(Node's test runner or Vitest — whichever HW3 used).

⏱ **~3 hours.**

---

### Task 4 — Put both halves live over HTTPS

1. **Deploy the API** as a Node web service and the **built frontend** as a static site.
   Both must be served over **`https://`** on hostnames your platform gives you (or your
   own domain). Write a short **topology note**: the two origins, and one consequence of
   that choice for CORS. (If you serve both from one origin, say why CORS no longer
   applies to your own frontend — and keep the allowlist anyway.)
2. **Production configuration:**
   - `CORS_ORIGINS` contains **only** your production frontend origin — no `localhost`.
     An origin is scheme + host + port, **no path**: a GitHub Pages site at
     `https://<you>.github.io/hw4/` has the origin `https://<you>.github.io`.
   - `VITE_API_URL` is an **`https://`** URL. Vite bakes it in **at build time**, so
     changing it means rebuilding the frontend. An `http://` API called from an
     `https://` page is blocked as **mixed content** before CORS is even consulted — say
     what you would see if you got this wrong.
   - `ALLOW_WRITES=false`.
3. From a machine that is **not** your server (PowerShell: use `curl.exe` and `NUL`
   instead of `/dev/null`):

```console
curl -sSI https://<your-frontend-host>/ | head -5
curl -sS  https://<your-api-host>/api/healthz
curl -sS  "https://<your-api-host>/api/summary?zone=North"
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://<your-api-host>/api/tickets \
     -H "Content-Type: application/json" -d "{}"
curl -sS -o /dev/null -D - -X OPTIONS https://<your-api-host>/api/tickets \
     -H "Origin: https://<your-frontend-host>" -H "Access-Control-Request-Method: POST"
```

The first three must succeed with **no TLS warnings and no `--insecure` / `-k`**. The
fourth must print `403`. The fifth must show `Access-Control-Allow-Origin` equal to your
production frontend origin.

4. Open the live frontend, change a filter, and screenshot the Network panel with the
   **Protocol** column turned on (right-click a column header → *Protocol*), showing both
   the frontend's assets and the API calls.

> **Free tiers sleep.** Many free web services stop after ~15 minutes idle and take 30+
> seconds to wake. Your first request will then hit your axios **timeout** — a real
> `timeout` you can capture for Task 3. Handle it honestly (a "waking the server…"
> message and a retry), not by setting the timeout to five minutes.

⏱ **~2–3 hours** on a managed platform.

---

### Task 5 — Read your own certificate and protocol

This is Block A, pointed at **your** live hostnames. Use whichever platform you have; both
earn full marks.

**Windows (PowerShell 5.1 or 7 — no OpenSSL):**

```powershell
cd weeks\week04\samples
.\tls-inspect.ps1 <your-api-host>
.\tls-inspect.ps1 <your-api-host> -SaveCertificate api.cer
certutil -dump api.cer          # every field, including the SAN extension
curl.exe -sS -o NUL -w "version=%{http_version} code=%{http_code}\n" https://<your-api-host>/api/healthz
curl.exe -sSI https://<your-frontend-host>/ | findstr /i "alt-svc"
Resolve-DnsName <platform-domain> -Type CAA
```

> If PowerShell refuses to run the script: `Set-ExecutionPolicy -Scope Process Bypass`
> (this window only). Edge/Chrome's padlock → *Connection is secure* → *Certificate is
> valid* shows the same chain graphically.

**macOS / Linux (reference):**

```bash
openssl s_client -connect <your-api-host>:443 -servername <your-api-host> \
  -showcerts -alpn h2,http/1.1 </dev/null 2>&1 \
  | grep -E 'depth=|^ [0-9] s:|^   [iv]:|Verification|ALPN protocol'
openssl s_client -connect <your-api-host>:443 -servername <your-api-host> </dev/null 2>/dev/null \
  | openssl x509 -noout -text | grep -E 'Issuer:|Subject:|Not (Before|After)|DNS:'
curl -sS -o /dev/null -w 'version=%{http_version} code=%{http_code}\n' https://<your-api-host>/api/healthz
curl -sSI https://<your-frontend-host>/ | grep -i alt-svc
dig +short CAA <platform-domain>
```

Run the inspection against **both** hostnames if they differ (the frontend's and the
API's certificates are usually different). Submit the raw output and an annotation, in
your own words, of:

- the leaf's **issuer** and the chain from leaf to root. On macOS, `-showcerts` lists
  what the **server sent**, so say which certificates were sent and which root came from
  **your device's trust store**. On Windows, `tls-inspect.ps1` shows the chain **Windows
  built**, which may include intermediates it fetched or cached; name the root that came
  from the Windows store and say why the script alone cannot prove which intermediates
  the server sent;
- the **SANs**. On a platform hostname you will often see a **wildcard** such as
  `*.onrender.com` or `*.github.io`: say what that means for who controls the private key
  and why it is acceptable for this course but not for a bank;
- **NotAfter**, the days remaining, and **who renews it** (almost certainly the platform —
  point to the documentation page that says so);
- the **verdict** (`PolicyErrors : None` / `Verification: OK`) and one failure it would
  have caught (compare with [`samples/badssl-diagnoses.txt`](samples/badssl-diagnoses.txt));
- the **HTTP version**: what the browser's Protocol column showed for the frontend and for
  the API, what `curl` negotiated, whether `alt-svc` advertises `h3`, and one sentence on
  why they may differ;
- **CAA, back to HW2.** In
  [HW2 Task 2](https://github.com/bodonnell-DePaul/webapps_week02/blob/main/homework.md)
  you read `github.com`'s CAA record and explained `depaul.edu`'s NODATA. Look up the CAA
  record for your platform's registrable domain (for example `onrender.com`,
  `github.io`, `azurewebsites.net`): does it permit the CA that issued your certificate?
  If there is no record, what does that mean — in the same terms you used in HW2? If
  your certificate is a wildcard, say whether the `issuewild` tag or the `issue` tag is
  the one that applied.

> **Windows vs. OpenSSL differences are expected, not errors.** Windows builds the chain
> itself and shows the root from its store, so it may list one more certificate than
> `openssl` showed being sent. Explain the difference; do not "fix" it.

⏱ **~1 hour.**

---

### Task 6 — Critique an AI-suggested "fix" for CORS or TLS

Ask an AI assistant to fix a CORS error or a TLS error you reproduced (locally, or
against `badssl.com` — never by weakening production). Assistants reliably suggest one of:

- **CORS:** `app.use(cors())` with no options, `origin: "*"` (or `origin: true`, which
  reflects any origin) **together with** `credentials: true`, a browser extension that
  "disables CORS", or proxying everything through the Vite dev server and calling it
  fixed;
- **TLS:** `curl -k`, `rejectUnauthorized: false` / an `httpsAgent` with verification off,
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
| 1 | Free-tier / no-card page, or budget alert screenshot | Task 0 |
| 2 | `curl -i` transcript for every route, one failure per route | Task 1 |
| 3 | Backend test output — the three named tests | Task 1 |
| 4 | Allowed preflight, refused preflight, curl-with-bad-Origin | Task 2 |
| 5 | CORS break-and-fix DevTools screenshots, with the missing header named | Task 2 |
| 6 | UI + Network evidence: verification metrics, 201/Location, http, timeout, network, canceled | Task 3 |
| 7 | Frontend test output for `ApiError` classification | Task 3 |
| 8 | Live-site `curl` checks (HTTPS, health, summary, `403` on write, production preflight) + Protocol-column screenshot | Task 4 |
| 9 | Topology note: the origins and one CORS consequence | Task 4 |
| 10 | Raw TLS output for each hostname (Windows or macOS) + annotation, HTTP version, CAA | Task 5 |
| 11 | AI suggestion, its real effect, your evidence, your fix | Task 6 |
| 12 | AI-use log and redaction attestation | Write-up |

---

## 5. Rubric — 100 points

Each row is evaluated 60% domain content and 40% evidence, as in the syllabus. Do not
infer fabrication merely because an external service or dependency changed.

### Part A — The API and its contract (30)

| # | Criterion | Pts |
| --- | --- | ---: |
| A1 | Routes use the **right method and status code** (201 + `Location`, 204 with no body, 400 vs 404 vs 409), with a failure case shown for each. | 10 |
| A2 | **HW3 contract over HTTP:** filters, sort, 50-row pages and the six metrics + `byZone` match the data contract; `null` vs `0` kept distinct; writes validated with the contract's field rules. | 8 |
| A3 | **One error shape** on every error path, no stack traces; request id on every response; production **read-only switch returns 403**. | 6 |
| A4 | The **three named backend tests** run and pass, including the hand-predicted `verification.csv` metrics. | 6 |

### Part B — Connect it (30)

| # | Criterion | Pts |
| --- | --- | ---: |
| B1 | **CORS:** exact allowlist from configuration (no `*`/reflection), allowed vs refused preflight evidence, exposed `Location`/`X-Request-Id`, CORS headers on errors, `Vary: Origin`. | 10 |
| B2 | **axios client:** one instance (`baseURL`, timeout), typed functions per endpoint reusing HW3 types, `params` for queries, request-id interceptor, response data checked before rendering. | 8 |
| B3 | **`ApiError`** distinguishes http/network/timeout/canceled with UI + Network evidence; `AbortController` cleanup; field reasons shown and input kept on failure; a frontend test. | 8 |
| B4 | CORS break-and-fix diagnosis that names the missing header and explains curl vs browser. | 4 |

### Part C — Ship and trust it (30)

| # | Criterion | Pts |
| --- | --- | ---: |
| C1 | **Cost ceiling** evidence (free tier with no card, or a configured budget). | 2 |
| C2 | Frontend and API **live over HTTPS**, no warnings, no `-k`; production `CORS_ORIGINS` exact and path-free; `https://` API URL; `403` on write; production preflight; topology note. | 12 |
| C3 | TLS inspection of **your** hostnames (Windows or macOS): chain (sent vs trust store / built by Windows), SANs and wildcard meaning, expiry, renewal owner, verdict. | 10 |
| C4 | HTTP version in the browser vs `curl` (and `alt-svc`) with a correct interpretation, plus the CAA lookup explained in HW2's terms. | 6 |

### Part D — Judgment (10)

| # | Criterion | Pts |
| --- | --- | ---: |
| D1 | AI CORS/TLS critique: the suggestion, what it really permits or disables, the evidence, the real fix. | 7 |
| D2 | AI-use log and redaction attestation, both complete. | 3 |

**Total: 100.**

### Automatic deductions

| Condition | Effect |
| --- | --- |
| A live secret or deploy token appears in the submission | Zero on that artifact + resubmission with rotation evidence |
| Production API accepts unauthenticated writes | Zero on A3's read-only portion; Gate 2 not passed until fixed |
| `Access-Control-Allow-Origin: *` or a reflected origin in production | Zero on B1 |
| Any live check uses `-k`, `--insecure` or `-SkipCertificateCheck` | Zero on C2 |
| Metrics computed from the current page instead of the whole matching set | Zero on A2's metrics portion |
| Evidence that cannot be reproduced from your own commands | Request provenance and diagnose environmental drift; fabrication requires evidence of fabrication, not failure alone |

---

## 6. Submission

One PDF or Markdown file, plus a repository link.

```
csc436-hw4-<lastname>.pdf                      # or .md
csc436-hw4-<lastname>-evidence/
  ├── 01-cost-ceiling.png
  ├── 02-api-curl.txt
  ├── 03-backend-tests.txt
  ├── 04-cors-preflights.txt
  ├── 05-cors-break-fix/           (screenshots)
  ├── 06-axios-states/             (screenshots or ≤2 min video)
  ├── 07-frontend-tests.txt
  ├── 08-live-checks.txt + protocol.png
  ├── 09-topology.md
  ├── 10-tls-inspect.txt
  └── 11-ai-critique.md
```

The write-up must open with: your frontend URL, your API base URL, the **commit SHA** the
evidence was captured at, the capture date, and your redaction attestation.

---

## 7. What good looks like, and what will lose points

| ✅ Good | ❌ Loses points |
| --- | --- |
| "Preflight from `evil.example` returned 204 but no `Access-Control-Allow-Origin`; that missing header is the refusal." | "CORS is configured. ✅" |
| `CORS_ORIGINS=https://jdoe.github.io` in production. | `origin: "*"`, `origin: true`, `localhost` left in the list, or `https://jdoe.github.io/hw4/` (a path is not an origin). |
| `"estimated_hours": null` and "14 known hours; 4 of 6 open tickets have estimates". | `"estimated_hours": 0` for a blank, or "14 hours of work". |
| `knownOpenHours` from `/api/summary` is the same on page 1 and page 3. | The UI sums the 50 rows it happens to have. |
| `createTicket` returns the new id read from `Location`. | Re-fetching everything after each create because the header was unreadable. |
| A sleeping server shows "Waking the server…" and retries once. | Every failure shows "Something went wrong", or a canceled request flashes an error. |
| `POST` to production returns `403 {"error":{"code":"read_only",…}}`. | "CORS stops other sites from writing to my API." |
| "Windows showed three certificates because it built the chain itself; the root came from my store." | "The certificate is valid. ✅" |
| "The model suggested `origin: true` with credentials; that lets any site read a logged-in user's data. I listed my one origin instead." | "The AI helped me fix CORS." |

---

## 8. The non-generatable component

**A model can write your Express routes, your CORS options and your axios client — and you
should let it.** What it cannot do:

- **Know your HW3 numbers.** Your hand prediction for `verification.csv` is the oracle
  the API is tested against; a model asked for "the metrics" will produce plausible ones.
- **See what your browser refused.** The preflight your browser actually sent, and the
  header missing from the answer, exist only in your DevTools.
- **Tell you what your chain looks like.** It has never connected to your host; asked, it
  will describe a *plausible* chain, confidently.
- **Judge the trade.** `origin: "*"` and `-k` genuinely do make the error go away.
  Knowing that the error *was the only thing telling you the truth* is the skill this
  week grades.

Every task above has its correctness oracle outside the file the model is editing — in
your HW3 arithmetic, a browser, a CA or a trust store. That is the delegation line from
Week 1.

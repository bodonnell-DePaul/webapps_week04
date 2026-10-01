# Week 4: HTTP at Speed, Trust on the Wire, and First Deploy — class notes

These notes contain the student-visible teaching material and examples. Complete the exercises individually. Instructor delivery notes and answer keys are not included.

## Weekly session — HTTP at Speed, Trust on the Wire, and First Deploy

Teaching, individual practice, and the end-of-class brief

## Block A — HTTP and TLS

### You ship over HTTP every day. You have never chosen a version

- Your app speaks HTTP, but you did not pick `1.1`, `2`, or `3` — something else did
- The version is negotiated **on the wire**, during the TLS handshake, by a step called **ALPN**
- It is not in your source code, your framework config, or your Dockerfile
- Same methods, same status codes, same headers in every version — only the **delivery** changed

> **Key idea**
>
> The HTTP version is a property of the connection, not of the code. To learn it, ask
> the connection — DevTools, `curl -v`, or the server's logs.

### HTTP/1.1: one answer at a time per connection

- A 1.1 connection carries **one request/response at a time**, in order
- Keep-alive reuses the socket, so request two skips the TCP and TLS setup
- But a slow response blocks everything queued behind it — **head-of-line blocking**
- Browsers worked around it by opening about **6 connections per site**
- Six connections means six handshakes and six of everything else

**Sources**

- MDN — [Connection management in HTTP/1.x](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x)
- IETF — [RFC 9112, HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112.html)

### One lane, or many lanes on one road

![Two rows compared. Top row, HTTP/1.1: three requests on one connection are served strictly in order, and a slow second response blocks the third. Bottom row, HTTP slash 2: the same three requests become three streams whose frames are interleaved on a single connection, so the slow response delays only itself.](../../assets/class-notes/week04-session-s4-1.svg)

*HTTP/1.1 serialises responses on one connection; HTTP/2 interleaves them as frames on independent streams*

### HTTP/2: same meaning, new envelope, one connection

- Requests become **binary frames**, each tagged with a stream ID, all on **one** TCP connection
- Headers are compressed (**HPACK**), so a big repeated `Cookie` header costs bytes once
- Your handlers do not change: HTTP/2 is a delivery upgrade, not an API change
- The catch: TCP delivers bytes strictly in order, so **one lost packet stalls every stream**

> **Caution**
>
> HTTP/2 fixed head-of-line blocking at the HTTP layer and inherited it at the TCP
> layer. On a lossy network one connection can lose to six HTTP/1.1 connections.

**Sources**

- IETF — [RFC 9113, HTTP/2](https://www.rfc-editor.org/rfc/rfc9113.html) · [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)

### HTTP/3: the same idea on a transport that knows about streams

- HTTP/3 runs over **QUIC**, a transport built on **UDP**
- QUIC knows about streams, so a lost packet stalls **only its own stream**
- TLS 1.3 is built into QUIC, so setup takes fewer round trips
- **Connection migration:** Wi-Fi to cellular keeps the same connection alive
- Discovery: the server advertises `alt-svc: h3=":443"`; the next connection tries QUIC, and falls back to TCP if UDP is blocked

**Sources**

- IETF — [RFC 9000, QUIC](https://www.rfc-editor.org/rfc/rfc9000.html) · [RFC 9114, HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html)
- MDN — [`Alt-Svc`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Alt-Svc)

### The three versions at a glance

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| Transport | TCP | TCP | QUIC over UDP |
| Requests per connection | One at a time | Many, interleaved | Many, independent |
| Head-of-line blocking | HTTP **and** TCP | TCP only | Removed between streams |
| Format on the wire | Text | Binary frames | Binary frames |
| Encryption | Optional (TLS) | TLS in practice | TLS 1.3 built in |
| Your app code changes | — | None | None |

### ALPN: the version is chosen inside the TLS handshake

```console title="real capture — curl 8.5.0 against www.depaul.edu, 2026-08-15"
$ curl -sS -o /dev/null -v --http2 https://www.depaul.edu/

* ALPN: curl offers h2,http/1.1
* SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256 / X25519
* ALPN: server accepted h2
* using HTTP/2
> GET / HTTP/2
< HTTP/2 200
```

> **Key idea**
>
> The client offers a list, the server picks one, and the choice is made **before a
> single HTTP byte moves**. That is why HTTP versions and TLS are one topic.

### TLS: privacy, integrity, and a name you can trust

The handshake, the certificate, the chain — and how to read all three on Windows.

### What TLS actually gives you, and the one thing it does not

- **Confidentiality** — an observer on the Wi-Fi sees ciphertext, not your request
- **Integrity** — tampering is detected, not merely discouraged
- **Server authentication** — you are talking to the owner of that **name**
- It does **not** say the site is honest, safe, or well run

> **Caution**
>
> A padlock means the connection is private. A phishing site with a free certificate has
> a padlock too. TLS authenticates the **name**, never the intent behind it.

**Sources**

- IETF — [RFC 8446, TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)

### One round trip, and where the certificate shows up

![A TLS 1.3 handshake sequence between client and server. The client sends ClientHello with its key share, the SNI server name and the ALPN protocol list, all in the clear. The server replies with ServerHello and its key share, then, now encrypted, its Certificate, CertificateVerify and Finished. The client sends Finished and application data follows. Total: one round trip.](../../assets/class-notes/week04-session-s11-1.svg)

*TLS 1.3 completes in one round trip; the certificate arrives in the server's first flight and is encrypted*

**Sources**

- IETF — [RFC 8446 §2, protocol overview](https://www.rfc-editor.org/rfc/rfc8446.html)

### A certificate is a signed, public statement about a name

- You make a **private key**. It never leaves your server; nobody else ever sees it
- A **certificate authority (CA)** checks you control the domain, then **signs** your public key + names
- The certificate is public by design — every visitor receives it
- Browsers match the hostname against the **Subject Alternative Name (SAN)** list, not `CN`
- A wildcard `*.example.edu` covers **one** label: `api.example.edu` ✓, `a.b.example.edu` ✗

> **Key idea**
>
> The only secret is the private key. A certificate in a screenshot is harmless; a
> private key in a screenshot is a compromise.

**Sources**

- IETF — [RFC 9525, service identity in TLS](https://www.rfc-editor.org/rfc/rfc9525.html)

### Three links, and only two of them travel

![A chain of trust diagram. On the left, a root CA certificate labelled already installed in the client trust store, never sent on the wire. It signs an intermediate CA certificate, which signs the leaf certificate for your domain. A bracket underneath marks the leaf and the intermediate as the part your server must send. A note says the client builds the path upward and stops when it reaches a certificate it already trusts.](../../assets/class-notes/week04-session-s13-1.svg)

*The server sends the leaf and the intermediates; the root is already on the client and is never sent*

### Demo: inspect a certificate on Windows, no OpenSSL

#### Steps

1. PowerShell in `weeks/week04/samples`
2. `.\tls-inspect.ps1 www.depaul.edu`
3. Then `.\tls-inspect.ps1 expired.badssl.com`

#### Expected observations

- DePaul `None`; expired `NotTimeValid`

#### Fallback

Show the printouts on the next slides (`tls-inspect-captures.txt`).

**Sources**

- Course — [tls-inspect.ps1](samples/tls-inspect.ps1) · [captured output](samples/tls-inspect-captures.txt)

### Windows printout: the connection and the leaf certificate

```console title="real capture — tls-inspect.ps1, PowerShell 7.6 (.NET), 2026-10-01"
PS> .\tls-inspect.ps1 www.depaul.edu
Protocol   : Tls12
Cipher     : TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
== Leaf certificate ==
Subject    : CN=www.depaul.edu
Issuer     : CN=YR1, O=Let's Encrypt, C=US
NotBefore  : 2026-09-22 17:53
NotAfter   : 2026-12-21 16:52
DaysLeft   : 81
SAN        : DNS:www.depaul.edu
Thumbprint : ECD4BF7AE268F126C5F5E667E44396890BFC2610
```

- `NotAfter − NotBefore` = **90 days**: renewal has to be automated

### Windows printout: the chain this device built, and the verdict

```console title="real capture — same run, continued"
== Chain built by this device (0 = leaf) ==
Depth Subject                                                   NotAfter
----- -------                                                   --------
    0 CN=www.depaul.edu                                         2026-12-21
    1 CN=YR1, O=Let's Encrypt, C=US                             2028-09-02
    2 CN=Root YR, O=ISRG, C=US                                  2032-09-02
    3 CN=ISRG Root X1, O=Internet Security Research Group, C=US 2035-06-04

== Verdict ==
PolicyErrors : None
ChainStatus  : OK
```

- Depth `3` is the **root** — it came from this device's trust store, not the server
- `PolicyErrors : None` is the same decision Edge makes before it draws the padlock

### Windows: where "trusted" actually lives

```powershell title="illustrative — Windows 11 output shape"
PS> Get-ChildItem Cert:\LocalMachine\Root |
>>   Where-Object Subject -like '*ISRG Root X1*' |
>>   Format-List Subject, Thumbprint, NotAfter

Subject    : CN=ISRG Root X1, O=Internet Security Research Group, C=US
Thumbprint : CABD2A79A1076A31F21D253635CB039D4329A5E8
NotAfter   : 6/4/2035 6:04:38 AM

PS> certutil -dump .\depaul.cer | Select-String 'Subject|NotAfter|DNS'
```

- GUI equivalent: run `certlm.msc` → **Trusted Root Certification Authorities**
- Windows downloads roots **on demand**, so the list grows as you visit sites
- `.\tls-inspect.ps1 www.depaul.edu -SaveCertificate depaul.cer` creates the file for `certutil`

### Windows, no command line: Edge's certificate viewer

#### Five clicks

1. Open `https://www.depaul.edu`
2. Click the icon left of the address bar
3. **Connection is secure**
4. Click the certificate icon
5. **Details** tab: issuer, validity, SAN, and the chain

#### What to point at

- **Issued to / by** — Subject and Issuer
- **Valid from / to** — the 90-day window
- **Certificate Subject Alternative Name** — the names covered
- **Certificate Hierarchy** — root, intermediate, leaf

### Four failures, and how each client reports them

| `*.badssl.com` site | Edge shows `NET::ERR_CERT_…` | PowerShell 7 says |
| --- | --- | --- |
| `expired` | `DATE_INVALID` | `NotTimeValid` |
| `wrong.host` | `COMMON_NAME_INVALID` | `NameMismatch` |
| `self-signed` | `AUTHORITY_INVALID` | `UntrustedRoot` |
| `incomplete-chain` | often **loads** (the trap) | often **passes** |

### Reference for macOS and Linux: the same checks with OpenSSL

```bash title="macOS / Linux reference — not run in class"
# Leaf fields (subject, issuer, dates, SAN)
openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu \
  </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates \
  -ext subjectAltName

# Full chain the server sends, and the verify result
openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu \
  -showcerts </dev/null

# ALPN: which HTTP version does the server pick?
openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu \
  -alpn h2,http/1.1 </dev/null 2>/dev/null | grep -i alpn
```

- Always pass `-servername`: without SNI, a shared host may return the **wrong** certificate

### Keeping HTTPS working: automate, then watch the automation

- Certificates now last **90 days or less**, so renewal must be automatic
- **ACME** (Let's Encrypt and most hosts) proves you control the domain, then issues and renews
- Platforms like Azure App Service, Netlify, and Vercel run ACME for you — you just add the domain
- Automation fails silently, so monitor **days until expiry** (the `DaysLeft` field) and alert well before zero
- **HSTS** (`Strict-Transport-Security`) tells browsers to use HTTPS only — and makes an expired cert a hard outage

**Sources**

- Let's Encrypt — [How it works](https://letsencrypt.org/how-it-works/)
- MDN — [`Strict-Transport-Security`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)

### Three claims. Which hold up, and what evidence settles each?

1. "We enabled HTTP/2, so a lost packet no longer blocks other responses."
2. "The login page has a padlock, so the site is safe to trust with my password."
3. "It loads in Edge on my Windows laptop, so our certificate chain is configured correctly."

## Block B — Frontend to API with axios

### Calling your API from the frontend with axios

One configured client, one function per endpoint, one error type

Your React app and your API are two programs on two ports. This block is the code
in the browser that connects them.

### Two programs, two ports, one HTTP conversation

![Architecture of the sample. On the left, the browser runs the React app served by Vite at localhost port 5173. Inside it, components call typed functions in incidents.ts, which use one axios instance from client.ts. Arrows labelled GET, POST, PUT, PATCH and DELETE with JSON go to the right, to an Express API at localhost port 3001, which returns JSON responses with CORS headers. A note says the two different ports make this a cross-origin request, covered in Block C.](../../assets/class-notes/week04-session-s24-1.svg)

*The browser loads the app from one origin and calls the API on another; axios is the code that makes those calls*

### fetch is built in. Why reach for axios?

#### `fetch` (built in)

- No install, works everywhere
- A `404` or `500` **resolves**; you must check `res.ok`
- You call `JSON.stringify` and `res.json()` yourself
- Timeouts need `AbortSignal.timeout()`

#### `axios` (npm package)

- **Rejects** on any non-2xx status
- Sends objects as JSON; parses JSON into `data`
- `baseURL`, `timeout`, `params` built in
- **Interceptors** run on every request and response

### Step 1: one configured client for the whole app

```ts title="frontend/src/api/client.ts" lines mark=4,7,8
import axios from "axios";

export const API_URL =
  import.meta.env?.VITE_API_URL ?? "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_URL,  // every call is relative to this
  timeout: 4000,     // fail fast instead of spinning forever
  headers: { Accept: "application/json" },
});
```

- Every request in the app goes through `api` — never `axios.get` with a full URL
- Change the base URL **once**, by environment: `.env` → `VITE_API_URL=https://api.example.edu/api`

### Step 2: one function per endpoint

| Method | Path | Function in `incidents.ts` | Success |
| --- | --- | --- | --- |
| `GET` | `/incidents?status=&q=` | `listIncidents(filters, signal)` | `200` + `{ items, count }` |
| `GET` | `/incidents/:id` | `getIncident(id)` | `200` + incident |
| `POST` | `/incidents` | `createIncident({ title, service })` | `201` + `Location` |
| `PUT` | `/incidents/:id` | `replaceIncident(incident)` | `200` + incident |
| `PATCH` | `/incidents/:id` | `updateStatus(id, status)` | `200` + incident |
| `DELETE` | `/incidents/:id` | `deleteIncident(id)` | `204`, no body |

### Reading: GET with query parameters

```ts title="frontend/src/api/incidents.ts" lines mark=5
// GET /incidents?status=…&q=…
export async function listIncidents(filters: Filters = {},
                                    signal?: AbortSignal) {
  const { data } = await api.get<{ items: Incident[]; count: number }>(
    "/incidents", { params: filters, signal });
  return data.items;
}

// GET /incidents/:id
export async function getIncident(id: string) {
  const { data } = await api.get<Incident>(
    `/incidents/${encodeURIComponent(id)}`);
  return data;
}
```

- `params` builds and encodes the query: `?status=monitoring&q=wi+fi`

### Creating: POST sends a body and gets back 201 + Location

```ts title="frontend/src/api/incidents.ts" lines mark=3
// POST /incidents — axios serializes the object to JSON and sets Content-Type
export async function createIncident(input: NewIncident) {
  const response = await api.post<Incident>("/incidents", input);
  return { incident: response.data,
           location: response.headers["location"] as string };
}

// usage in a component
await createIncident({ title: "Printers offline", service: "printing" });
```

- Pass a plain object: axios sends JSON **and** sets `Content-Type: application/json`
- Method name = HTTP verb, first argument = path, second = body

### Updating and deleting

```ts title="frontend/src/api/incidents.ts" lines mark=4,9,13
// PUT — send the whole editable record
export async function replaceIncident(incident: Incident) {
  const { id, title, service, status } = incident;
  const url = `/incidents/${encodeURIComponent(id)}`;
  return (await api.put<Incident>(url, { title, service, status })).data;
}
// PATCH — send only what changed
export async function updateStatus(id: string, status: Status) {
  const url = `/incidents/${encodeURIComponent(id)}`;
  return (await api.patch<Incident>(url, { status })).data;
}
// DELETE — 204, no body
export async function deleteIncident(id: string) {
  await api.delete(`/incidents/${encodeURIComponent(id)}`);
}
```

### What comes back: `response`, or one of two kinds of error

- Success (2xx): `response.data` is parsed JSON; also `status` and `headers`
- **The server answered** with 4xx/5xx: axios rejects; `error.response` holds status and body
- **No answer at all**: server down, DNS, timeout — or **blocked by CORS**; `error.response` is `undefined`
- The browser hides the reason for a CORS block from your code on purpose — read the **console**

> **Key idea**
>
> `error.response` present → read the server's message. Absent → it is a network
> problem, and the console and Network tab hold the real reason.

### Interceptors: code that runs on every request and response

```ts title="frontend/src/api/client.ts (abridged)" lines mark=2,8
api.interceptors.request.use((config) => {
  config.headers.set("X-Request-Id", crypto.randomUUID());
  return config;
});

api.interceptors.response.use(
  (response) => response,                    // 2xx: pass through
  (error) => Promise.reject(toApiError(error)), // anything else: normalize
);
```

- **Request** interceptor: add headers every call needs — a request ID, later an auth token
- **Response** interceptor: turn every failure into **one** error type the UI understands
- The sample also logs each call into an in-app activity table (see `client.ts`)

### One error type for the whole UI

```ts title="frontend/src/api/client.ts"
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;  // already normalized
  if (axios.isCancel(error))
    return new ApiError("canceled", "Request canceled");
  if (!(error instanceof AxiosError))
    return new ApiError("network", String(error));
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
    return new ApiError("timeout", `No answer in ${api.defaults.timeout} ms`);
  if (error.response) {                         // server answered 4xx/5xx
    const body = error.response.data as ErrorBody;
    return new ApiError("http", body?.error?.message ?? error.message,
                        error.response.status, body?.error?.code);
  }
  return new ApiError("network",                // down, DNS, TLS, or CORS
    "Network error — is the API running and is this origin allowed (CORS)?");
}
```

### Four kinds of failure, four different messages

| `kind` | What happened | What the user should see |
| --- | --- | --- |
| `http` | Server answered 4xx/5xx | The server's message: "title must be 3-120 characters" |
| `timeout` | No answer within `timeout` | "The API is slow — try again" |
| `network` | No answer: down, offline, **CORS** | "Can't reach the API"; details in the console |
| `canceled` | Your code aborted it | Nothing — it was intentional |

### Calling it from React, and cancelling stale requests

```tsx title="frontend/src/App.tsx (abridged)" lines mark=2,7
useEffect(() => {
  const controller = new AbortController();
  setLoading(true);
  listIncidents({ status, q }, controller.signal)
    .then((items) => { setIncidents(items); setError(""); })
    .catch((err: ApiError) => {
      if (err.kind !== "canceled") setError(describe(err));
    })
    .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();  // on filter change or unmount
}, [status, q, reload]);
```

- Without the abort, a **slow old** answer can arrive last and overwrite the new one
- Mutations use one wrapper: `run(() => updateStatus(id, "resolved"))`, then reload the list

### What the wire actually carried: a create, and a rejected create

```console title="real capture — sample API on localhost:3001, 2026-10-01 (abridged)"
$ curl -i -X POST localhost:3001/api/incidents \
    -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' \
    -d '{"title":"Library printers offline","service":"printing"}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Expose-Headers: Location,X-Request-Id
Location: /api/incidents/1bd5e680-a677-44b2-ac5f-9d616759c1b5
{"id":"1bd5e680-…","title":"Library printers offline",…}

$ curl -i -X POST localhost:3001/api/incidents \
    -H 'Content-Type: application/json' -d '{"title":"","service":"toaster"}'
HTTP/1.1 400 Bad Request
{"error":{"code":"validation_failed",
          "message":"title must be 3-120 characters"}}
```

### Demo: watch axios talk to the API

#### Steps

1. Backend: `npm start`; frontend: `npm run dev`
2. Open `localhost:5173`, DevTools → Network
3. Create, rename (PUT), change status (PATCH), delete
4. Slow-request panel: Cancel, then let it time out

#### Expected observations

- `OPTIONS` preflights, then `201`, `200`, `204`

#### Fallback

In `frontend/`, run `npm test`.

**Sources**

- Course — [campuspulse-fullstack sample](samples/campuspulse-fullstack/README.md)

### Predict what the user sees, and which part of the code decides it

1. The API is stopped and the page loads.
2. A user submits a new incident with the title "Hi".
3. A user types "wifi" quickly into the search box on a slow network.

## Block C — Backend API and CORS

### Building the API the frontend calls: Express and CORS

Routes, status codes, one error shape, and the browser rule that decides who may read the answer

Block B wrote the calls. This block writes the program that answers them — and the
one browser rule that can make a perfectly good answer unreadable.

### Any language works: the contract is the same four things

| You need | Express (Node) | FastAPI (Python) | ASP.NET Core (C#) |
| --- | --- | --- | --- |
| A route | `app.get(path, h)` | `@app.get(path)` | `app.MapGet(path, h)` |
| JSON body in | `req.body` | typed parameter | typed parameter |
| Status + JSON out | `res.status(201).json(x)` | `status_code=201` | `Results.Created(…)` |
| Allow an origin | `cors(…)` | `CORSMiddleware` | `UseCors(…)` |

### Setup: two packages, one entry point, one port

```js title="backend/src/server.mjs" lines mark=5,6
// Entry point: node src/server.mjs  (PORT and CORS_ORIGINS are optional)
import { createApp } from "./app.mjs";
import { parseOrigins } from "./cors-options.mjs";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS);
const app = createApp({ allowedOrigins, log: (line) => console.log(line) });

app.listen(port, () => {
  console.log(`CampusPulse API on http://localhost:${port}/api`);
  console.log(`CORS allowlist: ${allowedOrigins.join(", ")}`);
});
```

- `npm install express cors` · `npm start` · `npm run dev` restarts on save (`node --watch`)
- Port and allowlist come from the **environment**, so production changes config, not code

### Middleware runs top to bottom, so order is a design decision

```js title="backend/src/app.mjs (inside createApp)" lines mark=1,4
  app.use(cors(corsOptions(allowedOrigins)));  // answers allowed preflights
  // A refused preflight falls through to here: 204 with no CORS headers.
  app.options("/{*any}", (req, res) => res.status(204).end());
  app.use(express.json({ limit: "16kb" }));     // JSON body -> req.body
  // ...request-id middleware (sets X-Request-Id on every response)...
  app.get("/api/healthz", (req, res) => res.json({ ok: true }));
  app.use("/api/incidents", incidentsRouter(store));
  // ...then the JSON 404, then the error handler (slide 7)
```

- **CORS first**, so even a 404 or a 400 carries the headers the browser needs to read it
- `express.json()` before routes, or `req.body` is `undefined`

### One resource, five methods, and the status code each returns

| Method + path | Does | Success | Fails with |
| --- | --- | --- | --- |
| `GET /incidents?status=&q=` | List | `200` `{ items, count }` | `400` |
| `GET /incidents/:id` | Read one | `200` | `404` |
| `POST /incidents` | Create | `201` + `Location` | `400` |
| `PUT /incidents/:id` | Replace | `200` | `400`, `404` |
| `PATCH /incidents/:id` | Set status | `200` | `400`, `404` |
| `DELETE /incidents/:id` | Remove | `204`, no body | `404` |

### A route handler: validate, act, then answer with status + JSON

```js title="backend/src/incidents.mjs" lines mark=4,5,8
// POST /api/incidents — create; 201 + Location header
router.post("/", (req, res) => {
  const body = requireObject(req.body);
  const incident = store.insert({
    title: readTitle(body),
    service: readService(body),
    status: "investigating",
  });
  res.status(201).location(`/api/incidents/${incident.id}`).json(incident);
});
```

- `readTitle` trims, checks 3–120 characters, else `throw bad("title must be 3-120 characters")`
- `bad(...)` is an `HttpError(400, "validation_failed", …)` — the error handler turns it into JSON

### Every error leaves in one JSON shape the frontend already reads

```js title="backend/src/app.mjs (error handler, last middleware)" lines mark=7,8,10
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof HttpError ? err.status : err.status ?? 500;
  const code = err instanceof HttpError ? err.code
    : err.type === "entity.parse.failed" ? "invalid_json"
    : err.type === "entity.too.large" ? "too_large"
    : "internal_error";
  const message = status >= 500 ? "unexpected server error" : err.message;
  if (status >= 500) log(`ERROR ${err.stack ?? err}`);
  res.status(status).json({ error: { code, message } });
});
```

- `{ error: { code, message } }` is exactly the `ErrorBody` type `toApiError` reads
- 5xx: log the stack, send a **generic** message — never leak internals

### CORS: who may read the answer

### Origin = scheme + host + port; change one and it is cross-origin

| Page origin | Request to | Same origin? |
| --- | --- | --- |
| `http://localhost:5173` | `http://localhost:5173/api` | **Yes** — nothing differs |
| `http://localhost:5173` | `http://localhost:3001/api` | **No** — port differs |
| `http://localhost:5173` | `http://127.0.0.1:5173/api` | **No** — host differs |
| `https://app.example.edu` | `http://app.example.edu/api` | **No** — scheme differs |
| `https://app.example.edu` | `https://api.example.edu` | **No** — host differs |

### The preflight: the browser asks first, then sends the real request

![Sequence diagram. On the left the browser at origin localhost 5173, on the right the API at localhost 3001. Step 1, the browser sends OPTIONS with Origin, Access-Control-Request-Method PATCH and Access-Control-Request-Headers content-type and x-request-id. Step 2, the API answers 204 with Access-Control-Allow-Origin, Allow-Methods, Allow-Headers and Max-Age 600. Step 3, the browser sends the real PATCH with a JSON body. Step 4, the API answers 200 with JSON and Access-Control-Allow-Origin, and JavaScript may read the response.](../../assets/class-notes/week04-session-s48-1.svg)

*A preflight is the browser asking permission before a non-simple request; the real request is only sent if the answer allows it*

### The policy: an exact allowlist, and the headers it permits

```js title="backend/src/cors-options.mjs (comments trimmed)" lines mark=4,6,8,9
export function corsOptions(allowedOrigins = DEFAULT_ORIGINS) {
  const allowed = new Set(allowedOrigins);
  return {
    origin(origin, done) {
      if (!origin) return done(null, true);
      done(null, allowed.has(origin)); // false = no CORS headers at all
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    exposedHeaders: ["Location", "X-Request-Id"], // readable by axios
    maxAge: 600, // the browser may cache a preflight answer for 10 minutes
  };
}
```

- `exposedHeaders` is why Block B's `createIncident` can read `Location`

### Allowed and refused preflights, side by side

```console title="real capture — sample API on localhost:3001, 2026-10-01 (Date/Connection omitted)"
$ curl -i -X OPTIONS localhost:3001/api/incidents/abc \
    -H 'Origin: http://localhost:5173' \
    -H 'Access-Control-Request-Method: PATCH'
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE
Access-Control-Allow-Headers: Content-Type,X-Request-Id
Access-Control-Max-Age: 600

$ curl -i -X OPTIONS localhost:3001/api/incidents/abc \
    -H 'Origin: http://localhost:5174' \
    -H 'Access-Control-Request-Method: PATCH'
HTTP/1.1 204 No Content
```

- Refused is not an error status: it is a 204 **with no `Access-Control-*` headers**
- `Vary: Origin` tells caches the answer depends on who asked

### Same request: curl gets the data, the browser refuses to hand it over

```console title="real capture — GET from a non-allowed origin, then Edge console on :5174"
$ curl -i localhost:3001/api/incidents -H 'Origin: http://localhost:5174'
HTTP/1.1 200 OK            ← no Access-Control-Allow-Origin header
Content-Type: application/json; charset=utf-8
{"items":[{"id":"…","title":"Synthetic printing delay",…}],"count":3}

Edge console on :5174 — Access to XMLHttpRequest at 'http://localhost:3001/
api/healthz' from origin 'http://localhost:5174' has been blocked by CORS
policy: Response to preflight request doesn't pass access control check: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

> **Failure to avoid**
>
> CORS is enforced by the **browser**. It is not authentication: curl, scripts and other
> servers ignore it entirely.

### CORS mistakes that ship to production

- **`origin: "*"` with cookies** — browsers reject it; reflecting any origin instead is a real vulnerability
- **Fixing CORS in the frontend** — headers only work when the *server* sends them; a browser extension "fix" hides the bug
- **Forgetting the deployed origin** — `CORS_ORIGINS=https://app.example.edu`, set per environment
- **Treating CORS as security for the API** — it is not; authenticate every request
- **Alternative in dev:** a Vite proxy makes the calls same-origin, so no CORS at all

### Demo: break CORS, read the error, fix it with configuration

#### Steps

1. Open `localhost:5174` (`npm run dev:wrong-origin`)
2. Red banner; console shows the CORS message
3. Restart API with `CORS_ORIGINS` including `:5174`
4. Reload `:5174` — it works, no code changed

#### Expected observations

- Preflight gains `Allow-Origin: http://localhost:5174`

#### Fallback

The real captures on slides 12–13.

**Sources**

- Course — [campuspulse-fullstack sample](samples/campuspulse-fullstack/README.md)

### Which layer is wrong, and what is the smallest fix?

1. The deployed app at `https://app.example.edu` shows a "network error"; curl to the API returns 200.
2. Creating an incident works, but `createIncident` returns `location: undefined`.
3. Every failed POST shows "network error" instead of the server's validation message.

## Individual practice

### Individual lab: HTTPS to deployment

**Predict before each command, then compare with the result.**

| Part | Focus | Min |
| --- | --- | ---: |
| 1 | Negotiated HTTP version | 5 |
| 2 | Reconstruct a certificate chain | 7 |
| 3 | Diagnose three failure reports | 8 |
| 4 | Your domain's CT record | 4 |
| 5 | Deploy, fail a gate, roll back | 11 |

**Sources**

- Course — [Week 4 guided lab: full commands, expected output, and offline fallbacks](lab.md)

## Homework brief

### The budget alert is this week's gate, and it comes first

- Configure a cloud budget alert **before** you provision anything that bills
- Set the threshold at a number that would genuinely alarm you — for most of you, low
- Alert at **50%, 80% and 100%**, to an address you actually read
- **Screenshot the configured alert.** That screenshot is a graded HW4 artifact
- No budget alert means no cloud-hosted work — this gate is not negotiable

> **Key idea**
>
> Five minutes, zero dollars, and it is the difference between finding out in a day and
> finding out on the invoice.

### HW4 — Connect It: frontend, API, HTTPS

**100 points · individual · due before Week 5 · Gate 2.**

#### Connect it

- API status codes, one error shape
- Exact CORS allowlist
- One axios client, one `ApiError`

#### Ship and trust it

- Live over HTTPS, read-only
- Digest deploy + rollback
- Your chain + a fired alert

**Sources**

- Course — [HW4 handout](homework.md) · [evidence standard](../../docs/evidence-standard.md)

## Closing logistics

### Before you leave

#### Exit ticket — one line

- Name one command that would settle: *"our API is slow on mobile because HTTP/3 is
  disabled."*

#### Before Week 5

- **HW4 is due before Week 5** — start with the budget alert tonight, not the certificate
- Complete the [Week 5 prep](../week05/prep.md) before class: delivery, caching, and
  what the user actually experiences

# Week 4 — Guided lab

**Protocol negotiation, chain reconstruction, failure diagnosis, CT lookup, and a
rollback you actually run.**
35 minutes, in five parts. Individual work throughout — write your own prediction and
run every command yourself. Last verified: 2026-08-15.

> **Everything in this lab was run for real on 2026-08-15.** Parts 1–4 hit live systems;
> part 5 is a real HTTP client-server exchange on your own machine. Every "expected
> output" block below is a genuine capture, not an illustration — though live data such
> as the CT rows will have moved on by the time you run it. If your output differs, that
> is information: read [§ Troubleshooting](#troubleshooting) before assuming you did it
> wrong.

---

## 0. Toolchain check — do this **before** class *(5 min)*

You need `curl` **with HTTP/2 support** and `openssl`. Check:

```bash
curl --version      # read the "Features:" line
openssl version
```

You are looking for `HTTP2` in the `Features:` list.

### Check features, not just the operating system

Some Windows curl builds lack HTTP/2 and HTTP/3; Schannel itself does not determine
that. The following is the **dated captured build**, not a claim about every installation:

```console
$ curl --version
curl 8.21.0 (x86_64-w64-mingw32) libcurl/8.21.0 Schannel zlib/1.3.2 ...
Features: alt-svc AsynchDNS brotli HSTS HTTPS-proxy IDN IPv6 Kerberos
          Largefile libz NTLM PSL SPNEGO SSL SSPI threadsafe UnixSockets zstd
                                       ^ no HTTP2, no HTTP3

$ curl --http2 https://www.cloudflare.com/
curl: option --http2: the installed libcurl version does not support this
```

Pick **one** supported route, before class. If installation is blocked, use a
browser's Network Protocol column or `samples/curl-protocol-compare.txt` with
explicit provenance; the comparison still earns full credit:

| Option | Command | Notes |
| --- | --- | --- |
| **WSL** (recommended) | `wsl -e curl --version` | Ubuntu's curl has `HTTP2`. Prefix every step-1 command with `wsl -e`. |
| **Git Bash** | open Git Bash, `curl --version` | Ships an OpenSSL-backed curl on most installs — **check the Features line**, some builds lack HTTP2. |
| **Docker** | `docker run --rm curlimages/curl --version` | You already have Docker from HW3. |

`openssl.exe` on Windows *is* fine — Git for Windows and the standalone OpenSSL build
both work. Only two syntax differences matter, because PowerShell has no `<`:

| Unix | PowerShell equivalent |
| --- | --- |
| `openssl s_client … </dev/null` | `cmd /c "openssl s_client … <NUL"` |
| `cmd \| grep foo` | `cmd \| Select-String foo` |

### Nobody has `--http3`, and that is fine

Stock curl on Windows, macOS **and** most Linux distributions is built without HTTP/3 —
it requires a custom build against quiche or ngtcp2. WSL's curl 8.5.0, for example,
reports `HTTP2` but not `HTTP3`. **Step 1 does not require `--http3`.** You will prove
an HTTP/3 **advertisement** by reading `alt-svc`. This does not demonstrate a
negotiated or reachable HTTP/3 connection.

---

## 1. Which protocol did you actually get? *(5 min)*

### 1.1 Force each version and compare

```bash
curl -sS -o /dev/null --http1.1 \
  -w 'version=%{http_version} code=%{http_code}\n' https://www.cloudflare.com/

curl -sS -o /dev/null --http2 \
  -w 'version=%{http_version} code=%{http_code}\n' https://www.cloudflare.com/
```

**Expected — real output:**

```console
version=1.1 code=200
version=2 code=200
```

> `--http1.1` restricts curl to HTTP/1.1; `--http2` requests HTTP/2 but can
> fall back to HTTP/1.1. Read `%{http_version}` and the ALPN result.

### 1.2 Watch ALPN choose

```bash
curl -sS -o /dev/null -v --http2 https://www.depaul.edu/ 2>&1 | grep -i 'alpn\|using HTTP'
```

**Expected — real output:**

```console
* ALPN: curl offers h2,http/1.1
* ALPN: server accepted h2
* using HTTP/2
```

### 1.3 Find HTTP/3 without an HTTP/3 client

```bash
curl -sSI https://www.cloudflare.com/ | grep -i 'alt-svc\|HTTP/'
```

**Expected — real output:**

```console
HTTP/2 103
HTTP/2 200
alt-svc: h3=":443"; ma=86400
```

Two things to notice and write down:

- `alt-svc: h3=":443"` is the server saying *"I also speak HTTP/3 here; remember that
  for 86 400 seconds."* This is the usual way a browser discovers HTTP/3. (A DNS `HTTPS`
  record can also advertise it, before the first connection.) **It proves the server
  advertises H3 — not that H3 works from where you are sitting.**
- `HTTP/2 103` is an **Early Hints** response arriving before the real `200`. One
  request, two response heads.

**✅ Checkpoint:** use the example or an already-live assigned hostname in class.
Your Week 3 container may not have public TLS yet—that is HW4's task.
Repeat against your own deployment after the [runbook](../../docs/deployment-runbook.md).
Separate negotiated version from h3 advertisement in the evidence.

---

## 2. Reconstruct a real chain *(7 min)*

### 2.1 Dump the chain the server actually sends

```bash
openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu \
  -showcerts -alpn h2,http/1.1 </dev/null 2>&1 \
  | grep -E 'depth=|^Certificate chain|^ [0-9] s:|^   [iv]:|Verification|ALPN protocol|Verify return code'
```

*PowerShell:* `cmd /c "openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu -showcerts <NUL 2>&1" | Select-String 'depth=|Certificate chain|^ \d s:|^   [iv]:|Verif|ALPN'`

Drop the `grep` to see the raw `-showcerts` output, which also includes the PEM blocks —
those are the certificates themselves, base64-encoded.

**Expected — real output (verified on OpenSSL 3.0.13 and 3.5.7):**

```console
depth=3 C = US, O = Internet Security Research Group, CN = ISRG Root X1
depth=2 C = US, O = ISRG, CN = Root YR
depth=1 C = US, O = Let's Encrypt, CN = YR2
depth=0 CN = www.depaul.edu
Certificate chain
 0 s:CN = www.depaul.edu
   i:C = US, O = Let's Encrypt, CN = YR2
   v:NotBefore: Jul 22 18:05:32 2026 GMT; NotAfter: Oct 20 18:05:31 2026 GMT
 1 s:C = US, O = Let's Encrypt, CN = YR2
   i:C = US, O = ISRG, CN = Root YR
   v:NotBefore: Sep  3 00:00:00 2025 GMT; NotAfter: Sep  2 23:59:59 2028 GMT
 2 s:C = US, O = ISRG, CN = Root YR
   i:C = US, O = Internet Security Research Group, CN = ISRG Root X1
   v:NotBefore: May 13 00:00:00 2026 GMT; NotAfter: Sep  2 23:59:59 2032 GMT
Verification: OK
ALPN protocol: h2
Verify return code: 0 (ok)
```

> **Spacing differs by OpenSSL version.** 3.0.x (Ubuntu, WSL) prints `CN = www.depaul.edu`;
> 3.5.x (recent Windows/Homebrew builds) prints `CN=www.depaul.edu`. Same certificate.
> If a `grep` pattern of yours suddenly matches nothing, this is usually why.

**Answer these three, in writing:**

1. The server sent **three** certificates (`0`, `1`, `2`). The verification trace shows
   **four** depths. Where did `depth=3` come from?
2. Follow the `i:` (issuer) lines upward. Confirm each certificate's issuer is the next
   certificate's subject. That is the chain.
3. `notAfter − notBefore` on the leaf is 90 days. What does that tell you about how this
   certificate is managed?

> **Answers, so you are not stuck:** (1) your own trust store — the root is never sent
> on the wire. (2) leaf ← YR2 ← Root YR ← ISRG Root X1. (3) it must be automated.

### 2.2 Read just the fields you need

```bash
openssl s_client -connect www.depaul.edu:443 -servername www.depaul.edu 2>/dev/null \
  </dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName -serial
```

**Expected — real output:**

```console
subject=CN = www.depaul.edu
issuer=C = US, O = Let's Encrypt, CN = YR2
notBefore=Jul 22 18:05:32 2026 GMT
notAfter=Oct 20 18:05:31 2026 GMT
X509v3 Subject Alternative Name:
    DNS:www.depaul.edu
serial=052BCEC3A1F722A7D16EC6BF11A481CE3438
```

**Keep this command.** It is the one you will use for the rest of the quarter, and its
output (or the Windows `tls-inspect.ps1` equivalent) feeds HW4 Task 6.

**✅ Checkpoint:** save the example outputs now; repeat on your own domain after
HW4 provisions its certificate. An absent pre-HW4 certificate is not a missed prerequisite.

---

## 3. Diagnose three failures from the error text alone *(8 min)*

`badssl.com` runs deliberately broken endpoints. All five below were verified live on
2026-08-15.

**For each host: write down your predicted failure first, then run it.** Do not skip
the prediction — the point of this step is calibration, not command execution.

```bash
for h in expired.badssl.com wrong.host.badssl.com incomplete-chain.badssl.com; do
  echo "=== $h ==="
  curl -sS -o /dev/null "https://$h/" 2>&1 | head -1
done
```

**Expected — real output:**

```console
=== expired.badssl.com ===
curl: (60) SSL certificate problem: certificate has expired
=== wrong.host.badssl.com ===
curl: (60) SSL: no alternative certificate subject name matches target host name
      'wrong.host.badssl.com'
=== incomplete-chain.badssl.com ===
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

### 3.1 Now prove each diagnosis with `openssl`

```bash
openssl s_client -connect incomplete-chain.badssl.com:443 \
  -servername incomplete-chain.badssl.com -showcerts </dev/null 2>&1 \
  | grep -E 'depth=|verify error|^Certificate chain|^ [0-9] s:|^   i:|Verify return code' | head -8
```

**Expected — real output:**

```console
depth=0 CN = *.badssl.com
verify error:num=20:unable to get local issuer certificate
verify error:num=21:unable to verify the first certificate
Certificate chain
 0 s:CN = *.badssl.com
   i:C = US, O = Let's Encrypt, CN = YR2
Verify return code: 21 (unable to verify the first certificate)
```

**The chain list has exactly one entry.** The server named its issuer (`i:`) but did not
send it. That absence is the whole diagnosis.

Compare `expired.badssl.com`, whose chain is *complete* but whose leaf is 11 years stale:

```console
 0 s:OU = Domain Control Validated, OU = PositiveSSL Wildcard, CN = *.badssl.com
   v:NotBefore: Apr  9 00:00:00 2015 GMT; NotAfter: Apr 12 23:59:59 2015 GMT
verify error:num=10:certificate has expired
```

### 3.2 The trap: two tools, two different questions

```bash
H=wrong.host.badssl.com
openssl s_client -brief -connect $H:443 -servername $H </dev/null 2>&1 | grep Verif
openssl s_client -brief -connect $H:443 -servername $H -verify_hostname $H </dev/null 2>&1 | grep -i 'verif\|mismatch'
```

**Expected — real output:**

```console
Verification: OK                          <- first command
verify error:num=62:hostname mismatch     <- second command
Verification error: hostname mismatch
```

> **`openssl s_client` does not check the hostname unless you ask it to.** It validated
> the *chain* and reported OK. `curl` checks both and refused. When two tools disagree,
> they are usually answering different questions.

Confirm why, with the SAN:

```bash
openssl s_client -connect $H:443 -servername $H 2>/dev/null </dev/null \
  | openssl x509 -noout -ext subjectAltName
```

```console
X509v3 Subject Alternative Name:
    DNS:*.badssl.com, DNS:badssl.com
```

`*.badssl.com` matches **one** label. `wrong.host.badssl.com` has two. No match.

### 3.3 Write the error-number table into your notes

| `verify error:num=` | Meaning | The real fix |
| ---: | --- | --- |
| **10** | certificate has expired | Renew — then find out why renewal did not run |
| **20** | unable to get local issuer certificate | Serve the **full chain**, not just the leaf |
| **21** | unable to verify the first certificate | Same cause as 20, seen from the other end |
| **62** | hostname mismatch | Reissue with the correct SAN |

None of these is fixed by `--insecure`. All four are on the Week 6 midterm.

---

## 4. Find your own domain in a Certificate Transparency log *(4 min — the first thing to cut if you are behind)*

Every publicly-trusted certificate must be logged. That means every certificate ever
issued for your domain is a public record you can query.

```bash
curl -sS 'https://crt.sh/?q=depaul.edu&output=json&exclude=expired&match=%3D' \
  | head -c 400
```

Or just open <https://crt.sh/?q=depaul.edu&exclude=expired&match=%3D> in a browser.

> **Use the `&match=%3D` (exact-match) form.** During authoring, the plain
> `?q=depaul.edu` form timed out and `?q=depaul.edu&exclude=expired` returned a 404,
> while the exact-match form returned 200. crt.sh is one volunteer-run service and it is
> genuinely flaky.

**Expected — real output, author-captured on 2026-08-15 and reformatted for reading. The
raw command emits JSON, and these rows will have changed by the time you run it:**

```console
entries returned: 9

crt.sh id     issuer                                     not_before   not_after
28201765906   C=US, O=Let's Encrypt, CN=YR2              2026-07-24   2026-10-22
28201759287   C=US, O=Let's Encrypt, CN=YR2              2026-07-24   2026-10-22
26532101078   C=US, O=Let's Encrypt, CN=R13              2026-05-21   2026-08-19
24475081130   C=US, O=Amazon, CN=Amazon RSA 2048 M04     2026-02-17   2027-03-18
21548372354   C=US, O=Internet2, CN=InCommon ECC Server  2025-10-07   2026-11-07
```

**Three things to notice:**

1. The top two rows are identical apart from the id. That is a **precertificate and its
   certificate** — normal, not a duplicate issuance. (Not every duplicate pair is; CAs
   also log to several logs.)
2. `depaul.edu` has live certificates from **three different CAs** — Let's Encrypt,
   Amazon and InCommon. That is what a real organization looks like, and it is exactly
   why a careless CAA record breaks things (step 4.2).
3. Any certificate here that *you* did not request is worth **investigating** — it may be
   your CDN or infrastructure you forgot you had running, or it may be a compromise of
   your DNS, registrar or CA account.

### 4.1 Now look up your own domain

Do it. If you find a certificate you do not recognize, tell the instructor.

### 4.2 Check the CAA record — yours and DePaul's

```bash
dig +short CAA github.com
dig +short CAA depaul.edu
```

*No `dig`?* Use `https://cloudflare-dns.com/dns-query?name=github.com&type=CAA` with an
`accept: application/dns-json` header, or any DoH web UI.

**Expected — real output:**

```console
$ dig +short CAA github.com
0 issue "digicert.com"
0 issue "globalsign.com"
0 issue "letsencrypt.org"
0 issuewild "digicert.com"

$ dig +short CAA depaul.edu
                          <- empty. No CAA record. Any public CA may issue.
```

> Our own university has not set one. You set yours in HW2 and re-check it in HW4
> Task 6 — and given what step 4 just
> showed you about DePaul using three CAs, you now know why writing that record
> carelessly is how you break a renewal six weeks from now.

---

## 5. Deploy, watch the gate stop you, roll back *(11 min)*

You will build the real GitHub Actions version in HW4. Here you run the **shape** of it,
offline, in ninety seconds, so that the HW4 version is your second attempt and not your
first.

`samples/deploy-sim.mjs` runs a real HTTP server on `127.0.0.1` and makes real HTTP
requests to it. The health gate is a genuine network check.

### 5.1 The happy path

```bash
cd weeks/week04/samples
node deploy-sim.mjs
```

**Expected — real output:**

```console
[cluster  ] live release v1.0.0 digest sha256:2485f4d55aae6c5b073114bc
[test     ] npm test ................................. 12 passed, 0 failed
[build    ] built v1.1.0
[build    ] digest sha256:0351e58a8e1677f197d37d18   <- deployed, not the tag
[build    ] previous digest recorded for rollback: sha256:2485f4d55aae6c5b073114bc
[deploy   ] rolling out sha256:0351e58a8e1677f197d37d18
[gate     ] attempt 1/6: HTTP 200 digest=sha256:0351e58a8e… | status-only gate: PASS | digest gate: PASS
[result   ] DEPLOY SUCCEEDED. live digest sha256:0351e58a8e1677f197d37d18

pipeline exit code: 0
```

### 5.2 The trap: a rolling deploy

Almost every modern platform deploys **rolling**, with zero downtime. That means for the
first few seconds the load balancer is still routing to the *old* instance — which is
perfectly healthy.

```bash
node deploy-sim.mjs --rolling
```

**Expected — real output:**

```console
[cluster  ] ROLLING cutover: the old instance keeps serving during rollout
[deploy   ] rolling out sha256:0351e58a8e1677f197d37d18
[gate     ] attempt 1/6: HTTP 200 digest=sha256:2485f4d55a… | status-only gate: PASS | digest gate: WAIT old release answering
[gate     ] attempt 2/6: HTTP 200 digest=sha256:2485f4d55a… | status-only gate: PASS | digest gate: WAIT old release answering
[gate     ] attempt 3/6: HTTP 200 digest=sha256:2485f4d55a… | status-only gate: PASS | digest gate: WAIT old release answering
[gate     ] attempt 4/6: HTTP 200 digest=sha256:0351e58a8e… | status-only gate: PASS | digest gate: PASS
[result   ] DEPLOY SUCCEEDED. live digest sha256:0351e58a8e1677f197d37d18
```

> **Look at attempts 1–3.** A health gate that only asks *"did I get a 200?"* would have
> declared success on attempt 1 — while the release it just deployed had not started
> serving a single request. If that release were broken, the pipeline would have gone
> green anyway and the crash-loop would have been invisible.
>
> **The fix is one field.** `/healthz` reports which digest is answering, and the gate
> checks for the digest it just deployed. This is HW4 rubric item B4.

### 5.3 The path that matters

```bash
node deploy-sim.mjs --broken
```

**Expected — real output (abridged):**

```console
[build    ] built v1.1.0-bad
[build    ] previous digest recorded for rollback: sha256:2485f4d55aae6c5b073114bc
[deploy   ] rolling out sha256:5fd9beebe2624ea65afbf27b
[gate     ] attempt 1/6: HTTP 503 digest=sha256:5fd9beebe2… | status-only gate: FAIL | digest gate: FAIL unhealthy
...
[gate     ] all 6 attempts failed -> FAIL
[rollback ] health gate failed; rolling back to sha256:2485f4d55aae6c5b073114bc
[gate     ] attempt 1/6: HTTP 200 digest=sha256:2485f4d55a… | status-only gate: PASS | digest gate: PASS
[result   ] DEPLOY FAILED and was ROLLED BACK. live digest sha256:2485f4d55aae6c5b073114bc
[result   ] service is serving again

pipeline exit code: 1
```

### 5.4 Self-check, in writing — these rehearse HW4 Task 5

1. The rollback **succeeded**, and the pipeline still **exited 1**. Why is that correct?
2. In the `--rolling` run, what exactly would a status-only gate have gotten wrong, and
   what is the smallest change to `/healthz` that fixes it?
3. The rollback target is a **digest**, not the tag `v1.0.0`. Why does that distinction
   matter, given what you learned about `:latest` in Week 3?
4. `previous digest recorded for rollback` happens **before** the deploy. What breaks if
   you try to record it afterwards?
5. If the health gate had checked the database instead of the process, and the database
   blipped for 4 seconds, what would this pipeline have done — and would that have been
   right?

> **Answers.** (1) A deploy that did not ship is a failed deploy; a green pipeline would
> tell you a broken release went out fine. (2) It would have passed on the *old*
> instance's 200 and never noticed the new release was not serving; the fix is to have
> `/healthz` return the running digest and grep for it. (3) A tag is a mutable pointer —
> it may now point at the broken image. (4) The deploy has already overwritten "current",
> so you no longer have a name for the thing to go back to. (5) It would have rolled back
> a perfectly good release. Liveness must not depend on anything outside the process;
> **readiness** is where dependency checks belong.

**✅ Deliverable for the exit ticket:** paste the last three lines of your `--broken`
run, plus one sentence naming which gate stopped the deploy.

---

## Troubleshooting

### `curl: option --http2: the installed libcurl version does not support this`
Your curl is built without HTTP/2 — almost certainly Windows' bundled Schannel build.
See [§0](#0-toolchain-check--do-this-before-class-5-min). Use `wsl -e curl`, Git Bash, or
`docker run --rm curlimages/curl`.

### `openssl s_client` just sits there and never returns
It is waiting on stdin. Give it EOF: `</dev/null` on Unix, or
`cmd /c "openssl … <NUL"` in PowerShell. `Ctrl+C` also works but is untidy.

### `The '<' operator is reserved for future use.`
PowerShell has no input redirection. Wrap the command:
`& $env:ComSpec /c 'openssl s_client -connect host:443 <NUL 2>&1'`.

### The certificate I get back is for a domain I have never heard of
You omitted `-servername`. `openssl s_client` does **not** send SNI automatically, so a
shared-IP host handed you its default certificate. Always pass
`-servername <the same host>`.

### `openssl` output looks different from the examples
OpenSSL 3.0.x (Ubuntu, WSL, most current Linux) prints distinguished names with spaces —
`CN = www.depaul.edu`. OpenSSL 3.5.x (recent Windows and Homebrew builds) prints
`CN=www.depaul.edu`. Same certificate, different formatting. Every command in this lab
was verified on **both**. If a `grep` of yours matches nothing, loosen the pattern.

### crt.sh returns a Postgres error, a 502, or times out
Known and common — it is one volunteer-run service. Real error text seen during
authoring: `FATAL: terminating connection due to conflict with recovery`. Retry two or
three times, then fall back to:
- <https://transparencyreport.google.com/https/certificates> (Google's CT search), or
- <https://search.censys.io/> (free account required), or
- the captured output in [`samples/ct-log-depaul.txt`](samples/ct-log-depaul.txt).

### A badssl.com endpoint does not fail the way this document says
All five were verified live on 2026-08-15, but badssl is a free community service and
does go down. Fall back to [`samples/badssl-diagnoses.txt`](samples/badssl-diagnoses.txt),
which has the full captured output for all five hosts, and run the diagnosis exercise
against that.

### `node deploy-sim.mjs` fails with `EADDRINUSE`
Something is already on port 8088. Use `node deploy-sim.mjs --port 8099`.

### I have no network at all
Every step has a captured transcript in [`samples/`](samples):
`curl-protocol-compare.txt`, `openssl-chain-good.txt`, `badssl-diagnoses.txt`,
`ct-log-depaul.txt`, `caa-and-headers.txt`. Step 5 needs no network at all — it is
entirely local.

---

## What you should walk out with

- [ ] The negotiated HTTP version for **your own domain**, and whether it advertises `h3`
- [ ] A full `-showcerts` chain dump for **your own domain**
- [ ] The four `verify error:num=` codes and what each one actually means
- [ ] Your domain's CT log history, and whether anything in it surprises you
- [ ] Your domain's CAA record status (set in HW2; re-checked in HW4 Task 6)
- [ ] The last three lines of a failed-and-rolled-back pipeline run

# Week 4 — Pre-class prep

**CSC 436 — Web Application Systems** · ~45 minutes · complete **before** class
Last verified: 2026-10-01

> **Why this is flipped.** Class time is spent on things you cannot do alone: reading
> real network evidence, arguing about trust claims, watching frontend API calls in
> DevTools, and diagnosing CORS. The mechanics below are things you can absorb from a
> screen. Do them first.

---

## Core set — assigned, ~45 minutes

Do these five, in this order. The order matters: HTTP first, then TLS, then the API code
that rides on top of the connection.

| # | Title | Publisher | Type | Time |
| --- | --- | --- | --- | ---: |
| 1 | [HTTP/2](https://hpbn.co/http2/) — *High Performance Browser Networking*, Ch. 12 | Ilya Grigorik | Book chapter (free) | 15 min |
| 2 | [What is HTTP/3?](https://www.cloudflare.com/learning/performance/what-is-http3/) | Cloudflare Learning Center | Article | 7 min |
| 3 | [How HTTPS Works — The Handshake](https://howhttps.works/the-handshake/) | howhttps.works | Interactive comic | 10 min |
| 4 | [What Happens in a TLS Handshake?](https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/) | Cloudflare Learning Center | Article | 7 min |
| 5 | [Axios intro](https://axios-http.com/docs/intro) + [MDN CORS guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) | Axios / MDN | Docs | 6 min |

**Total: 45 minutes.**

**If Cloudflare items 2 or 4 cannot be opened:** substitute
[the course-written HTTP/TLS overview](reference.md#http-versions-and-a-tls-handshake)
for that item's reading time. It covers the required version and handshake
distinctions. The same reference defines optional mTLS vocabulary. This is an
equivalent path, not extra reading or a reduced-credit option.

### What to look for in each

1. **HPBN Ch. 12.** Skim the binary framing detail. What you need is: *why* one
   connection with many streams beats six connections, and what HPACK does. You do not
   need the Huffman table.
2. **HTTP/3.** One question only: what problem does QUIC solve that HTTP/2 could not?
3. **The handshake comic.** Read it twice — it is ten minutes and it is the clearest
   explanation of the handshake that exists.
4. **Cloudflare TLS handshake.** Cross-check the comic against a prose version. Note
   where TLS 1.3 differs from 1.2 in *number of round trips*.
5. **Axios + CORS.** For axios, notice `baseURL`, `timeout`, and how responses/errors are
   shaped. For CORS, focus on the same-origin rule, preflight, and which headers the
   server must send.

---

## Reference only — do **not** read in full

These are here so you know where to look, not so you can read them all. They are tested
at **recognition level only** — you should know what each topic *is*, not how to
implement it. This is deliberate: per the course's depth direction, revocation mechanics
and mTLS internals are not lectured.

| # | Title | Publisher | Use it for |
| --- | --- | --- | --- |
| 6 | [How Let's Encrypt Works](https://letsencrypt.org/how-it-works/) | ISRG / Let's Encrypt | HW4 certificate automation background |
| 7 | [Express](https://expressjs.com/) | Express | Recognizing route and middleware vocabulary |
| 8 | [`cors` npm package](https://github.com/expressjs/cors) | expressjs | Seeing the CORS middleware options used in Block C |

---

## Optional enrichment

Only if you have time and appetite. Nothing here is assessed.

- Let's Encrypt — [Why ninety-day lifetimes?](https://letsencrypt.org/2015/11/09/why-90-days.html)
  (the 2015 rationale) and [Certificate lifetimes](https://letsencrypt.org/docs/cert-lifetimes/)
  (what is true now).
- CA/Browser Forum — [Ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/),
  the schedule that takes maximum certificate lifetimes to 47 days by March 2029.
- IETF — [RFC 9110 (HTTP semantics)](https://www.rfc-editor.org/rfc/rfc9110.html),
  [RFC 9113 (HTTP/2)](https://www.rfc-editor.org/rfc/rfc9113.html),
  [RFC 9114 (HTTP/3)](https://www.rfc-editor.org/rfc/rfc9114.html),
  [RFC 8446 (TLS 1.3)](https://www.rfc-editor.org/rfc/rfc8446.html).

> **A note on the links.** Cloudflare Learning Center pages (items 2, 4, 7) may
> return HTTP 403 to automation while remaining available in a browser. That is
> not proof of a dead link. Use the course-written alternative if access fails;
> do not spend prep time troubleshooting a publisher's access controls.

---

## Before you arrive: a five-minute toolchain check

You will run commands in class. Find out now whether you can.

```bash
curl --version          # look at the "Features:" line
node --version          # Blocks B/C require Node 20.19+; course standard is Node 24
```

For a live curl HTTP/2 comparison, `HTTP2` must appear in its `Features:` line. This
depends on the **build**, not the operating system or Schannel alone. Use the browser
Protocol column, the course shell or the supplied transcript if the feature is missing;
no last-minute WSL installation is required. On Windows, type `curl.exe` when you really
mean curl; `curl` may be a PowerShell alias.

You do **not** need OpenSSL for the lecture. Windows certificate inspection uses the
course PowerShell/.NET script. macOS/Linux OpenSSL commands appear as reference paths and
may still show up in the lab handout.

Almost nobody's `curl` has `HTTP3`. That is expected and the lab does not require it.

---

## Readiness check — 5 questions

Answer before class. Two minutes. It is graded on completion, not correctness — the
point is to find out what you did not absorb while there is still time to fix it.

**1.** HTTP/2 lets many requests share one connection. A single lost TCP packet still
delays *all* of them. Why?

**2.** In TLS 1.3, is the server's certificate sent encrypted or in the clear? Name one
thing that *is* still sent in the clear during the handshake.

**3.** Your server sends only its own (leaf) certificate. Your laptop loads the site
fine; your phone shows a security warning. What is misconfigured, and why do the two
devices disagree?

**4.** A React app at `http://localhost:5173` calls an API at
`http://localhost:3001`. Is that same-origin? What browser rule decides whether
JavaScript may read the answer?

**5.** Axios receives a failure. What is the difference between `error.response` being
present and absent?

---
---

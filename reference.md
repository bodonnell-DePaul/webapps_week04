# Week 4 public reference — deployment and trust evidence

The [deployment runbook](../../docs/deployment-runbook.md) is the complete public
walkthrough from local app to course-host staging, custom DNS, reverse proxy,
ACME, renewal, rollback and teardown. Use it during HW4; it is not extra prep.
Private speaker notes are not needed to execute that path.

## HTTP versions and a TLS handshake

HTTP methods, status codes and resource semantics remain recognizable across
versions. HTTP/1.1 commonly uses multiple TCP connections for concurrency.
HTTP/2 multiplexes streams over one TCP connection, but TCP must deliver bytes
in order: losing bytes can delay otherwise independent HTTP streams.
HTTP/3 uses QUIC over UDP. QUIC provides reliability, encryption and separate
stream delivery, reducing cross-stream transport head-of-line blocking from
loss. Shared congestion control and dependencies can still affect several
streams; HTTP/3 is not a guarantee that every site becomes faster.

A typical new TLS 1.3 connection starts with a ClientHello offering versions,
algorithms and key-share material, then a ServerHello selecting parameters.
Subsequent handshake messages—including the server certificate—are encrypted.
The client validates the chain, hostname and validity and verifies the
handshake before trusting application data. The private key is not sent.
Without ECH, ClientHello metadata such as SNI is normally visible; encryption
of page content does not imply that every connection detail is hidden.

Ordinary TLS 1.3 establishment generally needs one handshake round trip after
TCP setup; older TLS 1.2 handshakes commonly need two. Resumption changes this
sequence. Optional 0-RTT early data has replay risk and is not suitable for
arbitrary state-changing requests. These counts describe a protocol pattern,
not a promise about a browser waterfall with DNS, network loss and application work.

ALPN helps select an application protocol during connection establishment.
The client must report the negotiated result. `Alt-Svc` advertises another
service endpoint/protocol; it does not prove the client reached it.

In ordinary server-authenticated HTTPS, the server presents a certificate and
the client validates it. **Mutual TLS (mTLS)** also authenticates the client
using a client certificate. Application permissions still require an
authorization policy; possessing a certificate does not automatically authorize
every action. mTLS is recognition-level material, not a required setup exercise.

## Separate the questions

| Question | Evidence |
| --- | --- |
| Does DNS identify the intended target? | Authority plus resolver observations |
| Does this connection negotiate the expected HTTP version? | Client's reported version / browser Protocol column |
| Does the endpoint advertise h3? | Alt-Svc or applicable HTTPS DNS record — advertisement only |
| Does a normal client trust this HTTPS endpoint? | Chain, SAN hostname, validity and trust-anchor verification |
| Did the new release answer? | Health status **and exact release identity**, correlated with inspected deployment image |
| Will certificate renewal keep working? | Config/timer/provider ownership, logs and an external expiry alert that has fired |

`--http2` can fall back. `--http3` can fall back. Missing curl features are a
build limitation, not proof of missing server capability. Use the documented
browser/course-shell/fixture fallback and label untested negotiation honestly.

## TLS operation

SNI selects a virtual host; hostname verification checks its certificate's SAN.
Modern OpenSSL can infer SNI from a DNS-name `-connect`; use `-servername`
explicitly for an intended name and `-noservername` to deliberately omit it.
`s_client` does not verify hostname by default; use `-verify_hostname` and
`-verify_return_error` for a validating probe.

Servers normally send leaf plus intermediates. Sending a root would not make it
trusted: the client needs a trusted anchor already. Browser/OS/enterprise trust
policy can differ. Do not globally trust an unknown root or disable verification
as an outage repair.

If the server omits an intermediate, a client that cached it or can fetch it
through the certificate's AIA information may still connect, while another
client fails. The operational repair is to serve the needed intermediate chain,
not to tell every visitor to weaken certificate checking.

ACME verifies domain control, not application quality. CA staging certificates
are deliberately untrusted; the application staging site ultimately needs
ordinary trusted HTTPS. Inspect actual lifetime and issuer policy; ninety days
and a twenty-one-day warning threshold are fixture examples, not universal rules.

## X-Forwarded-Proto behind TLS termination

When a reverse proxy terminates public HTTPS and forwards to an HTTP origin,
the origin's direct connection is plaintext even though the browser used HTTPS.
`X-Forwarded-Proto: https` is one common way the proxy communicates the original
scheme. The app may need that information for secure redirects and absolute URLs.
Without a correctly configured trusted-proxy path, an app can keep redirecting
an already-HTTPS visitor back to HTTPS.

The header is **not proof by itself**: clients can send headers too. Accept it
only through the configured trusted immediate proxy, ensure that proxy
overwrites untrusted incoming values, and prevent an untrusted direct-origin
route. Inspect the public response chain, proxy configuration and the origin's
observed scheme together. Do not trust every sender or every forwarded-header
entry merely to make a redirect loop disappear.

## If a small request works but a larger one hangs

A handshake does not rule out every path problem. PMTUD relies on appropriate
ICMP feedback when a path's MTU is smaller than expected; filtering IPv4
"fragmentation needed" or IPv6 "Packet Too Big" can stall larger transfers.
Compare bounded small/large requests only on authorized staging and inspect
retransmissions/ICMP with the network owner. Do not change global MTUs or disable
firewalls to force success. IPv6 also relies on ICMPv6 Neighbor Discovery.

## Cost, access and release boundaries

Use the course-provisioned host if personal cloud/card access is unavailable.
Budget alerts notify; they are not caps. Record quotas and teardown ownership.
Before Week 8, public applications must be read-only or access-controlled;
an unlinked hostname and HTTPS are not authorization.

The local deployment simulator exercises real loopback HTTP checks, not cloud
builds or certificate issuance. Reuse its reasoning, not its simulated output
as public deployment evidence.

Use the [HW4 supplied CORS and release draft](../../docs/non-ai-review-artifacts.md#hw4---cors-and-release-draft)
for the no-personal-AI route, following the equivalent critique instructions in HW4.

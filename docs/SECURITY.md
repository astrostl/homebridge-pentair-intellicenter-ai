# Security Policy

This is a hobby project, **not a supported product**. It is provided **"AS IS",
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND** — see the [Apache 2.0
LICENSE](../LICENSE). There is no guarantee of fitness, availability, response,
or fix for any issue, security or otherwise. Use at your own risk.

## Reporting a vulnerability

Open a public [GitHub issue](https://github.com/astrostl/homebridge-pentair-intellicenter-ai/issues),
or — if you'd rather not disclose publicly — a private
[security advisory](https://github.com/astrostl/homebridge-pentair-intellicenter-ai/security/advisories/new).

We will make **best-effort** attempts to fix security issues. That is the
entire commitment: no timelines, no guarantees.

## What it actually is

- **No dependencies**: a single plain-JavaScript Homebridge plugin with no npm
  runtime or dev dependencies — no JS tree to audit or get CVEs against.
- **Self-contained Go sidecar**: the engine is a statically compiled
  ([pentameter](https://github.com/astrostl/pentameter)) binary (`CGO_ENABLED=0`).
- **No credentials**: talks to IntelliCenter over an unauthenticated local
  WebSocket; never requests or stores credentials.
- **Local-only**: communicates solely with the IntelliCenter on your LAN; opens
  no outbound internet connections.

Keep your IntelliCenter and Homebridge host on a trusted network segment.

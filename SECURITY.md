# Security Policy

## Supported Versions

Security updates are provided for the latest published version of this Homebridge plugin. Given the home automation use case and typically low-privilege runtime environment, the security impact is generally limited to local network access.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please follow these steps:

### 🔒 For Sensitive Security Issues

For vulnerabilities affecting local network security or device control:
- **Contact**: Create a GitHub issue marked as "security"
- **Response time**: Best effort response
- **Process**: We'll work with you to verify, fix, and coordinate disclosure

### 🐛 For General Security Concerns

For less critical security improvements:
- **GitHub Issues**: Open a public issue with the "security" label
- **Pull Requests**: Security improvements are welcome via PR

## Security Posture

This plugin is deliberately built to minimize attack and supply-chain surface:

- **Near-zero dependency footprint**: the Homebridge plugin is a single
  plain-JavaScript file with **no npm runtime or dev dependencies** — there is no
  JS dependency tree to scan, audit, or get CVEs against. (Removing that toolchain
  surface is a primary goal of the rework.)
- **Self-contained Go sidecar**: the engine ships as a statically compiled
  ([pentameter](https://github.com/astrostl/pentameter)) binary built with
  `CGO_ENABLED=0`; its Go dependencies are vetted in that repository with Go's
  tooling (`go vet`, `golangci-lint`) and `go test`.
- **No credentials**: the plugin talks to IntelliCenter over an unauthenticated
  local WebSocket — it neither requests nor stores pool-system credentials.
- **Local-only**: all communication is to the IntelliCenter on your LAN; the
  plugin opens no outbound internet connections.

## Disclosure Policy

- **Verified vulnerabilities** will be fixed promptly
- **Security releases** will be published as patch versions
- **CVE assignment** will be requested for significant vulnerabilities
- **Public disclosure** will be coordinated with reporter

## Home Automation Context

Remember that this is a **home automation plugin** with limited blast radius:
- Runs on local networks (typically Raspberry Pi or NAS)
- Manages pool equipment (not critical infrastructure)
- Standard home network practices apply (keep the IntelliCenter and Homebridge on a
  trusted, isolated network segment)

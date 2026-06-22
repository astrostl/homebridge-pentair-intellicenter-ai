# Contributing to Homebridge Pentair IntelliCenter AI

Thank you for your interest in contributing! This project welcomes contributions
from the community.

## Architecture, in one paragraph

This plugin is a **thin JavaScript shim** (`shim/index.js`, zero npm dependencies)
over a **Go sidecar** — the [pentameter](https://github.com/astrostl/pentameter)
engine running in `homebridge` mode, spawned as a child process and bundled as a
prebuilt binary. The shim only does the JavaScript-mandatory glue: register HomeKit
accessories and relay get/set/state over a stdio pipe. **All real logic lives in
Go** (in the pentameter repo): the IntelliCenter protocol, the device model,
discovery, polling, control/writes, and resilience.

### Where does my change go?

The litmus test: *if IntelliCenter or the device model changes, does this code
change?* → it belongs in **pentameter (Go)**. *If Homebridge/HomeKit's API changes,
does it change?* → it belongs in the **shim (JS)**. Anything that makes a decision
(what to expose, how to map a device, unit conversion, write logic) is Go. Most
contributions will be to pentameter, not to this repo.

## How to Contribute

### Reporting Issues

- **Search existing issues** first to avoid duplicates.
- **Use the issue template** if provided.
- **Include details**: plugin version, IntelliCenter firmware, config, and logs
  (the shim forwards the sidecar's logs to the Homebridge log).
- **Be respectful** — this is an open source project.

### Submitting Pull Requests

1. **Fork** and create a feature branch.
2. **Decide where the change goes** (see the litmus test above). Engine changes go
   to pentameter; only HomeKit-glue changes go here.
3. **Keep changes focused** — one feature/fix per PR.
4. **Update documentation** (README / CHANGELOG / config schema) as needed.

## Development Setup

- See the README and `CLAUDE.md` for the Docker-based dev loop (`make up` /
  `make logs` / `make deploy`), which runs Homebridge in a container with the
  plugin bind-mounted and the sidecar built from a local pentameter checkout.
- The sidecar is built by `make build`, which cross-compiles pentameter into
  `pentameter/<os>-<arch>`. These binaries are gitignored and bundled into the npm
  tarball at release time.

## Code Standards

- **Shim (JS)**: plain CommonJS, zero npm dependencies, no build step. Match the
  surrounding style; keep it dumb.
- **Engine (Go, in pentameter)**: the part that matters is covered by Go's own
  tooling — `go test`, `go vet`, `gofmt`, and `golangci-lint`. Add/extend tests
  there (the engine has a mock IntelliCenter, so no hardware is required).
- The whole point of the rework is to **minimize the JavaScript toolchain** — please
  don't reintroduce TypeScript, ESLint, Jest, etc. into the shim.

## Getting Help

- **Check `CLAUDE.md`** (this repo) and pentameter's `API.md` for the protocol.
- **Open an issue** for questions or clarification.
- **Review existing code** to understand patterns and conventions.

## Recognition

Contributors will be recognized in release notes and project documentation. We
appreciate all forms of contribution, from bug reports to code improvements!

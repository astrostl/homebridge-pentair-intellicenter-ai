# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Hard rules (never violate)

- **NEVER store memories.** Do not write to the memory directory, MEMORY.md, or
  any persistent memory store. Ever.
- **NEVER write personally-identifying info to any file** (name, address, email,
  IP addresses, MAC addresses, etc.) — including committed files, docs, and
  notes. If a fact involves PII, record the *method* to obtain it, not the value.
- **NEVER tell the maintainer to test in Apple Home, the Home app, or to pair
  with HomeKit.** The maintainer tests in the **Homebridge UI**. Do not suggest
  it, do not ask them to "eyeball it in Home," do not append testing caveats
  referencing Apple Home. If verification matters, point at the Homebridge UI or
  the sidecar logs.
- **Keep this CLAUDE.md current as we go.** It is the project's source of truth;
  treat it as a living document. When a decision changes, a feature lands, an env
  var/flag/IPC message is added or renamed, or the pentameter engine moves —
  update the relevant section in the same change, don't let it drift. Verify
  claims against `src/pentameter` rather than trusting prose.

## Debugging tools

- Prefer **CLI tools** for ad-hoc debugging where reasonably possible — `curl`
  (HTTP / `/metrics`), `websocat` (the IntelliCenter WebSocket), `jq`, etc. They
  leave no project residue and are the fastest way to probe.
- If a CLI tool can't reasonably do it, use **Python — and ALWAYS inside a
  venv**. Never `pip install` into the system/global interpreter. Create and use
  a throwaway venv (e.g. `python3 -m venv .venv && .venv/bin/pip install …`),
  even for quick scripts.

## What this project is

`homebridge-pentair-intellicenter-ai` — the Homebridge plugin for Pentair
IntelliCenter pool controllers. The maintainer develops this with AI assistance.

This is a from-scratch rework of the plugin's older codebase — a working but
buggy, messy TypeScript/Node implementation. The rework ships as prerelease
versions on the npm **`alpha`** dist-tag (currently `3.0.0-alpha.8`), so existing
stable users on `latest` are untouched until it's promoted. (Note: the `beta`
dist-tag is occupied by an unrelated older line — `2.14.0-beta.2` from the v2.x
IntelliBrite work — so the rework deliberately uses `alpha`, not `beta`.) It
exists to: clean up the codebase, reduce
bugs, and **move as much logic as possible into Go** to escape the daily
npm/Dependabot churn of the JS toolchain.

## Architecture (DECIDED)

**Hybrid: a thin JavaScript shim + a Go sidecar — and the sidecar IS pentameter.**

```
HomeKit <--HAP--> Homebridge (Node) <--> [tiny JS shim] <--stdio--> [ pentameter homebridge ]
                                                                     <--WebSocket--> IntelliCenter
```

- It **must remain a real Homebridge plugin** — keeping the existing user base,
  the Homebridge Config UI, config schema, and `install via Homebridge` is a
  hard requirement. (This is the maintainer's explicit call.)
- A Homebridge plugin's entry point is unavoidably JavaScript — Homebridge is a
  Node process that `require()`s the plugin's `main`. So the JS shim is the
  minimum-possible Node surface.
- **The JS shim does as little as possible:** register accessories with the
  Homebridge API and forward every get/set/state change to the sidecar. All real
  work (IntelliCenter protocol, state model, polling, control, resilience) lives
  in Go.
- **Litmus test for where code goes** (decides every feature): *if
  IntelliCenter or the device model changes, does this code change?* → it's
  **pentameter (Go)**. *If HomeKit/Homebridge's API changes, does it change?* →
  it's the **shim**. So **anything that makes a decision** (what to expose, how to
  filter, how to map a device, unit conversion, write logic) is Go; the shim only
  does the JS-mandatory glue (HAP registration, IPC↔characteristic translation,
  spawn/respawn/logging). Concretely: the Feature-only circuit filter (`FEATR`)
  lives in Go because it's about IntelliCenter's data model — and it's `go test`-
  covered as a result, with the shim untouched. Every bit of logic in Go is logic
  *not* in the npm toolchain (the whole anti-Dependabot point).
- IPC: plain stdio (newline-delimited JSON) so neither side needs IPC deps. The
  binary is spawned as a child process of the plugin.

### pentameter is the shared IntelliCenter engine (DECIDED)

Rather than maintain a second IntelliCenter implementation here, **the sidecar is
pentameter** running in a `homebridge` mode. pentameter already owns the
WebSocket protocol, mDNS discovery, reconnect/backoff, and a `listen`
troubleshooting mode; reusing it means one protocol implementation, autodiscovery
for free, and `listen` mode doubles as a plugin debugging tool. The engine work
is merged to `master` in `src/pentameter` (first shipped as v0.5.0; v0.5.1 added
homebridge Lightbulb classification, non-fatal metrics bind, and change-only
logging; v0.5.2 clarified `--help`, quieted skipped-feature logging to `--listen`
mode only, and bound the metrics server before announcing it; the alpha.9 plugin
bundles **v0.6.0**, which gates `circuit_status`/`feature_status` on physical pump
delivery — **metrics-only; HomeKit accessories are unaffected** — and adds a
periodic static-config refresh that re-pulls feature visibility and the
circuit⇄pump graph every 60 polls, so a reconfiguration is picked up without a
restart).

- pentameter gained **control/writes** (`SetParamList`) — it was 100% read-only;
  this is confined to homebridge mode (a monitoring tool that became a control
  tool; treat writes carefully).
- The reusable **`intellicenter` package** (transport + protocol + query builders
  + interpret helpers + discovery + writes) is extracted and now backs **all
  three modes** (metrics / listen / homebridge) — one implementation, no
  duplicated `PoolMonitor` transport. metrics is the default mode; `-homebridge`
  and `-listen` are the alternates.
- `src/pentameter/API.md` is the protocol source of truth — use it, don't
  re-derive.
- This repo's `go/` sidecar is **retired** (replaced by pentameter). It served
  its purpose: it proved the IPC protocol + the full Docker→shim→sidecar→HomeKit
  pipeline, and that IPC design carries into pentameter's homebridge mode.

### Killing Dependabot (the real motivation)

The legacy plugin's *runtime* deps are tiny (`telnet-client`, `uuid`). The daily
Dependabot noise comes from the **devDependencies** — a ~14-package JS toolchain
(typescript, eslint, jest, prettier, ts-jest, ts-node, nodemon, `@types/*`…).
So the rewrite must also **minimize/eliminate the JS toolchain**, not just shrink
runtime deps:

- Write the shim in **plain JS** (no TypeScript) if practical.
- Avoid jest/eslint/prettier/ts-node etc. where possible; lean on Go's tooling
  (`go test`, `go vet`, `gofmt`) for the part that matters.
- Keep JS runtime dependencies at or near **zero** (HomeKit/HAP comes from
  Homebridge as a peer; the shim shouldn't pull its own tree).

## Goals

1. Stay a Homebridge plugin (keep users + Config UI).
2. Maximize Go, minimize JS/TS/Node.
3. Rapid local dev: run the plugin **in Docker** and verify via the **Homebridge
   UI** (and the sidecar logs).

## Approach & rollout (maintainer's plan)

- Build something **minimal and resilient** in Go, using **pentameter as the
  reference** for the IntelliCenter client.
- Develop and test **locally in Docker**, verifying in the **Homebridge UI**,
  throughout.
- Ship to the **npm `alpha` channel** and dogfood it there for a **long time**
  before promoting to stable/`latest`.
- Bias toward small, robust increments over a big-bang rewrite. Started with a
  walking skeleton (sidecar connects + one accessory shows in the Homebridge UI),
  then grew coverage of device types.

## Related projects by the same maintainer (symlinked under `src/`)

- **`src/homebridge-pentair-intellicenter-ai`** — the legacy/predecessor plugin
  (TypeScript). Reference for behavior, config schema, and the existing dev
  workflow (Docker Compose + Makefile + nodemon). Talks to IntelliCenter over
  **telnet** (`telnet-client`).
- **`src/pentameter`** — the IntelliCenter **engine**. A Go monitoring tool that
  speaks the protocol over WebSocket; also the homebridge sidecar via its
  `intellicenter` package + `homebridge` mode (on `master`). `make build` here
  compiles it into `pentameter/`.
- **`src/homebridge`** — Homebridge core, for reference.

## Repo layout (this repo is now thin — the engine lives in pentameter)

```
index.js               The Homebridge plugin (plain JS, zero npm deps). Spawns
                       `pentameter -homebridge`, maps each kind the sidecar emits
                       to a HomeKit accessory (switch/thermostat/lightsensor/
                       occupancy/tempsensor).
pentameter/            Cross-compiled pentameter sidecar binaries, one per
                       platform as `<os>-<arch>` (gitignored, `make build`;
                       bundled into the npm tarball for releases).
config.schema.json     Homebridge Config UI schema (pluginAlias PentairIntelliCenter,
                       kept from 2.x so existing configs upgrade without edits).
homebridge-config/     Local Docker storage; only config.template.json is committed.
docker-compose.yml     homebridge/homebridge image, bind-mounts this repo as a plugin.
Makefile               Dev loop (see below). Builds the sidecar from PENTAMETER_DIR.
```

The Go engine (`intellicenter` package + `homebridge` mode) lives in
`src/pentameter`, NOT here. This repo is the JS shim + Docker dev glue + bundled
binaries.

## Dev workflow (built — this is the loop)

```
cp homebridge-config/config.template.json homebridge-config/config.json
# optionally set ipAddress; blank = mDNS auto-discovery (the default)
make up        # build pentameter sidecar (from ../pentameter) + start Homebridge in Docker
make logs      # watch discovery / sidecar logs
# verify accessories in the Homebridge UI (http://localhost:8581), toggle circuits
make deploy    # after editing pentameter: rebuild sidecar + restart container
make down      # stop
make test      # pentameter Go tests (mock IntelliCenter, no hardware needed)
```

- `make build` cross-compiles pentameter from `PENTAMETER_DIR` (default
  `../pentameter`) into `pentameter/<os>-<arch>`; the shim picks the match. The
  shim passes config via `PENTAMETER_IC_IP` / `PENTAMETER_IC_PORT` /
  `PENTAMETER_INTERVAL` / `PENTAMETER_HTTP_PORT`; a blank IP makes pentameter
  auto-discover.
- Note: mDNS auto-discovery generally does NOT work from inside Docker with
  bridge networking (macOS/Windows) — set an explicit `ipAddress` for Docker dev,
  or use `network_mode: host` on Linux.
- Don't ask the maintainer for the IntelliCenter's IP — discover it from the
  host with `./pentameter -discover` (mDNS for `pentair.local`), then set that as
  `ipAddress` in `homebridge-config/config.json` for Docker dev.

Key mechanic (verified working): `docker-compose.yml` bind-mounts the repo at a
**separate** path `/plugin-src` (read-only), NOT under `node_modules`. `make up`
then runs `_link_plugin`, which:
  1. `npm pkg set dependencies.<plugin>="file:/plugin-src"` in `/homebridge`,
     and
  2. `ln -sfn /plugin-src /homebridge/node_modules/<plugin>`.
Both are required. The official `homebridge/homebridge` image runs a boot-time
"Installing Homebridge and user plugins" step that **prunes anything in
`node_modules` not listed in `package.json`**, so an unregistered symlink is
deleted on the next restart — hence the `npm pkg set`. We deliberately do NOT
use `npm install` to link it: that reconciles the whole dependency tree and
intermittently fails on homebridge's bundled `@matter` deps over Docker's
filesystem (`ENOTEMPTY`). Because the symlink points at the live repo,
rebuilding `pentameter/` on the host is reflected on the next restart; `make deploy` =
rebuild + re-link + restart.

Gotchas learned the hard way (don't regress):
- Do NOT bind-mount the repo directly into `/homebridge/node_modules/<plugin>` —
  the prune step tries to `rename` it and fails with `EBUSY` on the mount point,
  aborting the entire startup install (homebridge core never installs).
- `/var/lib/homebridge` is a symlink to `/homebridge` in this image; the
  homebridge process runs with `-P /var/lib/homebridge/node_modules
  --strict-plugin-resolution`, so the plugin must live in that (same) dir.

- Container is **linux/arm64** here; `make build` cross-compiles a trimmed
  matrix — linux/{arm64,amd64,arm} + darwin/arm64 — and the shim picks the match
  by `process.platform`/`process.arch` (node `x64` → go `amd64`). windows-amd64
  and darwin-amd64 are deliberately dropped (see the Makefile `build` comment);
  add a target back there if a user needs it.
- The shim passes config to the sidecar via env (config field → env var):
  `ipAddress`→`PENTAMETER_IC_IP`, `port`→`PENTAMETER_IC_PORT`,
  `pollIntervalSeconds`→`PENTAMETER_INTERVAL`, `metricsPort`→`PENTAMETER_HTTP_PORT`.
- Homebridge on macOS Docker uses bridge networking + mapped ports (8581 UI /
  51826 HAP / 5353 mDNS / 8080 Prometheus metrics). mDNS across the Docker VM can
  be finicky — on Linux prefer `network_mode: host` (commented in compose).

## IPC contract (shim ⇆ sidecar, newline-delimited JSON)

Defined in `src/pentameter/homebridge.go` and consumed in `index.js`. Keep
both in sync.

Accessory **kinds** (the `kind` field of an `accessories` item):
`switch` (circuit/feature), `lightbulb` (a light circuit — `SUBTYP` in the light
set per `isLightSubType`; on/off only, color TBD — uses the same `set`/`state`
on/off path as `switch`, just a Lightbulb service so it gets the right icon and
skips Apple Home's per-Switch "Display As" prompt), `thermostat` (body+heater),
`lightsensor` (a read-only metric encoded as lux — pump RPM/Watts/GPM),
`occupancy` (a read-only boolean — pump Running, Freeze Protection, and the
`_conn` controller-online sensor), `tempsensor` (read-only Celsius — e.g. air
temp).

- sidecar → shim (**stdout**):
  - `{"t":"ready"}`
  - `{"t":"accessories","items":[{id,name,kind,...}]}` — item carries the
    fields its kind needs: `on` (switch/occupancy), `curC/heatC/coolC/state`
    (thermostat), `lux` (lightsensor), `curC` (tempsensor).
  - `{"t":"state","id,"on"}` — switch/occupancy on/off
  - `{"t":"tstate","id","curC","heatC","coolC","state"}` — thermostat update
  - `{"t":"lstate","id","lux"}` — lightsensor (lux) update
  - `{"t":"sstate","id","c"}` — temperature-sensor (Celsius) update
- shim → sidecar (**stdin**):
  - `{"t":"set","id","on"}` — toggle a circuit
  - `{"t":"tset","id",...}` — thermostat write (heat/cool setpoint, mode)
- sidecar → shim (**stderr**): human log lines (shim forwards to Homebridge log).

When extending to new device types: add a `kind`, emit it in
`src/pentameter/homebridge.go`, and handle that `kind` in `index.js`'s
`syncAccessories`. The shim stays dumb; logic stays in Go. The `intellicenter`
package exposes Bodies/Pumps/Heaters/Sensors + heat-status interpretation +
writes for these increments.

**Standard for service type:** every `ensureX` in the shim must acquire its HAP
service via `useService(accessory, type, name)`, never `getService||addService`
directly. `useService` strips any *other* primary service the accessory carried
under a previous kind, so when a circuit is reclassified across versions (e.g.
the same objnam went `switch` → `lightbulb` when light detection landed),
HomeKit re-renders it cleanly instead of keeping both services and showing the
old type. Add any new primary service type to `primaryServiceTypes()` so it
participates in this swap. The accessory UUID is seeded from `PLATFORM_NAME:id`
and stays stable across a kind change — that's *why* the stale service must be
removed rather than relying on a fresh accessory.

## Status / roadmap

- **Done (engine + device coverage):** `intellicenter` package extracted
  (transport, queries, interpret, control/writes, mock tests); `pentameter
  -homebridge` mode with resilient connect/reconnect + autodiscovery; the plugin
  wired to build + spawn pentameter; Docker dev loop verified. Device coverage
  shipped: circuits/features → Switch (FEATR filter); bodies+heaters →
  Thermostat; air temp → TemperatureSensor; pump RPM/Watts/GPM → LightSensor
  (lux); pump Running + Freeze Protection + controller-online (`_conn`) →
  OccupancySensor. Real-time **push** handling is live (push lane ~1s for
  circuits/temps/heat/freeze; poll lane ~30s for pump RPM/Watts/GPM, which are
  never pushed).
- **Done (one engine, three modes):** metrics (default) / `-homebridge` /
  `-listen` all run the same `intellicenter` engine — the duplicated `PoolMonitor`
  transport is gone. `-homebridge` and metrics mode both serve Prometheus
  `/metrics` and advertise over mDNS (one sidecar feeds both HomeKit and Grafana);
  `-listen` does neither.
- **Next:** IntelliBrite lights (Lightbulb + colors).
- **Distribution:** bundle prebuilt pentameter binaries in the npm tarball
  (`files` includes `pentameter/`) or download-on-postinstall; publish to the `alpha`
  channel first and dogfood before promoting to `latest`.

## IntelliCenter protocol reference (from pentameter + legacy plugin)

- **Transport: WebSocket** `ws://<ip>:6680` (pentameter, Go, proven). The legacy
  plugin used **telnet on 6681** — we are deliberately switching to WebSocket
  because it's what works cleanly in Go. **No authentication** required.
- **Message shape** (JSON):
  - Request: `{messageID, command, condition?, objectList:[{objnam, keys:[]}]}`
  - Response: `{command, messageID, response, objectList:[{objnam, params:{}}]}`
  - All param values arrive as **strings** (parse floats/ints defensively).
- **Commands**: `GetParamList` (poll), `GetQuery` (config, e.g.
  `queryName:GetConfiguration` / `GetHardwareDefinition`), `SetParamList`
  (write), `RequestParamList` (subscribe). IntelliCenter pushes unsolicited
  `WriteParamList`/`NotifyList` messages on change — must tolerate/route these.
- **Discovery** by `condition: "OBJTYP=<TYPE>"`: `BODY`, `CIRCUIT`, `PUMP`,
  `HEATER`, `CIRCGRP`. Object naming: bodies `B####`, circuits `C####`/features
  `FTR##`, heaters `H####`, pumps `PMP##`, air sensor `_A135`.
- **Key params**: BODY → `SNAME,STATUS,TEMP,HTMODE,HTSRC,LOTMP,HITMP`;
  CIRCUIT → `SNAME,STATUS,OBJTYP,SUBTYP,FREEZE`; PUMP → `RPM,MAX,PWR,GPM,MAXF`
  (power is under **`PWR`**, not `WATTS` — `WATTS` is a garbage echo; pump
  `STATUS` is a **numeric code**, not `ON`, so derive on-state from `RPM>0`; GPM
  is only meaningful when `MAXF>0`). See API.md for the full param tables.
- **Resilience** (pentameter): handshake timeout 10s; ping keepalive every 30s
  (5s timeout); exponential reconnect backoff 1s→30s; optional mDNS rediscovery
  of `pentair.local.` after repeated failures.
- **Push vs poll**: body temps / circuit on-off / heater / freeze changes are
  pushed (push lane, ~1s); pump RPM/Watts/GPM are **not** pushed — they're polled
  on the poll lane (shim default 30s; pentameter's standalone default is 60s).
- Detailed code: `src/pentameter/intellicenter/client.go` (transport, connect,
  read loop) and `intellicenter/parse.go` / `types.go` (param parsing);
  `src/pentameter/API.md` is the full protocol reference.

## HomeKit accessory model to reproduce (from legacy plugin)

Target the same HomeKit surface so existing users see no regression:

- **Circuits/features** → `Switch` (On/Off via `STATUS`). IntelliBrite lights →
  `Lightbulb` (+ a separate colors accessory). VSP circuits optionally add a
  `Fan` (RotationSpeed ↔ pump speed).
- **Body + heater** → `Thermostat` (CurrentTemperature read; TargetTemperature →
  `LOTMP`; heat-pump dual setpoints → `LOTMP`/`HITMP`). Internally Celsius;
  config picks display F/C; 0.5°C step.
- **Temperature sensors** (air `_A135`, pool) → `TemperatureSensor`.
- **Pump RPM/GPM/WATTS** → `LightSensor` (value encoded as lux) — a quirk used
  to surface read-only metrics. We additionally surface pump Running, Freeze
  Protection, and controller-online as `OccupancySensor`s.
- **Our** config surface (this repo's `config.schema.json`, alias
  `PentairIntelliCenter`): `name`, `ipAddress` (blank = mDNS), `port` (6680),
  `temperatureUnits` (F/C), `pollIntervalSeconds` (30), `metricsPort` (8080).
  This is a deliberately smaller surface than the legacy plugin's, but it
  **keeps the legacy `PentairIntelliCenter` platform alias** so existing 2.x
  installs upgrade seamlessly (no config edit, no crash). We briefly used a
  distinct `PentairIntelliCenterAI` alias to force a clean config, but that made
  Homebridge reject every existing config block (`No plugin was found for the
  platform "PentairIntelliCenter"`) and crash-loop the child bridge on upgrade —
  unacceptable for shipped users. Dead legacy options
  (`minimumTemperature`/`maximumTemperature`/`airTemp`/`supportIntelliBrite`/
  `includeAllCircuits`/`heatModeOverride`) are simply ignored by the shim, not
  carried into behavior. The shim only reads `ipAddress`/`temperatureUnits`/
  `name` (shared with legacy) plus the new `port`/`pollIntervalSeconds`/
  `metricsPort` (which default when absent).
- Legacy reference code: `src/homebridge-pentair-intellicenter-ai/src/`
  (platform.ts is the core; `*Accessory.ts` per device type;
  `config.schema.json`) — read it for behavior, not as our config.

## Distribution note (to solve later)

Because the plugin ships a compiled Go binary, the npm package must deliver the
right binary per platform/arch (Homebridge runs on linux x64/arm64, macOS,
etc.). Standard options: bundle prebuilt binaries in the npm tarball, or a
postinstall that downloads from GitHub Releases. Prefer the approach that adds
the least supply-chain/Dependabot surface.

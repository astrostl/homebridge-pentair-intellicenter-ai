***All code is AI-generated (currently Claude Code) and directed, overseen, and tested by me. If running stuff from the internet scared you, this might horrify you.**

***Provided strictly as-is with no warranty, guarantee, etc.***

# Homebridge Pentair IntelliCenter
[![NPM Version](https://img.shields.io/npm/v/homebridge-pentair-intellicenter-ai.svg)](https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai) [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

This is a plugin to integrate your [Pentair IntelliCenter](https://www.pentair.com/en-us/products/residential/pool-spa-equipment/pool-automation/intellicenter-control-system.html) ([1.064+](https://www.pentair.com/en-us/education-support/residential/product-support/pentair-pool-and-spa-software-downloads/intellicenter-download.html)) setup with [Homebridge](https://homebridge.io) (so it shows up in [Apple Home](https://www.apple.com/home-app/) and [Siri](https://www.apple.com/siri/)).

> ## ⚠️ 3.x is an alpha rework
>
> The `3.0.0-alpha.x` line is a **ground-up rework** and is published only to the
> npm **`alpha`** dist-tag. It will not install unless you explicitly ask for it
> (`@alpha`), and it does **not** affect the stable `2.x` line on `latest`.
>
> It uses a **new config platform** (`PentairIntelliCenterAI`), so it starts from
> a clean configuration — your existing `2.x` config block is intentionally not
> carried over. Treat it as early and rough.

## What changed in 3.x

The old `2.x` roadmap — switch off telnet to WebSocket, autodetect the controller,
and move the heavy lifting into Go — is exactly what 3.x delivers. The plugin is now
a **thin JavaScript shim over a Go sidecar**:

- The shim is the (required) Homebridge entry point. It does as little as possible:
  register accessories and relay get/set/state.
- All real work — the IntelliCenter protocol, state model, polling, control, and
  resilience — lives in a bundled Go binary ([pentameter](https://github.com/astrostl/pentameter),
  in its `homebridge` mode), spawned as a child process and spoken to over a simple
  pipe.

Why: keeping the logic in Go (with Go's own tooling and tests) gets it out of the
churning JavaScript dependency toolchain. The shim ships with **zero npm
dependencies**.

Concretely, versus `2.x`:

- **WebSocket** transport (`ws://<ip>:6680`), not telnet. **No authentication** needed.
- **mDNS auto-discovery** of the controller — leave the IP blank and it finds
  `pentair.local` on your network. (Set an IP manually if discovery can't reach it,
  e.g. Docker with bridge networking.)
- Built-in **Prometheus `/metrics`** for Grafana, served alongside HomeKit from the
  same process (no second tool to run).

## What gets exposed

- **Circuits / features / groups** → switches (the same visibility rules as before:
  bodies, features, groups, and circuits flagged as features in IntelliCenter).
- **Bodies + heaters** → a Thermostat (current temp, setpoint; dual setpoints where
  the heater supports cooling).
- **Air temperature** → a Temperature sensor.
- **Pump RPM / Watts / GPM** → read-only Light sensors (the value is encoded as lux —
  a HomeKit quirk for surfacing read-only numbers). GPM is reported only when the pump
  exposes a max flow.
- **Pump Running**, **Freeze Protection**, and **Pool Controller Online** → Occupancy
  sensors (read-only boolean states).

For real dashboards/graphs, point Grafana at the Prometheus metrics rather than
HomeKit.

## Install

This is alpha-tagged, so install it explicitly:

```bash
npm install homebridge-pentair-intellicenter-ai@alpha
```

…or, in the Homebridge UI, install the plugin and select an `alpha` version.

## Configuration

| Option | Default | Notes |
| --- | --- | --- |
| `name` | Pentair IntelliCenter | Accessory/platform name. |
| `ipAddress` | *(blank)* | Leave blank to auto-discover via mDNS. Set an IP if discovery can't reach the controller. |
| `port` | `6680` | IntelliCenter WebSocket port. |
| `temperatureUnits` | `F` | `F` or `C` for display. |
| `pollIntervalSeconds` | `30` | How often pump RPM/Watts/GPM (which aren't pushed) are polled. |
| `metricsPort` | `8080` | Port for the Prometheus `/metrics` endpoint. Expose it from your host/container to scrape it. |

## Supported platforms

Prebuilt sidecar binaries are bundled for: **Linux** arm64 / amd64 / arm (32-bit),
and **macOS** arm64 (Apple Silicon). Windows and Intel-mac builds are not shipped;
open an issue if you need one.

## Provenance

This is a fork of [Windscar/homebridge-pentair-intellicenter](https://github.com/Windscar/homebridge-pentair-intellicenter),
which itself is a fork of [dustindclark/homebridge-pentair-intellicenter](https://github.com/dustindclark/homebridge-pentair-intellicenter).
dustindclark's original hasn't been actively maintained since 2023; Windscar made a
few updates but has issues disabled and doesn't take pull requests. With great
gratitude to both, this is broken out into a repository "I"* can actively maintain.

Testing is done against a dual-body setup (pool: IntelliFlo VSF pump, cleaner pump,
heat pump, lights, fountain; spa: IntelliFlo VS pump, air blower, gas heater, lights)
on firmware 3.004+.

## Roadmap

- **IntelliBrite color lights** → Lightbulb (+ color control).
- **Richer feature-visibility filtering** beyond the current feature-flag rule.

# homebridge-pentair-intellicenter-ai — local dev loop
#
# Quick start:
#   cp homebridge-config/config.template.json homebridge-config/config.json
#   # edit config.json: set ipAddress to your IntelliCenter
#   make up         # build sidecar + start Homebridge in Docker
#   make logs       # watch it discover circuits
#   # pair with Apple Home using the PIN below, then toggle circuits
#
# Rapid iteration:
#   # edit Go code, then:
#   make deploy     # rebuild sidecar + restart container

.PHONY: help build up deploy down logs restart pair-info test fmt _link_plugin _require_compose _require_config

# Detect container runtime (Docker or nerdctl / Rancher Desktop).
COMPOSE := $(shell if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then echo "docker compose"; elif command -v nerdctl >/dev/null 2>&1; then echo "nerdctl compose"; fi)

# The sidecar IS pentameter (homebridge mode). We build it from a local
# pentameter checkout. Override with `make build PENTAMETER_DIR=/path/to/pentameter`.
PENTAMETER_DIR ?= ../pentameter
OUT_DIR := pentameter

help:
	@echo "Targets:"
	@echo "  build      - cross-compile pentameter (the sidecar) into ./pentameter for all dev targets"
	@echo "  up         - build sidecar + start Homebridge container"
	@echo "  deploy     - rebuild sidecar + restart container (fast iteration)"
	@echo "  down       - stop the container"
	@echo "  restart    - restart the container (reload plugin)"
	@echo "  logs       - follow Homebridge logs"
	@echo "  pair-info  - print the HomeKit pairing PIN / UI URL"
	@echo "  test       - run pentameter Go tests + shim mock-HAP tests (shim_test.js)"
	@echo "  fmt        - gofmt + vet pentameter"
	@echo ""
	@echo "  PENTAMETER_DIR=$(PENTAMETER_DIR) (override to point at your pentameter checkout)"

# The sidecar is pentameter built in homebridge mode. Cross-compile for the
# platforms Homebridge actually runs on (Go cross-compiles fast; CGO off for
# static binaries). The shim picks the matching pentameter/<os>-<arch> at runtime.
#
# Matrix is deliberately trimmed to keep the npm tarball small:
#   linux-arm64  Pi 4/5 + most installs (and the dev Docker container)
#   linux-amd64  x86 boxes / Docker / Synology
#   linux-arm    older 32-bit Pis (kept so existing users don't regress)
#   darwin-arm64 Apple Silicon (Mac dev + Mac Homebridge users)
# Dropped: windows-amd64 (Homebridge on Windows is ~nonexistent) and
# darwin-amd64 (Intel Mac, shrinking). Add back here if a user actually needs one.
build:
	@if [ ! -d "$(PENTAMETER_DIR)" ]; then \
		echo "❌ pentameter checkout not found at $(PENTAMETER_DIR)"; \
		echo "   Override: make build PENTAMETER_DIR=/path/to/pentameter"; \
		exit 1; \
	fi
	@echo "🔨 Building pentameter sidecar -> $(OUT_DIR)/ (from $(PENTAMETER_DIR))"
	@mkdir -p $(OUT_DIR)
	@cd $(PENTAMETER_DIR) && \
		CGO_ENABLED=0 GOOS=linux  GOARCH=arm64       go build -trimpath -ldflags="-s -w" -o $(CURDIR)/$(OUT_DIR)/linux-arm64  . && \
		CGO_ENABLED=0 GOOS=linux  GOARCH=amd64       go build -trimpath -ldflags="-s -w" -o $(CURDIR)/$(OUT_DIR)/linux-amd64  . && \
		CGO_ENABLED=0 GOOS=linux  GOARCH=arm GOARM=7 go build -trimpath -ldflags="-s -w" -o $(CURDIR)/$(OUT_DIR)/linux-arm    . && \
		CGO_ENABLED=0 GOOS=darwin GOARCH=arm64       go build -trimpath -ldflags="-s -w" -o $(CURDIR)/$(OUT_DIR)/darwin-arm64 .
	@echo "✅ Built: $$(ls $(OUT_DIR))"

PLUGIN_PKG := homebridge-pentair-intellicenter-ai

up: _require_compose _require_config build
	@echo "🚀 Starting Homebridge..."
	@$(COMPOSE) up -d
	@echo "⏳ Waiting for homebridge core to install..."
	@for i in $$(seq 1 40); do \
		if $(COMPOSE) exec -T homebridge sh -c '[ -f /homebridge/node_modules/homebridge/package.json ]' 2>/dev/null; then break; fi; \
		sleep 3; \
	done
	@$(MAKE) --no-print-directory _link_plugin
	@echo "🔄 Restarting to load the plugin..."
	@$(COMPOSE) restart homebridge
	@echo "✅ Up. UI: http://localhost:8581"
	@$(MAKE) --no-print-directory pair-info
	@echo "📊 Logs: make logs"

# Make the bind-mounted repo a registered, symlinked plugin. Two steps, both
# needed:
#   1. `npm pkg set` registers it as a file: dependency in package.json. The
#      Docker image's boot-time "Installing Homebridge and user plugins" step
#      PRUNES anything in node_modules that isn't in package.json, so an
#      unregistered symlink gets deleted on the next restart.
#   2. `ln -sfn` symlinks it into the plugin path immediately. We do NOT use
#      `npm install` for this: it reconciles the whole dependency tree and
#      intermittently fails on homebridge's bundled @matter deps over Docker's
#      filesystem (ENOTEMPTY). The symlink points at the live repo, so
#      rebuilding pentameter/ on the host is picked up on the next restart.
_link_plugin: _require_compose
	@echo "🔗 Registering + linking plugin into Homebridge plugin path..."
	@$(COMPOSE) exec -T homebridge sh -c '\
		cd /homebridge && \
		npm pkg set dependencies.$(PLUGIN_PKG)="file:/plugin-src" && \
		ln -sfn /plugin-src /homebridge/node_modules/$(PLUGIN_PKG)'

deploy: _require_compose build
	@$(MAKE) --no-print-directory _link_plugin
	@echo "🔄 Restarting container to reload the rebuilt sidecar..."
	@$(COMPOSE) restart homebridge
	@echo "✅ Deployed."

down: _require_compose
	@$(COMPOSE) down
	@echo "🛑 Stopped."

restart: _require_compose
	@$(COMPOSE) restart homebridge

logs: _require_compose
	@$(COMPOSE) logs -f --tail 100 homebridge

pair-info:
	@echo "🔑 HomeKit pairing PIN (from homebridge-config/config.json):"
	@grep -o '"pin"[^,]*' homebridge-config/config.json 2>/dev/null || echo "   (config.json not found yet)"
	@echo "   Add accessory in Apple Home -> 'More options' -> pick the bridge -> enter PIN."

test:
	@cd $(PENTAMETER_DIR) && go test ./...
	@node shim_test.js

fmt:
	@cd $(PENTAMETER_DIR) && gofmt -w . && go vet ./...

# --- guards ---------------------------------------------------------------

_require_compose:
	@if [ -z "$(COMPOSE)" ]; then \
		echo "❌ Neither Docker nor nerdctl found/running. Start Docker Desktop or Rancher Desktop."; \
		exit 1; \
	fi

_require_config:
	@if [ ! -f homebridge-config/config.json ]; then \
		echo "❌ homebridge-config/config.json not found."; \
		echo "   cp homebridge-config/config.template.json homebridge-config/config.json"; \
		echo "   then edit it and set ipAddress to your IntelliCenter."; \
		exit 1; \
	fi

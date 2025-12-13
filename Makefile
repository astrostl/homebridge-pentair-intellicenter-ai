# Homebridge Development Environment
# Supports both Docker and nerdctl (Rancher Desktop, Lima, etc.)

.PHONY: up down deploy help

# Detect container runtime
COMPOSE_CMD := $(shell if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then echo "docker compose"; elif command -v nerdctl >/dev/null 2>&1; then echo "nerdctl compose"; fi)

# Default target - show usage
help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  up      - Build plugin, start container, and deploy"
	@echo "  down    - Stop Homebridge container"
	@echo "  deploy  - Build and copy plugin files to running container"
	@echo ""
	@echo "First time setup:"
	@echo "  cp homebridge-config/config.template.json homebridge-config/config.json"
	@echo "  # Edit config.json with your IntelliCenter credentials"
	@echo "  make up"
	@echo "  # Install plugin via Homebridge UI at http://localhost:8581"
	@echo "  make deploy"

up:
	@if [ -z "$(COMPOSE_CMD)" ]; then \
		echo "❌ Neither Docker nor nerdctl found!"; \
		echo "📦 Please install Docker Desktop or Rancher Desktop"; \
		exit 1; \
	fi
	@if [ ! -f "homebridge-config/config.json" ]; then \
		echo "❌ Config file not found!"; \
		echo "📝 Please copy the template and add your credentials:"; \
		echo "   cp homebridge-config/config.template.json homebridge-config/config.json"; \
		exit 1; \
	fi
	@echo "🔨 Building plugin..."
	@npm run build
	@echo "🚀 Starting Homebridge..."
	@$(COMPOSE_CMD) up -d
	@echo "✅ Homebridge started!"
	@echo ""
	@# Attempt deploy - will fail silently on first run before plugin is installed
	@PLUGIN_DIR=$$($(COMPOSE_CMD) exec homebridge find /homebridge/node_modules /var/lib/homebridge/node_modules -name "homebridge-pentair-intellicenter-ai" -type d 2>/dev/null | head -1 | tr -d '\r\n'); \
	if [ -z "$$PLUGIN_DIR" ]; then \
		echo "📋 Plugin not installed yet - install via UI at http://localhost:8581"; \
		echo "   Default login: admin / admin"; \
		echo "   After installing, run: make deploy"; \
	else \
		echo "📂 Deploying to $$PLUGIN_DIR..."; \
		$(COMPOSE_CMD) cp dist/. homebridge:$$PLUGIN_DIR/dist/; \
		$(COMPOSE_CMD) cp config.schema.json homebridge:$$PLUGIN_DIR/config.schema.json; \
		echo "🔄 Restarting Homebridge..."; \
		$(COMPOSE_CMD) restart homebridge; \
		echo "✅ Plugin deployed!"; \
	fi
	@echo ""
	@echo "📊 View logs: $(COMPOSE_CMD) logs --tail 50 homebridge"

down:
	@if [ -z "$(COMPOSE_CMD)" ]; then \
		echo "❌ Neither Docker nor nerdctl found!"; \
		exit 1; \
	fi
	@echo "🛑 Stopping Homebridge..."
	@$(COMPOSE_CMD) down
	@echo "✅ Homebridge stopped!"

deploy:
	@if [ -z "$(COMPOSE_CMD)" ]; then \
		echo "❌ Neither Docker nor nerdctl found!"; \
		exit 1; \
	fi
	@echo "🔨 Building plugin..."
	@npm run build
	@echo "📁 Finding plugin directory in container..."
	@PLUGIN_DIR=$$($(COMPOSE_CMD) exec homebridge find /homebridge/node_modules /var/lib/homebridge/node_modules -name "homebridge-pentair-intellicenter-ai" -type d 2>/dev/null | head -1 | tr -d '\r\n'); \
	if [ -z "$$PLUGIN_DIR" ]; then \
		echo "❌ Plugin not found in container! Install it via Homebridge UI first."; \
		exit 1; \
	fi; \
	echo "📋 Found plugin at: $$PLUGIN_DIR"; \
	echo "📂 Copying dist/ files to container..."; \
	$(COMPOSE_CMD) cp dist/. homebridge:$$PLUGIN_DIR/dist/; \
	echo "📂 Copying config.schema.json to container..."; \
	$(COMPOSE_CMD) cp config.schema.json homebridge:$$PLUGIN_DIR/config.schema.json
	@echo "🔄 Restarting Homebridge..."
	@$(COMPOSE_CMD) restart homebridge
	@echo "✅ Plugin deployed!"
	@echo "📊 View logs: $(COMPOSE_CMD) logs --tail 50 homebridge"

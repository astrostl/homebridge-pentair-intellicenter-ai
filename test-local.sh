#!/bin/bash

# Test Local Plugin Changes
# Copies built dist/ files directly into container's plugin directory

set -e

echo "🔨 Building local plugin..."
npm run build

# Detect container runtime
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v nerdctl &> /dev/null; then
    COMPOSE_CMD="nerdctl compose"
else
    echo "❌ Neither Docker nor nerdctl found!"
    exit 1
fi

echo "📁 Finding plugin directory in container..."
PLUGIN_DIR=$($COMPOSE_CMD exec homebridge find /var/lib/homebridge/node_modules -name "homebridge-pentair-intellicenter-ai" -type d 2>/dev/null | head -1 | tr -d '\r\n')

if [ -z "$PLUGIN_DIR" ]; then
    echo "❌ Plugin not found in container! Make sure it's installed via UI first."
    exit 1
fi

echo "📋 Found plugin at: $PLUGIN_DIR"

echo "📂 Copying dist/ files to container..."
$COMPOSE_CMD cp dist/. homebridge:$PLUGIN_DIR/dist/

echo "🔄 Restarting Homebridge..."
$COMPOSE_CMD exec homebridge bash -c "
    echo '🛑 Stopping Homebridge...'
    supervisorctl stop homebridge 2>/dev/null || pkill -f homebridge || true
    sleep 2
    echo '▶️ Starting Homebridge...'
    supervisorctl start homebridge 2>/dev/null || echo 'Homebridge will restart automatically'
"

echo "✅ Local plugin files updated!"
echo "📊 Watch logs with: $COMPOSE_CMD logs -f homebridge"
echo ""
echo "🎯 Look for your heat pump range update logs:"
echo "   $COMPOSE_CMD logs -f homebridge | grep 'temperature range'"
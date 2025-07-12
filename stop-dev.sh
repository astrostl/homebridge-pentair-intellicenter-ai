#!/bin/bash

# Homebridge Development Environment Stopper
# Supports both Docker and nerdctl

set -e

echo "🛑 Stopping Homebridge development environment..."

# Detect available container runtime and stop services
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    echo "🐳 Using Docker..."
    docker compose down
elif command -v nerdctl &> /dev/null; then
    echo "🦭 Using nerdctl..."
    nerdctl compose down
else
    echo "❌ Neither Docker nor nerdctl found!"
    exit 1
fi

echo "✅ Homebridge stopped successfully!"
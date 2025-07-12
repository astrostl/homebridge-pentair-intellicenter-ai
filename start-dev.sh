#!/bin/bash

# Homebridge Development Environment Starter
# Supports both Docker and nerdctl (Rancher Desktop, Lima, etc.)

set -e

echo "🚀 Starting Homebridge development environment..."

# Check if config.json exists
if [ ! -f "homebridge-config/config.json" ]; then
    echo "❌ Config file not found!"
    echo "📝 Please copy the template and add your credentials:"
    echo "   cp homebridge-config/config.template.json homebridge-config/config.json"
    echo "   # Then edit config.json with your IntelliCenter details"
    exit 1
fi

# Build the plugin first
echo "🔨 Building plugin..."
npm run build

# Detect available container runtime and start services
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    echo "🐳 Using Docker..."
    docker compose up -d
elif command -v nerdctl &> /dev/null; then
    echo "🦭 Using nerdctl..."
    nerdctl compose up -d
else
    echo "❌ Neither Docker nor nerdctl found!"
    echo "📦 Please install Docker Desktop or Rancher Desktop"
    exit 1
fi

echo "✅ Homebridge started successfully!"
echo "🌐 Access the UI at: http://localhost:8581"
echo "📋 Default login: admin / admin"
echo ""
echo "📊 To view logs:"
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    echo "   docker compose logs -f homebridge"
elif command -v nerdctl &> /dev/null; then
    echo "   nerdctl compose logs -f homebridge"
fi
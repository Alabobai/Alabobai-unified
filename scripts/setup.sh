#!/bin/bash

# Alabobai Setup Script
# Helps you get the platform running quickly

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║          ALABOBAI SETUP                                       ║"
echo "║          Your AI Operating System                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit .env and add your API key!"
    exit 1
fi

# Check for API key
if grep -q "REPLACE-WITH-YOUR" .env; then
    echo "⚠️  Please edit .env and replace the placeholder API key!"
    echo ""
    echo "   Open: /Users/alaboebai/Alabobai/alabobai-unified/.env"
    echo "   Replace: sk-REPLACE-WITH-YOUR-OPENAI-API-KEY"
    echo "   With: Your actual OpenAI API key"
    echo ""
    exit 1
fi

echo "✓ Configuration found"
echo ""

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "Docker detected. Building container..."
    docker build -t alabobai-unified .
    echo ""
    echo "Starting Alabobai..."
    docker run -d -p 8888:8888 --env-file .env --name alabobai alabobai-unified
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║   ✓ ALABOBAI IS RUNNING!                                      ║"
    echo "║                                                               ║"
    echo "║   Web UI:    http://localhost:8888                            ║"
    echo "║   API:       http://localhost:8888/api                        ║"
    echo "║                                                               ║"
    echo "║   To stop:   docker stop alabobai                             ║"
    echo "║   To logs:   docker logs -f alabobai                          ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
else
    echo "Docker not found. Running with Node.js..."
    npm run build
    npm run start:prod
fi

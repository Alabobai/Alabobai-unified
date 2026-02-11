#!/bin/bash

# Alabobai Unified Platform - Start Script

echo "Starting Alabobai Unified Platform..."

# Check for .env file
if [ ! -f "config/.env" ]; then
    echo "Warning: config/.env not found. Copying from example..."
    cp config/.env.example config/.env
    echo "Please edit config/.env with your API keys."
fi

# Load environment variables
export $(cat config/.env | xargs)

# Check for required API keys
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: No LLM API key configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY in config/.env"
    exit 1
fi

# Create data directory
mkdir -p data logs

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the server
echo "Starting server on port ${PORT:-8888}..."
npm run dev

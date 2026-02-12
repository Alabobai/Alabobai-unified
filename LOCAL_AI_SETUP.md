# Alabobai Local AI Brain Setup Guide

Run AI completely locally with Ollama and Qdrant - no API keys required, full privacy, offline capable.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Hardware Requirements](#hardware-requirements)
- [Quick Start](#quick-start)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Model Selection](#model-selection)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Performance Tuning](#performance-tuning)

---

## Overview

The Alabobai Local AI Brain combines:

- **Ollama** - Local LLM inference engine
- **Qdrant** - Vector database for knowledge storage and RAG
- **RAG Pipeline** - Retrieval-augmented generation for context-aware responses

Benefits:
- Complete privacy - data never leaves your machine
- No API costs
- Works offline
- Fast local inference
- Full control over models

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | 18+ | Runtime for Alabobai |
| **Docker** | 20+ | Container runtime for Qdrant |
| **Ollama** | Latest | Local LLM inference |

### Operating System

- **macOS** 12+ (Monterey or later)
- **Linux** Ubuntu 20.04+, Debian 11+, or equivalent
- **Windows** WSL2 with Ubuntu (experimental)

### Installation Links

- [Node.js](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (macOS/Windows)
- [Docker Engine](https://docs.docker.com/engine/install/) (Linux)
- [Ollama](https://ollama.ai/download)

---

## Hardware Requirements

### Minimum Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **RAM** | 8 GB | 16 GB+ |
| **Storage** | 20 GB free | 50 GB+ free |
| **CPU** | 4 cores | 8+ cores |
| **GPU** | Not required | NVIDIA GPU (CUDA) |

### RAM Requirements by Model

| Model | Parameters | RAM Required |
|-------|------------|--------------|
| `llama3.1` | 8B | 8 GB |
| `llama3.1:70b` | 70B | 48 GB |
| `mixtral:8x7b` | 46.7B | 32 GB |
| `codellama` | 7B | 8 GB |
| `nomic-embed-text` | 137M | 1 GB |
| `phi3` | 3.8B | 4 GB |

**Note:** Ollama requires approximately 1.5x the model size in available RAM.

---

## Quick Start

The fastest way to get started:

```bash
# 1. Clone and enter the project
cd /path/to/alabobai-unified

# 2. Run the setup script
./scripts/setup-local-ai.sh

# 3. Start the server
npm run dev

# 4. (Optional) Ingest your documents
./scripts/ingest-docs.sh /path/to/your/documents
```

The setup script will:
1. Check for Ollama and Docker
2. Start Qdrant using Docker Compose
3. Pull recommended models (llama3.1, nomic-embed-text)
4. Create default Qdrant collections
5. Verify everything is working

---

## Manual Installation

### Step 1: Install Ollama

**macOS:**
```bash
# Option 1: Download from website
# Visit https://ollama.ai/download and download the macOS installer

# Option 2: Using Homebrew
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Start Ollama:**
```bash
# macOS: Open the Ollama app (it runs in the menu bar)
# Linux: Start as a service
ollama serve
```

### Step 2: Install Docker

**macOS:**
Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop)

**Linux:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### Step 3: Start Qdrant

```bash
# Navigate to the Qdrant directory
cd docker/qdrant

# Copy environment template
cp .env.example .env

# Create the Docker network
docker network create alabobai-network

# Start Qdrant
docker compose up -d

# Verify it's running
curl http://localhost:6333/readyz
```

### Step 4: Pull AI Models

```bash
# Pull the default chat model
ollama pull llama3.1

# Pull the embedding model
ollama pull nomic-embed-text

# (Optional) Pull additional models
ollama pull codellama      # For code tasks
ollama pull mixtral:8x7b   # Better quality (needs 32GB RAM)
```

### Step 5: Configure Alabobai

Add these to your `.env` file:

```env
# Local AI Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=alabobai_knowledge
```

### Step 6: Start Alabobai

```bash
npm run dev
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_DEFAULT_MODEL` | `llama3.1` | Default chat model |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Model for embeddings |
| `OLLAMA_TIMEOUT` | `120000` | Request timeout (ms) |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant API endpoint |
| `QDRANT_API_KEY` | `` | Qdrant auth (optional) |
| `QDRANT_COLLECTION` | `alabobai_knowledge` | Default collection |

### Qdrant Configuration

Edit `docker/qdrant/.env`:

```env
# API Key (optional - for security)
QDRANT_API_KEY=your-secret-key

# Memory limits
QDRANT_MEMORY_LIMIT=2G
QDRANT_MEMORY_RESERVATION=512M

# Store payload on disk (for large datasets)
QDRANT_ON_DISK_PAYLOAD=false
```

---

## Model Selection

### Recommended Models

| Use Case | Model | Size | Notes |
|----------|-------|------|-------|
| **General chat** | `llama3.1` | 4.7 GB | Best balance of quality/speed |
| **High quality** | `llama3.1:70b` | 40 GB | Best responses, needs lots of RAM |
| **Code tasks** | `codellama` | 3.8 GB | Optimized for programming |
| **Fast responses** | `phi3` | 2.2 GB | Microsoft's compact model |
| **Embeddings** | `nomic-embed-text` | 300 MB | Fast, 768-dimension vectors |
| **Vision** | `llava` | 4.5 GB | Can analyze images |

### Pull Models Script

```bash
# List available models
./scripts/pull-models.sh --list

# Pull recommended models
./scripts/pull-models.sh

# Pull specific model
./scripts/pull-models.sh codellama

# Pull all suitable models for your RAM
./scripts/pull-models.sh --all
```

---

## Usage

### Ingest Documents

```bash
# Ingest a directory
./scripts/ingest-docs.sh /path/to/documents

# Recursive ingestion
./scripts/ingest-docs.sh /path/to/documents --recursive

# Specific files
./scripts/ingest-docs.sh report.pdf notes.md data.csv

# Ingest from URL
./scripts/ingest-docs.sh https://example.com/article
```

**Supported formats:** PDF, TXT, MD, JSON, CSV, HTML, XML

### API Usage

```javascript
// Chat with RAG (knowledge-augmented)
const response = await fetch('/api/local-ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What are our company policies?",
    useKnowledge: true,  // Enable RAG
    stream: true
  })
});

// Direct completion (no RAG)
const completion = await fetch('/api/local-ai/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "Explain quantum computing in simple terms",
    model: "llama3.1"
  })
});

// Search knowledge base
const results = await fetch('/api/local-ai/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "vacation policy",
    topK: 5
  })
});
```

### CLI Tools

```bash
# Check status
ollama list                    # List installed models
curl localhost:11434/api/tags  # Ollama API
curl localhost:6333/collections # Qdrant collections

# Manage models
ollama pull <model>    # Download model
ollama rm <model>      # Remove model
ollama run <model>     # Interactive chat
```

---

## Troubleshooting

### Ollama Issues

**Problem:** `Ollama is not running`
```bash
# macOS: Open the Ollama app
# Linux: Start the service
ollama serve

# Or as a systemd service
sudo systemctl start ollama
```

**Problem:** `Model not found`
```bash
# Pull the model
ollama pull llama3.1

# List available models
ollama list
```

**Problem:** `Out of memory`
- Use a smaller model (e.g., `phi3` instead of `llama3.1`)
- Close other applications
- Increase swap space

### Qdrant Issues

**Problem:** `Connection refused on port 6333`
```bash
# Check if container is running
docker ps | grep qdrant

# Start if not running
cd docker/qdrant && docker compose up -d

# Check logs
docker logs alabobai-qdrant
```

**Problem:** `Network not found`
```bash
# Create the network
docker network create alabobai-network

# Restart Qdrant
cd docker/qdrant && docker compose down && docker compose up -d
```

**Problem:** `Permission denied on data directory`
```bash
# Fix permissions
sudo chown -R $(whoami) docker/qdrant/data docker/qdrant/snapshots
```

### Performance Issues

**Problem:** `Slow responses`
- Use a smaller model
- Ensure you have enough RAM (check with `htop` or Activity Monitor)
- Reduce `topK` in RAG queries
- Consider GPU acceleration (NVIDIA)

**Problem:** `High memory usage`
```bash
# Reduce Qdrant memory limit in docker/qdrant/.env
QDRANT_MEMORY_LIMIT=1G

# Use disk-based payload storage
QDRANT_ON_DISK_PAYLOAD=true
```

### Common Error Messages

| Error | Solution |
|-------|----------|
| `ECONNREFUSED 127.0.0.1:11434` | Start Ollama |
| `ECONNREFUSED 127.0.0.1:6333` | Start Qdrant |
| `Model 'xyz' not found` | Run `ollama pull xyz` |
| `Collection not found` | Run setup script or create manually |
| `Out of memory` | Use smaller model or add RAM |

---

## Performance Tuning

### Ollama Optimization

```bash
# Use GPU acceleration (NVIDIA)
# Ollama automatically detects NVIDIA GPUs

# Set number of GPU layers
export OLLAMA_NUM_GPU=99  # All layers on GPU

# Reduce context length for faster responses
# (configured per request in API calls)
```

### Qdrant Optimization

Edit `docker/qdrant/.env`:

```env
# For large datasets (>100k vectors)
QDRANT_ON_DISK_PAYLOAD=true
QDRANT_INDEXING_THRESHOLD=10000

# For better search quality
QDRANT_MAX_SEGMENT_SIZE=500000
```

### System Optimization

**macOS:**
- Increase Docker memory in Docker Desktop settings
- Use Apple Silicon Macs for better performance (M1/M2/M3)

**Linux:**
- Increase swap space for large models
- Use SSD for Qdrant data directory
- Consider NVIDIA GPU with CUDA support

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs: `docker logs alabobai-qdrant`
3. Check Ollama logs: `ollama logs`
4. Open an issue on GitHub

---

## Quick Reference

```bash
# Setup
./scripts/setup-local-ai.sh      # Full setup
./scripts/setup-local-ai.sh --verify-only  # Check status

# Models
./scripts/pull-models.sh         # Pull recommended models
./scripts/pull-models.sh --list  # List available models
ollama list                      # Show installed models

# Documents
./scripts/ingest-docs.sh /docs   # Ingest documents
./scripts/ingest-docs.sh -r /docs  # Recursive

# Services
ollama serve                     # Start Ollama
cd docker/qdrant && docker compose up -d  # Start Qdrant
npm run dev                      # Start Alabobai

# Status
curl localhost:11434/api/tags    # Ollama status
curl localhost:6333/readyz       # Qdrant status
curl localhost:8888/api/health   # Alabobai status
```

#!/bin/bash

# ============================================================================
# Alabobai Local AI Brain Setup Script
# ============================================================================
# This script sets up all dependencies for running Alabobai with local AI:
# - Ollama for local LLM inference
# - Qdrant for vector storage
# - Required AI models for chat and embeddings
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
DEFAULT_CHAT_MODEL="${DEFAULT_CHAT_MODEL:-llama3.1}"
DEFAULT_EMBEDDING_MODEL="${DEFAULT_EMBEDDING_MODEL:-nomic-embed-text}"

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                                    ║${NC}"
    echo -e "${CYAN}║${NC}          ${BLUE}ALABOBAI LOCAL AI BRAIN SETUP${NC}                            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}          Run AI locally with Ollama + Qdrant                       ${CYAN}║${NC}"
    echo -e "${CYAN}║                                                                    ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BLUE}==>${NC} ${1}"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} ${1}"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} ${1}"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} ${1}"
}

print_info() {
    echo -e "${CYAN}[INFO]${NC} ${1}"
}

command_exists() {
    command -v "$1" &> /dev/null
}

wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -n "Waiting for $name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}timeout${NC}"
    return 1
}

# ============================================================================
# Check Prerequisites
# ============================================================================

check_ollama() {
    print_step "Checking Ollama installation..."

    if command_exists ollama; then
        local version=$(ollama --version 2>/dev/null || echo "unknown")
        print_success "Ollama is installed (version: $version)"
        return 0
    else
        print_warning "Ollama is not installed"
        echo ""
        echo "To install Ollama:"
        echo ""
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "  Option 1 (Recommended): Download from https://ollama.ai/download"
            echo "  Option 2: brew install ollama"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "  curl -fsSL https://ollama.ai/install.sh | sh"
        else
            echo "  Visit https://ollama.ai/download for installation instructions"
        fi
        echo ""
        return 1
    fi
}

check_docker() {
    print_step "Checking Docker installation..."

    if command_exists docker; then
        if docker info > /dev/null 2>&1; then
            local version=$(docker --version 2>/dev/null || echo "unknown")
            print_success "Docker is installed and running ($version)"
            return 0
        else
            print_warning "Docker is installed but not running"
            echo "  Please start Docker Desktop or the Docker daemon"
            return 1
        fi
    else
        print_warning "Docker is not installed"
        echo ""
        echo "To install Docker:"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "  Download Docker Desktop: https://www.docker.com/products/docker-desktop"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "  curl -fsSL https://get.docker.com | sh"
            echo "  sudo usermod -aG docker \$USER"
        fi
        echo ""
        return 1
    fi
}

check_docker_compose() {
    print_step "Checking Docker Compose..."

    # Check for docker compose (v2) or docker-compose (v1)
    if docker compose version > /dev/null 2>&1; then
        print_success "Docker Compose v2 is available"
        DOCKER_COMPOSE="docker compose"
        return 0
    elif command_exists docker-compose; then
        print_success "Docker Compose v1 is available"
        DOCKER_COMPOSE="docker-compose"
        return 0
    else
        print_warning "Docker Compose is not available"
        return 1
    fi
}

# ============================================================================
# Start Services
# ============================================================================

start_ollama() {
    print_step "Starting Ollama service..."

    # Check if Ollama is already running
    if curl -s "$OLLAMA_BASE_URL/api/tags" > /dev/null 2>&1; then
        print_success "Ollama is already running at $OLLAMA_BASE_URL"
        return 0
    fi

    # Try to start Ollama
    if command_exists ollama; then
        print_info "Starting Ollama in the background..."

        if [[ "$OSTYPE" == "darwin"* ]]; then
            # On macOS, Ollama might be a GUI app
            open -a Ollama 2>/dev/null || ollama serve &
        else
            ollama serve &
        fi

        # Wait for it to be ready
        if wait_for_service "$OLLAMA_BASE_URL/api/tags" "Ollama" 30; then
            print_success "Ollama started successfully"
            return 0
        else
            print_error "Failed to start Ollama"
            return 1
        fi
    else
        print_error "Ollama is not installed"
        return 1
    fi
}

start_qdrant() {
    print_step "Starting Qdrant vector database..."

    # Check if Qdrant is already running
    if curl -s "$QDRANT_URL/readyz" > /dev/null 2>&1; then
        print_success "Qdrant is already running at $QDRANT_URL"
        return 0
    fi

    local qdrant_dir="$PROJECT_DIR/docker/qdrant"

    if [ ! -f "$qdrant_dir/docker-compose.yml" ]; then
        print_error "Qdrant docker-compose.yml not found at $qdrant_dir"
        return 1
    fi

    # Create necessary directories
    mkdir -p "$qdrant_dir/data" "$qdrant_dir/snapshots"

    # Copy .env if not exists
    if [ ! -f "$qdrant_dir/.env" ] && [ -f "$qdrant_dir/.env.example" ]; then
        cp "$qdrant_dir/.env.example" "$qdrant_dir/.env"
        print_info "Created Qdrant .env from template"
    fi

    # Create Docker network if not exists
    docker network create alabobai-network 2>/dev/null || true

    # Start Qdrant
    print_info "Starting Qdrant container..."
    cd "$qdrant_dir"
    $DOCKER_COMPOSE up -d
    cd "$PROJECT_DIR"

    # Wait for it to be ready
    if wait_for_service "$QDRANT_URL/readyz" "Qdrant" 60; then
        print_success "Qdrant started successfully"
        print_info "Dashboard available at: $QDRANT_URL/dashboard"
        return 0
    else
        print_error "Failed to start Qdrant"
        return 1
    fi
}

# ============================================================================
# Pull Models
# ============================================================================

pull_models() {
    print_step "Pulling AI models..."

    if ! curl -s "$OLLAMA_BASE_URL/api/tags" > /dev/null 2>&1; then
        print_error "Ollama is not running. Please start Ollama first."
        return 1
    fi

    local models=("$DEFAULT_CHAT_MODEL" "$DEFAULT_EMBEDDING_MODEL")

    for model in "${models[@]}"; do
        echo ""
        print_info "Pulling model: $model"

        # Check if model already exists
        if curl -s "$OLLAMA_BASE_URL/api/show" -d "{\"name\": \"$model\"}" | grep -q "modelfile"; then
            print_success "Model $model is already available"
        else
            # Pull the model
            if ollama pull "$model"; then
                print_success "Successfully pulled $model"
            else
                print_warning "Failed to pull $model (you can try again later with: ollama pull $model)"
            fi
        fi
    done
}

# ============================================================================
# Create Qdrant Collections
# ============================================================================

create_collections() {
    print_step "Creating Qdrant collections..."

    if ! curl -s "$QDRANT_URL/readyz" > /dev/null 2>&1; then
        print_error "Qdrant is not running. Please start Qdrant first."
        return 1
    fi

    # Default collection for knowledge base
    local collections=(
        "alabobai_knowledge:768"
        "alabobai_conversations:768"
        "alabobai_documents:768"
    )

    for entry in "${collections[@]}"; do
        IFS=':' read -r name size <<< "$entry"

        # Check if collection exists
        local exists=$(curl -s "$QDRANT_URL/collections/$name" | grep -c '"status":"ok"' || echo "0")

        if [ "$exists" -gt 0 ]; then
            print_success "Collection '$name' already exists"
        else
            print_info "Creating collection '$name' (vector size: $size)..."

            local response=$(curl -s -X PUT "$QDRANT_URL/collections/$name" \
                -H "Content-Type: application/json" \
                -d "{
                    \"vectors\": {
                        \"size\": $size,
                        \"distance\": \"Cosine\"
                    },
                    \"optimizers_config\": {
                        \"default_segment_number\": 2
                    },
                    \"replication_factor\": 1
                }")

            if echo "$response" | grep -q '"status":"ok"'; then
                print_success "Created collection '$name'"
            else
                print_warning "Failed to create collection '$name': $response"
            fi
        fi
    done
}

# ============================================================================
# Verify Setup
# ============================================================================

verify_setup() {
    print_step "Verifying setup..."

    local all_good=true

    # Check Ollama
    if curl -s "$OLLAMA_BASE_URL/api/tags" > /dev/null 2>&1; then
        local models=$(curl -s "$OLLAMA_BASE_URL/api/tags" | grep -o '"name":"[^"]*"' | wc -l)
        print_success "Ollama: Running with $models model(s)"
    else
        print_error "Ollama: Not running"
        all_good=false
    fi

    # Check Qdrant
    if curl -s "$QDRANT_URL/readyz" > /dev/null 2>&1; then
        local collections=$(curl -s "$QDRANT_URL/collections" | grep -o '"name":"[^"]*"' | wc -l)
        print_success "Qdrant: Running with $collections collection(s)"
    else
        print_error "Qdrant: Not running"
        all_good=false
    fi

    # Check for required models
    if curl -s "$OLLAMA_BASE_URL/api/show" -d "{\"name\": \"$DEFAULT_CHAT_MODEL\"}" | grep -q "modelfile"; then
        print_success "Chat model ($DEFAULT_CHAT_MODEL): Available"
    else
        print_warning "Chat model ($DEFAULT_CHAT_MODEL): Not found (run: ollama pull $DEFAULT_CHAT_MODEL)"
        all_good=false
    fi

    if curl -s "$OLLAMA_BASE_URL/api/show" -d "{\"name\": \"$DEFAULT_EMBEDDING_MODEL\"}" | grep -q "modelfile"; then
        print_success "Embedding model ($DEFAULT_EMBEDDING_MODEL): Available"
    else
        print_warning "Embedding model ($DEFAULT_EMBEDDING_MODEL): Not found (run: ollama pull $DEFAULT_EMBEDDING_MODEL)"
        all_good=false
    fi

    echo ""
    if [ "$all_good" = true ]; then
        echo -e "${GREEN}All components are ready!${NC}"
    else
        echo -e "${YELLOW}Some components need attention. See warnings above.${NC}"
    fi
}

# ============================================================================
# Print Summary
# ============================================================================

print_summary() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                        ${GREEN}SETUP COMPLETE${NC}                              ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Services:"
    echo "  Ollama API:        $OLLAMA_BASE_URL"
    echo "  Qdrant REST API:   $QDRANT_URL"
    echo "  Qdrant Dashboard:  $QDRANT_URL/dashboard"
    echo ""
    echo "Models:"
    echo "  Chat:      $DEFAULT_CHAT_MODEL"
    echo "  Embedding: $DEFAULT_EMBEDDING_MODEL"
    echo ""
    echo "Next steps:"
    echo "  1. Start the Alabobai server:    npm run dev"
    echo "  2. Ingest documents:             ./scripts/ingest-docs.sh /path/to/docs"
    echo "  3. Pull more models:             ./scripts/pull-models.sh"
    echo ""
    echo "Configuration (set in .env):"
    echo "  OLLAMA_BASE_URL=$OLLAMA_BASE_URL"
    echo "  QDRANT_URL=$QDRANT_URL"
    echo "  OLLAMA_DEFAULT_MODEL=$DEFAULT_CHAT_MODEL"
    echo "  OLLAMA_EMBEDDING_MODEL=$DEFAULT_EMBEDDING_MODEL"
    echo ""
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    print_header

    local skip_ollama=false
    local skip_qdrant=false
    local skip_models=false
    local skip_collections=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-ollama)
                skip_ollama=true
                shift
                ;;
            --skip-qdrant)
                skip_qdrant=true
                shift
                ;;
            --skip-models)
                skip_models=true
                shift
                ;;
            --skip-collections)
                skip_collections=true
                shift
                ;;
            --verify-only)
                verify_setup
                exit 0
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-ollama       Skip Ollama setup"
                echo "  --skip-qdrant       Skip Qdrant setup"
                echo "  --skip-models       Skip model pulling"
                echo "  --skip-collections  Skip collection creation"
                echo "  --verify-only       Only verify existing setup"
                echo "  --help, -h          Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Check Ollama
    if [ "$skip_ollama" = false ]; then
        if ! check_ollama; then
            print_warning "Please install Ollama and run this script again."
            echo "  You can skip this check with: $0 --skip-ollama"
            exit 1
        fi
        start_ollama || true
    fi

    # Check Docker and Docker Compose
    if [ "$skip_qdrant" = false ]; then
        if ! check_docker; then
            print_warning "Please install Docker and run this script again."
            echo "  You can skip this check with: $0 --skip-qdrant"
            exit 1
        fi

        if ! check_docker_compose; then
            print_warning "Please install Docker Compose and run this script again."
            exit 1
        fi

        start_qdrant || true
    fi

    # Pull models
    if [ "$skip_models" = false ]; then
        pull_models || true
    fi

    # Create collections
    if [ "$skip_collections" = false ]; then
        create_collections || true
    fi

    # Verify and summarize
    verify_setup
    print_summary
}

# Run main function
main "$@"

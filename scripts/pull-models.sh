#!/bin/bash

# ============================================================================
# Alabobai Model Pull Script
# ============================================================================
# Pull AI models for local inference with Ollama
#
# Usage:
#   ./pull-models.sh              # Pull recommended models
#   ./pull-models.sh --all        # Pull all supported models
#   ./pull-models.sh llama3.1     # Pull specific model
#   ./pull-models.sh --list       # List available models
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

# ============================================================================
# Model Definitions
# ============================================================================

# Format: "name:size_gb:description:recommended"
declare -a MODELS=(
    # General Purpose - Recommended
    "llama3.1:4.7:Latest Llama model, excellent general purpose (8B):true"
    "llama3.1:70b:40:High quality responses, requires 48GB+ RAM:false"

    # Embeddings - Recommended
    "nomic-embed-text:0.3:Fast embeddings, 768 dimensions:true"
    "mxbai-embed-large:0.7:High quality embeddings, 1024 dimensions:false"

    # Code Generation
    "codellama:3.8:Code-specialized Llama, great for programming:false"
    "codellama:34b:22:Large code model for complex tasks:false"
    "deepseek-coder:1.3:Compact code model:false"
    "deepseek-coder:6.7b:3.8:Balanced code model:false"
    "qwen2.5-coder:4.4:Advanced code model from Alibaba:false"

    # Balanced Models
    "mixtral:8x7b:26:Mixture of experts, good quality (requires 32GB+ RAM):false"
    "mistral:4.1:Fast and capable general model:false"
    "phi3:2.2:Microsoft's compact but capable model:false"
    "qwen2.5:4.4:Strong multilingual model from Alibaba:false"

    # Vision Models
    "llava:4.5:Vision-language model, can analyze images:false"
    "bakllava:4.5:Alternative vision model:false"
    "moondream:1.7:Compact vision model:false"

    # Specialized
    "dolphin-mixtral:8x7b:26:Uncensored Mixtral variant:false"
    "neural-chat:4.1:Intel's optimized chat model:false"
    "starling-lm:4.1:High benchmark scores:false"
    "yi:6b:3.5:Chinese/English bilingual model:false"
)

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                                    ║${NC}"
    echo -e "${CYAN}║${NC}          ${BLUE}ALABOBAI MODEL MANAGER${NC}                                    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}          Pull and manage Ollama models                             ${CYAN}║${NC}"
    echo -e "${CYAN}║                                                                    ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
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

check_ollama() {
    if ! curl -s "$OLLAMA_BASE_URL/api/tags" > /dev/null 2>&1; then
        print_error "Ollama is not running at $OLLAMA_BASE_URL"
        echo ""
        echo "Please start Ollama first:"
        echo "  - macOS: Open the Ollama app or run 'ollama serve'"
        echo "  - Linux: Run 'ollama serve' or 'systemctl start ollama'"
        echo ""
        exit 1
    fi
}

get_system_ram() {
    local ram_gb=0
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ram_gb=$(($(sysctl -n hw.memsize) / 1024 / 1024 / 1024))
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        ram_gb=$(free -g | awk '/^Mem:/{print $2}')
    fi
    echo $ram_gb
}

is_model_installed() {
    local model_name=$1
    curl -s "$OLLAMA_BASE_URL/api/show" -d "{\"name\": \"$model_name\"}" 2>/dev/null | grep -q "modelfile"
}

format_size() {
    local size=$1
    if (( $(echo "$size < 1" | bc -l) )); then
        echo "${size}GB"
    elif (( $(echo "$size >= 1" | bc -l) )); then
        echo "${size}GB"
    fi
}

# ============================================================================
# List Models
# ============================================================================

list_models() {
    local show_all=${1:-false}
    local ram_gb=$(get_system_ram)

    echo ""
    echo -e "${BLUE}Available Models${NC}"
    echo -e "${BLUE}================${NC}"
    echo ""
    printf "%-25s %-8s %-10s %-50s\n" "MODEL" "SIZE" "STATUS" "DESCRIPTION"
    printf "%-25s %-8s %-10s %-50s\n" "-----" "----" "------" "-----------"

    for entry in "${MODELS[@]}"; do
        IFS=':' read -r name size desc recommended <<< "$entry"

        # Skip non-recommended if not showing all
        if [ "$show_all" = false ] && [ "$recommended" != "true" ]; then
            continue
        fi

        local status=""
        local status_color=""

        if is_model_installed "$name"; then
            status="installed"
            status_color="${GREEN}"
        else
            # Check if system has enough RAM
            local size_num=$(echo "$size" | sed 's/[^0-9.]//g')
            if (( $(echo "$size_num * 1.5 > $ram_gb" | bc -l) )); then
                status="low RAM"
                status_color="${YELLOW}"
            else
                status="available"
                status_color="${NC}"
            fi
        fi

        local rec_marker=""
        if [ "$recommended" = "true" ]; then
            rec_marker=" *"
        fi

        printf "%-25s %-8s ${status_color}%-10s${NC} %-50s\n" "${name}${rec_marker}" "$(format_size $size)" "$status" "$desc"
    done

    echo ""
    echo "* = Recommended for most users"
    echo ""
    echo "Your system RAM: ${ram_gb}GB"
    echo ""
    echo "Usage:"
    echo "  ./pull-models.sh               # Pull recommended models"
    echo "  ./pull-models.sh --all         # Show all models"
    echo "  ./pull-models.sh <model-name>  # Pull specific model"
    echo ""
}

# ============================================================================
# Pull Model
# ============================================================================

pull_model() {
    local model=$1

    echo ""
    print_info "Pulling model: $model"

    if is_model_installed "$model"; then
        print_success "Model $model is already installed"
        return 0
    fi

    echo ""
    echo "This may take a while depending on model size and internet speed..."
    echo ""

    # Pull with progress
    if ollama pull "$model"; then
        echo ""
        print_success "Successfully pulled $model"
        return 0
    else
        echo ""
        print_error "Failed to pull $model"
        return 1
    fi
}

pull_recommended() {
    print_info "Pulling recommended models..."

    local success_count=0
    local fail_count=0

    for entry in "${MODELS[@]}"; do
        IFS=':' read -r name size desc recommended <<< "$entry"

        if [ "$recommended" = "true" ]; then
            if pull_model "$name"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
        fi
    done

    echo ""
    echo "═══════════════════════════════════════"
    echo "Results: $success_count succeeded, $fail_count failed"
    echo "═══════════════════════════════════════"
}

pull_all() {
    local ram_gb=$(get_system_ram)
    print_info "Pulling all models suitable for your system (${ram_gb}GB RAM)..."

    local success_count=0
    local fail_count=0
    local skip_count=0

    for entry in "${MODELS[@]}"; do
        IFS=':' read -r name size desc recommended <<< "$entry"

        local size_num=$(echo "$size" | sed 's/[^0-9.]//g')

        # Skip if not enough RAM (need ~1.5x model size)
        if (( $(echo "$size_num * 1.5 > $ram_gb" | bc -l) )); then
            print_warning "Skipping $name (requires more RAM)"
            ((skip_count++))
            continue
        fi

        if pull_model "$name"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
    done

    echo ""
    echo "═══════════════════════════════════════"
    echo "Results: $success_count succeeded, $fail_count failed, $skip_count skipped"
    echo "═══════════════════════════════════════"
}

# ============================================================================
# List Installed Models
# ============================================================================

list_installed() {
    echo ""
    print_info "Installed models:"
    echo ""

    local response=$(curl -s "$OLLAMA_BASE_URL/api/tags")

    if [ -z "$response" ] || [ "$response" = "null" ]; then
        echo "No models installed"
        return
    fi

    # Parse and display models
    echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = data.get('models', [])
    if not models:
        print('No models installed')
    else:
        print(f'{'MODEL':<30} {'SIZE':<12} {'MODIFIED':<20}')
        print(f'{'-'*30} {'-'*12} {'-'*20}')
        for m in models:
            name = m.get('name', 'unknown')
            size = m.get('size', 0)
            size_gb = size / (1024**3)
            modified = m.get('modified_at', 'unknown')[:19]
            print(f'{name:<30} {size_gb:>8.1f} GB  {modified:<20}')
except Exception as e:
    print(f'Error parsing response: {e}')
" 2>/dev/null || echo "$response" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g; s/"//g'

    echo ""
}

# ============================================================================
# Remove Model
# ============================================================================

remove_model() {
    local model=$1

    echo ""
    print_info "Removing model: $model"

    if ! is_model_installed "$model"; then
        print_warning "Model $model is not installed"
        return 1
    fi

    if ollama rm "$model"; then
        print_success "Successfully removed $model"
        return 0
    else
        print_error "Failed to remove $model"
        return 1
    fi
}

# ============================================================================
# Show Usage
# ============================================================================

show_usage() {
    echo "Usage: $0 [OPTIONS] [MODEL...]"
    echo ""
    echo "Options:"
    echo "  --list, -l          List available models"
    echo "  --all, -a           Pull all suitable models / List all models"
    echo "  --installed, -i     List installed models"
    echo "  --remove, -r MODEL  Remove a model"
    echo "  --help, -h          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  Pull recommended models"
    echo "  $0 llama3.1         Pull specific model"
    echo "  $0 codellama phi3   Pull multiple models"
    echo "  $0 --list           List available models"
    echo "  $0 --list --all     List all models"
    echo "  $0 --installed      Show installed models"
    echo "  $0 --remove phi3    Remove a model"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_header
    check_ollama

    # Handle no arguments - pull recommended
    if [ $# -eq 0 ]; then
        pull_recommended
        exit 0
    fi

    # Parse arguments
    case "$1" in
        --list|-l)
            if [ "$2" = "--all" ] || [ "$2" = "-a" ]; then
                list_models true
            else
                list_models false
            fi
            ;;
        --all|-a)
            if [ "$2" = "--list" ] || [ "$2" = "-l" ]; then
                list_models true
            else
                pull_all
            fi
            ;;
        --installed|-i)
            list_installed
            ;;
        --remove|-r)
            if [ -z "$2" ]; then
                print_error "Please specify a model to remove"
                exit 1
            fi
            remove_model "$2"
            ;;
        --help|-h)
            show_usage
            ;;
        --*)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            # Pull specified models
            for model in "$@"; do
                pull_model "$model"
            done
            ;;
    esac
}

main "$@"

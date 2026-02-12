#!/bin/bash

# ============================================================================
# Alabobai Document Ingestion Script
# ============================================================================
# Bulk ingest documents into the Alabobai knowledge base
#
# Usage:
#   ./ingest-docs.sh /path/to/documents
#   ./ingest-docs.sh /path/to/documents --recursive
#   ./ingest-docs.sh file1.pdf file2.md file3.txt
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
API_BASE_URL="${API_BASE_URL:-http://localhost:8888}"
INGEST_ENDPOINT="${INGEST_ENDPOINT:-/api/knowledge/ingest}"
COLLECTION="${COLLECTION:-alabobai_knowledge}"

# Supported file types
SUPPORTED_EXTENSIONS="pdf txt md json csv html xml rst"

# Counters
TOTAL_FILES=0
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                                    ║${NC}"
    echo -e "${CYAN}║${NC}          ${BLUE}ALABOBAI DOCUMENT INGESTION${NC}                               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}          Bulk load documents into the knowledge base               ${CYAN}║${NC}"
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

print_progress() {
    local current=$1
    local total=$2
    local file=$3
    local pct=$((current * 100 / total))
    printf "\r${BLUE}[%3d%%]${NC} Processing %d/%d: %-50s" "$pct" "$current" "$total" "${file:0:50}"
}

is_supported_file() {
    local file=$1
    local ext="${file##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    for supported in $SUPPORTED_EXTENSIONS; do
        if [ "$ext" = "$supported" ]; then
            return 0
        fi
    done
    return 1
}

get_file_size() {
    local file=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        stat -f%z "$file" 2>/dev/null || echo 0
    else
        stat --printf="%s" "$file" 2>/dev/null || echo 0
    fi
}

format_size() {
    local bytes=$1
    if [ "$bytes" -lt 1024 ]; then
        echo "${bytes}B"
    elif [ "$bytes" -lt 1048576 ]; then
        echo "$((bytes / 1024))KB"
    else
        echo "$((bytes / 1048576))MB"
    fi
}

check_api() {
    print_info "Checking API availability..."

    if curl -s "${API_BASE_URL}/api/health" > /dev/null 2>&1; then
        print_success "API is available at $API_BASE_URL"
        return 0
    else
        print_error "API is not available at $API_BASE_URL"
        echo ""
        echo "Please ensure the Alabobai server is running:"
        echo "  npm run dev"
        echo ""
        echo "Or set a custom API URL:"
        echo "  API_BASE_URL=http://your-server:port $0 /path/to/docs"
        echo ""
        return 1
    fi
}

# ============================================================================
# Ingestion Functions
# ============================================================================

ingest_file() {
    local file=$1
    local filename=$(basename "$file")
    local ext="${file##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    # Determine content type
    local content_type="text/plain"
    case "$ext" in
        pdf) content_type="application/pdf" ;;
        json) content_type="application/json" ;;
        csv) content_type="text/csv" ;;
        md) content_type="text/markdown" ;;
        html) content_type="text/html" ;;
        xml) content_type="application/xml" ;;
    esac

    # Try multipart file upload first
    local response=$(curl -s -X POST "${API_BASE_URL}${INGEST_ENDPOINT}" \
        -H "Accept: application/json" \
        -F "file=@${file};type=${content_type}" \
        -F "collection=${COLLECTION}" \
        -F "filename=${filename}" \
        2>/dev/null)

    # Check response
    if [ -z "$response" ]; then
        # Try alternative text-based endpoint
        if [ "$ext" = "txt" ] || [ "$ext" = "md" ]; then
            local content=$(cat "$file")
            response=$(curl -s -X POST "${API_BASE_URL}${INGEST_ENDPOINT}" \
                -H "Content-Type: application/json" \
                -H "Accept: application/json" \
                -d "{
                    \"text\": $(echo "$content" | jq -Rs .),
                    \"sourceName\": \"${filename}\",
                    \"collection\": \"${COLLECTION}\"
                }" 2>/dev/null)
        fi
    fi

    # Evaluate success
    if echo "$response" | grep -qi '"success"\s*:\s*true\|"documentId"\|"id"\|"chunksCreated"'; then
        return 0
    elif echo "$response" | grep -qi 'error\|failed'; then
        echo "$response" > /tmp/ingest_error.log
        return 1
    else
        # Assume success if no error
        return 0
    fi
}

ingest_url() {
    local url=$1

    local response=$(curl -s -X POST "${API_BASE_URL}${INGEST_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "{
            \"url\": \"${url}\",
            \"collection\": \"${COLLECTION}\"
        }" 2>/dev/null)

    if echo "$response" | grep -qi '"success"\s*:\s*true\|"documentId"\|"id"'; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Directory Processing
# ============================================================================

find_files() {
    local dir=$1
    local recursive=$2

    local find_args=""
    if [ "$recursive" = false ]; then
        find_args="-maxdepth 1"
    fi

    local files=()

    for ext in $SUPPORTED_EXTENSIONS; do
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$dir" $find_args -type f -iname "*.${ext}" -print0 2>/dev/null)
    done

    printf '%s\n' "${files[@]}"
}

process_directory() {
    local dir=$1
    local recursive=$2

    if [ ! -d "$dir" ]; then
        print_error "Directory not found: $dir"
        return 1
    fi

    print_info "Scanning directory: $dir"
    if [ "$recursive" = true ]; then
        print_info "Recursive mode enabled"
    fi

    # Find all supported files
    local files=()
    while IFS= read -r file; do
        [ -n "$file" ] && files+=("$file")
    done < <(find_files "$dir" "$recursive")

    if [ ${#files[@]} -eq 0 ]; then
        print_warning "No supported files found in $dir"
        echo "Supported formats: $SUPPORTED_EXTENSIONS"
        return 0
    fi

    TOTAL_FILES=${#files[@]}
    print_info "Found $TOTAL_FILES files to process"
    echo ""

    local current=0
    for file in "${files[@]}"; do
        ((current++))
        local filename=$(basename "$file")
        local size=$(get_file_size "$file")

        print_progress "$current" "$TOTAL_FILES" "$filename"

        if ingest_file "$file"; then
            ((SUCCESS_COUNT++))
        else
            ((FAIL_COUNT++))
            echo ""
            print_warning "Failed to ingest: $filename"
        fi
    done

    echo ""
}

process_files() {
    local files=("$@")

    TOTAL_FILES=${#files[@]}
    print_info "Processing $TOTAL_FILES files"
    echo ""

    local current=0
    for file in "${files[@]}"; do
        ((current++))

        # Handle URLs
        if [[ "$file" =~ ^https?:// ]]; then
            print_progress "$current" "$TOTAL_FILES" "$file"
            if ingest_url "$file"; then
                ((SUCCESS_COUNT++))
            else
                ((FAIL_COUNT++))
                echo ""
                print_warning "Failed to ingest URL: $file"
            fi
            continue
        fi

        # Handle files
        if [ ! -f "$file" ]; then
            print_warning "File not found: $file"
            ((SKIP_COUNT++))
            continue
        fi

        if ! is_supported_file "$file"; then
            print_warning "Unsupported file type: $file"
            ((SKIP_COUNT++))
            continue
        fi

        local filename=$(basename "$file")
        print_progress "$current" "$TOTAL_FILES" "$filename"

        if ingest_file "$file"; then
            ((SUCCESS_COUNT++))
        else
            ((FAIL_COUNT++))
            echo ""
            print_warning "Failed to ingest: $filename"
        fi
    done

    echo ""
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                     INGESTION SUMMARY${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Total files:     $TOTAL_FILES"
    echo -e "  Successful:      ${GREEN}$SUCCESS_COUNT${NC}"
    if [ $FAIL_COUNT -gt 0 ]; then
        echo -e "  Failed:          ${RED}$FAIL_COUNT${NC}"
    else
        echo "  Failed:          $FAIL_COUNT"
    fi
    if [ $SKIP_COUNT -gt 0 ]; then
        echo -e "  Skipped:         ${YELLOW}$SKIP_COUNT${NC}"
    fi
    echo ""
    echo "  Collection:      $COLLECTION"
    echo ""

    if [ $SUCCESS_COUNT -gt 0 ]; then
        echo -e "${GREEN}Documents are now available for RAG queries!${NC}"
    fi

    if [ $FAIL_COUNT -gt 0 ]; then
        echo ""
        echo "Check /tmp/ingest_error.log for error details"
    fi

    echo ""
}

# ============================================================================
# Usage
# ============================================================================

show_usage() {
    echo "Usage: $0 [OPTIONS] <path|file|url>..."
    echo ""
    echo "Options:"
    echo "  -r, --recursive     Recursively process subdirectories"
    echo "  -c, --collection    Specify collection name (default: $COLLECTION)"
    echo "  --dry-run           Show files that would be processed without ingesting"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Arguments:"
    echo "  path                Directory containing documents"
    echo "  file                Individual file(s) to ingest"
    echo "  url                 URL(s) to fetch and ingest"
    echo ""
    echo "Supported file types: $SUPPORTED_EXTENSIONS"
    echo ""
    echo "Examples:"
    echo "  $0 /path/to/documents                    # Ingest all files in directory"
    echo "  $0 /path/to/documents --recursive       # Include subdirectories"
    echo "  $0 report.pdf notes.md data.csv         # Ingest specific files"
    echo "  $0 https://example.com/article          # Ingest from URL"
    echo "  $0 -c my_project /docs                  # Use custom collection"
    echo ""
    echo "Environment variables:"
    echo "  API_BASE_URL        Server URL (default: http://localhost:8888)"
    echo "  COLLECTION          Default collection name"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_header

    # Parse arguments
    local recursive=false
    local dry_run=false
    local paths=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            -r|--recursive)
                recursive=true
                shift
                ;;
            -c|--collection)
                COLLECTION="$2"
                shift 2
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                paths+=("$1")
                shift
                ;;
        esac
    done

    # Check for paths
    if [ ${#paths[@]} -eq 0 ]; then
        print_error "No path or files specified"
        echo ""
        show_usage
        exit 1
    fi

    # Check API
    if [ "$dry_run" = false ]; then
        if ! check_api; then
            exit 1
        fi
    fi

    # Process paths
    for path in "${paths[@]}"; do
        if [[ "$path" =~ ^https?:// ]]; then
            # URL
            if [ "$dry_run" = true ]; then
                echo "Would ingest URL: $path"
            else
                process_files "$path"
            fi
        elif [ -d "$path" ]; then
            # Directory
            if [ "$dry_run" = true ]; then
                print_info "Files that would be processed from: $path"
                find_files "$path" "$recursive"
            else
                process_directory "$path" "$recursive"
            fi
        elif [ -f "$path" ]; then
            # File
            if [ "$dry_run" = true ]; then
                echo "Would ingest: $path"
            else
                process_files "$path"
            fi
        else
            print_warning "Path not found: $path"
            ((SKIP_COUNT++))
        fi
    done

    # Summary
    if [ "$dry_run" = false ]; then
        print_summary
    fi
}

main "$@"

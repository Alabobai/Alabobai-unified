# Alabobai Unified Platform - Production Dockerfile
# Multi-stage build for optimal image size

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (sharp, better-sqlite3)
RUN apk add --no-cache python3 make g++ vips-dev

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install build dependencies for native modules (sharp, better-sqlite3)
RUN apk add --no-cache python3 make g++ vips-dev

# Create non-root user for security
RUN addgroup -g 1001 -S alabobai && \
    adduser -S alabobai -u 1001

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Create data directory for SQLite
RUN mkdir -p ./data && chown -R alabobai:alabobai ./data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8888

# Switch to non-root user
USER alabobai

# Expose port
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8888/api/agents || exit 1

# Start the server
CMD ["node", "dist/index.js"]

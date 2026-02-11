# Alabobai Sandbox Docker Image
# Provides an isolated execution environment for tasks
#
# Features:
# - Ubuntu 22.04 LTS base
# - Python 3.11 with common packages
# - Node.js 20 LTS with npm
# - Chromium for headless browser automation
# - Common development tools

FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# ============================================================================
# BASE SYSTEM SETUP
# ============================================================================

# Update and install base packages
RUN apt-get update && apt-get install -y \
    # Essential tools
    curl \
    wget \
    git \
    unzip \
    zip \
    jq \
    vim-tiny \
    nano \
    # Build essentials
    build-essential \
    gcc \
    g++ \
    make \
    # Python dependencies
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    # Network tools
    ca-certificates \
    gnupg \
    lsb-release \
    # Process management
    procps \
    htop \
    # For Chromium/Puppeteer
    chromium-browser \
    chromium-chromedriver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# NODE.JS INSTALLATION
# ============================================================================

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node --version && npm --version

# Install common global npm packages
RUN npm install -g \
    typescript \
    ts-node \
    tsx \
    prettier \
    eslint \
    npm-check-updates \
    && npm cache clean --force

# ============================================================================
# PYTHON SETUP
# ============================================================================

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Upgrade pip
RUN python -m pip install --upgrade pip setuptools wheel

# Install common Python packages
RUN pip install --no-cache-dir \
    # Data science essentials
    numpy \
    pandas \
    matplotlib \
    seaborn \
    scipy \
    scikit-learn \
    # Web & API
    requests \
    httpx \
    aiohttp \
    beautifulsoup4 \
    lxml \
    selenium \
    # Automation
    playwright \
    pyautogui \
    # Utilities
    python-dotenv \
    pyyaml \
    jsonschema \
    pydantic \
    rich \
    click \
    typer \
    # Image processing
    pillow \
    opencv-python-headless \
    # Testing
    pytest \
    pytest-asyncio

# Install Playwright browsers
RUN playwright install chromium --with-deps

# ============================================================================
# ENVIRONMENT CONFIGURATION
# ============================================================================

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    CHROMIUM_PATH=/usr/bin/chromium-browser

# Create workspace directory
WORKDIR /workspace

# Create non-root user for safer execution (optional, containers run as root by default)
RUN useradd -m -s /bin/bash sandbox \
    && chown -R sandbox:sandbox /workspace

# ============================================================================
# HEALTH CHECK & ENTRYPOINT
# ============================================================================

# Health check - verify tools are available
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python --version && node --version && chromium-browser --version || exit 1

# Default command - keep container running
CMD ["tail", "-f", "/dev/null"]

# ============================================================================
# LABELS
# ============================================================================

LABEL org.opencontainers.image.title="Alabobai Sandbox" \
      org.opencontainers.image.description="Isolated execution environment for Alabobai tasks" \
      org.opencontainers.image.vendor="Alabobai" \
      org.opencontainers.image.version="1.0.0" \
      alabobai.sandbox="true"

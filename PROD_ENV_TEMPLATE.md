# Production Environment Template

Use strong random secrets in production (do not reuse dev values).

```env
NODE_ENV=production
PORT=8888

# CORS lock-down (comma-separated)
CORS_ORIGINS=https://app.yourcompany.com,https://admin.yourcompany.com

# Role API keys
ADMIN_API_KEY=replace-with-64-char-random
OPERATOR_API_KEY=replace-with-64-char-random
VIEWER_API_KEY=replace-with-64-char-random

# Session/JWT signing
SESSION_TOKEN_SECRET=replace-with-very-long-random
JWT_SECRET=replace-with-very-long-random
JWT_REFRESH_SECRET=replace-with-very-long-random

# LLM provider
LLM_PROVIDER=groq
GROQ_API_KEY=your-prod-key
LLM_MODEL=llama-3.3-70b-versatile

# Storage
DATABASE_PATH=./data/alabobai.db

# Optional local AI infra
OLLAMA_BASE_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
```

## Secret generation (macOS/Linux)

```bash
openssl rand -hex 32
```

Run it once per key.

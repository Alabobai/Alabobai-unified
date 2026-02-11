# Alabobai Unified Platform

**Your AI Operating System** - Every person with their own "cabinet" of AI agents.

## What Is This?

Alabobai is a unified AI platform that gives you:

- **ChatGPT-like interface** - Talk naturally to get things done
- **Manus AI capabilities** - Autonomous task execution
- **Computer control** - AI that can see your screen and control your computer
- **App builder** - Generate full-stack apps from natural language (like Bolt.new)
- **Advisory agents** - Specialized AI for wealth, credit, legal, business, health

Think of it as having a team of expert advisors (your "cabinet") who work autonomously but ask for your approval on important decisions.

## Quick Start

```bash
# Install dependencies
cd alabobai-unified
npm install

# Configure environment
cp config/.env.example config/.env
# Edit config/.env with your API keys

# Start the platform
npm run dev
```

Open http://localhost:8888 - you'll see the chat interface ready to go.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CHAT INTERFACE                            │
│  • Web/Desktop/Mobile                                        │
│  • Voice input/output                                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    ORCHESTRATOR                              │
│  • Intent detection                                          │
│  • Task routing                                              │
│  • Approval workflow                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌─────────┐         ┌─────────┐          ┌─────────┐
│ADVISORY │         │COMPUTER │          │ BUILDER │
│ AGENTS  │         │ CONTROL │          │  AGENT  │
├─────────┤         ├─────────┤          ├─────────┤
│Wealth   │         │Screen   │          │Apps     │
│Credit   │         │Mouse    │          │Websites │
│Legal    │         │Keyboard │          │APIs     │
│Business │         │Browser  │          │Code     │
│Health   │         │Files    │          │Deploy   │
└─────────┘         └─────────┘          └─────────┘
```

## Directory Structure

```
alabobai-unified/
├── src/
│   ├── core/                 # Core platform
│   │   ├── types.ts          # TypeScript types
│   │   ├── orchestrator.ts   # The "brain"
│   │   ├── agent-registry.ts # Agent management
│   │   ├── llm-client.ts     # LLM abstraction
│   │   └── memory.ts         # Persistent memory
│   ├── agents/               # Agent implementations
│   │   ├── advisory/         # Wealth, Credit, Legal, etc.
│   │   ├── computer-control/ # Screen control
│   │   ├── builder/          # App generation
│   │   └── research/         # Web search
│   ├── integrations/         # External integrations
│   │   ├── openmanus/        # OpenManus integration
│   │   ├── computer-use/     # Bytebot/CUA integration
│   │   ├── bolt-diy/         # Bolt.diy integration
│   │   └── voice/            # Deepgram integration
│   ├── ui/                   # React components
│   │   └── components/       # Chat interface
│   └── api/                  # REST + WebSocket server
│       └── server.ts
├── config/
│   └── .env.example          # Environment template
└── package.json
```

## API Endpoints

### Chat
- `POST /api/chat` - Send a message, get response
- `POST /api/chat/stream` - Stream response (SSE)
- `GET /api/chat/:sessionId/history` - Get conversation history

### Agents
- `GET /api/agents` - List all agents
- `GET /api/state` - System state (agents, tasks, approvals)

### Approvals
- `GET /api/approvals` - Pending approvals
- `POST /api/approvals/:id` - Approve/reject

### Computer Control
- `POST /api/computer/screenshot` - Capture screen
- `POST /api/computer/action` - Execute action

### Builder
- `POST /api/builder/generate` - Generate app from prompt

## WebSocket

Connect to `ws://localhost:8888?sessionId=YOUR_SESSION` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8888?sessionId=abc123');

ws.onmessage = (event) => {
  const { event, data } = JSON.parse(event.data);
  // Handle events: connected, chat-response, agent-started, approval-requested, etc.
};

// Send messages
ws.send(JSON.stringify({
  type: 'chat',
  content: 'Help me build a landing page',
  userId: 'user123'
}));
```

## Environment Variables

```env
# LLM
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# Voice
DEEPGRAM_API_KEY=your_key

# Server
PORT=8888

# Database
DATABASE_PATH=./data/alabobai.db

# Computer Control
ENABLE_SCREEN_CONTROL=true
ENABLE_MOUSE_CONTROL=true
ENABLE_KEYBOARD_CONTROL=true
```

## The "President with Cabinet" Pattern

Like a president with advisors, Alabobai:

1. **You ask** - "Help me apply for this government contract"
2. **Agents work** - ResearchLabobai finds requirements, LegalLabobai reviews terms
3. **Present solution** - "Here's the completed application. Review before I submit?"
4. **You approve** - "Looks good, submit it"
5. **Execute** - ComputerLabobai fills out the form and submits

High-risk actions (payments, emails, deletes) always require your approval.

## Development

```bash
# Run in development
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm run test

# Build for production
npm run build
npm start
```

## License

Proprietary - Alabobai Platform

---

**Built with Claude Code | Rose-Gold Intelligence | The Future of AI**

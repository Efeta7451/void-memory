# Void Memory — Installation Guide for Every LLM

**Your AI agent forgets everything on auto-compact. This fixes that.**

Void Memory works with any tool that supports the Model Context Protocol (MCP). One install, persistent memory across sessions.

---

## Table of Contents

1. [Quick Install (npm)](#quick-install)
2. [Claude Code](#claude-code)
3. [Claude Desktop](#claude-desktop)
4. [OpenClaw / GoClaw](#openclaw--goclaw)
5. [Cursor](#cursor)
6. [Windsurf](#windsurf)
7. [Continue.dev](#continuedev)
8. [Cline / Roo Code](#cline--roo-code)
9. [ChatGPT (via MCP bridge)](#chatgpt-via-mcp-bridge)
10. [Local Models (Ollama, LM Studio)](#local-models)
11. [Google Gemini CLI](#google-gemini-cli)
12. [Programmatic (TypeScript / Python)](#programmatic)
13. [Docker](#docker)
14. [Multi-Agent Setup](#multi-agent-setup)
15. [Noob Quick Start (Zero to Working in 5 Steps)](#noob-quick-start)

---

## Quick Install

```bash
npm install void-memory
```

That's it. The package includes the MCP server, the engine, and the SQLite database — zero external dependencies beyond `better-sqlite3`.

---

## Claude Code

Add to `~/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

Restart Claude Code. You now have 5 tools: `void_recall`, `void_store`, `void_stats`, `void_zones`, `void_explain`.

**Pro tip:** Add this to your CLAUDE.md so the agent recalls its identity after every auto-compact:

```markdown
After every auto-compact, run:
1. void_recall("who am I, what am I working on")
2. void_stats() to verify memory health
```

---

## Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["/path/to/node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "/path/to/my-memory"
      }
    }
  }
}
```

Use absolute paths for Claude Desktop (it doesn't resolve relative paths from your project).

---

## OpenClaw / GoClaw

OpenClaw is the hottest open-source AI coding CLI right now. Void Memory plugs right in.

### OpenClaw (Node-based)

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

Or via CLI:

```bash
openclaw config set mcpServers.void-memory.command "node"
openclaw config set mcpServers.void-memory.args '["node_modules/void-memory/dist/mcp-server.js"]'
openclaw config set mcpServers.void-memory.env.VOID_DATA_DIR "./memory"
```

### GoClaw (Go-based / `claw` CLI)

GoClaw uses TOML config at `~/.config/goclaw/config.toml`:

```toml
[mcp.servers.void-memory]
transport = "stdio"
command = "node"
args = ["node_modules/void-memory/dist/mcp-server.js"]

[mcp.servers.void-memory.env]
VOID_DATA_DIR = "./memory"
```

For HTTP transport (remote Void Memory server):

```toml
[mcp.servers.void-memory]
transport = "http"
url = "http://localhost:3410/mcp"
```

### OpenClaw Plugin Mode

If you want Void Memory as an OpenClaw memory plugin (auto-recall on startup, auto-capture on compact):

```json
{
  "plugins": {
    "entries": {
      "memory-void": {
        "enabled": true,
        "config": {
          "mcpServer": "void-memory",
          "autoRecall": true,
          "autoCapture": true
        }
      }
    },
    "slots": {
      "memory": "memory-void"
    }
  }
}
```

This replaces OpenClaw's built-in memory with Void Memory. Every auto-compact triggers a recall, every important conversation gets stored.

---

## Cursor

Add to `.cursor/mcp.json` in your project root (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

Restart Cursor after adding the config.

**Note:** Cursor has a 40-tool limit across all MCP servers. Void Memory uses only 5 tools, leaving plenty of room.

---

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

Quit and restart Windsurf to load the new config.

---

## Continue.dev

Continue.dev is an open-source AI coding assistant that supports MCP.

Edit `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: void-memory
    command: node
    args:
      - node_modules/void-memory/dist/mcp-server.js
    env:
      VOID_DATA_DIR: ./memory
```

Or if using `config.json`:

```json
{
  "mcpServers": [
    {
      "name": "void-memory",
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  ]
}
```

---

## Cline / Roo Code

Cline (VS Code extension) and Roo Code both support MCP servers.

In VS Code, open Cline settings and add an MCP server:

- **Name:** `void-memory`
- **Command:** `node`
- **Args:** `node_modules/void-memory/dist/mcp-server.js`
- **Env:** `VOID_DATA_DIR=./memory`

Or edit the Cline MCP config file directly:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

---

## ChatGPT (via MCP bridge)

ChatGPT supports MCP via remote servers, or you can use OpenAPI Actions for custom GPTs.

### Option 1: MCP bridge

```bash
# Start the dashboard/API server
npx void-memory-dashboard  # runs on port 3410
```

Expose via tunnel (for cloud-hosted GPTs):

```bash
# Cloudflare Tunnel (free)
cloudflared tunnel --url http://localhost:3410

# Or ngrok
ngrok http 3410

# Or Tailscale Funnel
tailscale funnel 3410
```

### Option 2: GPT Action (OpenAPI schema)

In the ChatGPT GPT builder, add a custom action with this schema:

```yaml
openapi: 3.0.0
info:
  title: Void Memory
  version: 1.0.0
servers:
  - url: https://your-tunnel-url.com
paths:
  /api/recall:
    post:
      operationId: recallMemory
      summary: Query persistent memory
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
                  description: What to search for
                budget:
                  type: integer
                  default: 2000
      responses:
        '200':
          description: Memory blocks matching the query
  /api/store:
    post:
      operationId: storeMemory
      summary: Store new knowledge
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [content, keywords]
              properties:
                content:
                  type: string
                keywords:
                  type: array
                  items:
                    type: string
                category:
                  type: string
                  enum: [fact, preference, context, skill, episode, decision]
      responses:
        '200':
          description: Block stored successfully
  /api/stats:
    get:
      operationId: memoryStats
      summary: Get memory health stats
      responses:
        '200':
          description: Memory statistics
```

### Option 3: OpenClaw bridge

If you're running OpenClaw with Void Memory, ChatGPT can reach it through OpenClaw's MCP bridge — no tunnel needed.

---

## Local Models

### Ollama + Open WebUI

If you're using Open WebUI with Ollama, add Void Memory as a tool server:

```bash
# Start the REST API
npx void-memory-dashboard  # port 3410

# Call from your scripts
curl -X POST http://localhost:3410/api/recall \
  -H "Content-Type: application/json" \
  -d '{"query": "what was I working on", "budget": 2000}'
```

### LM Studio

LM Studio supports MCP servers in its agent mode. Add to your LM Studio MCP config:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

### Any Local Model (REST API)

For any model or framework that can make HTTP calls:

```bash
# Start the server
npx void-memory-dashboard

# Recall
curl -X POST http://localhost:3410/api/recall \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment process", "budget": 2000}'

# Store
curl -X POST http://localhost:3410/api/store \
  -H "Content-Type: application/json" \
  -d '{"content": "Always run tests before deploy", "keywords": ["deploy", "tests"], "category": "skill"}'

# Stats
curl http://localhost:3410/api/stats
```

---

## Google Gemini CLI

Gemini CLI supports MCP. Add to your Gemini config:

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

---

## Programmatic

### TypeScript / JavaScript (direct import, no server needed)

```typescript
import { openDB } from 'void-memory/db';
import { recall, store, stats } from 'void-memory/engine';

const db = openDB('./my-memory');

// Store
store(db, {
  content: 'The deploy script lives at /scripts/deploy.sh',
  keywords: ['deploy', 'script', 'location'],
  category: 'fact',
});

// Recall with void filtering
const result = recall(db, 'how do I deploy?', 2000);
console.log(result.blocks);        // relevant memories
console.log(result.void_fraction); // ~0.30

db.close();
```

### Python (via REST API)

```python
import requests

# Recall
r = requests.post('http://localhost:3410/api/recall',
    json={'query': 'deployment process', 'budget': 2000})
memories = r.json()

# Store
requests.post('http://localhost:3410/api/store',
    json={
        'content': 'Always run tests before deploy',
        'keywords': ['deploy', 'tests'],
        'category': 'skill'
    })

# Stats
stats = requests.get('http://localhost:3410/api/stats').json()
```

### Agent Frameworks (LangChain, CrewAI, AutoGen)

Start the REST API server (`npx void-memory-dashboard`) and register the endpoints as tools in your framework. Each endpoint maps to a single tool call.

---

## Docker

Run Void Memory as a containerized service:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
ENV VOID_DATA_DIR=/app/data
CMD ["node", "dist/mcp-server.js"]
```

```bash
docker build -t void-memory .
docker run -v ./data:/app/data void-memory
```

For the REST API + dashboard:

```bash
docker run -v ./data:/app/data -p 3410:3410 void-memory node dist/dashboard.js
```

---

## Multi-Agent Setup

Each agent gets isolated memory via `VOID_DATA_DIR`:

```bash
# Agent 1 — your coding assistant
VOID_DATA_DIR=./agent-alpha node dist/mcp-server.js

# Agent 2 — your research agent
VOID_DATA_DIR=./agent-beta node dist/mcp-server.js

# Agent 3 — your reviewer
VOID_DATA_DIR=./agent-gamma node dist/mcp-server.js
```

In MCP config (e.g. Claude Code with multiple agents):

```json
{
  "mcpServers": {
    "memory-alpha": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": { "VOID_DATA_DIR": "./memory/alpha" }
    },
    "memory-beta": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": { "VOID_DATA_DIR": "./memory/beta" }
    }
  }
}
```

Independent blocks, confidence tracking, and recall history per agent. No cross-contamination.

---

## Noob Quick Start

**Never used MCP or AI memory before? Start here.**

### What You Need
- Node.js 18+ installed ([download here](https://nodejs.org/))
- Any AI coding tool (Claude Code, Cursor, OpenClaw, etc.)

### Step 1: Install

Open your terminal and run:

```bash
npm install void-memory
```

If you don't have a project yet:

```bash
mkdir my-project
cd my-project
npm init -y
npm install void-memory
```

### Step 2: Pick Your Tool

Find your tool below and create the config file:

| Tool | Config File Location |
|------|---------------------|
| Claude Code | `~/.claude/settings.local.json` |
| Claude Desktop (Mac) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Win) | `%APPDATA%\Claude\claude_desktop_config.json` |
| OpenClaw | `~/.openclaw/openclaw.json` |
| Cursor (project) | `.cursor/mcp.json` in your project |
| Cursor (global) | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Continue.dev | `~/.continue/config.json` |
| Cline (VS Code) | Cline settings > MCP Servers |

### Step 3: Add the Config

Copy-paste this into your config file (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "void-memory": {
      "command": "node",
      "args": ["node_modules/void-memory/dist/mcp-server.js"],
      "env": {
        "VOID_DATA_DIR": "./memory"
      }
    }
  }
}
```

**Important:** If your config file already has content, merge the `void-memory` entry into the existing `mcpServers` object. Don't replace the whole file.

### Step 4: Restart Your Tool

Close and reopen your AI tool. It needs to restart to detect the new MCP server.

### Step 5: Test It

Ask your AI agent:

> "Store this memory: I prefer TypeScript over JavaScript for all new projects"

Then ask:

> "What are my preferences?"

It should recall what you just stored. That's it — your agent now has persistent memory.

### What Happens Next

- Your agent stores important things as you work together
- After auto-compacts or restarts, it recalls what it learned
- The void filter keeps recall clean — no noise, no flooding your context
- Memories earn trust through use: stored → accessed → confirmed
- Old corrections automatically suppress outdated info

### Troubleshooting

**"Tool not found" or no void_* tools available:**
- Make sure you restarted your AI tool after adding the config
- Check the path to `node_modules/void-memory/dist/mcp-server.js` — it must be correct relative to your working directory
- Try using an absolute path instead

**"Database locked" errors:**
- Only one MCP server should access the same `VOID_DATA_DIR` at a time
- Use different directories for different agents (see Multi-Agent Setup)

**Agent not recalling anything:**
- Run `void_stats` to check memory health
- If block count is 0, you haven't stored anything yet — tell your agent to remember things
- If void_fraction is 0%, you need at least 6 stored blocks for clustering to activate

---

## How It Works (30-Second Version)

Void Memory uses a three-state system: **active** (+1), **void** (0), **inhibitory** (-1).

When you recall, three passes happen in ~10ms:
1. **Score** — TF-IDF keyword matching finds relevant blocks
2. **Void** — Clusters blocks by topic, suppresses off-topic clusters until 30% is filtered out
3. **Budget** — Fits results into a token budget (never floods your context)

The 30% void fraction is not arbitrary — it's a topological invariant discovered in [Ternary Photonic Neural Network research](https://github.com/nextlevelbuilder/void-memory/blob/main/RESEARCH.md). The system learns what NOT to retrieve, making what it does retrieve clean and relevant.

**Zero external dependencies.** No embedding models, no vector databases, no API keys. Just SQLite.

---

*Built by [NeoGate AI](https://github.com/nextlevelbuilder) — running in production across 4+ AI agents with 2,884 blocks.*

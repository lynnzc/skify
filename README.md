<p align="center">
  <h1 align="center">skify</h1>
  <p align="center">
    <strong>Self-Hosted Agent Skills Registry</strong>
    <br/>
    Deploy your own private skill management platform for AI coding agents
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@skify/cli"><img src="https://img.shields.io/npm/v/@skify/cli.svg" alt="npm version"></a>
  <a href="https://github.com/lynnzc/skify/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.6.0-brightgreen.svg" alt="Node.js"></a>
</p>

---

**skify** is a private skill registry you can deploy in minutes. Host your own skill packages for AI coding agents — keep proprietary workflows private, ensure team consistency, and maintain full control.

```bash
# Deploy to Cloudflare (personal profile, default)
cd deploy/cloudflare && bash deploy.sh all personal

# Or self-host with Docker (team profile)
cd deploy/docker && bash deploy.sh team
```

## Why skify?

AI coding agents need domain-specific knowledge. Skills provide reusable instructions, templates, and workflows — but public repositories aren't always an option.

**skify gives you:**

| | |
|---|---|
| **🔒 Private by default** | Your skills stay in your infrastructure |
| **⚡ One-click deploy** | Cloudflare Workers (free) or Docker |
| **📦 Full registry** | Publish, version, search, and install skills |
| **🛠️ CLI included** | `npx skify add/publish/sync` |
| **🌐 Web UI** | Browse and search skills visually |

## Table of Contents

- [Quick Deploy](#quick-deploy)
- [CLI Usage](#cli-usage)
- [How It Works](#how-it-works)
- [Creating Skills](#creating-skills)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Quick Deploy

### Option 1: Cloudflare Workers (Recommended)

Free tier, global edge, zero server management.

```bash
cd deploy/cloudflare
bash deploy.sh all personal
# or strict team profile:
# bash deploy.sh all team
```

The script will:
1. Create D1 database and R2 storage
2. Deploy the Worker
3. Generate and display your API token

```
✓ Deployed to https://skify-api.your-account.workers.dev
✓ API Token: sk_xxxxxxxxxxxx
```

### Option 2: Docker (Self-Hosted)

Full control, runs anywhere, air-gapped support.

```bash
cd deploy/docker
bash deploy.sh personal
# or strict team profile:
# bash deploy.sh team
```

Or with docker-compose:

```bash
cd deploy/docker
docker-compose up -d
```

### Configure CLI

After deployment, point the CLI to your registry:

```bash
skify config set registry https://your-registry-url
skify config set token <your-api-token>
```

### Post-Deploy Checklist (1 minute)

```bash
# 1) API health
curl -sS https://your-registry-url/api/health
# expected: {"status":"ok"}

# 2) list skills (default onboarding mode)
curl -sS https://your-registry-url/api/skills

# 3) CLI connectivity
skify config set registry https://your-registry-url
skify config set token <admin-token>
skify browse
```

If you run `team` profile (`ALLOW_ANONYMOUS_READ=false`), step 2 should include a read/admin token:

```bash
curl -sS https://your-registry-url/api/skills \
  -H "Authorization: Bearer <read-or-admin-token>"
```

### RBAC Tokens

skify supports role-based API tokens:

- `read`: browse/search/download/install
- `publish`: includes `read`, plus publish/update skill content
- `admin`: includes `publish`, plus delete/sync/token management

Access behavior:

- `personal` profile: anonymous read enabled (smooth onboarding)
- `team` profile: anonymous read disabled (`ALLOW_ANONYMOUS_READ=false`)

Quick start (`personal`):

```bash
# set registry/admin token for CLI
skify config set registry https://your-registry-url
skify config set token <admin-token>

# publish then browse immediately (web/cli read works without extra token)
skify publish ./my-skill
```

Strict mode (`team`):

```bash
# deploy with team profile
cd deploy/cloudflare && bash deploy.sh all team
# or
cd deploy/docker && bash deploy.sh team

# create a read-only token for users/services
skify token create team-read --permissions read
```

```bash
# list existing tokens (admin token required)
skify token list

# create publish token
skify token create ci-publisher --permissions publish

# create read token for Web UI
skify token create web-read --permissions read

# revoke token by id
skify token revoke <token-id>
```

## CLI Usage

### Install CLI

```bash
# Run directly with npx
npx skify <command>

# Or install globally
npm install -g @skify/cli
```

### Commands

| Command | Description |
|---------|-------------|
| `skify add <skill>` | Install a skill |
| `skify remove <name>` | Remove a skill |
| `skify list` | List installed skills |
| `skify update [name]` | Update skills |
| `skify sync` | Generate AGENTS.md |
| `skify publish <dir>` | Publish skill to registry |
| `skify search <query>` | Search for skills |
| `skify read <name>` | Output skill content |
| `skify token ...` | Manage registry RBAC tokens |
| `skify config` | Manage configuration |

### Examples

```bash
# Publish a skill to your registry
skify publish ./my-skill

# Install from your registry
skify add my-skill

# Install from GitHub (public or private with token)
skify add owner/repo/skill-name
skify add owner/repo/skill-name --token ghp_xxx

# Install to specific agent directory
skify add my-skill --agent cursor   # .cursor/skills/
skify add my-skill --agent claude   # .claude/skills/

# Generate AGENTS.md for AI agents
skify sync
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. DEPLOY                                                          │
│                                                                     │
│     bash deploy.sh  ──►  Your Private Registry                     │
│                          (Cloudflare or Docker)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. PUBLISH                                                         │
│                                                                     │
│     skify publish ./my-skill  ──►  Registry stores skill           │
│                                    with version tracking            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. INSTALL                                                         │
│                                                                     │
│     skify add my-skill  ──►  Downloads to .agent/skills/           │
│     skify sync          ──►  Generates AGENTS.md                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. USE                                                             │
│                                                                     │
│     AI Agent reads AGENTS.md                                        │
│     ↓                                                               │
│     Sees available skills                                           │
│     ↓                                                               │
│     Runs: npx skify read my-skill                                  │
│     ↓                                                               │
│     Receives instructions and executes                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Project Structure After Install

```
your-project/
├── .agent/
│   ├── skills/
│   │   ├── my-skill/
│   │   │   ├── SKILL.md
│   │   │   └── templates/
│   │   └── another-skill/
│   │       └── SKILL.md
│   └── skify.lock.json
├── AGENTS.md              # Auto-generated skill manifest
└── ...
```

### AGENTS.md Format

```xml
<skills_system priority="1">
<usage>
Invoke skills: `npx skify read <skill-name>`
</usage>

<available_skills>
<skill>
  <name>my-skill</name>
  <description>What this skill does</description>
</skill>
</available_skills>
</skills_system>
```

## Creating Skills

### Skill Structure

```
my-skill/
├── SKILL.md           # Required: Instructions for the agent
├── templates/         # Optional: Template files
├── examples/          # Optional: Example code
└── resources/         # Optional: Other resources
```

### SKILL.md Format

```markdown
---
name: my-skill
description: Brief description of what this skill does
version: 1.0.0
---

# My Skill

Instructions for the AI agent.

## When to Use

Describe when this skill applies.

## How to Use

Step-by-step instructions.
```

### Publish to Your Registry

```bash
# Set up registry (one time)
skify config set registry https://your-registry
skify config set token <token>

# Publish
cd my-skill
skify publish .

# Version updates
# Edit SKILL.md, bump version, publish again
skify publish .
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         skify Registry                              │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   REST API  │    │   Storage   │    │  Database   │            │
│  │             │    │             │    │             │            │
│  │ - publish   │    │ Cloudflare: │    │ Cloudflare: │            │
│  │ - download  │    │   R2        │    │   D1        │            │
│  │ - search    │    │             │    │             │            │
│  │ - list      │    │ Docker:     │    │ Docker:     │            │
│  │             │    │   Filesystem│    │   SQLite    │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         skify CLI                                   │
│                                                                     │
│  @skify/cli                                                         │
│  ├── add/remove/update     # Manage installed skills               │
│  ├── publish               # Upload to registry                    │
│  ├── search/list           # Discover skills                       │
│  ├── sync                  # Generate AGENTS.md                    │
│  └── read                  # Output skill for agent                │
│                                                                     │
│  @skify/core                                                        │
│  ├── GitHub API            # Fetch from GitHub repos               │
│  └── Parser                # Parse SKILL.md files                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         skify Web UI                                │
│                                                                     │
│  Browse, search, and preview skills in your browser                │
│  Deploy alongside registry or standalone                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Deployment Comparison

| | Cloudflare | Docker |
|---|---|---|
| **Setup** | One script | One script |
| **Cost** | Free tier (100k req/day) | Your infrastructure |
| **Scaling** | Automatic, global edge | Manual |
| **Storage** | R2 (S3-compatible) | Filesystem |
| **Database** | D1 (SQLite) | SQLite |
| **Best for** | Most users | Air-gapped, on-premise |

## Development

### Prerequisites

- Node.js >= 20.6.0
- pnpm >= 9.0.0

### Setup

```bash
git clone https://github.com/lynnzc/skify.git
cd skify
pnpm install
pnpm build
```

### Project Structure

```
skify/
├── packages/
│   ├── core/       # Shared library
│   ├── cli/        # CLI tool
│   ├── web/        # Web UI
│   └── worker/     # Cloudflare Worker
├── deploy/
│   ├── cloudflare/ # CF deployment script
│   └── docker/     # Docker deployment
└── scripts/
```

### Local Development

```bash
# CLI
cd packages/cli && npm link
skify --help

# Web UI
pnpm --filter @skify/web dev
# http://localhost:5173

# Worker (local)
pnpm --filter @skify/worker dev
```

## Compatible Agents

Works with any AI coding agent that can read markdown and run shell commands:

- Cursor
- Claude Code
- GitHub Copilot
- Codex
- Windsurf
- And more...

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a Pull Request

## License

Apache License 2.0 — see [LICENSE](LICENSE)

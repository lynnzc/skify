# skit

**Agent Skills Kit** - Install and manage skills for AI coding agents

```bash
npx skit add anthropics/skills/pdf
```

## Features

- 🔍 **Search** - Find skill repos on GitHub with `topic:agent-skills`
- 📦 **Install** - Install skills from any GitHub repository
- 🔄 **Update** - Track versions and update with one command
- 📋 **Sync** - Generate `AGENTS.md` for AI agents to read
- 🌐 **Web UI** - Browse and search skills visually

Compatible with Cursor, Claude Code, GitHub Copilot, Codex, and more.

## Quick Start

```bash
# Search for skills
npx skit search "react"

# List skills in a repo
npx skit list anthropics/skills

# Install a skill
npx skit add anthropics/skills/pdf

# Generate AGENTS.md
npx skit sync
```

## Commands

| Command | Description |
|---------|-------------|
| `skit search <query>` | Search for skill repos on GitHub |
| `skit list [repo]` | List skills in a repo, or list installed skills |
| `skit add <source>` | Install skill (`owner/repo/skill` or `owner/repo`) |
| `skit update [name]` | Update skills (all or specific) |
| `skit read <name>` | Read skill content (for agent invocation) |
| `skit remove <name>` | Remove a skill |
| `skit sync` | Generate AGENTS.md |
| `skit config` | Manage configuration |

### Options

```bash
# Install globally (~/.agent/skills/)
skit add anthropics/skills/pdf -g

# Specify agent directory
skit add anthropics/skills/pdf --agent cursor  # .cursor/skills/
skit add anthropics/skills/pdf --agent claude  # .claude/skills/

# Use GitHub token (for private repos or higher API limits)
skit add myorg/private-skills/internal --token ghp_xxx

# Or configure global token
skit config set token ghp_xxx
```

## File Structure

After installation:

```
your-project/
├── .agent/
│   ├── skills/
│   │   ├── pdf/
│   │   │   ├── SKILL.md
│   │   │   └── ...
│   │   └── remotion/
│   │       └── SKILL.md
│   └── skit.lock.json    # Version tracking
├── AGENTS.md             # Skill manifest for AI agents
└── ...
```

## How Agents Use Skills

### Setup

```bash
# 1. Install skills
skit add anthropics/skills/canvas-design

# 2. Generate AGENTS.md
skit sync
```

### Agent Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Agent reads AGENTS.md on startup                           │
│  ↓                                                          │
│  Sees available skills:                                     │
│    - canvas-design: "Create visual art..."                  │
│    - pdf: "PDF manipulation toolkit..."                     │
│  ↓                                                          │
│  User: "Create a poster for my event"                       │
│  ↓                                                          │
│  Agent runs: npx skit read canvas-design                    │
│  ↓                                                          │
│  Agent receives full instructions + BASE_DIR for resources  │
│  ↓                                                          │
│  Agent executes the skill                                   │
└─────────────────────────────────────────────────────────────┘
```

### AGENTS.md Format

```xml
<skills_system priority="1">
<usage>
How to use skills:
- Invoke: `npx skit read <skill-name>` (run in your shell)
- The skill content will load with detailed instructions
- Base directory provided in output for resolving bundled resources
</usage>

<available_skills>
<skill>
  <name>canvas-design</name>
  <description>Create beautiful visual art...</description>
  <location>project</location>
</skill>
</available_skills>
</skills_system>
```

### Agent-Specific Directories

```bash
# Cursor
skit add anthropics/skills/pdf --agent cursor
# → .cursor/skills/pdf/

# Claude Code  
skit add anthropics/skills/pdf --agent claude
# → .claude/skills/pdf/

# Default (any agent)
skit add anthropics/skills/pdf
# → .agent/skills/pdf/
```

## Using Private Skills

### Option 1: Private GitHub Repo

```bash
# Fork to your org, modify, then install with token
skit add myorg/skills/custom-skill --token ghp_xxx

# Or set token globally
skit config set githubToken ghp_xxx
skit add myorg/skills/custom-skill
```

### Option 2: Private Registry

```bash
# Deploy your registry (Cloudflare or Docker)
cd deploy/cloudflare && bash deploy.sh

# Configure CLI
skit config set registry https://skills.company.com
skit config set token <api-token>

# Publish local skill
skit publish ./my-skill

# Install by name
skit add my-skill
```

## Development

### Requirements

- Node.js >= 20.6.0
- pnpm >= 9.0.0

### Local Development

```bash
# Clone the repo
git clone https://github.com/lynnzc/skit.git
cd skit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI globally (for local testing)
cd packages/cli && npm link

# Test CLI
skit --help
skit search "agent skills"
```

### Project Structure

```
skit/
├── packages/
│   ├── core/       # Core library (parsing, GitHub API)
│   ├── cli/        # CLI tool
│   ├── web/        # Web UI
│   └── worker/     # Cloudflare Worker API
└── deploy/
    ├── cloudflare/ # Cloudflare deployment scripts
    └── docker/     # Docker deployment config
```

### Testing

```bash
# Test CLI commands
cd packages/cli
pnpm build
node dist/index.js search "pdf"
node dist/index.js list anthropics/skills
node dist/index.js add anthropics/skills/pdf
node dist/index.js list
node dist/index.js read pdf
node dist/index.js update
node dist/index.js sync
node dist/index.js remove pdf
```

### Running Web UI

```bash
pnpm --filter @skit/web dev
# Open http://localhost:5173
```

The Web UI uses GitHub API mode by default, no backend required.

## Publishing

### Publish to npm

```bash
# 1. Update version
cd packages/cli
npm version patch  # or minor, major

# 2. Build
pnpm build

# 3. Publish
npm publish --access public
```

After publishing, users can run:

```bash
npx skit add anthropics/skills/pdf
```

### Deploy Private Registry

For internal company skill repositories:

**Cloudflare (recommended, free tier):**

```bash
cd deploy/cloudflare
bash deploy.sh
```

**Docker:**

```bash
cd deploy/docker
bash deploy.sh
```

Both scripts will:
- Create required resources (database, storage)
- Generate and display an API token
- Deploy the service

After deployment, configure CLI:

```bash
skit config set registry https://your-api-endpoint
skit config set token <your-api-token>
```

## Configuration

Config file location: `~/.config/skit-nodejs/config.json`

```bash
# View config
skit config get

# Set GitHub token (for GitHub API access)
skit config set token ghp_xxx

# Set private registry
skit config set registry https://skills.company.com
```


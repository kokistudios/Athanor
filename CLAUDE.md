# Athanor

## What This Project Is

Athanor is an Electron desktop application that orchestrates AI agent workflows with structured decision tracking. It provides a visual interface for CARD's decision capsule system: running multi-phase sessions, reviewing decisions, managing approvals, and browsing engineering memory.

It is not a chatbot, not an agent framework, not a SaaS product. It is a local desktop tool for controlled agent orchestration.

## Core Concepts

### Decision Capsules
The fundamental unit of engineering memory. Each capsule captures a question, the choice made, alternatives considered, rationale, tags (file paths, concepts, domains), and status (active or invalidated).

### Workflows
Multi-phase pipelines with configurable approval gates. Each phase runs as a separate agent session with scoped context. Artifacts from one phase feed the next.

### Approvals
Human-in-the-loop checkpoints. Phase transitions, decisions, and merges can require explicit approval before proceeding.

### MCP Server
Athanor includes an MCP server (`src/mcp/`) that exposes decision tools to Claude and other runtimes:
- `card_context`, `card_query`, `card_snapshot` for retrieval
- `card_record`, `card_decision`, `card_decision_confirm` for recording
- `card_session_ops`, `card_capsule_ops` for operations
- `card_write_artifact`, `card_phase_complete` for phase management

## Architecture

### Process Model

```
Main Process (Electron)
  ├── IPC Handlers        src/main/ipc/
  ├── Services            src/main/services/
  ├── Database            src/main/database/
  └── Config              src/main/config/

Renderer Process (React)
  ├── Components          src/renderer/components/
  ├── Hooks               src/renderer/hooks/
  └── Styles              src/renderer/index.css

MCP Server
  ├── Tools               src/mcp/tools/
  └── Server              src/mcp/server.ts

Preload Bridge            src/preload/index.ts
Shared Types              src/shared/types/
```

### IPC Channels

Handlers are split by domain:
- `agent-handlers.ts` - agent lifecycle and streaming
- `approval-handlers.ts` - approval queue management
- `db-handlers.ts` - database queries
- `shell-handlers.ts` - subprocess execution
- `workflow-handlers.ts` - workflow CRUD and phase management
- `streaming-bridge.ts` - real-time agent output relay

### Services

- `agent-manager.ts` - spawn and manage agent processes
- `workflow-engine.ts` - phase state machine, approval gates
- `approval-router.ts` - route approval requests
- `content-store.ts` - artifact storage
- `worktree-manager.ts` - git worktree operations
- `service-registry.ts` - dependency injection

### Database

SQLite via better-sqlite3 with Kysely as the query builder. Migrations live in `src/main/database/migrations/`. Connection management in `src/main/database/connection.ts`.

### Renderer Components

Organized by domain:

| Directory | Purpose |
|-----------|---------|
| `agents/` | Agent threads, message bubbles, streaming text, tool use blocks |
| `approvals/` | Approval queue and individual approval cards |
| `decisions/` | Decision browser and detail views |
| `sessions/` | Session dashboard, detail, and launch views |
| `workflows/` | Workflow list, editor, and phase editor |
| `workspaces/` | Workspace dashboard and detail |
| `layout/` | Sidebar navigation, main content router |
| `shared/` | Markdown preview/editor, security utilities |

### Hooks

- `useIpc.ts` - typed IPC communication with main process
- `useAgentStream.ts` - real-time agent output subscription
- `useApprovals.ts` - approval queue state
- `useSessions.ts` - session lifecycle
- `useTheme.ts` - dark/light theme toggling

## Technology

- **Desktop**: Electron 40, Electron Forge (packaging)
- **UI**: React 19, TypeScript 5.4, Tailwind CSS v4
- **Data**: SQLite (better-sqlite3), Kysely
- **Validation**: Zod
- **MCP**: @modelcontextprotocol/sdk
- **Fonts**: Geist Variable, Geist Mono Variable, Instrument Serif
- **Icons**: Lucide React

## Development

```bash
npm start          # dev mode with hot reload
npm run lint       # ESLint
npm run format     # Prettier
npm run rebuild    # rebuild native modules for Electron
npm run build:mcp  # build standalone MCP server
npm run package    # package for current platform
npm run make       # create distributable installers
```

## Design System

See [STYLES.md](STYLES.md) for the full design system: color tokens, typography, spacing, component patterns, and animation guidelines.

## Guiding Principles

- **Decisions are first-class**: everything exists to produce, review, or query decision capsules
- **Local-first**: no servers, no sync, no subscriptions
- **Human over agent**: agents propose, humans decide
- **Phases are boundaries**: separate contexts keep agents focused and failures recoverable
- **Simple over clever**: SQLite, markdown artifacts, standard tools

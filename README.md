# Athanor

A desktop application for orchestrating AI agent workflows with structured decision tracking. Built on Electron, React, and CARD's decision capsule system.

Athanor provides a visual interface for running multi-phase agent sessions, reviewing decisions, managing approvals, and browsing the engineering memory that CARD captures.

## Features

- **Agent orchestration** with real-time streaming output
- **Decision tracking** via CARD integration (record, query, invalidate)
- **Multi-phase workflows** with configurable approval gates
- **Session management** for structured investigate/plan/execute/verify cycles
- **Workspace organization** for grouping related work
- **MCP server** exposing decision tools to Claude and other runtimes

## Installation

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/kokistudios/athanor.git
cd athanor
npm install
npm run rebuild  # native module rebuild for Electron
```

### Development

```bash
npm start        # launch in dev mode with hot reload
```

### Build

```bash
npm run package  # package for current platform
npm run make     # create distributable installers
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 40 + Electron Forge |
| UI | React 19, Tailwind CSS v4, Lucide icons |
| Data | SQLite (better-sqlite3) + Kysely query builder |
| Validation | Zod |
| MCP | @modelcontextprotocol/sdk |
| Fonts | Geist, Geist Mono, Instrument Serif |

## Project Structure

```
src/
  main/              Electron main process
    config/           Configuration loading and defaults
    database/         SQLite connection, migrations
    ipc/              IPC handlers (agents, approvals, db, shell, workflows)
    services/         Agent manager, workflow engine, content store
  renderer/           React UI
    components/       Domain-organized components
      agents/         Agent threads, message bubbles, streaming
      approvals/      Approval queue and cards
      decisions/      Decision browser and detail views
      sessions/       Session dashboard and detail
      workflows/      Workflow and phase editors
      workspaces/     Workspace management
      layout/         Sidebar, main content router
      shared/         Markdown preview/editor, security
    hooks/            Custom React hooks (IPC, approvals, sessions, themes)
  mcp/                MCP server and tool implementations
  preload/            Electron preload bridge
  shared/types/       TypeScript interfaces shared across processes
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT

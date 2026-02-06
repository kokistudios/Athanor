# AGENTS.md

Project context for agentic tools working in this codebase.

## Overview

Athanor is an Electron desktop app that orchestrates AI agent workflows with structured decision tracking. It provides a visual interface on top of CARD's decision capsule system.

## Tech Stack

- Electron 40 (main process) + React 19 (renderer)
- TypeScript strict mode, Tailwind CSS v4
- SQLite via better-sqlite3 + Kysely
- MCP server (@modelcontextprotocol/sdk)

## Key Commands

```bash
npm start          # dev mode with hot reload
npm run lint       # ESLint
npm run format     # Prettier
npm run rebuild    # rebuild native modules for Electron
npm run build:mcp  # build MCP server
```

## Project Structure

```
src/main/          Electron main process (IPC handlers, services, database)
src/renderer/      React UI (components, hooks, styles)
src/mcp/           MCP server and tool implementations
src/preload/       Electron preload bridge
src/shared/types/  TypeScript interfaces shared across processes
```

## Design System

See [STYLES.md](STYLES.md) for colors, typography, spacing, and component patterns.

## Architecture Notes

- IPC handlers in `src/main/ipc/` bridge renderer requests to services
- Services in `src/main/services/` contain business logic (agent management, workflows, approvals)
- All database access goes through Kysely with migrations in `src/main/database/migrations/`
- MCP tools in `src/mcp/tools/` expose decision operations to external runtimes
- Renderer components are organized by domain (agents, approvals, decisions, sessions, workflows, workspaces)

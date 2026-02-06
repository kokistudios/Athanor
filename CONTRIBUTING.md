# Contributing to Athanor

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Building

```bash
git clone https://github.com/kokistudios/athanor.git
cd athanor
npm install
npm run rebuild  # rebuild native modules for Electron
```

### Running

```bash
npm start        # dev mode with hot reload
```

### Linting and Formatting

```bash
npm run lint          # ESLint
npm run format        # Prettier (write)
npm run format:check  # Prettier (check only)
```

### Building the MCP Server

```bash
npm run build:mcp
```

## Project Structure

```
src/
  main/              Electron main process (IPC, services, database)
  renderer/          React UI (components, hooks, styles)
  mcp/               MCP server and tool implementations
  preload/           Electron preload bridge
  shared/types/      TypeScript interfaces shared across processes
```

## Making Changes

### Code Style

- TypeScript strict mode
- ESLint + Prettier (config in `.eslintrc.json` and `.prettierrc.json`)
- Functional React components with hooks
- Tailwind CSS for styling (design tokens in `src/renderer/index.css`)
- See [STYLES.md](STYLES.md) for the design system

### Commit Messages

Use clear messages that explain the reasoning:

```
feat: add phase approval gates to workflow editor

Workflows can now require explicit approval before advancing
to the next phase. Configurable per-phase in the editor.
```

### Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes with clear commits
3. Ensure linting passes (`npm run lint`)
4. Open a PR with a description of what changed and why

## What We're Looking For

- Bug fixes
- UI/UX improvements
- New MCP tool implementations
- Performance optimizations
- Documentation improvements

## What Likely Won't Be Accepted

- Features requiring external services or accounts
- Heavy new dependencies without strong justification
- Changes that break the local-first model

## Questions?

Open an issue for questions about contributing or the codebase.

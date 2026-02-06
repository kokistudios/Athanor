---
name: add-ipc-channel
description: Add a new IPC channel to Athanor with type-safe handler, preload allowlist entry, and renderer hook usage
disable-model-invocation: true
argument-hint: [channel-name description]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Add IPC Channel

Add a new IPC channel to the Athanor Electron app. This is a cross-cutting change that touches 4+ files.

**User request:** $ARGUMENTS

## Required Changes (in order)

### 1. Add channel to `src/shared/types/ipc.ts`

Add the new channel name to either `IpcChannel` (request-response) or `PushChannel` (server-push) union type. Follow the existing `namespace:action` naming convention (e.g., `db:list-repos`, `agent:send-input`).

### 2. Add to preload allowlist in `src/preload/index.ts`

Add the channel string to `ALLOWED_REQUEST_CHANNELS` (for request-response) or `ALLOWED_PUSH_CHANNELS` (for push channels). The sets must exactly match the type unions.

### 3. Create the handler

Add the handler using `registerSecureIpcHandler()` from `src/main/ipc/security.ts`. Follow these patterns:

**Handler file location:**
- Database/CRUD operations: `src/main/ipc/db-handlers.ts`
- Agent operations: `src/main/ipc/agent-handlers.ts`
- Workflow/session operations: `src/main/ipc/workflow-handlers.ts`
- Approval operations: `src/main/ipc/approval-handlers.ts`
- New domain: create `src/main/ipc/<domain>-handlers.ts` and register in `src/main/ipc/handlers.ts`

**Handler pattern:**
```typescript
import { registerSecureIpcHandler } from './security';
import { z } from 'zod';

// Define Zod schema for args as z.tuple([...])
const myArgsSchema = z.tuple([z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
}).strict()]);

registerSecureIpcHandler(mainWindow, 'domain:action', myArgsSchema, async (_event, opts) => {
  // Implementation
  return result;
});
```

**Key rules:**
- Always use `z.tuple([...])` for args schema (wraps the args array)
- Use `.strict()` on object schemas to reject unknown keys
- Use `z.string().uuid()` for ID parameters
- Use `z.string().max(4096)` for string fields
- Handler receives destructured tuple args after the event

### 4. Wire into renderer

If this channel is used from the UI, show usage with the existing hooks from `src/renderer/hooks/useIpc.ts`:

```typescript
// For queries (GET-like operations)
const { data, loading, error, refetch } = useIpcQuery<ResultType>('domain:action');

// For mutations (POST/PUT/DELETE-like operations)
const { mutate, loading, error } = useIpcMutation<ResultType>('domain:action');
```

### 5. For push channels, add event listener wiring

If this is a push channel, also show the `window.athanor.on()` subscription pattern and any cleanup needed in `useEffect` return.

## Checklist

- [ ] Channel name added to `IpcChannel` or `PushChannel` type union
- [ ] Channel string added to preload allowlist set
- [ ] Handler registered with `registerSecureIpcHandler` and Zod validation
- [ ] If new handler file: registered in `src/main/ipc/handlers.ts`
- [ ] Renderer usage demonstrated with `useIpcQuery` or `useIpcMutation`

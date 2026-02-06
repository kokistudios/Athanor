import * as fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpDatabase } from './db';
import { contextSchema, athanorContext } from './tools/context';
import { recordSchema, athanorRecord } from './tools/record';
import { decideSchema, athanorDecide } from './tools/decide';
import { artifactSchema, athanorArtifact } from './tools/artifact';
import { phaseCompleteSchema, athanorPhaseComplete } from './tools/phase-complete';

const dbPath = process.env.ATHANOR_DB_PATH;
const agentId = process.env.ATHANOR_AGENT_ID;
const sessionId = process.env.ATHANOR_SESSION_ID;
const phaseId = process.env.ATHANOR_PHASE_ID;
const dataDir = process.env.ATHANOR_DATA_DIR;

if (!dbPath || !agentId || !sessionId || !phaseId || !dataDir) {
  console.error(
    'Missing required environment variables: ATHANOR_DB_PATH, ATHANOR_AGENT_ID, ATHANOR_SESSION_ID, ATHANOR_PHASE_ID, ATHANOR_DATA_DIR',
  );
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error(`Database file not found: ${dbPath}`);
  process.exit(1);
}

const db = createMcpDatabase(dbPath);

const server = new McpServer({
  name: 'athanor',
  version: '1.0.0',
});

// Register tools
server.tool(
  'athanor_context',
  'Surface relevant decisions and artifacts before work begins',
  contextSchema.shape,
  async (params) => {
    const result = await athanorContext(db, sessionId, params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'athanor_record',
  'Record a decision or finding immediately',
  recordSchema.shape,
  async (params) => {
    const result = await athanorRecord(db, sessionId, agentId, params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'athanor_decide',
  'Propose a decision for human confirmation',
  decideSchema.shape,
  async (params) => {
    const result = await athanorDecide(db, sessionId, agentId, params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'athanor_artifact',
  'Write a phase artifact to disk and database',
  artifactSchema.shape,
  async (params) => {
    const result = await athanorArtifact(db, sessionId, agentId, phaseId, dataDir, params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'athanor_phase_complete',
  'Signal that the current phase is done',
  phaseCompleteSchema.shape,
  async (params) => {
    const result = await athanorPhaseComplete(db, agentId, sessionId, params);
    return { content: [{ type: 'text', text: result }] };
  },
);

async function main() {
  // Validate that the database has the expected schema
  try {
    await db.selectFrom('decisions').select('id').limit(1).execute();
  } catch (err) {
    console.error('Database schema validation failed — expected "decisions" table:', err);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Athanor MCP server started');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

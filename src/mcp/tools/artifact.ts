import { z } from 'zod';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';

export const artifactSchema = z.object({
  name: z.string().describe('Artifact name (e.g. "investigation_summary", "implementation_guide")'),
  content: z.string().describe('Artifact content (markdown)'),
  status: z.enum(['draft', 'final']).default('draft').describe('Artifact status'),
});

export async function athanorArtifact(
  db: Kysely<Database>,
  sessionId: string,
  agentId: string,
  phaseId: string,
  dataDir: string,
  params: z.infer<typeof artifactSchema>,
): Promise<string> {
  const id = crypto.randomUUID();
  const safeName = params.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const relPath = `sessions/${sessionId}/artifacts/${safeName}.md`;
  const fullPath = path.join(dataDir, relPath);

  // Write file to disk
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, params.content, 'utf-8');

  // Record in DB
  await db
    .insertInto('artifacts')
    .values({
      id,
      session_id: sessionId,
      phase_id: phaseId,
      agent_id: agentId,
      name: params.name,
      file_path: relPath,
      status: params.status || 'draft',
    })
    .execute();

  return JSON.stringify({
    artifact_id: id,
    file_path: relPath,
    status: params.status || 'draft',
    message: `Artifact "${params.name}" written to ${relPath}`,
  });
}

import { z } from 'zod';
import * as crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';

export const recordSchema = z.object({
  type: z
    .enum(['decision', 'finding'])
    .default('finding')
    .describe('Type: decision (has alternatives) or finding (observation)'),
  question: z.string().describe('What was being decided or investigated'),
  choice: z.string().describe('What was chosen or concluded'),
  rationale: z.string().describe('Why this choice was made'),
  alternatives: z.array(z.string()).optional().describe('Options considered (for decisions)'),
  tags: z.array(z.string()).optional().describe('File paths, concepts, domains'),
});

export async function athanorRecord(
  db: Kysely<Database>,
  sessionId: string,
  agentId: string,
  params: z.infer<typeof recordSchema>,
): Promise<string> {
  const id = crypto.randomUUID();

  await db
    .insertInto('decisions')
    .values({
      id,
      session_id: sessionId,
      agent_id: agentId,
      question: params.question,
      choice: params.choice,
      rationale: params.rationale,
      alternatives: params.alternatives ? JSON.stringify(params.alternatives) : null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      type: params.type || 'finding',
      origin: 'agent',
    })
    .execute();

  return JSON.stringify({
    capsule_id: id,
    status: 'stored',
    message: `Recorded ${params.type || 'finding'}: ${params.question}`,
  });
}

import { z } from 'zod';
import * as crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';

export const decideSchema = z.object({
  question: z.string().describe('What is being decided'),
  choice: z.string().describe('The proposed choice'),
  rationale: z.string().describe('Why this choice is recommended'),
  alternatives: z.array(z.string()).optional().describe('Options considered'),
  tags: z.array(z.string()).optional().describe('File paths, concepts, domains'),
});

export async function athanorDecide(
  db: Kysely<Database>,
  sessionId: string,
  agentId: string,
  workspaceId: string | null,
  params: z.infer<typeof decideSchema>,
): Promise<string> {
  // Record the decision as pending
  const decisionId = crypto.randomUUID();

  await db
    .insertInto('decisions')
    .values({
      id: decisionId,
      session_id: sessionId,
      agent_id: agentId,
      workspace_id: workspaceId,
      question: params.question,
      choice: params.choice,
      rationale: params.rationale,
      alternatives: params.alternatives ? JSON.stringify(params.alternatives) : null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      type: 'decision',
      origin: 'agent',
    })
    .execute();

  // Create an approval for human confirmation
  const approvalId = crypto.randomUUID();

  await db
    .insertInto('approvals')
    .values({
      id: approvalId,
      session_id: sessionId,
      agent_id: agentId,
      type: 'decision',
      summary: `Decision: ${params.question} → ${params.choice}`,
      payload: JSON.stringify({
        decisionId,
        question: params.question,
        choice: params.choice,
        rationale: params.rationale,
        alternatives: params.alternatives,
        tags: params.tags,
      }),
    })
    .execute();

  return JSON.stringify({
    decision_id: decisionId,
    approval_id: approvalId,
    status: 'pending_approval',
    message: `Decision proposed and queued for human review: ${params.question}`,
  });
}

import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';

export const phaseCompleteSchema = z.object({
  summary: z.string().describe('Brief summary of what was accomplished in this phase'),
  status: z
    .enum(['complete', 'blocked', 'needs_input'])
    .default('complete')
    .describe('Phase completion status'),
});

export async function athanorPhaseComplete(
  db: Kysely<Database>,
  agentId: string,
  params: z.infer<typeof phaseCompleteSchema>,
): Promise<string> {
  if (params.status === 'complete') {
    await db
      .updateTable('agents')
      .set({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .where('id', '=', agentId)
      .execute();

    return JSON.stringify({
      status: 'completed',
      message: `Phase marked as complete. Summary: ${params.summary}`,
    });
  } else if (params.status === 'blocked') {
    await db.updateTable('agents').set({ status: 'waiting' }).where('id', '=', agentId).execute();

    return JSON.stringify({
      status: 'blocked',
      message: `Phase blocked: ${params.summary}`,
    });
  } else {
    await db.updateTable('agents').set({ status: 'waiting' }).where('id', '=', agentId).execute();

    return JSON.stringify({
      status: 'needs_input',
      message: `Waiting for input: ${params.summary}`,
    });
  }
}

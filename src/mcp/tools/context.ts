import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';

export const contextSchema = z.object({
  query: z.string().optional().describe('Search query text'),
  tags: z.array(z.string()).optional().describe('Tags to filter by'),
  files: z.array(z.string()).optional().describe('File paths to filter by'),
  limit: z.number().optional().default(15).describe('Maximum results to return'),
});

export async function athanorContext(
  db: Kysely<Database>,
  sessionId: string,
  params: z.infer<typeof contextSchema>,
): Promise<string> {
  const limit = params.limit || 15;

  // Get decisions for this session and related sessions
  let query = db
    .selectFrom('decisions')
    .selectAll()
    .where('status', '=', 'active')
    .orderBy('created_at', 'desc')
    .limit(limit);

  if (params.tags && params.tags.length > 0) {
    // Filter by tags (JSON contains)
    for (const tag of params.tags) {
      query = query.where('tags', 'like', `%${tag}%`);
    }
  }

  if (params.files && params.files.length > 0) {
    for (const file of params.files) {
      query = query.where('tags', 'like', `%${file}%`);
    }
  }

  const decisions = await query.execute();

  // Get artifacts for current session
  const artifacts = await db
    .selectFrom('artifacts')
    .selectAll()
    .where('session_id', '=', sessionId)
    .orderBy('created_at', 'desc')
    .limit(10)
    .execute();

  const result: string[] = [];

  if (decisions.length > 0) {
    result.push('## Active Decisions\n');
    for (const d of decisions) {
      result.push(`### ${d.question}`);
      result.push(`**Choice:** ${d.choice}`);
      result.push(`**Rationale:** ${d.rationale}`);
      if (d.alternatives) {
        try {
          const alts = JSON.parse(d.alternatives);
          result.push(`**Alternatives:** ${alts.join(', ')}`);
        } catch {
          /* ignore */
        }
      }
      if (d.tags) {
        try {
          const tags = JSON.parse(d.tags);
          result.push(`**Tags:** ${tags.join(', ')}`);
        } catch {
          /* ignore */
        }
      }
      result.push('');
    }
  }

  if (artifacts.length > 0) {
    result.push('## Session Artifacts\n');
    for (const a of artifacts) {
      result.push(`- **${a.name}** (${a.status}) — ${a.file_path}`);
    }
  }

  if (result.length === 0) {
    return 'No relevant context found. This may be a new session with no prior decisions or artifacts.';
  }

  return result.join('\n');
}

import { useState, useEffect, useCallback } from 'react';

interface Approval {
  id: string;
  session_id: string;
  agent_id: string | null;
  type: string;
  summary: string;
  payload: string | null;
  status: string;
  resolved_by: string | null;
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function useApprovals(): {
  approvals: Approval[];
  loading: boolean;
  refetch: () => void;
  resolve: (id: string, status: 'approved' | 'rejected', response?: string) => Promise<void>;
} {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.athanor.invoke('approval:list-pending' as never);
      setApprovals(result as Approval[]);
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    const cleanupNew = window.athanor.on('approval:new' as never, () => {
      fetch();
    });

    const cleanupResolved = window.athanor.on('approval:resolved' as never, () => {
      fetch();
    });

    return () => {
      cleanupNew();
      cleanupResolved();
    };
  }, [fetch]);

  const resolve = useCallback(
    async (id: string, status: 'approved' | 'rejected', response?: string) => {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string } | null;
      if (!user) return;

      await window.athanor.invoke('approval:resolve' as never, {
        id,
        status,
        userId: user.id,
        response,
      });
    },
    [],
  );

  return { approvals, loading, refetch: fetch, resolve };
}

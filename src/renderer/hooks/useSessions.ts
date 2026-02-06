import { useState, useEffect, useCallback } from 'react';

interface Session {
  id: string;
  user_id: string;
  workspace_id: string;
  workflow_id: string;
  status: string;
  current_phase: number | null;
  context: string | null;
  created_at: string;
  completed_at: string | null;
}

export function useSessions(): {
  sessions: Session[];
  loading: boolean;
  refetch: () => void;
} {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.athanor.invoke('session:list' as never);
      setSessions(result as Session[]);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    const cleanup = window.athanor.on('session:status-change' as never, () => {
      fetch();
    });

    return () => {
      cleanup();
    };
  }, [fetch]);

  return { sessions, loading, refetch: fetch };
}

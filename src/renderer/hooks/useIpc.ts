import { useState, useEffect, useCallback } from 'react';

export function useIpcQuery<T>(
  channel: string,
  ...args: unknown[]
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.athanor.invoke(channel as never, ...args);
      setData(result as T);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channel, ...args]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useIpcMutation<T>(channel: string): {
  mutate: (...args: unknown[]) => Promise<T>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (...args: unknown[]): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.athanor.invoke(channel as never, ...args);
        return result as T;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [channel],
  );

  return { mutate, loading, error };
}

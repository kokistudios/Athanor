import { useState, useCallback } from 'react';
import type { ToastData } from '../components/shared/Toast';

let toastCounter = 0;

export interface AddToastOptions {
  message: string;
  variant?: 'default' | 'approval' | 'success';
  onClick?: () => void;
}

export function useToast(): {
  toasts: ToastData[];
  addToast: (options: AddToastOptions) => void;
  dismissToast: (id: string) => void;
} {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((options: AddToastOptions) => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, ...options }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface ToastData {
  id: string;
  message: string;
  variant?: 'default' | 'approval' | 'success';
  onClick?: () => void;
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps): React.ReactElement {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const borderColor =
    toast.variant === 'approval'
      ? 'var(--color-accent-ember)'
      : toast.variant === 'success'
        ? 'var(--color-accent-green)'
        : 'var(--color-border-strong)';

  return (
    <div
      className={`toast-item ${exiting ? 'toast-item-exit' : ''}`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={() => {
        toast.onClick?.();
        onDismiss(toast.id);
      }}
      role={toast.onClick ? 'button' : undefined}
    >
      <div className="flex-1 text-[0.8125rem] text-text-primary leading-snug">{toast.message}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): React.ReactElement | null {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

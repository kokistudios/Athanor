import React, { useEffect, useRef, useState } from 'react';
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

const TOAST_DURATION = 6000;
const EXIT_DURATION = 220;

function ToastItem({ toast, onDismiss }: ToastItemProps): React.ReactElement {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const variant = toast.variant || 'default';

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), EXIT_DURATION);
    }, TOAST_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`toast-item toast-variant-${variant} ${exiting ? 'toast-item-exit' : ''}`}
      onClick={() => {
        toast.onClick?.();
        onDismiss(toast.id);
      }}
      role={toast.onClick ? 'button' : undefined}
    >
      <div className="flex-1 text-[0.8125rem] text-text-primary leading-snug">
        {toast.message}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), EXIT_DURATION);
        }}
        className="toast-close"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>

      {/* Auto-dismiss progress indicator */}
      <div className={`toast-progress toast-progress-${variant}`} />
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

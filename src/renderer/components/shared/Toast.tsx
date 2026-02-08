import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, ShieldCheck, X } from 'lucide-react';

export interface ToastData {
  id: string;
  message: string;
  variant?: 'default' | 'approval' | 'success';
  onClick?: () => void;
}

type ToastVariant = NonNullable<ToastData['variant']>;

type VariantMeta = {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  accentClass: string;
  label: string;
};

const VARIANT_META: Record<ToastVariant, VariantMeta> = {
  default: {
    Icon: Info,
    accentClass: 'toast-icon-default',
    label: 'Notification',
  },
  approval: {
    Icon: ShieldCheck,
    accentClass: 'toast-icon-approval',
    label: 'Approval required',
  },
  success: {
    Icon: CheckCircle2,
    accentClass: 'toast-icon-success',
    label: 'Success',
  },
};

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const TOAST_DURATION = 6000;
const EXIT_DURATION = 220;

function ToastItem({ toast, onDismiss }: ToastItemProps): React.ReactElement {
  const [exiting, setExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStartRef = useRef<number | null>(null);
  const remainingRef = useRef(TOAST_DURATION);
  const variant: ToastVariant = toast.variant || 'default';
  const variantMeta = VARIANT_META[variant];
  const interactive = Boolean(toast.onClick);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (exitTimerRef.current) return;
    clearTimer();
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onDismiss(toast.id), EXIT_DURATION);
  }, [clearTimer, onDismiss, toast.id]);

  const startTimer = useCallback(() => {
    if (exitTimerRef.current) return;
    clearTimer();
    lastStartRef.current = performance.now();
    timerRef.current = setTimeout(() => {
      remainingRef.current = 0;
      dismiss();
    }, remainingRef.current);
  }, [clearTimer, dismiss]);

  const pauseTimer = useCallback(() => {
    if (exitTimerRef.current) return;
    if (lastStartRef.current !== null) {
      const elapsed = performance.now() - lastStartRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
    clearTimer();
    lastStartRef.current = null;
    setIsPaused(true);
  }, [clearTimer]);

  const resumeTimer = useCallback(() => {
    if (exitTimerRef.current) return;
    if (remainingRef.current <= 0) {
      dismiss();
      return;
    }
    setIsPaused(false);
    startTimer();
  }, [dismiss, startTimer]);

  useEffect(() => {
    remainingRef.current = TOAST_DURATION;
    lastStartRef.current = null;
    setIsPaused(false);
    startTimer();

    return () => {
      clearTimer();
      clearExitTimer();
    };
  }, [startTimer, clearTimer, clearExitTimer, toast.id]);

  const handleActivate = useCallback(() => {
    toast.onClick?.();
    dismiss();
  }, [dismiss, toast]);

  const handleBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }
      resumeTimer();
    },
    [resumeTimer],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleActivate();
      }
    },
    [handleActivate, interactive],
  );

  return (
    <div
      className={`toast-item toast-variant-${variant} ${exiting ? 'toast-item-exit' : ''}`}
      onClick={handleActivate}
      role={toast.onClick ? 'button' : undefined}
      tabIndex={toast.onClick ? 0 : undefined}
      data-paused={isPaused ? 'true' : undefined}
      onKeyDown={handleKeyDown}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={handleBlurCapture}
    >
      <div className="toast-content">
        <div className={`toast-icon ${variantMeta.accentClass}`} aria-hidden="true">
          <variantMeta.Icon size={15} strokeWidth={1.6} />
        </div>
        <div className="toast-message" role="status" aria-live="polite">
          {toast.message}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
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

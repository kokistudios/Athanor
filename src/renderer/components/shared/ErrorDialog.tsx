import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';

interface ErrorDialogProps {
  open: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
}

export function ErrorDialog({
  open,
  title,
  message,
  onDismiss,
}: ErrorDialogProps): React.ReactElement | null {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      aria-describedby="error-dialog-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="confirm-dialog">
        <div className="confirm-dialog-icon">
          <XCircle size={18} />
        </div>
        <div id="error-dialog-title" className="confirm-dialog-title">
          {title}
        </div>
        <div id="error-dialog-desc" className="confirm-dialog-desc">
          {message}
        </div>
        <div className="confirm-dialog-actions">
          <button className="btn-secondary" onClick={onDismiss}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

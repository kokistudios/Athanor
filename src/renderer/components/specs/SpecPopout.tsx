import React, { useState, useEffect } from 'react';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';

export function SpecPopout(): React.ReactElement {
  const [content, setContent] = useState('');

  // Apply dark theme to :root
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text-primary font-sans">
      {/* Draggable title bar region */}
      <div
        className="flex items-center justify-between px-4 py-2 select-none border-b border-border-subtle"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
          Spec Editor
        </span>
      </div>

      <div className="flex-1 min-h-0 p-4">
        <div className="h-full rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
          <TransparentMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write your specification here..."
            autoFocus
            fillHeight
            normalTextareaClassName="w-full h-full p-6 bg-surface-1 border-none text-text-primary text-[0.875rem] font-mono leading-relaxed resize-none outline-none"
            transparentContainerClassName="relative h-full"
            transparentPreviewStyle={{
              height: '100%',
              overflow: 'auto',
              padding: 24,
              fontSize: '0.875rem',
              lineHeight: 1.7,
            }}
            transparentTextareaStyle={{
              padding: 24,
              fontSize: '0.875rem',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              resize: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}

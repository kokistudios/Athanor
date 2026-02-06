import React, { useState } from 'react';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { NotebookPen } from 'lucide-react';

export function SpecEditor(): React.ReactElement {
  const [content, setContent] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 md:px-8">
        <div className="page-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NotebookPen size={18} strokeWidth={1.75} className="text-accent-ember" />
            <h2>Spec Editor</h2>
          </div>
          <span className="text-[0.6875rem] text-text-tertiary">Editor</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-5 md:px-8 pb-5 md:pb-8">
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

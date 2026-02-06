import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ToolUseBlockProps {
  name: string;
  preview: string;
  fullContent?: string;
}

export function ToolUseBlock({
  name,
  preview,
  fullContent,
}: ToolUseBlockProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="animate-fade-in py-1">
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full px-3 py-2 border-none bg-transparent text-text-secondary cursor-pointer text-[0.75rem] text-left hover:bg-surface-2/50 transition-colors duration-100"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-text-tertiary shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-text-tertiary shrink-0" />
          )}
          <span className="font-mono font-medium text-accent-ember text-[0.6875rem]">{name}</span>
          {!expanded && (
            <span className="ml-1 text-text-tertiary overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-[0.6875rem]">
              {preview}
            </span>
          )}
        </button>
        {expanded && (
          <pre className="px-3 py-2.5 m-0 bg-code-bg text-text-secondary text-[0.6875rem] overflow-auto max-h-[300px] whitespace-pre-wrap break-words font-mono border-t border-border-subtle leading-relaxed">
            {fullContent || preview}
          </pre>
        )}
      </div>
    </div>
  );
}

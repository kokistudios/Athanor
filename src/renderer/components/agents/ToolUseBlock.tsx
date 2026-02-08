import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

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
      <div
        className={`tool-use-block${expanded ? ' tool-use-block-expanded' : ''}`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="tool-use-trigger"
        >
          <ChevronRight
            size={12}
            className={`tool-use-chevron${expanded ? ' tool-use-chevron-open' : ''}`}
          />
          <span className="tool-use-name">{name}</span>
          <span className="tool-use-preview">
            {preview}
          </span>
        </button>
        <div className="tool-use-body">
          <div className="tool-use-body-inner">
            <pre className="tool-use-content scrollbar-thin">
              {fullContent || preview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

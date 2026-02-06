import React from 'react';
import { Sparkles } from 'lucide-react';

interface StreamingTextProps {
  text: string;
}

export function StreamingText({ text }: StreamingTextProps): React.ReactElement {
  return (
    <div className="py-5">
      <div className="flex gap-3.5">
        <div className="shrink-0 w-7 h-7 rounded-full bg-surface-2 border border-border-subtle flex items-center justify-center mt-0.5">
          <Sparkles size={13} strokeWidth={1.75} className="text-accent-gold" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-[0.6875rem] text-text-tertiary mb-2 font-medium tracking-wide">
            Assistant
          </div>
          <div className="text-[0.875rem] leading-[1.75] text-text-primary whitespace-pre-wrap break-words">
            {text}
            <span className="inline-block w-[6px] h-[15px] ml-0.5 align-text-bottom rounded-[1px] bg-accent-ember animate-cursor-breathe" />
          </div>
        </div>
      </div>
    </div>
  );
}

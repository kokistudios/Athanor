import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, User } from 'lucide-react';
import { ToolUseBlock } from './ToolUseBlock';
import { secureMarkdownComponents } from '../shared/markdown-security';

interface Message {
  id: string;
  type: string;
  content_preview: string | null;
  content_path: string | null;
  metadata: string | null;
  created_at: string;
}

interface MessageBubbleProps {
  message: Message;
}

function AssistantIcon() {
  return (
    <div className="shrink-0 w-7 h-7 rounded-full bg-surface-2 border border-border-subtle flex items-center justify-center mt-0.5">
      <Sparkles size={13} strokeWidth={1.75} className="text-accent-gold" />
    </div>
  );
}

function UserIcon() {
  return (
    <div className="shrink-0 w-7 h-7 rounded-full bg-accent-ember/15 flex items-center justify-center mt-0.5">
      <User size={13} strokeWidth={1.75} className="text-accent-ember" />
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
  const content = message.content_preview || '';

  switch (message.type) {
    case 'assistant': {
      let text = '';
      try {
        const parsed = JSON.parse(content);
        if (parsed?.content) {
          text = parsed.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('');
        } else {
          text = content;
        }
      } catch {
        text = content;
      }

      return (
        <div className="animate-fade-in py-5 border-b border-border-subtle/60">
          <div className="flex gap-3.5">
            <AssistantIcon />
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-[0.6875rem] text-text-tertiary mb-2 font-medium tracking-wide">
                Assistant
              </div>
              <div className="markdown-body text-[0.875rem] leading-[1.75]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
                  {text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case 'user': {
      let text = content;
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed?.content)) {
          text = parsed.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('');
        }
      } catch {
        /* use raw */
      }

      return (
        <div className="animate-fade-in py-5 border-b border-border-subtle/60">
          <div className="flex gap-3.5">
            <UserIcon />
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-[0.6875rem] text-accent-ember mb-2 font-medium tracking-wide">
                You
              </div>
              <div className="markdown-body text-[0.875rem] leading-[1.75]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
                  {text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case 'tool_use': {
      let name = 'tool';
      let preview = content;
      try {
        const parsed = JSON.parse(content);
        name = parsed?.name || 'tool';
        preview = JSON.stringify(parsed?.input || parsed, null, 2).slice(0, 200);
      } catch {
        /* use raw */
      }

      return (
        <div className="pl-[42px]">
          <ToolUseBlock name={name} preview={preview} fullContent={content} />
        </div>
      );
    }

    case 'tool_result': {
      let preview = content.slice(0, 200);
      try {
        const parsed = JSON.parse(content);
        if (parsed?.content) {
          preview =
            typeof parsed.content === 'string'
              ? parsed.content.slice(0, 200)
              : JSON.stringify(parsed.content).slice(0, 200);
        }
      } catch {
        /* use raw */
      }

      return (
        <div className="pl-[42px]">
          <ToolUseBlock name="Result" preview={preview} fullContent={content} />
        </div>
      );
    }

    case 'result': {
      let costStr = content;
      if (message.metadata) {
        try {
          const meta = JSON.parse(message.metadata);
          costStr = `Cost: $${meta.total_cost_usd?.toFixed(4) || '0'}`;
        } catch {
          /* use raw */
        }
      }

      return (
        <div className="animate-fade-in py-2 pl-[42px]">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-status-completed/10 text-status-completed text-[0.75rem] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-status-completed" />
            {costStr}
          </div>
        </div>
      );
    }

    case 'system': {
      return (
        <div className="animate-fade-in py-3 pl-[42px]">
          <div className="text-[0.8125rem] text-text-tertiary italic">{content}</div>
        </div>
      );
    }

    default:
      return (
        <div className="animate-fade-in py-2 pl-[42px] text-[0.8125rem] text-text-tertiary">
          <span className="opacity-60">[{message.type}]</span> {content.slice(0, 200)}
        </div>
      );
  }
}

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, User, ChevronRight, ChevronDown } from 'lucide-react';
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

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
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

// --- Content block renderers ---

function TextBlock({ text }: { text: string }): React.ReactElement {
  return (
    <div className="markdown-body text-[0.875rem] leading-[1.75]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-left hover:bg-surface-2/50 rounded-md px-2 py-1 -ml-2 transition-colors duration-100"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-status-active shrink-0" />
        <span className="text-[0.8125rem] text-text-tertiary italic">Thinking</span>
        {expanded ? (
          <ChevronDown size={11} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={11} className="text-text-tertiary" />
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-5 text-[0.8125rem] text-text-tertiary leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-auto scrollbar-thin">
          {text}
        </div>
      )}
    </div>
  );
}

function getToolDisplayName(name: string): string {
  // Strip MCP prefixes like mcp__athanor__ or mcp__server__
  const cleaned = name.replace(/^mcp__[^_]+__/, '');
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getToolSummary(name: string, input: Record<string, unknown>): string {
  const cleaned = name.replace(/^mcp__[^_]+__/, '').toLowerCase();

  switch (cleaned) {
    case 'read':
      if (typeof input.file_path === 'string') {
        const parts = input.file_path.split('/');
        return parts[parts.length - 1] || input.file_path;
      }
      return '';
    case 'write':
      if (typeof input.file_path === 'string') {
        const parts = input.file_path.split('/');
        return parts[parts.length - 1] || input.file_path;
      }
      return '';
    case 'edit':
      if (typeof input.file_path === 'string') {
        const parts = input.file_path.split('/');
        return parts[parts.length - 1] || input.file_path;
      }
      return '';
    case 'glob':
      return typeof input.pattern === 'string' ? `pattern: "${input.pattern}"` : '';
    case 'grep':
      return typeof input.pattern === 'string' ? `"${input.pattern}"` : '';
    case 'bash':
      if (typeof input.description === 'string') return input.description;
      if (typeof input.command === 'string') return input.command.slice(0, 80);
      return '';
    case 'task':
      return typeof input.description === 'string' ? input.description : '';
    case 'webfetch':
    case 'web_fetch':
      return typeof input.url === 'string' ? input.url : '';
    case 'websearch':
    case 'web_search':
      return typeof input.query === 'string' ? `"${input.query}"` : '';
    default: {
      const preview = JSON.stringify(input);
      return preview.length > 80 ? preview.slice(0, 77) + '...' : preview;
    }
  }
}

function ToolUseInline({
  name,
  input,
}: {
  name: string;
  input: Record<string, unknown>;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const displayName = getToolDisplayName(name);
  const summary = getToolSummary(name, input);

  return (
    <div className="py-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-left hover:bg-surface-2/50 rounded-md px-2 py-1 -ml-2 transition-colors duration-100 max-w-full"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-status-active shrink-0" />
        <span className="font-semibold text-text-primary text-[0.8125rem] shrink-0">
          {displayName}
        </span>
        {summary && (
          <span className="text-text-secondary font-mono text-[0.75rem] truncate">
            {summary}
          </span>
        )}
        {expanded ? (
          <ChevronDown size={11} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-text-tertiary shrink-0" />
        )}
      </button>
      {expanded && (
        <pre className="mt-1 ml-5 px-3 py-2 rounded-md bg-code-bg text-[0.6875rem] text-text-secondary font-mono leading-relaxed max-h-[300px] overflow-auto scrollbar-thin whitespace-pre-wrap break-words">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }): React.ReactElement | null {
  switch (block.type) {
    case 'text':
      if (!block.text?.trim()) return null;
      return <TextBlock text={block.text} />;

    case 'thinking':
      if (!block.thinking?.trim()) return null;
      return <ThinkingBlock text={block.thinking} />;

    case 'tool_use':
      return (
        <ToolUseInline name={block.name || 'tool'} input={block.input || {}} />
      );

    case 'server_tool_use':
      return (
        <ToolUseInline name={block.name || 'tool'} input={block.input || {}} />
      );

    default:
      return null;
  }
}

function parseContentBlocks(content: string): ContentBlock[] {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.content && Array.isArray(parsed.content)) {
      return parsed.content as ContentBlock[];
    }
    // If it's a plain object without content array, treat as raw text
    return [{ type: 'text', text: content }];
  } catch {
    // Plain text fallback
    return content.trim() ? [{ type: 'text', text: content }] : [];
  }
}

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement | null {
  const content = message.content_preview || '';

  switch (message.type) {
    case 'assistant': {
      const blocks = parseContentBlocks(content);

      // Filter out empty/null renderable blocks
      const renderableBlocks = blocks.filter((b) => {
        if (b.type === 'text') return !!b.text?.trim();
        if (b.type === 'thinking') return !!b.thinking?.trim();
        if (b.type === 'tool_use' || b.type === 'server_tool_use') return true;
        return false;
      });

      if (renderableBlocks.length === 0) return null;

      return (
        <div className="animate-fade-in py-5 border-b border-border-subtle/60">
          <div className="flex gap-3.5">
            <AssistantIcon />
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-[0.6875rem] text-text-tertiary mb-2 font-medium tracking-wide">
                Assistant
              </div>
              <div className="flex flex-col gap-1">
                {renderableBlocks.map((block, i) => (
                  <ContentBlockView key={i} block={block} />
                ))}
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

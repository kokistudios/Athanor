import { useState, useEffect, useRef, useCallback } from 'react';

interface AgentToken {
  agentId: string;
  text: string;
}

interface AgentMessage {
  agentId: string;
  messageId: string;
  type: string;
  event: unknown;
}

export function useAgentStream(agentId: string | null): {
  streamingText: string;
  messages: AgentMessage[];
  isStreaming: boolean;
} {
  const [streamingText, setStreamingText] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bufferRef = useRef('');

  useEffect(() => {
    if (!agentId) return;

    setStreamingText('');
    setMessages([]);
    bufferRef.current = '';

    const cleanupToken = window.athanor.on('agent:token' as never, (data: unknown) => {
      const token = data as AgentToken;
      if (token.agentId !== agentId) return;
      bufferRef.current += token.text;
      setStreamingText(bufferRef.current);
      setIsStreaming(true);
    });

    const cleanupMessage = window.athanor.on('agent:message' as never, (data: unknown) => {
      const msg = data as AgentMessage;
      if (msg.agentId !== agentId) return;

      if (msg.type === 'assistant') {
        // Full message replaces streaming buffer
        bufferRef.current = '';
        setStreamingText('');
        setIsStreaming(false);
      }

      setMessages((prev) => [...prev, msg]);
    });

    const cleanupCompleted = window.athanor.on('agent:completed' as never, (data: unknown) => {
      const { agentId: completedId } = data as { agentId: string };
      if (completedId !== agentId) return;
      setIsStreaming(false);
    });

    return () => {
      cleanupToken();
      cleanupMessage();
      cleanupCompleted();
    };
  }, [agentId]);

  return { streamingText, messages, isStreaming };
}

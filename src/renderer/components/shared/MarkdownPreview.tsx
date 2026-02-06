import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { secureMarkdownComponents } from './markdown-security';

interface CursorPosition {
  left: number;
  top: number;
  height: number;
}

interface MarkdownPreviewProps {
  content: string;
  emptyText?: string;
  showCursor?: boolean;
  cursorIndex?: number;
  style?: React.CSSProperties;
}

const spaceWidthCache = new Map<string, number>();
let measurementContext: CanvasRenderingContext2D | null | undefined;

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext !== undefined) {
    return measurementContext;
  }
  if (typeof document === 'undefined') {
    measurementContext = null;
    return measurementContext;
  }
  measurementContext = document.createElement('canvas').getContext('2d');
  return measurementContext;
}

function getLastTextNode(node: Node | null): Text | null {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    return textNode.textContent ? textNode : null;
  }
  for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
    const result = getLastTextNode(node.childNodes[i]);
    if (result) {
      return result;
    }
  }
  return null;
}

function parsePositivePx(value: string): number | null {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getLineHeight(element: Element, fallback: number): number {
  const lineHeight = parsePositivePx(window.getComputedStyle(element).lineHeight);
  return lineHeight ?? fallback;
}

function getSpaceWidth(element: Element): number {
  const computed = window.getComputedStyle(element);
  const font = computed.font;
  const letterSpacing = parseFloat(computed.letterSpacing || '0');
  const cacheKey = `${font}|${letterSpacing}`;
  const cached = spaceWidthCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fallback = Math.max(4, (parsePositivePx(computed.fontSize) ?? 16) * 0.35);
  const ctx = getMeasurementContext();
  if (!ctx || !font) {
    spaceWidthCache.set(cacheKey, fallback);
    return fallback;
  }

  ctx.font = font;
  const measured = ctx.measureText(' ').width;
  const width = Math.max(1, measured + (Number.isFinite(letterSpacing) ? letterSpacing : 0));
  spaceWidthCache.set(cacheKey, width || fallback);
  return width || fallback;
}

function applyTrailingWhitespaceOffset(
  baseCursor: CursorPosition,
  trailingWhitespace: string,
  container: HTMLElement,
  anchorElement: Element,
): CursorPosition {
  if (!trailingWhitespace) {
    return baseCursor;
  }

  const normalized = trailingWhitespace.replace(/\r/g, '');
  const lineHeight = getLineHeight(anchorElement, baseCursor.height);
  const spaceWidth = getSpaceWidth(anchorElement);
  const containerStyles = window.getComputedStyle(container);
  const paddingLeft = parseFloat(containerStyles.paddingLeft || '0') || 0;

  const lines = normalized.split('\n');
  const newlineCount = Math.max(0, lines.length - 1);
  const trailingLine = lines[lines.length - 1] ?? '';

  let left = baseCursor.left;
  let top = baseCursor.top;
  if (newlineCount > 0) {
    left = paddingLeft;
    top += lineHeight * newlineCount;
  }

  const trailingColumns = trailingLine.split('').reduce((count, char) => {
    if (char === '\t') {
      return count + 2;
    }
    return count + 1;
  }, 0);
  left += trailingColumns * spaceWidth;

  return {
    left,
    top,
    height: Math.max(baseCursor.height, lineHeight),
  };
}

export const MarkdownPreview = React.forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  function MarkdownPreview(
    {
      content,
      emptyText = 'Rendered markdown will appear here.',
      showCursor = false,
      cursorIndex,
      style,
    },
    forwardedRef,
  ): React.ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const measureRef = useRef<HTMLDivElement | null>(null);
    const measureContentRef = useRef<HTMLDivElement | null>(null);
    const [cursor, setCursor] = useState<CursorPosition | null>(null);
    const clampedCursorIndex =
      typeof cursorIndex === 'number' ? Math.max(0, Math.min(content.length, cursorIndex)) : null;
    const cursorPrefix = clampedCursorIndex === null ? '' : content.slice(0, clampedCursorIndex);

    const setContainerRef = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (!forwardedRef) return;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const updateCursor = useCallback(() => {
      if (!showCursor) {
        setCursor(null);
        return;
      }

      if (clampedCursorIndex !== null) {
        const measureContainer = measureRef.current;
        const measureContent = measureContentRef.current;
        if (!measureContainer || !measureContent) {
          setCursor(null);
          return;
        }

        const computed = window.getComputedStyle(measureContainer);
        const left = parseFloat(computed.paddingLeft || '0') || 0;
        const top = parseFloat(computed.paddingTop || '0') || 0;
        const lineHeight = parsePositivePx(computed.lineHeight) ?? 18;
        const cursorAtStart = { left, top, height: lineHeight };

        if (clampedCursorIndex === 0) {
          setCursor(cursorAtStart);
          return;
        }

        const textNode = getLastTextNode(measureContent);
        if (!textNode) {
          setCursor(
            applyTrailingWhitespaceOffset(
              cursorAtStart,
              cursorPrefix,
              measureContainer,
              measureContainer,
            ),
          );
          return;
        }

        const range = document.createRange();
        range.setStart(textNode, textNode.textContent?.length ?? 0);
        range.collapse(true);
        const endRect = range.getBoundingClientRect();
        const measureRect = measureContainer.getBoundingClientRect();
        const baseCursor: CursorPosition = {
          left: Math.max(0, endRect.left - measureRect.left),
          top: Math.max(0, endRect.top - measureRect.top),
          height: Math.max(16, endRect.height || lineHeight),
        };
        const trailingWhitespace = cursorPrefix.match(/[ \t\n\r]+$/)?.[0] ?? '';
        const anchorElement = textNode.parentElement ?? measureContent;
        setCursor(
          applyTrailingWhitespaceOffset(
            baseCursor,
            trailingWhitespace,
            measureContainer,
            anchorElement,
          ),
        );
        return;
      }

      const container = containerRef.current;
      const contentEl = contentRef.current;
      if (!container || !contentEl) {
        setCursor(null);
        return;
      }

      if (!content.trim()) {
        const computed = window.getComputedStyle(container);
        const left = parseFloat(computed.paddingLeft || '0') || 0;
        const top = parseFloat(computed.paddingTop || '0') || 0;
        const lineHeight = parsePositivePx(computed.lineHeight) ?? 18;
        const cursorAtStart = { left, top, height: lineHeight };
        setCursor(applyTrailingWhitespaceOffset(cursorAtStart, content, container, container));
        return;
      }

      const textNode = getLastTextNode(contentEl);
      if (!textNode) {
        setCursor(null);
        return;
      }

      const range = document.createRange();
      range.setStart(textNode, textNode.textContent?.length ?? 0);
      range.collapse(true);
      const endRect = range.getBoundingClientRect();
      if (!endRect || (endRect.width === 0 && endRect.height === 0)) {
        setCursor(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const baseCursor: CursorPosition = {
        left: Math.max(0, endRect.left - containerRect.left + container.scrollLeft),
        top: Math.max(0, endRect.top - containerRect.top + container.scrollTop),
        height: Math.max(16, endRect.height || 18),
      };

      const trailingWhitespace = content.match(/[ \t\n\r]+$/)?.[0] ?? '';
      const anchorElement = textNode.parentElement ?? contentEl;
      setCursor(
        applyTrailingWhitespaceOffset(baseCursor, trailingWhitespace, container, anchorElement),
      );
    }, [clampedCursorIndex, content, cursorPrefix, showCursor]);

    useLayoutEffect(() => {
      updateCursor();
      const raf = requestAnimationFrame(updateCursor);
      return () => cancelAnimationFrame(raf);
    }, [updateCursor]);

    useEffect(() => {
      if (!showCursor) return;
      const container = containerRef.current;
      if (!container) return;

      const onChange = () => updateCursor();
      container.addEventListener('scroll', onChange);
      window.addEventListener('resize', onChange);

      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : null;
      if (observer) {
        observer.observe(container);
        if (contentRef.current) {
          observer.observe(contentRef.current);
        }
      }

      return () => {
        container.removeEventListener('scroll', onChange);
        window.removeEventListener('resize', onChange);
        observer?.disconnect();
      };
    }, [showCursor, updateCursor]);

    return (
      <div
        ref={setContainerRef}
        className="markdown-body"
        style={{
          position: 'relative',
          ...style,
        }}
      >
        <div ref={contentRef}>
          {content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
              {content}
            </ReactMarkdown>
          ) : (
            <div className="text-text-tertiary">{emptyText}</div>
          )}
        </div>
        {showCursor && clampedCursorIndex !== null && (
          <div
            ref={measureRef}
            className="markdown-body"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              visibility: 'hidden',
              pointerEvents: 'none',
              ...style,
              overflow: 'hidden',
            }}
          >
            <div ref={measureContentRef}>
              {cursorPrefix ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
                  {cursorPrefix}
                </ReactMarkdown>
              ) : null}
            </div>
          </div>
        )}
        {showCursor && cursor && (
          <span
            className="transparent-editor-cursor"
            style={{
              left: cursor.left,
              top: cursor.top,
              height: cursor.height,
            }}
          />
        )}
      </div>
    );
  },
);

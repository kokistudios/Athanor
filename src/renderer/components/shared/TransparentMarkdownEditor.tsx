import React, { useCallback } from 'react';

interface TransparentMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  normalTextareaClassName: string;
  transparentContainerClassName: string;
  transparentPreviewStyle?: React.CSSProperties;
  transparentTextareaStyle?: React.CSSProperties;
  rows?: number;
  fillHeight?: boolean;
  autoFocus?: boolean;
  onMetaEnter?: () => void;
}

function asCssValue(
  value: React.CSSProperties[keyof React.CSSProperties],
  fallback: string,
): string {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
}

export function TransparentMarkdownEditor({
  value,
  onChange,
  placeholder,
  normalTextareaClassName,
  transparentContainerClassName,
  transparentPreviewStyle,
  transparentTextareaStyle,
  rows = 5,
  fillHeight = false,
  autoFocus = false,
  onMetaEnter,
}: TransparentMarkdownEditorProps): React.ReactElement {
  const className = normalTextareaClassName || transparentContainerClassName || 'w-full';
  const minHeight = Math.max(96, rows * 22);
  const textPadding = asCssValue(
    transparentPreviewStyle?.padding ?? transparentTextareaStyle?.padding,
    '10px 12px',
  );
  const textFontSize = asCssValue(
    transparentPreviewStyle?.fontSize ?? transparentTextareaStyle?.fontSize,
    '0.8125rem',
  );
  const textLineHeight = asCssValue(
    transparentPreviewStyle?.lineHeight ?? transparentTextareaStyle?.lineHeight,
    '1.5',
  );
  const textFontFamily = asCssValue(transparentTextareaStyle?.fontFamily, 'var(--font-mono)');

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && onMetaEnter) {
        event.preventDefault();
        onMetaEnter();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
      }
    },
    [onMetaEnter],
  );

  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={rows}
      className={className}
      autoFocus={autoFocus}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      autoComplete="off"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      style={{
        minHeight: `${minHeight}px`,
        ...(fillHeight ? { height: '100%' } : undefined),
        padding: textPadding,
        fontSize: textFontSize,
        lineHeight: textLineHeight,
        fontFamily: textFontFamily,
        ...(transparentPreviewStyle ?? {}),
        ...(transparentTextareaStyle ?? {}),
      }}
    />
  );
}

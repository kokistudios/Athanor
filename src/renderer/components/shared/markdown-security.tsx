import React from 'react';
import type { Components } from 'react-markdown';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function toSafeExternalUrl(href: string | undefined): string | null {
  if (!href) return null;

  try {
    const parsed = new URL(href, window.location.origin);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export const secureMarkdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    const safeHref = toSafeExternalUrl(href);

    if (!safeHref) {
      return <span {...props}>{children}</span>;
    }

    return (
      <a
        {...props}
        href={safeHref}
        rel="noopener noreferrer"
        onClick={(event) => {
          event.preventDefault();
          void window.athanor.openExternal(safeHref);
        }}
      >
        {children}
      </a>
    );
  },
};

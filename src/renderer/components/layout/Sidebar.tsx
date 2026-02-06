import React from 'react';
import {
  UsersRound,
  Folders,
  ClipboardClock,
  Workflow,
  Orbit,
  NotebookPen,
  Brain,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import logoDarkSrc from '../../../logo.png'; // resolved via webpack asset loader
import logoLightSrc from '../../../logo-light.png';

export type ViewKind =
  | 'agents'
  | 'sessions'
  | 'approvals'
  | 'workflows'
  | 'workspaces'
  | 'specs'
  | 'decisions';

interface SidebarProps {
  currentView: ViewKind;
  onNavigate: (view: ViewKind) => void;
  approvalCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const navItems: { kind: ViewKind; label: string; icon: LucideIcon }[] = [
  { kind: 'agents', label: 'Agents', icon: UsersRound },
  { kind: 'sessions', label: 'Sessions', icon: Folders },
  { kind: 'approvals', label: 'Approvals', icon: ClipboardClock },
  { kind: 'workflows', label: 'Workflows', icon: Workflow },
  { kind: 'workspaces', label: 'Workspaces', icon: Orbit },
  { kind: 'specs', label: 'Specs', icon: NotebookPen },
  { kind: 'decisions', label: 'Decisions', icon: Brain },
];

export function Sidebar({
  currentView,
  onNavigate,
  approvalCount,
  collapsed,
  onToggleCollapsed,
  theme,
  onToggleTheme,
}: SidebarProps): React.ReactElement {
  const logoSrc = theme === 'dark' ? logoDarkSrc : logoLightSrc;
  return (
    <nav
      style={{
        width: collapsed ? 60 : 232,
        minWidth: collapsed ? 60 : 232,
        background: 'var(--color-sidebar-bg)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        transition:
          'width 150ms cubic-bezier(0.16, 1, 0.3, 1), min-width 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: collapsed ? '16px 12px 12px' : '16px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 8,
        }}
      >
        {!collapsed ? (
          <>
            <img
              src={logoSrc}
              alt="Athanor"
              draggable={false}
              style={{
                height: 36,
                width: 'auto',
                userSelect: 'none',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }} />
            <button
              onClick={onToggleCollapsed}
              title="Collapse navigation"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
            >
              <PanelLeftClose size={15} />
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <img
              src={logoSrc}
              alt="Athanor"
              draggable={false}
              style={{
                height: 22,
                width: 22,
                objectFit: 'cover',
                objectPosition: 'left',
                userSelect: 'none',
              }}
            />
            <button
              onClick={onToggleCollapsed}
              title="Expand navigation"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
            >
              <PanelLeftOpen size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'var(--color-border-subtle)',
          margin: collapsed ? '0 8px 8px' : '0 14px 8px',
        }}
      />

      {/* Navigation items */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: collapsed ? '0 8px' : '0 10px',
          overflowY: 'auto',
        }}
      >
        {navItems.map((item) => {
          const isActive = currentView === item.kind;
          return (
            <button
              key={item.kind}
              onClick={() => onNavigate(item.kind)}
              title={collapsed ? item.label : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: collapsed ? '10px 0' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 120ms ease',
                color: isActive ? 'var(--color-accent-ember)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-sidebar-active-bg)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-sidebar-hover)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 18,
                    borderRadius: 2,
                    background: 'var(--color-accent-ember)',
                  }}
                />
              )}
              <item.icon size={18} strokeWidth={isActive ? 2 : 1.75} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
              {item.kind === 'approvals' && approvalCount > 0 && (
                <span
                  style={{
                    marginLeft: collapsed ? 0 : 'auto',
                    background: 'rgba(196, 92, 92, 0.2)',
                    color: 'var(--color-status-failed)',
                    fontSize: collapsed ? '0.5625rem' : '0.6875rem',
                    fontWeight: 600,
                    padding: collapsed ? '0 4px' : '1px 7px',
                    borderRadius: 9999,
                    position: collapsed ? 'absolute' : 'static',
                    top: collapsed ? 4 : undefined,
                    right: collapsed ? 4 : undefined,
                    lineHeight: 1.4,
                  }}
                >
                  {approvalCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: Theme toggle */}
      <div
        style={{
          padding: collapsed ? '12px 8px' : '12px 14px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '6px 12px',
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <span
            style={{
              display: 'flex',
              transition: 'transform 300ms ease',
              transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          >
            {theme === 'dark' ? (
              <Moon size={15} strokeWidth={1.75} />
            ) : (
              <Sun size={15} strokeWidth={1.75} />
            )}
          </span>
          {!collapsed && <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>}
        </button>
      </div>
    </nav>
  );
}

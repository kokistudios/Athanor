# Athanor Design System — Precision Alchemy

> Athanor is an alchemical furnace — a vessel of controlled transformation. The design feels like watching a master craftsperson at work: every element purposeful, every transition deliberate, every surface hinting at the powerful processes happening beneath. Not flashy. Not cold. **Warm precision.**

The aesthetic sits at an intersection called **"refined industrial"** — the clean geometric confidence of a Swiss watch dial meets the warm glow of a forge. Linear gives us the machine-precision. Anthropic gives us the warmth and soul. OpenAI gives us the breathing room.

---

## Technology

- **Framework**: Tailwind CSS v4 via `@tailwindcss/postcss`
- **Theming**: CSS custom properties in `@theme` block (dark default) with `.light` class overrides
- **Fonts**: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/instrument-serif`
- **Icons**: Lucide React (`lucide-react`)
- **Build**: PostCSS loader in webpack pipeline

All design tokens live in `src/renderer/index.css`. Theme toggling is handled by the `useTheme` hook which swaps `dark`/`light` class on `<html>`.

---

## Color System

The signature move: a **warm neutral foundation** instead of the typical blue-gray that every dev tool defaults to. The backgrounds have a barely perceptible warm undertone — like parchment that's been near heat.

### Dark Mode (Default)

```
Surface layers (warm charcoal, NOT blue-gray):
  --surface-0:      #0e0d0c    deepest — app shell / main content bg
  --surface-1:      #181614    panels, secondary areas
  --surface-2:      #211f1c    elevated containers
  --surface-3:      #2d2a26    inputs, hover states
  --surface-raised: #282522    cards, lifted elements

Sidebar:
  --sidebar-bg:        #151311
  --sidebar-hover:     rgba(212, 105, 46, 0.08)
  --sidebar-active-bg: rgba(212, 105, 46, 0.14)

Borders:
  --border-subtle:  #282522    structural dividers
  --border-default: #3a3632    visible borders, card outlines
  --border-strong:  #504b45    emphasis, hover states

Text:
  --text-primary:   #ede9e2    warm white — NOT pure #fff
  --text-secondary: #a8a29a    muted body text
  --text-tertiary:  #716b64    timestamps, labels, disabled
```

### Light Mode

```
Surface layers (warm cream, NOT stark white):
  --surface-0:      #f7f5f2    app shell — parchment tone
  --surface-1:      #ffffff    sidebar, panels
  --surface-2:      #ffffff    cards (use shadow for lift)
  --surface-3:      #efece7    inputs, hover states
  --surface-raised: #ffffff    cards

Sidebar:
  --sidebar-bg:        #f0ede8
  --sidebar-hover:     rgba(192, 84, 26, 0.06)
  --sidebar-active-bg: rgba(192, 84, 26, 0.10)

Borders:
  --border-subtle:  #e8e4dd
  --border-default: #d6d1c9
  --border-strong:  #c0b9af

Text:
  --text-primary:   #1a1918
  --text-secondary: #65605a
  --text-tertiary:  #9a958e
```

### Accent: The Crucible Palette

Instead of a single accent, Athanor uses a **gradient pair — ember to gold** — for moments of transformation:

```
--accent-ember:       #d4692e    deep warm orange — the furnace
--accent-gold:        #dab257    refined gold — the result
--accent-glow:        rgba(212, 105, 46, 0.10)   subtle warm glow
--accent-glow-strong: rgba(212, 105, 46, 0.20)   stronger for focus rings
```

**Rule**: Accents are earned, not scattered. Gold appears only at moments of completion, transformation, or key actions. The UI is predominantly neutral — when gold shows up, it means something.

### Status Colors

Muted, sophisticated — NOT neon:

```
--status-active:    #5c9a6e    sage green
--status-running:   #5b8dd4    steel blue
--status-waiting:   #c4893a    amber
--status-failed:    #c45c5c    muted red
--status-completed: #5c9a6e    sage green (same as active)
--status-spawning:  #c4893a    amber (same as waiting)
```

---

## Typography

### Font Stack

| Role | Family | Usage |
|------|--------|-------|
| **UI / Body** | `Geist Variable` | All interface text, buttons, labels |
| **Code / Data** | `Geist Mono Variable` | Agent output, code blocks, IDs, timestamps |
| **Display** | `Instrument Serif` | Reserved — app title wordmark only |

### Scale

```
0.625rem  / 10px    kbd elements, tiny labels
0.6875rem / 11px    badges, section labels, meta info
0.75rem   / 12px    small body, back links, filters
0.8125rem / 13px    primary body text, form inputs
0.875rem  / 14px    emphasized body, card titles
0.9375rem / 15px    large inputs (workflow name)
1.0rem    / 16px    page header text
1.0625rem / 17px    detail page question text
1.125rem  / 18px    section headers (NOT used for page headers)
```

### Weights

- **400**: Body text
- **500**: Emphasis, labels, nav items, form inputs
- **600**: Headings, active nav items, section headers

### Letter Spacing

- Body: `0` (natural)
- Section labels/badges: `0.02em–0.04em` (slight tracking, uppercase)
- Headings: `-0.01em` (tightened for density)

---

## Spacing & Layout

### Base Grid

`--spacing: 4px` — all Tailwind spacing utilities multiply from this base.

Common patterns:
- `p-5` (20px) — card internal padding
- `p-7` (28px) — scrollable content area padding
- `gap-2` (8px) — default flex gap
- `gap-3` (12px) — nav item gap, form field spacing
- `mb-2` (8px) — card list spacing
- `mb-4`–`mb-6` — section spacing

### Border Radius

```
--radius-sm: 4px    buttons, inputs, badges
--radius-md: 6px    cards, panels
--radius-lg: 8px    large containers
--radius-xl: 12px   empty-state icon boxes
```

### Content Layout

```css
.content-area {
  max-width: 820px;
  margin: 0 auto;    /* CENTERED — never left-aligned */
  width: 100%;
}
```

All dashboard/detail views center their content using `.content-area`. Full-width layouts (like the agent threads split view) do NOT use this wrapper.

### Page Structure

Every view follows this pattern:

```
┌─────────────────────────────────┐
│  .page-header                   │  ← sticky header with icon + title
│  [icon] Title         [actions] │
├─────────────────────────────────┤
│  .flex-1.overflow-auto.p-7      │  ← scrollable content
│    .content-area                │  ← centered max-width wrapper
│      [content]                  │
│                                 │
└─────────────────────────────────┘
```

---

## Component Patterns

### Page Header (`.page-header`)

Every view has a consistent header with an ember-colored Lucide icon:

```tsx
<div className="page-header flex items-center gap-3">
  <SomeIcon size={18} strokeWidth={1.75} className="text-accent-ember" />
  <h2>Page Title</h2>
</div>
```

For headers with actions (buttons on the right), use `justify-between`:

```tsx
<div className="page-header flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Icon size={18} strokeWidth={1.75} className="text-accent-ember" />
    <h2>Title</h2>
  </div>
  <button className="btn-primary">Action</button>
</div>
```

For detail views with back navigation:

```tsx
<div className="page-header">
  <button className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 text-[0.75rem] mb-2">
    <ArrowLeft size={13} /> Back to list
  </button>
  <div className="flex items-center gap-3">
    <Icon size={18} strokeWidth={1.75} className="text-accent-ember" />
    <h2>Detail Title</h2>
  </div>
</div>
```

### Cards (`.card`)

```css
background: var(--color-surface-raised);
border: 1px solid var(--color-border-default);  /* visible, not subtle */
border-radius: 6px;
```

Cards get shadow on hover in dark mode (`0 4px 12px rgba(0,0,0,0.2)`), stronger shadows in light mode. Internal padding: `p-5` for forms/detail content, `p-3`–`p-4` for list items.

### Buttons

| Class | Usage | Style |
|-------|-------|-------|
| `.btn-primary` | Primary actions | Ember-to-gold gradient, white text |
| `.btn-secondary` | Secondary actions | `surface-3` bg, default border |
| `.btn-ghost` | Tertiary/inline | Transparent, subtle hover |
| `.btn-danger` | Destructive | Transparent, red border |
| `.btn-icon` | Icon-only | 28x28, `surface-2` bg, subtle border |

### Inputs (`.input-base`)

```css
background: var(--color-surface-3);
border: 1px solid var(--color-border-default);
border-radius: 4px;
padding: 6px 10px;
font-size: 0.8125rem;
```

Focus state: ember border + glow ring (`box-shadow: 0 0 0 2px var(--color-accent-glow)`).

### Badges (`.badge`, `.badge-*`)

Pill-shaped status indicators. Variants: `badge-ember`, `badge-gold`, `badge-blue`, `badge-green`, `badge-red`, `badge-neutral`. Each uses 15% opacity background of its accent color.

### Status Dots (`.status-dot`, `.status-dot-*`)

8px circles. Running/spawning/active dots pulse with `animate-pulse-dot`.

### Empty States (`.empty-state`)

Centered container with icon box + title + description:

```tsx
<div className="empty-state">
  <div className="empty-state-icon">
    <SomeIcon size={22} strokeWidth={1.5} />
  </div>
  <div className="empty-state-title">No items yet</div>
  <div className="empty-state-desc">Helpful description of what to do.</div>
</div>
```

---

## Sidebar

The sidebar uses a distinct background (`--sidebar-bg`) that's visually separate from the main content area. Key details:

- **Width**: 232px expanded, 60px collapsed
- **Active item**: `--sidebar-active-bg` background + 3px ember indicator bar on the left + bold weight (600)
- **Hover**: `--sidebar-hover` background
- **Logo**: Image mark at top, with collapse/expand toggle
- **Theme toggle**: Sun/Moon icon at bottom with rotation animation
- **Divider**: 1px `border-subtle` between header and nav items

---

## Animation

### Philosophy

Animations serve function, not decoration. They communicate state changes and guide attention.

### Keyframes

```
fade-in       200ms ease-out    — element entrance (opacity + 4px translateY)
pulse-dot     2s ease-in-out    — running/active status indicators
cursor-breathe 1.5s ease-in-out — streaming cursor (opacity 0.3 ↔ 1)
shimmer-gold  reserved          — completion moments
blink         1s steps          — text cursor
```

### Staggered Lists (`.stagger-children`)

Child elements animate in with 30ms incremental delay (up to 10 children). Used on all list views for smooth population.

### Transitions

Default transition duration: `100ms–150ms ease`. Used on:
- Button hover/active states
- Card border/shadow on hover
- Nav item background changes
- Sidebar width collapse/expand (`150ms cubic-bezier(0.16, 1, 0.3, 1)`)
- Theme icon rotation (`300ms ease`)

---

## Signature Visual Elements

### The Warm Glow (`.warm-glow`)

A pseudo-element radial gradient that appears on hover/focus. Applied sparingly to interactive elements that benefit from emphasis. The glow uses `accent-glow` color.

### Phase Progress Visualization

```
○———○———○    (nodes + connectors)
```

`.phase-node` (10px circles) + `.phase-connector` (1.5px lines). Completed nodes fill with gold, current node pulses with ember border. Connectors turn gold when their phase is complete.

### The Crucible Gradient

`linear-gradient(135deg, accent-ember, accent-gold)` — used exclusively on `.btn-primary`. This gradient is the most distinctive visual element and should NOT be used elsewhere.

---

## Scrollbar

Thin (6px), transparent track, warm-toned thumb matching the surface palette. Only visible on hover via `.scrollbar-thin` class.

---

## Selection & Focus

- **Text selection**: `accent-glow-strong` background, keeps text color
- **Focus-visible**: 2px ember outline with 2px offset

---

## File Reference

| File | Purpose |
|------|---------|
| `src/renderer/index.css` | All design tokens, component classes, animations |
| `src/renderer/index.html` | `<html class="dark">` default |
| `src/renderer/hooks/useTheme.ts` | Theme state + DOM class toggling |
| `src/renderer/assets.d.ts` | TypeScript declarations for image imports |
| `src/renderer/components/layout/Sidebar.tsx` | Main navigation sidebar |
| `src/renderer/components/layout/MainContent.tsx` | View router |

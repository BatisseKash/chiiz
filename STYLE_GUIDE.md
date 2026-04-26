# Chiiz — Style Guide
> Personal Budgeting & Finance App
> Aesthetic Direction: **Modern Minimalist with Playful Precision**

---

## 1. Brand Personality

Chiiz lives at the intersection of **calm confidence** and **quiet delight**. It doesn't feel like a bank — it feels like a smart, well-dressed friend who happens to be great with money. Every screen should feel like breathing room: clean enough to think, warm enough to trust.

**Keywords:** Effortless · Precise · Trustworthy · Quietly playful · Premium without intimidation

---

## 2. Color Palette

Use CSS custom properties throughout. Never hardcode hex values.

```css
:root {

  /* --- Primary Palette --- */
  --color-bg:            #F7F6F2;   /* Warm off-white — the app's canvas */
  --color-surface:       #FFFFFF;   /* Cards, modals, panels */
  --color-surface-alt:   #EEECEA;   /* Subtle input backgrounds, secondary cards */

  /* --- Brand Accent (Chiiz Green) --- */
  --color-accent:        #2DCC8F;   /* Primary CTA, positive values, highlights */
  --color-accent-light:  #D4F5E9;   /* Accent backgrounds, tags, badges */
  --color-accent-dark:   #1FA870;   /* Hover state on accent elements */

  /* --- Typography & Icons --- */
  --color-text-primary:  #1A1A2E;   /* Headings, primary labels */
  --color-text-secondary:#6B6B80;   /* Subtext, descriptions, metadata */
  --color-text-muted:    #ADADBE;   /* Placeholders, disabled states */

  /* --- Semantic Colors --- */
  --color-positive:      #2DCC8F;   /* Under budget, savings, positive delta */
  --color-negative:      #F0635A;   /* Over budget, expenses, alerts */
  --color-warning:       #F5A623;   /* Approaching budget limit */
  --color-neutral:       #A0AEC0;   /* Neutral/unchanged states */

  /* --- Borders & Dividers --- */
  --color-border:        #E8E6E1;   /* Subtle card borders */
  --color-border-strong: #D0CEC9;   /* Form inputs, dividers */

  /* --- Elevation / Shadows --- */
  --shadow-xs:  0px 1px 3px rgba(26, 26, 46, 0.05);
  --shadow-sm:  0px 2px 8px rgba(26, 26, 46, 0.07);
  --shadow-md:  0px 6px 20px rgba(26, 26, 46, 0.09);
  --shadow-lg:  0px 16px 40px rgba(26, 26, 46, 0.12);
}
```

### Dark Mode

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:            #12121C;
    --color-surface:       #1C1C2A;
    --color-surface-alt:   #252535;
    --color-border:        #2E2E42;
    --color-border-strong: #3A3A52;
    --color-text-primary:  #F0EFF8;
    --color-text-secondary:#9090A8;
    --color-text-muted:    #50506A;
    /* Accents remain the same */
  }
}
```

---

## 3. Typography

**Font Stack:** [Sora](https://fonts.google.com/specimen/Sora) (display/headings) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body/UI)

```html
<!-- In your <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'Sora', sans-serif;      /* Page titles, hero numbers, brand */
  --font-body:    'DM Sans', sans-serif;   /* All UI copy, labels, inputs */

  /* --- Type Scale --- */
  --text-xs:   0.75rem;    /* 12px — tags, captions */
  --text-sm:   0.875rem;   /* 14px — metadata, secondary labels */
  --text-base: 1rem;       /* 16px — body text */
  --text-lg:   1.125rem;   /* 18px — subheadings */
  --text-xl:   1.25rem;    /* 20px — card titles */
  --text-2xl:  1.5rem;     /* 24px — section headers */
  --text-3xl:  2rem;       /* 32px — page titles */
  --text-4xl:  2.75rem;    /* 44px — hero budget totals */
  --text-5xl:  3.5rem;     /* 56px — dashboard spotlight numbers */

  /* --- Weight --- */
  --weight-light:   300;
  --weight-regular: 400;
  --weight-medium:  500;
  --weight-semibold:600;
  --weight-bold:    700;

  /* --- Line Height --- */
  --leading-tight:  1.2;
  --leading-snug:   1.35;
  --leading-normal: 1.5;
  --leading-relaxed:1.65;

  /* --- Letter Spacing --- */
  --tracking-tight: -0.03em;   /* Hero numbers */
  --tracking-snug:  -0.01em;   /* Headings */
  --tracking-normal: 0;
  --tracking-wide:   0.05em;   /* Uppercase labels, tags */
  --tracking-wider:  0.1em;    /* Section dividers */
}
```

### Usage Rules
- **Hero numbers** (e.g. total balance, monthly spend): `font-family: var(--font-display); letter-spacing: var(--tracking-tight); font-weight: var(--weight-bold);`
- **Section headings**: `font-family: var(--font-display); font-weight: var(--weight-semibold);`
- **All body copy, labels, inputs**: `font-family: var(--font-body);`
- **Uppercase category labels**: always use `letter-spacing: var(--tracking-wide); text-transform: uppercase; font-size: var(--text-xs); font-weight: var(--weight-semibold);`

---

## 4. Spacing & Layout

```css
:root {
  /* --- Base Unit: 4px --- */
  --space-1:  0.25rem;   /* 4px */
  --space-2:  0.5rem;    /* 8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */
  --space-20: 5rem;      /* 80px */

  /* --- Layout --- */
  --max-width-app:    1280px;
  --sidebar-width:    240px;
  --content-padding:  var(--space-8);   /* 32px on desktop */
  --content-padding-mobile: var(--space-4);

  /* --- Border Radius --- */
  --radius-sm:   6px;    /* Badges, tags, small chips */
  --radius-md:   10px;   /* Inputs, small cards */
  --radius-lg:   16px;   /* Main cards */
  --radius-xl:   24px;   /* Hero panels, modals */
  --radius-full: 9999px; /* Pills, toggles, avatars */
}
```

**Layout Principles:**
- Sidebar navigation on desktop; bottom tab bar on mobile
- Cards always use `--radius-lg` and `--shadow-sm`
- Generous internal card padding: `var(--space-6)` minimum
- Vertical rhythm: sections separated by `var(--space-8)` or `var(--space-10)`
- Never exceed 4 columns in any grid

---

## 5. Components

### Cards
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-6);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card--highlight {
  background: var(--color-accent);
  border-color: transparent;
  color: #fff;
}

.card--muted {
  background: var(--color-surface-alt);
  border-color: transparent;
  box-shadow: none;
}
```

### Buttons
```css
.btn {
  font-family: var(--font-body);
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  border-radius: var(--radius-full);
  padding: var(--space-3) var(--space-6);
  cursor: pointer;
  border: none;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.btn--primary {
  background: var(--color-accent);
  color: #fff;
}
.btn--primary:hover {
  background: var(--color-accent-dark);
  box-shadow: 0 4px 14px rgba(45, 204, 143, 0.35);
  transform: translateY(-1px);
}

.btn--secondary {
  background: var(--color-surface-alt);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}
.btn--secondary:hover {
  background: var(--color-border);
}

.btn--ghost {
  background: transparent;
  color: var(--color-accent);
}
.btn--ghost:hover {
  background: var(--color-accent-light);
}

.btn--sm {
  font-size: var(--text-xs);
  padding: var(--space-2) var(--space-4);
}

.btn--lg {
  font-size: var(--text-base);
  padding: var(--space-4) var(--space-8);
}
```

### Inputs
```css
.input {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  background: var(--color-surface-alt);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}
.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-light);
}
.input::placeholder {
  color: var(--color-text-muted);
}
```

### Budget Progress Bar
```css
.progress-track {
  background: var(--color-surface-alt);
  border-radius: var(--radius-full);
  height: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Semantic state variants */
.progress-fill[data-status="safe"]     { background: var(--color-positive); }
.progress-fill[data-status="warning"]  { background: var(--color-warning); }
.progress-fill[data-status="over"]     { background: var(--color-negative); }
```

### Transaction Row
```css
.transaction-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  transition: background 0.15s ease;
}
.transaction-row:hover {
  background: var(--color-surface-alt);
}

.transaction-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-accent-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.transaction-amount--debit  { color: var(--color-text-primary); font-weight: var(--weight-semibold); }
.transaction-amount--credit { color: var(--color-positive);      font-weight: var(--weight-semibold); }
```

### Category Badge / Chip
```css
.badge {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background: var(--color-accent-light);
  color: var(--color-accent-dark);
  display: inline-block;
}
```

---

## 6. Iconography

Use **[Lucide Icons](https://lucide.dev)** exclusively — they match the clean, geometric aesthetic of Chiiz.

```
Size scale:
  sm:  16px (inline text icons, table rows)
  md:  20px (navigation, buttons)
  lg:  24px (section headers, feature icons)
  xl:  32px (empty states, onboarding)

Stroke width: 1.5px (never 2px — keeps the look refined)
Color: inherit from context or var(--color-text-secondary)
```

**Key icon mappings:**
| Feature | Icon |
|---|---|
| Transactions | `receipt` |
| Budget | `target` |
| Savings | `piggy-bank` |
| AI / Insights | `sparkles` |
| Bank / Account | `landmark` |
| Credit Card | `credit-card` |
| Settings | `sliders-horizontal` |
| Alerts | `bell-ring` |
| Categories | `layout-grid` |

---

## 7. Motion & Animation

```css
:root {
  --ease-out-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce:     cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring:     cubic-bezier(0.175, 0.885, 0.32, 1.275);

  --duration-fast:   120ms;
  --duration-base:   200ms;
  --duration-slow:   400ms;
  --duration-enter:  600ms;
}

/* Fade-up entrance (cards, list items) */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate-enter {
  animation: fadeUp var(--duration-enter) var(--ease-out-smooth) both;
}

/* Stagger children */
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 60ms; }
.stagger-children > *:nth-child(3) { animation-delay: 120ms; }
.stagger-children > *:nth-child(4) { animation-delay: 180ms; }
.stagger-children > *:nth-child(5) { animation-delay: 240ms; }

/* Number counter animation (for budget totals) */
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.animate-number {
  animation: countUp var(--duration-slow) var(--ease-bounce) both;
}
```

**Rules:**
- Never animate layout properties (width, height, top, left) — use `transform` only
- Progress bars animate on mount with a 0.6s ease
- Hover lifts are always `transform: translateY(-1px)` — never more
- No spinning loaders — use a subtle shimmer skeleton instead

---

## 8. Data Visualization

Charts should use this color order for multi-series data:

```js
const CHIIZ_CHART_COLORS = [
  '#2DCC8F',  // accent green — always first (primary category)
  '#667EEA',  // soft indigo
  '#F5A623',  // warm amber
  '#F0635A',  // coral red
  '#63B3ED',  // sky blue
  '#B794F4',  // lavender
  '#68D391',  // mint
];
```

- Bar/line charts: use `--color-accent` for the primary metric
- Donut chart for category breakdown: use the array above in order
- Always round chart container corners: `border-radius: var(--radius-lg)`
- Chart grids: use `var(--color-border)`, dashed, opacity 0.5
- Axis labels: `font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-text-muted);`

---

## 9. Voice & Microcopy

- **Friendly, not casual.** "You're on track this month 🎯" not "Great job!!!"
- **Specific, not vague.** "You've spent 78% of your Dining budget" not "You're close to your limit"
- **Active, not passive.** "Chiiz found 3 uncategorized transactions" not "3 transactions were found"
- **Positive framing first.** "$47 left in Groceries" not "You've almost used your Groceries budget"
- **Currency format:** Always `$X,XXX.XX` — never abbreviate unless space is critical (then `$1.2K`)

---

## 10. Claude Code Prompt (Copy-Paste Ready)

Use this block when instructing Claude Code to apply this style guide to your codebase:

```
Apply the Chiiz style guide to update the UI.

Design direction: modern minimalist with playful precision. Finance app that feels calm, trustworthy, and quietly delightful — not corporate.

Fonts: 'Sora' for display/headings, 'DM Sans' for body/UI. Load both from Google Fonts.

Color tokens (use as CSS custom properties on :root):
- bg: #F7F6F2, surface: #FFFFFF, surface-alt: #EEECEA
- accent: #2DCC8F, accent-light: #D4F5E9, accent-dark: #1FA870
- text-primary: #1A1A2E, text-secondary: #6B6B80, text-muted: #ADADBE
- positive: #2DCC8F, negative: #F0635A, warning: #F5A623
- border: #E8E6E1, border-strong: #D0CEC9

Spacing: base unit 4px. Use multiples: 4, 8, 12, 16, 20, 24, 32, 40, 48.

Radius: sm=6px, md=10px, lg=16px, xl=24px, full=9999px. Cards use lg. Buttons use full (pill).

Shadows: cards use a subtle shadow (0px 2px 8px rgba(26,26,46,0.07)). Elevate on hover.

Buttons: pill shape, accent color for primary, ghost for secondary actions. Smooth hover transitions.

Cards: white surface, 1px border (#E8E6E1), radius 16px, shadow-sm, hover lifts with transform: translateY(-1px).

Progress bars: 6px height, full border-radius. Green (#2DCC8F) when safe, amber (#F5A623) when warning, red (#F0635A) when over budget.

Transaction rows: rounded hover background, 40px circular icon with accent-light fill, semibold amount text.

Badges/chips: pill shape, uppercase, small tracking, accent-light background.

Icons: Lucide icons only, stroke-width 1.5.

Animation: fade-up entrance on cards (translateY 12px → 0, 600ms ease), smooth transitions on all interactive elements (200ms), progress bars animate width on load (600ms cubic-bezier).

Microcopy tone: friendly precision. Specific, positive, active voice.
```

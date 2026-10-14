/**
 * Leish! Design Tokens — Original Champagne Elegance palette.
 * Keep this typed reference aligned with the CSS @theme source of truth.
 */

export const primitives = {
  color: {
    brand: {
      gold: 'var(--color-brand-gold)',
      goldLight: 'var(--color-brand-gold-light)',
      goldDark: 'var(--color-brand-gold-dark)',
      champagne: 'var(--color-brand-champagne)',
      blush: 'var(--color-brand-blush)',
      cream: 'var(--color-brand-cream)',
      rose: 'var(--color-brand-rose)',
      emerald: 'var(--color-brand-emerald)',
      roseSurface: 'var(--color-brand-rose-surface)',
      emeraldSurface: 'var(--color-brand-emerald-surface)',
    },
    neutral: {
      50: 'var(--color-neutral-50)', 100: 'var(--color-neutral-100)',
      200: 'var(--color-neutral-200)', 300: 'var(--color-neutral-300)',
      400: 'var(--color-neutral-400)', 500: 'var(--color-neutral-500)',
      600: 'var(--color-neutral-600)', 700: 'var(--color-neutral-700)',
      800: 'var(--color-neutral-800)', 900: 'var(--color-neutral-900)',
      950: 'var(--color-neutral-950)',
    },
    accent: {
      gold: 'var(--color-accent-text)',
      goldLight: 'var(--color-brand-gold-light)',
      goldDark: 'var(--color-brand-gold-dark)',
      champagne: 'var(--color-brand-champagne)',
      blush: 'var(--color-brand-blush)',
      cream: 'var(--color-neutral-50)',
      emerald: 'var(--color-brand-emerald)',
      rose: 'var(--color-brand-rose)',
      roseSurface: 'var(--color-brand-rose-surface)',
      emeraldSurface: 'var(--color-brand-emerald-surface)',
    },
  },
  space: {
    0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
    5: '1.25rem', 6: '1.5rem', 8: '2rem', 10: '2.5rem', 12: '3rem',
    16: '4rem', 20: '5rem', 24: '6rem',
  },
  font: {
    sans: 'Raleway, Inter, system-ui, -apple-system, sans-serif',
    serif: 'Lora, Playfair Display, Georgia, serif',
    mono: 'JetBrains Mono, monospace',
  },
  radius: {
    sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem',
    '2xl': '1.5rem', '3xl': '2rem', full: '9999px',
  },
} as const;

export const semantic = {
  color: {
    bg: {
      primary: 'var(--color-canvas)',
      recessed: 'var(--color-recessed)',
      panel: 'var(--color-panel)',
      inset: 'var(--color-inset)',
      secondary: 'var(--color-surface)',
      tertiary: 'var(--color-chip)',
      elevated: 'var(--color-elevated)',
    },
    text: {
      primary: 'var(--color-fg)',
      secondary: 'var(--color-fg-muted)',
      tertiary: 'var(--color-fg-dim)',
      inverse: 'var(--color-on-primary)',
    },
    brand: {
      primary: 'var(--color-primary)',
      hover: 'var(--color-primary-hover)',
      active: 'var(--color-accent-strong)',
      rose: 'var(--color-brand-rose)',
      emerald: 'var(--color-brand-emerald)',
      roseSurface: 'var(--color-brand-rose-surface)',
      emeraldSurface: 'var(--color-brand-emerald-surface)',
    },
    accent: {
      gold: 'var(--color-accent-text)',
      goldLight: 'var(--color-brand-gold-light)',
      goldDark: 'var(--color-brand-gold-dark)',
      champagne: 'var(--color-brand-champagne)',
      blush: 'var(--color-brand-blush)',
      success: 'var(--color-success)',
      fill: 'var(--color-accent)',
      soft: 'var(--color-accent-soft)',
      strong: 'var(--color-accent-strong)',
      text: 'var(--color-accent-text)',
      rose: 'var(--color-brand-rose)',
      emerald: 'var(--color-brand-emerald)',
      roseSurface: 'var(--color-brand-rose-surface)',
      emeraldSurface: 'var(--color-brand-emerald-surface)',
    },
    status: {
      success: {
        foreground: 'var(--color-success)',
        surface: 'var(--color-success-surface)',
        border: 'var(--color-success-border)',
      },
      warning: {
        foreground: 'var(--color-warning)',
        surface: 'var(--color-warning-surface)',
        border: 'var(--color-warning-border)',
      },
      danger: {
        foreground: 'var(--color-danger)',
        surface: 'var(--color-danger-surface)',
        border: 'var(--color-danger-border)',
      },
      info: {
        foreground: 'var(--color-info)',
        surface: 'var(--color-info-surface)',
        border: 'var(--color-info-border)',
      },
    },
    border: {
      default: 'var(--color-line)',
      hover: 'var(--color-accent-soft)',
      focus: 'var(--color-accent-text)',
    },
  },
  space: {
    component: { xs: primitives.space[1], sm: primitives.space[2], md: primitives.space[4], lg: primitives.space[6], xl: primitives.space[8] },
    layout: { sm: primitives.space[4], md: primitives.space[8], lg: primitives.space[12], xl: primitives.space[16] },
  },
} as const;

export const backgroundRungs = {
  canvas: 'var(--color-canvas)',
  recessed: 'var(--color-recessed)',
  panel: 'var(--color-panel)',
  inset: 'var(--color-inset)',
  surface: 'var(--color-surface)',
  chip: 'var(--color-chip)',
  line: 'var(--color-line)',
} as const;

export const component = {
  button: {
    primary: { bg: semantic.color.brand.primary, text: semantic.color.text.inverse, hover: semantic.color.brand.hover, active: semantic.color.brand.active },
    secondary: { bg: semantic.color.bg.tertiary, text: semantic.color.text.primary, hover: 'var(--color-panel-mid)' },
  },
  card: { bg: semantic.color.bg.secondary, border: semantic.color.border.default, hover: semantic.color.border.hover },
  input: { bg: semantic.color.bg.tertiary, border: semantic.color.border.default, focus: semantic.color.border.focus, text: semantic.color.text.primary, placeholder: 'var(--color-fg-dim)' },
} as const;

export type PrimitiveTokens = typeof primitives;
export type SemanticTokens = typeof semantic;
export type ComponentTokens = typeof component;

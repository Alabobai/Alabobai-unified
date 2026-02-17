export const BRAND_TOKENS = {
  accent: {
    soft: '#ecd4c0',
    base: '#d9a07a',
    strong: '#c9956c',
    deep: '#b8845c',
  },
  text: {
    onAccent: '#0a0808',
    primary: '#ffffff',
    muted: 'rgba(255, 255, 255, 0.6)',
  },
  surface: {
    base: '#0a0808',
    elevated: '#120d0a',
    card: '#1a1410',
  },
  semantic: {
    success: '#d9ab7e',
    warning: '#c9956c',
    danger: '#8e4f42',
    info: '#e8b89d',
    neutral: '#b8846b',
  },
  gradients: {
    accent: 'linear-gradient(135deg, #ecd4c0 0%, #d9a07a 50%, #c9956c 100%)',
    accentSoft: 'linear-gradient(90deg, #ecd4c0 0%, #d9a07a 100%)',
  },
  charts: {
    primary: ['#d9a07a', '#c9956c', '#e8b89d', '#c78a5c', '#d9ab7e', '#b8846b', '#dbb590', '#8e4f42', '#be7a6a', '#f3d6c7'],
    grid: 'rgba(217, 160, 122, 0.12)',
    axis: 'rgba(243, 214, 199, 0.72)',
    axisMuted: 'rgba(243, 214, 199, 0.52)',
  },
} as const

export const BRAND_GRADIENT_ACCENT = BRAND_TOKENS.gradients.accent
export const BRAND_STATUS_COLORS = {
  success: BRAND_TOKENS.semantic.success,
  warning: BRAND_TOKENS.semantic.warning,
  danger: BRAND_TOKENS.semantic.danger,
  info: BRAND_TOKENS.semantic.info,
  neutral: BRAND_TOKENS.semantic.neutral,
} as const

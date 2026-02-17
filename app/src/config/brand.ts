export const BRAND = {
  name: 'Alabobai',
  product: 'Alabobai AI Platform',
  tagline: 'AI Agent Platform',
  title: 'Alabobai | AI Agent Platform',
  description:
    'Premium AI agent platform for building, researching, automating, and creating with local-first intelligence.',
  assets: {
    logo: '/logo.png',
    mark: '/logo-mark-tight.png',
  },
  colors: {
    roseGold: '#be7a6a',
    roseGoldGlow: '#d9a07a',
    background: '#0a0605',
  },
} as const

export type BrandConfig = typeof BRAND

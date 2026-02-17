# Alabobai Visual Spec (Premium Voice/AI Platform)

## Brand Intent
- **Feel**: premium, creative, intelligent, calm under power.
- **Reference quality**: ElevenLabs clarity + Apple material polish.
- **Identity guardrail**: Alabobai rose-gold DNA remains primary accent.

## Visual Pillars
1. **Morphic Glass** surfaces with restrained blur and high legibility.
2. **Luminous Accent** (rose-gold) used sparingly for focus/CTAs/status.
3. **Depth Hierarchy**: shell → panel → card → control.
4. **Motion Discipline**: subtle, short, meaningful transitions.

## Token Foundation
- Background: near-black graphite layers.
- Accent: rose-gold scale (light/base/dark).
- Surface opacity: 0.70–0.92 depending on depth.
- Border alpha: 0.10 idle, 0.18 hover, 0.30 active.
- Radius: 10 / 12 / 16 / 20.
- Motion: 120ms (tap), 220ms (hover), 280ms (panel transition).

## Core Components (target look)
- **Sidebar**: premium glass rail, brand mark + wordmark, soft nav glow on active.
- **Chat Panel**: dense message readability, minimal chrome, clear focus ring.
- **Workspace Panel**: tab bar with soft active indicator and low-noise framing.
- **Home Dashboard**: hero gradient field, KPI cards, progressive disclosure.
- **Voice surfaces**: waveform + latency state should feel “live studio”.

## Accessibility
- Preserve contrast >= WCAG AA on all text over glass.
- Keep motion reduced for users with `prefers-reduced-motion`.
- Keyboard focus ring always visible and distinct.

## Anti-patterns
- No over-bloomed glow on every element.
- No large blur on scrolling containers (perf + readability hit).
- No mixed border radii inside same component family.

# Apple Design Language Specifications
## iOS 17/18, visionOS & Liquid Glass (2024-2025)

This document provides a comprehensive guide to recreating Apple-tier quality visual design based on official Human Interface Guidelines, WWDC sessions, and detailed analysis of Apple's design system.

---

## Table of Contents

1. [Glass Morphism Effects](#1-glass-morphism-effects)
2. [Depth and Layers](#2-depth-and-layers)
3. [Glow Effects and Lighting](#3-glow-effects-and-lighting)
4. [Typography Choices](#4-typography-choices)
5. [Animation Principles](#5-animation-principles)
6. [Spatial Design (visionOS)](#6-spatial-design-visionos)
7. [Color Palettes and Gradients](#7-color-palettes-and-gradients)
8. [Creating Premium Feel](#8-creating-premium-feel)

---

## 1. Glass Morphism Effects

### Overview

Apple's "Liquid Glass" (introduced at WWDC 2025) represents the most significant UI redesign since iOS 7. It's a "digital meta-material" that dynamically bends and shapes light while moving fluidly like water.

### Three Compositional Layers

Apple describes glass as being composed of three layers:

1. **Highlight** - Light casting and movement
2. **Shadow** - Depth and foreground/background separation
3. **Illumination** - Flexible material properties

### CSS Implementation

#### Basic Glass (iOS Style)
```css
.glass-basic {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.35);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

#### Enhanced Glass (Liquid Glass Style)
```css
.liquid-glass {
  position: relative;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(2px) saturate(180%);
  -webkit-backdrop-filter: blur(2px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 2rem;
  box-shadow:
    0 8px 32px rgba(31, 38, 135, 0.2),
    inset 0 4px 20px rgba(255, 255, 255, 0.3);
}

/* Shine overlay */
.liquid-glass::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: inherit;
  backdrop-filter: blur(1px);
  box-shadow:
    inset -10px -8px 0px -11px rgba(255, 255, 255, 1),
    inset 0px -9px 0px -8px rgba(255, 255, 255, 1);
  opacity: 0.6;
  filter: blur(1px) brightness(115%);
  pointer-events: none;
}
```

#### visionOS Window Glass
```css
.visionos-glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(40px) saturate(150%) brightness(100%);
  -webkit-backdrop-filter: blur(40px) saturate(150%) brightness(100%);
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 32px;
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.1),
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
```

### Key Parameters

| Property | Light Mode | Dark Mode |
|----------|------------|-----------|
| Background opacity | 0.15 - 0.25 | 0.6 - 0.8 |
| Blur radius | 2px - 40px | 20px - 60px |
| Saturation boost | 150% - 180% | 120% - 150% |
| Border opacity | 0.2 - 0.8 | 0.1 - 0.2 |

### Important Notes

- Never use the `opacity` property on glass elements - it breaks backdrop-filter. Use `rgba()` values instead.
- Always include `-webkit-backdrop-filter` prefix for Safari compatibility.
- For true distortion effects, SVG filters are required (CSS alone cannot achieve this).

---

## 2. Depth and Layers

### Elevation System

Apple uses subtle, layered shadows to indicate hierarchy. Higher elevation = more attention.

```css
/* Level 1 - Cards, buttons */
.shadow-1 {
  box-shadow:
    0 1px 2px hsl(220deg 20% 20% / 0.06),
    0 1px 3px hsl(220deg 20% 20% / 0.1);
}

/* Level 2 - Dropdowns, popovers */
.shadow-2 {
  box-shadow:
    0 1px 2px hsl(220deg 20% 20% / 0.04),
    0 2px 4px hsl(220deg 20% 20% / 0.04),
    0 4px 8px hsl(220deg 20% 20% / 0.08);
}

/* Level 3 - Modals */
.shadow-3 {
  box-shadow:
    0 1px 2px hsl(220deg 20% 20% / 0.03),
    0 2px 4px hsl(220deg 20% 20% / 0.03),
    0 4px 8px hsl(220deg 20% 20% / 0.03),
    0 8px 16px hsl(220deg 20% 20% / 0.06),
    0 16px 32px hsl(220deg 20% 20% / 0.09);
}
```

### Layered Shadow Technique

Instead of a single shadow, use multiple stacked shadows:

```css
box-shadow:
  0 1px 1px hsl(0deg 0% 0% / 0.075),
  0 2px 2px hsl(0deg 0% 0% / 0.075),
  0 4px 4px hsl(0deg 0% 0% / 0.075),
  0 8px 8px hsl(0deg 0% 0% / 0.075),
  0 16px 16px hsl(0deg 0% 0% / 0.075);
```

### Design Principles

1. **Consistent light source** - All shadows should suggest light from top-left
2. **Color-matched shadows** - Use tinted shadows (e.g., blue-tinted for blue backgrounds) instead of pure black
3. **Blur grows with elevation** - Higher cards have softer shadows
4. **Opacity decreases with elevation** - Prevents shadows from feeling too heavy

---

## 3. Glow Effects and Lighting

### When to Use Glows

Apple uses glow effects sparingly for:
- Interactive elements (buttons, icons)
- Status indicators
- Premium accent moments
- Focus states

### Glow Specifications

```css
/* Subtle - Interactive elements */
.glow-subtle {
  box-shadow: 0 0 20px rgba(0, 122, 255, 0.3);
}

/* Medium - Active states */
.glow-medium {
  box-shadow:
    0 0 15px rgba(0, 122, 255, 0.4),
    0 0 30px rgba(0, 122, 255, 0.2),
    0 0 45px rgba(0, 122, 255, 0.1);
}

/* Intense - Focus/Selected states */
.glow-intense {
  box-shadow:
    0 0 10px rgba(0, 122, 255, 0.5),
    0 0 20px rgba(0, 122, 255, 0.4),
    0 0 40px rgba(0, 122, 255, 0.3),
    0 0 60px rgba(0, 122, 255, 0.2);
}
```

### Specular Highlights

Simulate light reflection on glass surfaces:

```css
.specular-highlight::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 50%;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 100%
  );
  pointer-events: none;
}
```

---

## 4. Typography Choices

### SF Pro Font Family

San Francisco (SF) is Apple's system font, designed for optimal legibility at every size.

| Variant | Usage |
|---------|-------|
| SF Pro Text | Below 20pt (body text) |
| SF Pro Display | 20pt and above (headlines) |
| SF Pro Rounded | Friendly/playful contexts |
| SF Mono | Code and monospace content |
| New York | Serif for reading-focused apps |

### CSS Font Stack

```css
/* Primary System Font */
font-family: system-ui, -apple-system, BlinkMacSystemFont,
             'SF Pro Text', 'SF Pro Display', 'Helvetica Neue',
             Helvetica, Arial, sans-serif;

/* Rounded Variant */
font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;

/* Monospace */
font-family: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
```

### Typography Scale

| Style | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| Large Title | 34px | Bold | 41px | 0.37px |
| Title 1 | 28px | Bold | 34px | 0.36px |
| Title 2 | 22px | Bold | 28px | 0.35px |
| Title 3 | 20px | Semibold | 25px | 0.38px |
| Headline | 17px | Semibold | 22px | -0.43px |
| Body | 17px | Regular | 22px | -0.43px |
| Callout | 16px | Regular | 21px | -0.32px |
| Subheadline | 15px | Regular | 20px | -0.24px |
| Footnote | 13px | Regular | 18px | -0.08px |
| Caption 1 | 12px | Regular | 16px | 0px |
| Caption 2 | 11px | Regular | 13px | 0.07px |

**Note:** Letter spacing is NEGATIVE for smaller sizes (below 20pt) and POSITIVE for larger sizes.

---

## 5. Animation Principles

### Core Principles (Apple HIG)

1. **Use motion to communicate** - Show how things change, what will happen
2. **Don't add motion for its own sake** - Gratuitous animation distracts
3. **Make motion optional** - Support reduce-motion preference
4. **Strive for realism** - Motion should follow physical laws

### Spring Animations

Apple prefers spring-based animations because:
- They maintain velocity continuity
- They feel natural and organic
- They work for both bouncy and non-bouncy effects

### Easing Functions

```css
/* Standard ease - default for most transitions */
--ease-standard: cubic-bezier(0.4, 0.0, 0.2, 1);

/* Ease out - elements entering */
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);

/* Ease in - elements exiting */
--ease-in: cubic-bezier(0.4, 0.0, 1, 1);

/* Spring-like bounce */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Soft spring - subtle bounce */
--ease-spring-soft: cubic-bezier(0.22, 1, 0.36, 1);

/* iOS-style */
--ease-ios: cubic-bezier(0.25, 0.1, 0.25, 1);
```

### Duration Scale

| Type | Duration | Use Case |
|------|----------|----------|
| Instant | 100ms | Button feedback |
| Fast | 200ms | Micro-interactions |
| Normal | 300ms | Standard transitions |
| Slow | 500ms | Modal presentations |
| Slower | 700ms | Complex animations |

### Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. Spatial Design (visionOS)

### Core Concepts

visionOS introduces spatial design where:
- Users enter an infinite 3D space
- Windows float and can be repositioned
- Content has physical presence
- Transparency is preferred over solid colors

### Design Principles

1. **Windows, Volumes, and Spaces**
   - Windows contain traditional 2D views
   - Volumes showcase 3D content
   - Full Spaces provide immersive experiences

2. **Glass Materials**
   - Reflect light from surroundings
   - Create immersive digital-yet-tangible experiences
   - Help apps blend with the physical world

3. **Depth and Ergonomics**
   - Display content within field of view
   - Avoid jarring motion
   - Support indirect gestures (hands at rest)

### Spatial Container CSS

```css
.spatial-container {
  --spatial-depth: 20px;

  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(40px) saturate(150%);
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 32px;

  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.1),
    0 var(--spatial-depth) calc(var(--spatial-depth) * 2)
      calc(var(--spatial-depth) * -0.5) rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);

  transform-style: preserve-3d;
}
```

---

## 7. Color Palettes and Gradients

### iOS System Colors

| Color | Light Mode | Dark Mode |
|-------|------------|-----------|
| Blue | #007AFF | #0A84FF |
| Green | #34C759 | #30D158 |
| Indigo | #5856D6 | #5E5CE6 |
| Orange | #FF9500 | #FF9F0A |
| Pink | #FF2D55 | #FF375F |
| Purple | #AF52DE | #BF5AF2 |
| Red | #FF3B30 | #FF453A |
| Teal | #5AC8FA | #64D2FF |
| Yellow | #FFCC00 | #FFD60A |

### Gradient Styles

#### App Icon Gradients
```css
/* Blue */
background: linear-gradient(180deg, #5AC8FA 0%, #007AFF 100%);

/* Purple */
background: linear-gradient(180deg, #BF5AF2 0%, #5856D6 100%);

/* Pink */
background: linear-gradient(180deg, #FF6B9D 0%, #FF2D55 100%);
```

#### Mesh Gradient (iOS 18)
```css
.gradient-mesh {
  background:
    radial-gradient(at 40% 20%, hsla(280, 100%, 76%, 0.8) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.6) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(355, 100%, 93%, 0.5) 0px, transparent 50%),
    radial-gradient(at 80% 50%, hsla(340, 100%, 76%, 0.5) 0px, transparent 50%),
    radial-gradient(at 0% 100%, hsla(22, 100%, 77%, 0.5) 0px, transparent 50%),
    radial-gradient(at 80% 100%, hsla(242, 100%, 70%, 0.5) 0px, transparent 50%);
  background-color: #1a1a2e;
}
```

### Dynamic Colors

Apple's dynamic colors adapt to:
- Light/Dark mode
- Accessibility settings (Increase Contrast)
- Context (system vs grouped backgrounds)

---

## 8. Creating Premium Feel

### What Makes Apple Feel "Premium"

1. **Consistent, intentional motion** - Every animation has purpose
2. **Subtle feedback on every interaction** - Haptic-like visual responses
3. **Layered shadows for depth** - Multi-layer shadow technique
4. **High contrast with soft transitions** - Clear hierarchy, smooth changes
5. **Attention to tiny details** - Every pixel matters

### Micro-Interactions

```css
/* Haptic-like visual feedback */
.haptic-press:active {
  transform: scale(0.98);
}

/* Hover lift effect */
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 20px rgba(0, 0, 0, 0.12),
    0 4px 8px rgba(0, 0, 0, 0.06);
}
```

### Focus States

```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 4px rgba(0, 122, 255, 0.4),
    0 0 0 2px rgba(0, 122, 255, 0.8);
}
```

### Loading States

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.shimmer {
  background: linear-gradient(
    90deg,
    #E5E5EA 25%,
    #F2F2F7 50%,
    #E5E5EA 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

### Design Checklist

- [ ] All interactive elements have visible feedback
- [ ] Transitions use appropriate easing (spring for enter, ease-out for exit)
- [ ] Shadows are layered and color-matched
- [ ] Glass effects use proper blur + saturation combination
- [ ] Typography follows SF Pro specifications (including letter-spacing)
- [ ] Colors adapt to light/dark mode
- [ ] Reduced motion preferences are respected
- [ ] Focus states are visible and accessible
- [ ] Border radii are consistent with scale (4px, 8px, 12px, 16px, 24px, 32px)

---

## Sources

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Apple Design Resources](https://developer.apple.com/design/resources/)
- [Apple Typography Guidelines](https://developer.apple.com/design/human-interface-guidelines/typography)
- [WWDC 2023: Principles of spatial design](https://developer.apple.com/videos/play/wwdc2023/10072/)
- [WWDC 2023: Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)
- [WWDC 2024: Enhance your UI animations](https://developer.apple.com/videos/play/wwdc2024/10145/)
- [Apple Motion Guidelines](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Apple Newsroom: Liquid Glass Announcement](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [CSS-Tricks: Getting Clarity on Apple's Liquid Glass](https://css-tricks.com/getting-clarity-on-apples-liquid-glass/)
- [LogRocket: How to create Liquid Glass effects](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/)
- [Josh W. Comeau: Designing Beautiful Shadows](https://www.joshwcomeau.com/css/designing-shadows/)
- [Josh W. Comeau: Backdrop Filter](https://www.joshwcomeau.com/css/backdrop-filter/)

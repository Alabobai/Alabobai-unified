# UI Release Scorecard — Alabobai Premium Experience

## Purpose
Use this scorecard before every production release to enforce premium quality, consistency, and reliability across the Alabobai UI.

---

## Scoring Model
- **Total score:** 100
- **Release thresholds:**
  - **90–100:** ✅ Ship
  - **80–89:** ⚠️ Ship with explicit risk acceptance
  - **<80:** ❌ No-go
- **Hard blockers:** any blocker failure = automatic no-go regardless of score.

---

## Hard Blockers (Must Pass)
1. **Production build passes** (`npm run build`)  
2. **No P0 visual breakage** on core surfaces (App Shell, Sidebar, Chat, Workspace, Command Palette, Settings, Home, Dashboard)  
3. **Keyboard escape routes work** for overlays/modals/palette  
4. **Reduced-motion support active** (`prefers-reduced-motion`)  
5. **No unreadable text** (critical controls + body text over glass)

If any blocker fails: stop release and fix.

---

## Weighted Categories

### A) Visual System Consistency (20)
- [ ] Brand layer applied coherently (`alabobai-shell`, rose-gold accent discipline) — 6
- [ ] Typography hierarchy consistent (title/subtitle/body/caption) — 4
- [ ] Radius/elevation consistency across cards/buttons/modals — 5
- [ ] Spacing rhythm consistent (8pt-like layout rhythm) — 5

### B) Interaction & Motion Quality (20)
- [ ] Motion tokens used (`--motion-fast/base/slow/spring`) — 5
- [ ] Interactive elements use shared primitives (`framer-btn`, `framer-card`, `framer-input`) — 6
- [ ] Modal/palette/panel transitions are smooth and non-jarring — 5
- [ ] Hover/press/focus states are distinct and consistent — 4

### C) Accessibility & UX Safety (20)
- [ ] Contrast meets practical AA legibility on key flows — 7
- [ ] Focus visibility is always clear for keyboard users — 5
- [ ] Reduced motion behavior verified in-system — 4
- [ ] Empty/error/loading states are understandable — 4

### D) Core Surface Quality (20)
- [ ] Chat surface (messages/composer/streaming states) premium + clear — 5
- [ ] Workspace surface (tabs/content/action controls) stable + polished — 5
- [ ] Command Palette + Settings modal premium consistency — 5
- [ ] Home + Dashboard cards/CTAs/empty states polished — 5

### E) Performance & Build Health (20)
- [ ] Production build passes cleanly — 6
- [ ] No severe interaction jank on primary routes — 5
- [ ] Bundle growth reviewed and accepted (main + heavy chunks) — 5
- [ ] No console error spam during core flows — 4

---

## Release Test Matrix (Manual)

### Required Screens (desktop + mobile if applicable)
- [ ] App Shell
- [ ] Sidebar (expanded/collapsed/mobile)
- [ ] Chat Panel
- [ ] Workspace Panel
- [ ] Command Palette
- [ ] Settings Modal
- [ ] Home View
- [ ] Company Dashboard

### Required States
- [ ] Default idle
- [ ] Hover/focus/active controls
- [ ] Loading states
- [ ] Empty states
- [ ] Error/degraded states
- [ ] Reduced-motion mode

---

## Evidence Log
Attach evidence for each release:
- Build log excerpt
- Screenshot set (or visual regression run)
- Known risks list
- Sign-off owner + timestamp

Template:
- **Build:** PASS/FAIL
- **Score:** __ / 100
- **Blockers:** PASS/FAIL
- **Known Risks:**
  - 1)
  - 2)
- **Decision:** SHIP / SHIP WITH RISK / NO-GO
- **Approved by:**
- **Date:**

---

## Current Snapshot (2026-02-14)
- Build: PASS
- Motion system: PASS
- Premium surfaces: PASS
- Reduced motion guard: PASS
- Suggested next upgrades:
  1. Add visual regression automation
  2. Run automated contrast checks
  3. Execute bundle optimization pass

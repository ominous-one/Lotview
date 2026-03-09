# LotView UI Tokens (Automation Overhaul)

These tokens are intentionally compatible with **Tailwind + shadcn/ui** patterns (CSS variables + semantic roles). They are not “theme candy”; they exist to enforce speed, clarity, and consistent hierarchy.

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** semantic tokens for color/type/spacing/radius/elevation/motion + accessibility notes.
- **Out of scope:** full multi-theme brand system.
- **Assumptions:** default surface is light mode; dark mode optional later.

### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\tokens\TOKENS.md`

### 2) Acceptance criteria
- No placeholders; tokens cover all required surfaces.
- Includes contrast guidance and focus ring guidance.

### 3) Validation steps
- Spot-check color contrast targets and ensure semantic status colors exist.

### 4) Gap report + auto-fill
- See bottom.

---

## 1) Typography tokens

### Font families
- `font.sans`: `Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif`
- `font.mono`: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

### Type scale (px)
Use a small set of sizes; this is a dealer app (readable, not editorial).
- `text.xs`  = 12 / 16
- `text.sm`  = 14 / 20
- `text.base`= 16 / 24
- `text.lg`  = 18 / 28
- `text.xl`  = 20 / 28
- `text.2xl` = 24 / 32
- `text.3xl` = 30 / 36

### Weights
- `weight.regular` 400
- `weight.medium`  500
- `weight.semibold`600

### Numeric tables
- Always enable `font-variant-numeric: tabular-nums` for price/miles/DOM columns.

---

## 2) Spacing tokens (4px base)
- `space.1` = 4
- `space.2` = 8
- `space.3` = 12
- `space.4` = 16
- `space.5` = 20
- `space.6` = 24
- `space.8` = 32
- `space.10`= 40
- `space.12`= 48
- `space.16`= 64

Layout guidance:
- Page padding: 24
- Card padding: 16
- Dense table cell padding: 12 (x) / 8 (y)

---

## 3) Radius tokens
- `radius.sm` = 6
- `radius.md` = 10

---

## 4) Elevation tokens
Keep shadows subtle. Data is the hero.
- `elevation.0`: none
- `elevation.1`: `0 1px 2px rgba(0,0,0,0.06)`
- `elevation.2`: `0 8px 24px rgba(0,0,0,0.10)`

---

## 5) Motion tokens
- `motion.fast` 150ms ease-out
- `motion.base` 200ms ease-out
- `motion.slow` 280ms ease-out

Rules:
- Avoid long animations.
- Respect `prefers-reduced-motion`.

---

## 6) Color tokens (semantic)

### Brand anchors (from `BRAND.md`)
- `brand.primary`   `#1A365D` (deep blue)
- `brand.secondary` `#4A5568` (steel gray)
- `brand.success`   `#38A169`
- `brand.warning`   `#D69E2E`
- `brand.danger`    `#E53E3E`
- `brand.bg`        `#FFFFFF`
- `brand.text`      `#1A202C`

### Semantic surface tokens (light)
Recommended mapping to shadcn/ui CSS vars:
- `bg`            `#FFFFFF`
- `bg.subtle`     `#F7FAFC`
- `bg.muted`      `#EDF2F7`
- `fg`            `#1A202C`
- `fg.muted`      `#4A5568`
- `fg.subtle`     `#718096`
- `border`        `#E2E8F0`
- `border.strong` `#CBD5E0`

### Status tokens
Use status color for badges + left borders, not huge fills.
- `status.success.fg` `#276749`
- `status.success.bg` `#F0FFF4`
- `status.warning.fg` `#975A16`
- `status.warning.bg` `#FFFAF0`
- `status.danger.fg`  `#9B2C2C`
- `status.danger.bg`  `#FFF5F5`
- `status.info.fg`    `#1A365D`
- `status.info.bg`    `#EBF8FF`

### Automation-specific semantic tokens
These are used across Inbox, Settings, and Audit.
- `auto.on.fg`        `#276749`
- `auto.on.bg`        `#F0FFF4`
- `auto.paused.fg`    `#975A16`
- `auto.paused.bg`    `#FFFAF0`
- `auto.blocked.fg`   `#9B2C2C`
- `auto.blocked.bg`   `#FFF5F5`
- `auto.manual.fg`    `#2D3748`
- `auto.manual.bg`    `#F7FAFC`
- `auto.queue.fg`     `#2B6CB0`
- `auto.queue.bg`     `#EBF8FF`

---

## 7) Accessibility tokens/guidance

### Focus rings
- Default focus ring: 2px outline using `brand.primary` at ~60% alpha.
- Focus must be visible on white + subtle surfaces.

### Contrast targets
- Body text: **≥ 4.5:1** contrast.
- Large text (≥ 18pt or 14pt bold): **≥ 3:1**.
- Non-text UI (icons/borders conveying meaning): aim **≥ 3:1**.

### Color usage rules
- Never encode automation state with color alone: always pair with text (ON/Paused/Blocked) + icon.
- Danger red is reserved for:
  - global kill switch
  - automation blocked/account-health issues
  - pricing alerts with real risk

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None.

### Why missing
- N/A

### Auto-fill action
- If dark mode becomes required, extend this file with a `Color tokens (dark)` section and map to shadcn `--background/--foreground/...` variables.

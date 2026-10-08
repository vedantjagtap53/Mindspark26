# DESIGN.md — Payoff Desk visual and motion design

Status: **draft for approval** (2026-10-08). This document describes the design the web app (`apps/web`) already has, and adds a motion layer on top of it. The product requirements are in `PRD.md`, which wins on any conflict. The delivery plan for the motion layer is `docs/ANIMATION_PLAN.md`.

## 1. Design principles

1. **Credibility first.** This is a tool a relationship manager uses in front of a client. Motion must feel calm and precise, never playful or promotional inside the product.
2. **The backend owns every number.** Animation never computes, rounds, interpolates or re-displays a payoff, risk or verdict figure. A number appears when the API result arrives and is shown exactly as received. No count-up counters, and no animated charts that pass through invented intermediate values.
3. **Ranges stay ranges.** In Mode A the result is "Base X, likely range L to H" (PRD §7.1). No effect may emphasise a single point as a prediction, and the "simulation, not a guarantee" notice is never animated away, delayed or hidden.
4. **Motion explains, it does not decorate.** Every animation must show a change of state, direction or hierarchy. Pure ambience is limited to the landing page.
5. **Everything has a still fallback.** Reduced motion, touch devices, print, tests and slow devices get the same content with no animation.
6. **One engine per element.** An element is animated by exactly one of CSS, Framer Motion or GSAP, never two (see section 6).

## 2. Brand and naming

- The product name is **FinStrukt** (decided by Karan, 2026-10-09). It is read from one constant, `BRAND_NAME` in `apps/web/src/constants/brand.ts`, and also appears in the `<title>` of `apps/web/index.html`. "Payoff Desk" is only the internal name of the design language, and MindSpark is the repository name; neither is shown to users.
- Tone: plain, precise, institutional. Short sentences, no hype, no promises about returns.

## 3. Design tokens (existing, do not rename)

All colours are CSS variables defined in `apps/web/src/index.css`, with a light default and a `:root[data-theme='dark']` override. New work uses these variables only. No hard-coded hex values in components.

| Role     | Variables                                                                           | Light                           | Dark                            |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| Page     | `--canvas-bg`, `--canvas-text`                                                      | `#f4f2eb`, `#0f172a`            | `#0e131b`, `#e6e9ef`            |
| Surfaces | `--card-bg`, `--card-bg-light`, `--well-bg`, `--well-deep`                          | alabaster and white             | slate blues                     |
| Borders  | `--border-subtle`, `--border-color`, `--border-strong`                              | 6%, 12%, 22% ink                | 7%, 14%, 28% light              |
| Text     | `--ink-primary`, `--ink-secondary`, `--ink-muted`                                   | `#0f172a`, `#334155`, `#64748b` | `#f1f4f9`, `#c3cad6`, `#94a0b5` |
| Accent   | `--accent-primary`, `--accent-gradient`, `--accent-hover`, `--accent-gold`          | slate, gold `#c59b27`           | blue `#3f63a6`, gold `#e0b64a`  |
| Verdict  | `--status-suitable-*`, `--status-caution-*`, `--status-breach-*` (bg, text, border) | green, amber, red               | dark equivalents                |
| Charts   | `--chart-payoff-stroke`, `--chart-grid-stroke`, `--chart-area-fill`                 | slate                           | light blue                      |
| Depth    | `--shadow-clay`, `--shadow-interactive`, `--inner-highlight`                        | soft                            | heavier                         |

Verdict colours carry meaning (Suitable, Caution, Not suitable). They are never reused for decoration or for effects.

### New motion tokens (to be added to `index.css`)

```css
:root {
  --motion-fast: 120ms; /* press feedback, hovers */
  --motion-base: 220ms; /* most UI transitions */
  --motion-slow: 450ms; /* panel and section entrances */
  --motion-scene: 900ms; /* landing choreography only */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1); /* already used by the clay classes */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --stagger: 60ms;
}
```

The same values are mirrored in `apps/web/src/motion/tokens.ts` so GSAP and Framer Motion use identical timing. CSS is the source of truth.

## 4. Typography

| Use                     | Family         | Notes                                               |
| ----------------------- | -------------- | --------------------------------------------------- |
| Body and UI             | IBM Plex Sans  | default (`--font-sans`)                             |
| Headings, memo titles   | Source Serif 4 | `font-serif`                                        |
| Numbers, labels, tables | IBM Plex Mono  | `font-mono`, tabular figures so values do not shift |

Landing hero: `text-5xl` mobile, `text-7xl` desktop, extrabold, tight tracking. In-app section headers: serif, `text-base`, with a mono uppercase kicker (`SectionHeader`).

Fonts must be loaded before any text-splitting or measuring animation runs (`document.fonts.ready`). The landing animations wait for it, so nothing jumps.

## 5. Surfaces and components (existing "clay" style)

- **Tiles:** `.clay-tile` (cards), `.clay-tile-light`, `.clay-tile-interactive` (hover lift 2 px).
- **Wells:** `.clay-inset` for inputs and read-outs.
- **Buttons:** `.clay-btn-primary`, `.clay-btn-secondary` (hover lift, press scale 0.98).
- **Segmented control:** `.clay-segmented-track` and `-active`.
- **Badges:** `.clay-badge-suitable`, `-caution`, `-unsafe`.
- **Stepper:** `.step-node`, `-active`, `-completed`.
- **Building blocks:** `Tile`, `SectionHeader`, `Field`, `NumberInput`, `TextInput`, `Segmented`, `Placeholder`, `Metric` in `components/ui.tsx`.
- **Layout:** pages are `max-w-6xl`, with 12–24 px gutters and a sticky header with backdrop blur. The landing page uses `max-w-5xl` to `max-w-6xl` sections.

New components follow the same tokens and class vocabulary. Nothing in the app switches to a different visual style.

## 6. Motion system

### 6.1 Which tool does what

| Tool                                | Role                             | Used for                                                                                                                                          | Not used for                                                   |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **CSS** (transitions and keyframes) | Default                          | hovers, press feedback, focus, simple entrances, the marquee, theme change                                                                        | anything needing sequencing or scroll progress                 |
| **Framer Motion** (`framer-motion`) | React state-driven motion        | stage transitions in the journey, modals and drawers (enter and exit), list and layout changes (saved runs, compare runs), verdict badge entrance | scroll-linked choreography                                     |
| **GSAP + ScrollTrigger** (`gsap`)   | Timeline and scroll choreography | landing page: hero timeline, pinned journey section, handoff between sections, footer reveal                                                      | anything inside the simulator pages                            |
| **Lenis** (`lenis`)                 | The single smooth-scroll engine  | landing page scrolling, driving ScrollTrigger                                                                                                     | simulator pages, dialogs, scrollable panels, the admin console |
| **Swiper** (`swiper`)               | Touch carousels                  | product cards on phones, compare runs on phones, the landing "journey" on phones                                                                  | desktop layouts that already fit                               |
| **Locomotive Scroll**               | Removed (2026-10-08)             | it duplicated Lenis (v5 is built on it), so Lenis is the only smooth-scroll engine.                                                               | not used                                                       |

### 6.2 Hard rules

1. **One scroll engine.** Only Lenis smooths scrolling, only on the landing route, and it is destroyed when leaving it. It is connected to ScrollTrigger and driven by the GSAP ticker, so there is one animation loop.
2. **One engine per element.** If GSAP animates an element's `transform`, no Framer Motion prop or CSS transition touches that element's transform.
3. **Animate only `transform`, `opacity` and `clip-path`.** No layout properties (`width`, `top`, `margin`) in loops. Blur is allowed in short entrances only.
4. **Reduced motion:** `prefers-reduced-motion: reduce` disables Lenis, ScrollTrigger scrubbing, timelines, parallax, marquees and Swiper autoplay. Content is shown in its final state at once. Framer Motion uses `MotionConfig reducedMotion="user"`.
5. **Hover-only effects require `(hover: hover) and (pointer: fine)`.** Touch devices get tap feedback only.
6. **Pause when not visible.** Looping animations pause off-screen (`IntersectionObserver`) and in hidden tabs.
7. **Cleanup.** Every effect returns a cleanup function (kill timelines, remove ScrollTrigger instances, destroy Lenis and Swiper). This matters for React 19 strict-mode double mounting.
8. **Print and tests.** Print CSS removes all motion. Under test, motion is disabled (section 10).
9. **Custom cursor.** The account setting `data-cursor` still controls the custom cursor. Effects must not hide or replace it.

### 6.3 Timing and easing

| Interaction                   | Duration                                     | Easing                               |
| ----------------------------- | -------------------------------------------- | ------------------------------------ |
| Press, hover                  | 120 ms                                       | `--ease-out`                         |
| Tab, toggle, small reveal     | 220 ms                                       | `--ease-out`                         |
| Stage change, panel, modal    | 220–450 ms                                   | `--ease-out` in, `--ease-in-out` out |
| Result entrance (cards, rows) | 450 ms, 60 ms stagger, max 8 items staggered | `--ease-out`                         |
| Landing scene                 | up to 900 ms                                 | `--ease-in-out` or scrubbed          |

Nothing in the product blocks the user waiting for an animation. Data is interactive and readable from the first frame. The landing hero is the only place with a longer timeline, and it is skippable by scrolling.

## 7. Motion specification by screen

### 7.1 Landing page (`LandingPage.tsx`)

| Section                   | Effect                                                                                                                                                                                                                                                                                                             | Engine                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Header                    | Docks and tightens after the hero; keeps backdrop blur                                                                                                                                                                                                                                                             | CSS + `IntersectionObserver`         |
| Hero                      | Headline and buttons reveal in sequence; a looping product demo (client entered, chart draws, verdict badge changes) plays only while visible. The demo is labelled "Sample, illustrative" and uses fixed example inputs.                                                                                          | GSAP timeline                        |
| Hero background           | A canvas grid of small "+" marks that breathes, fades out behind the headline and glows near the pointer. Drawn only on a desktop-width screen with a real hover-capable pointer and no reduced-motion preference; otherwise (and in print) a still CSS dotted pattern. Stops while off screen or in a hidden tab. | Canvas, `requestAnimationFrame`      |
| Capability grid           | Cards rise in with a stagger when entering                                                                                                                                                                                                                                                                         | GSAP ScrollTrigger (batch)           |
| "The 5-stage journey"     | Pinned scroll section: the five stages (Mandate, Structure, Simulate, Payoffs, Verdict) light up in turn with a progress bar and a shifting background tint. Phones: Swiper carousel (or accordion)                                                                                                                | GSAP ScrollTrigger; Swiper on phones |
| Product strip             | ELN, DCD, CPN cards; carousel on phones                                                                                                                                                                                                                                                                            | CSS; Swiper on phones                |
| Data and technology strip | Slow marquee, slower on hover                                                                                                                                                                                                                                                                                      | CSS                                  |
| Footer                    | Wordmark fades up once                                                                                                                                                                                                                                                                                             | GSAP ScrollTrigger                   |

Content rule: the landing copy may only describe what the product does today (PRD §3 and §8). The old copy mentioned "Precision Pricing", "Stress Testing", "Monte Carlo", "real-time" forecasting and an "Enterprise Edition"; all of those were removed on 2026-10-08 because the PRD (§3, §8) does not back them, and a test (`landing.test.tsx`) keeps them out.

### 7.2 Sign-in and registration (`AuthPage.tsx`)

Form card fades and rises once. Field errors appear with a short fade (no horizontal shake). The button shows a busy state without hiding its label.

### 7.3 Journey (`App.tsx`, five stages)

| Moment                    | Effect                                                                                             | Engine                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Stage change              | Current stage fades out and the next slides in 10 px (the current `journeySlideIn`, now with exit) | Framer Motion `AnimatePresence` |
| Stepper                   | Active node scales in; the connecting line fills to the current step                               | CSS                             |
| Product cards (dashboard) | Hover lift (already present); on phones, swipe carousel                                            | CSS; Swiper                     |
| Mode A or B switch        | Panels cross-fade; no layout jump                                                                  | Framer Motion (`layout`)        |

### 7.4 Results

| Item                                 | Effect                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario table                       | Rows fade in with a 60 ms stagger (max 8) once the result arrives                                                                                        |
| Risk panel, model card               | Fade up together                                                                                                                                         |
| Payoff and fan charts                | The container fades in; the chart itself renders at full, final geometry. The line may "draw" with a stroke reveal only, never by animating data values. |
| Suitability badge and flags          | The badge appears with a brief scale-in (0.96 to 1). Flags list in order. The colour is the verdict colour and never animates between colours.           |
| Explanation and chat                 | New messages slide up 8 px                                                                                                                               |
| "Simulation, not a guarantee" notice | Static. Never animated away.                                                                                                                             |

### 7.5 Saved runs, compare runs, admin

| Item                             | Effect                                                                      | Engine                 |
| -------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Runs window and saved-run record | Modal enters with scale 0.97 and fade, exits likewise                       | Framer Motion          |
| Run list                         | Rows animate when added or removed (layout)                                 | Framer Motion `layout` |
| Compare runs                     | Side-by-side columns enter staggered; on phones, swipe between the 2–3 runs | Framer Motion; Swiper  |
| Admin console, audit view        | No motion beyond hover and focus. These are working screens.                | CSS                    |
| Print of a saved run             | No motion                                                                   | print CSS              |

## 8. Accessibility

- Contrast stays at WCAG AA in both themes. Motion does not change colour contrast.
- Focus order and visible focus rings are preserved. A pinned landing section must be fully usable by keyboard and screen reader (headings in order, `aria-expanded` on phone accordions, no content only reachable by scrolling).
- Smooth scroll never traps the keyboard. Anchor links, Page Up and Down, Home and End, and browser find all work with Lenis on.
- Carousels (Swiper) need keyboard and screen-reader support (the Accessibility module), visible slide counts and no autoplay.
- Nothing flashes more than three times a second.
- Decorative canvases and demos are `aria-hidden`, and the information they show is also present as text.

## 9. Performance and loading

- **Code splitting:** the landing page and its animation code (GSAP, ScrollTrigger, Lenis, Swiper) load in a separate chunk, with `React.lazy` or dynamic `import()`. The simulator journey must not pay for them. Framer Motion loads with the journey (use `LazyMotion` with `domAnimation` to keep it small).
- **Budgets (gzipped):** the app's initial JS stays within +15 KB of the 138 KB it was before the motion work (measured at the end: 153.9 KB, 0.9 KB over). The landing chunk stays at or under 120 KB (measured: 56 KB). Largest Contentful Paint on the landing page stays at or under 2.5 s on a mid-range laptop.
- **Frame budget:** animations hold 60 fps on the landing page on a mid-range laptop. Canvas effects, if any, render every other frame and only the visible region.
- **Fonts and images:** fonts preloaded, images sized and lazy-loaded. No layout shift from animations (reserve space for pinned sections).

## 10. Testing the design

- **Unit (Vitest, jsdom):** the motion hooks (reduced motion, hover capability, in-view, scroll progress) with `matchMedia` mocked. Components render their final state when motion is disabled. GSAP, Lenis and Swiper are stubbed in jsdom tests.
- **Playwright:** the e2e journeys run with reduced motion on, so timing never causes flakes. A separate visual-motion spec runs with it off and checks that pinned sections and carousels work and that the page stays scrollable.
- **Manual checklist per phase:** light and dark theme, reduced motion, phone width, keyboard-only, custom cursor on and off, print preview.
- **Quality gate:** typecheck, lint, web tests, e2e, and `npm run build:web` bundle sizes against section 9.

## 11. Out of scope for this design

Sound, voice or simulated-voice effects; scroll hijacking that blocks native scrolling; intro splash screens; marketing tracking, A/B testing and lead-capture forms; new products, new roles and any change to the five API capabilities. Copying another company's code, artwork or copy: reference sites are for ideas only, and everything is built from scratch with our own assets.

# ANIMATION_PLAN.md — implementing the motion layer

Status: **draft for approval** (2026-10-08). Nothing in this plan has been built. The design it implements is `docs/DESIGN.md`. If this plan conflicts with `PRD.md`, the PRD wins.

## Progress (updated 2026-10-08)

Approved by Karan on 2026-10-08: Lenis is the only smooth-scroll engine and is used on the landing page only; Locomotive Scroll is removed (done in Phase 11); no splash; phases 0 to 4 first, then the landing page; the landing copy may be reworded to match the PRD. **Decided 2026-10-09:** the product name is FinStrukt (D6), and the ambient background (Phase 10), first dropped, was reinstated and built at Karan's request. Nothing is open.

| Phase                       | State | Notes                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundation                | Done  | Hooks, tokens, `MotionProvider`, Lenis and GSAP wiring (not mounted yet), print and reduced-motion CSS.                                                                                                                                                                                                 |
| 1 Press and hover feedback  | Done  | Hover lifts only for real pointers, visible keyboard focus, `.clay-press`, no `transition: all` left in the clay styles.                                                                                                                                                                                |
| 2 Stage transitions         | Done  | `StageTransition`, animated Runs and Compare windows, stage heading takes focus, progress line under the nav. The memo print overlays are deliberately not animated.                                                                                                                                    |
| 3 Result entrances          | Done  | CSS reveals with a capped stagger on result tiles, scenario and risk rows, verdict badge, flags and chat messages. Charts are not animated (the optional stroke reveal was skipped).                                                                                                                    |
| 4 Lists, compare, carousels | Done  | Swiper carousels on phones for the product cards and Compare runs; reveals on run lists.                                                                                                                                                                                                                |
| 5 Landing structure, copy   | Done  | Split into `pages/landing/*`, lazy-loaded behind the unchanged `pages/LandingPage.tsx`; copy rewritten to match the PRD (no pricing, stress-test, Monte Carlo or edition claims); one `BRAND_NAME` constant.                                                                                            |
| 6 Smooth scroll, header     | Done  | Lenis on the landing page only (destroyed when the simulator opens, off for reduced motion); header docks; in-page anchor links.                                                                                                                                                                        |
| 7 Hero demo                 | Done  | A labelled, fixed-data sample driven by a GSAP timeline that plays only while visible; one still frame for reduced motion.                                                                                                                                                                              |
| 8 Pinned journey            | Done  | Desktop: pinned, ScrollTrigger-driven, stages are buttons; phone: Swiper carousel; otherwise the plain ordered list.                                                                                                                                                                                    |
| 9 Strip, footer             | Done  | CSS marquee of the integrations (pauses off-screen and on hover, static for reduced motion); footer wordmark reveal.                                                                                                                                                                                    |
| 10 Ambient background       | Done  | Reinstated 2026-10-09. A canvas "+" grid on the hero (`AmbientGrid`, maths in `ambient.ts`): desktop width and a real pointer only, quiet behind the text, glows near the cursor, pauses off screen and in hidden tabs; a still CSS dotted pattern for reduced motion, touch, narrow screens and print. |
| 11 Hardening                | Done  | Locomotive Scroll removed; docs and numbers updated; visual check in light, dark and phone. Lighthouse was not run (not installed here).                                                                                                                                                                |

Deviations from this plan, and measured numbers:

- Phase 4 uses CSS reveals for list rows, not Framer `layout` animations. Rows only appear when data loads, and `layout` would need the larger `domMax` feature set (about 25 KB) for little gain.
- Bundle (final, gzipped): first-load JS is 153.9 KB, which is 15.9 KB more than the 138 KB before this work, about 0.9 KB over the +15 KB budget in `docs/DESIGN.md`. Most of it is Framer Motion's core (`AnimatePresence` and its context machinery); `framer-motion/m` did not shrink it. Separate lazy chunks: the landing page with GSAP, ScrollTrigger and Lenis is 56 KB (budget 120 KB), the Framer animation features 14.5 KB, Swiper 29 KB plus 2 KB of CSS. The simulator downloads only the first-load JS, plus Swiper on a phone when a carousel is shown. Decision for Karan: accept the 0.9 KB overshoot.
- `vite.config.ts` pre-bundles `swiper/react`, `swiper/modules`, `gsap`, `gsap/ScrollTrigger` and `lenis` (`optimizeDeps.include`). Without it the dev server's first encounter with a lazily imported library reloaded the whole page, which a phone-width test caught.
- The hero builds its own demo timeline and the sections use the CSS `Reveal`; there is no separate GSAP hero reveal timeline. The capability grid and product cards use the same CSS reveal, not a ScrollTrigger batch. Result: ScrollTrigger is used by the pinned journey and the footer wordmark only.
- Not done: a Lighthouse run (the tool is not installed in this environment). The manual checklist was covered by Playwright runs (desktop, phone, reduced motion, keyboard) and screenshots in light, dark and phone widths; print preview of the landing page was not checked.
- The saved HackerRank reference folder was moved out of the repository to `Downloads/hackerrank-reference`, because ESLint was linting its 15,000 minified files.

## 1. Goal and scope

Add a motion layer to `apps/web`: a rebuilt, animated landing page, smoother journey transitions and calmer result entrances. Libraries already installed in `apps/web/package.json` (2026-10-08): `gsap` 3.15.0, `lenis` 1.3.26, `locomotive-scroll` 5.0.1, `swiper` 14.3.0, `framer-motion` 14.0.0.

**In scope:** the web app only. **Out of scope:** the API, the Python services, the database, the five API capabilities, any new product, role or requirement, and any change to what a number means or how it is calculated.

## 2. Current state (verified)

- **Stack:** React 19, Tailwind 4, Vite 8. Web unit tests: 8 files, 94 tests. e2e: 7 Playwright journeys (6 run without a database).
- **Build:** initial bundle 475 KB, 138 KB gzipped, with no animation library imported yet.
- **Landing page:** `pages/LandingPage.tsx` (167 lines), with a hero, a six-card grid and a five-step strip.
- **Existing motion:** only CSS keyframes (`liveBeacon`, `journeySlideIn`, `modalFadeIn`) and `CustomCursor.tsx`. All three keyframes already switch off under reduced motion.
- **Journey:** five stages in `App.tsx` (Mandate, Structure, Simulate, Outcomes, Verdict). Admin and audit screens use `AppShell`.
- **Design system:** the "clay" tokens and classes in `index.css`. Not changed by this plan except for added motion tokens.

## 3. Principles for the work

1. One phase, one branch commit, one reviewable diff. Each phase is shippable alone and can be dropped without breaking later ones, apart from Phase 0.
2. No phase may change an API call, a validator, or the text of a number.
3. Every effect has a reduced-motion and a touch fallback in the same commit as the effect.
4. Quality gate before a phase counts as done: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build:web`, plus the manual checklist in `docs/DESIGN.md` section 10. Then update `IMPLEMENTATION_STATUS.md`, as `CLAUDE.md` requires.
5. Stop and ask if a phase needs something the PRD or `CLAUDE.md` does not clearly allow.

## 4. Target file layout

```text
apps/web/src/
  motion/
    tokens.ts               durations, easing, stagger (mirrors the CSS variables)
    useReducedMotion.ts     media query hook
    useHoverCapable.ts      (hover: hover) and (pointer: fine)
    useInView.ts            IntersectionObserver hook
    useScrollProgress.ts    one rAF per scroll event
    MotionProvider.tsx      Framer MotionConfig + LazyMotion
    scroll/
      LenisProvider.tsx     Lenis lifecycle, landing route only
      gsapSetup.ts          registers ScrollTrigger once, ties Lenis to the GSAP ticker
    index.ts
  pages/landing/            split from LandingPage.tsx
    LandingPage.tsx         (lazy-loaded entry)
    Hero.tsx
    HeroDemo.tsx
    CapabilityGrid.tsx
    JourneyPinned.tsx
    JourneyCarousel.tsx     phone version (Swiper)
    ProductStrip.tsx
    DataStrip.tsx           marquee
    LandingFooter.tsx
  components/
    StageTransition.tsx     Framer Motion wrapper for the five stages
    Reveal.tsx              small reusable entrance
    Carousel.tsx            thin Swiper wrapper (keyboard + a11y modules)
apps/web/tests/motion/      unit tests for the hooks and components above
```

## 5. Phases

Effort: S is under half a day, M is about a day, L is two to three days. These are rough.

### Phase 0 — Foundation (S–M)

**Goal:** shared building blocks that every later phase uses.

**Tasks**

1. Add motion tokens to `index.css` (`--motion-*`, `--ease-*`, `--stagger`) and mirror them in `motion/tokens.ts`.
2. Add the four hooks: `useReducedMotion`, `useHoverCapable`, `useInView`, `useScrollProgress`.
3. Add `MotionProvider` (`MotionConfig reducedMotion="user"`, `LazyMotion features={domAnimation}`) and wrap the app in `AppRoot.tsx`.
4. Add `gsapSetup.ts` (register ScrollTrigger once) and `LenisProvider.tsx` (create Lenis, call `lenis.on('scroll', ScrollTrigger.update)`, run `lenis.raf` from `gsap.ticker`, set `gsap.ticker.lagSmoothing(0)`, destroy on unmount). The provider is mounted only around the landing route.
5. Add a global print rule that turns off animations and transitions.
6. Add a test helper that stubs `matchMedia`, `IntersectionObserver`, GSAP and Lenis for jsdom.

**Acceptance:** the app looks and behaves exactly as before. Hooks have unit tests. Initial bundle grows by no more than about 5 KB gzipped (Framer Motion's `LazyMotion` core only). Lenis and ScrollTrigger are not in the main chunk.

**Files:** `index.css`, `AppRoot.tsx`, new `motion/*`, `tests/motion/*`.

### Phase 1 — Press and hover feedback (S)

**Goal:** consistent tactile feedback.

**Tasks:** align `.clay-btn-primary`, `.clay-btn-secondary`, tiles and segmented controls to the motion tokens. Add a `:focus-visible` treatment where missing. Keep everything in CSS. Replace ad-hoc `hover:scale-105` on landing buttons with the shared class.

**Acceptance:** keyboard activation (Enter and Space) shows the same pressed state as the mouse. Nothing moves under reduced motion except colour.

### Phase 2 — Stage transitions in the journey (M)

**Goal:** smooth movement between the five stages and for modals.

**Tasks**

1. `StageTransition.tsx` using `AnimatePresence mode="wait"`, 220 ms out and in, 10 px slide, keyed by stage. Wrap the stage area in `App.tsx`.
2. Replace the CSS-only `animate-journey-step` and `animate-modal-in` classes with Framer Motion variants for `SessionRunsModal`, the saved-run report and other modals, so they also animate on exit.
3. Stepper line fill (CSS), active node scale.
4. Mode A and B panel cross-fade using `layout` without causing jumps.

**Acceptance:** form state is preserved when changing stage (the existing `forms.ts` state is untouched). Focus moves to the stage heading after a transition. Unit tests still pass. Playwright journeys pass under reduced motion.

**Risk:** exit animations can leave two stages mounted briefly, which could break tests that assert on text. Mitigate by disabling exit animations in test mode.

### Phase 3 — Result entrances (M)

**Goal:** calm, ordered entrances for results.

**Tasks:** staggered row entrance for `ScenarioTable` (max 8 rows staggered), grouped fade-up for `RiskPanel` and `ModelCard`, suitability badge scale-in (0.96 to 1) with flags in order, chat message slide-up, chart container fade with an optional stroke-reveal. Charts render at final geometry.

**Acceptance:** every value is present and correct in the DOM from the first render of the result. Tests that read values do not need waits. The "simulation, not a guarantee" notice is static and never delayed. No number tweens.

**Files:** `components/risk/*`, `components/suitability/SuitabilityPanel.tsx`, `components/charts/*`, `components/chat/ChatPanel.tsx`, `pages/OutcomesPage.tsx`, `pages/VerdictPage.tsx`.

### Phase 4 — Lists, compare runs and carousels (M)

**Goal:** movement for list changes, and swiping on phones.

**Tasks**

1. `layout` and `AnimatePresence` for `RunTable` and `SavedRunsPanel` rows.
2. `Carousel.tsx`: a thin Swiper wrapper with the Keyboard, A11y and Pagination modules, no autoplay, and its own cleanup.
3. Use it for `ProductCards` on phone widths and for `CompareRuns` on phone widths (2–3 runs, swipe between them). Desktop layouts stay as they are.
4. Import Swiper CSS only where used.

**Acceptance:** compare runs still shows only the backend's results and still warns on mismatched profiles (PRD §7.1). Swiper is lazy-loaded, so desktop users who never see a carousel do not download it where practical.

### Phase 5 — Landing page rebuild: structure and content (M)

**Goal:** split the landing page into components and align it with the PRD, before adding scroll effects.

**Tasks**

1. Split `LandingPage.tsx` into the `pages/landing/` components, behind `React.lazy` so the journey does not load them.
2. Review every claim in the copy against `PRD.md` (open item D5), including "Precision Pricing", "Stress Testing" and "Real-Time Simulation". Remove or reword anything that is out of scope or untrue. This needs your approval.
3. Keep the current props (`onStart`, `onLogin`, `onRegister`, `userSlot`) and behaviour exactly.
4. Add `Reveal` entrances to sections (CSS and `IntersectionObserver`).

**Acceptance:** same sign-in and start behaviour as today (the auth tests keep passing). Landing JS is in its own chunk. The Lighthouse performance score on the landing page is not lower than before.

### Phase 6 — Landing scroll engine and header (M)

**Goal:** turn on Lenis and the docked header.

**Tasks:** mount `LenisProvider` around the landing route only. Anchor links and the header scroll with Lenis (`lenis.scrollTo`). Header docks and tightens after the hero (CSS plus `IntersectionObserver`). Verify keyboard scrolling, find-in-page, and that leaving the landing page destroys Lenis (no leftover listeners).

**Acceptance:** the journey and admin pages scroll natively. Lenis is destroyed on route change. Reduced motion disables Lenis entirely.

### Phase 7 — Hero timeline and sample demo (L)

**Goal:** the hero reveal and a looping illustrative demo.

**Tasks**

1. GSAP timeline: headline words, subtitle and buttons reveal in sequence (about 900 ms total), skippable.
2. `HeroDemo.tsx`: a looping sequence (client fields fill, a payoff line draws, a verdict badge changes between Suitable, Caution and Not suitable) using fixed, clearly synthetic sample data. It carries a visible "Sample, illustrative" label and `aria-hidden`. It plays only while in view and pauses in hidden tabs.
3. Static first-frame fallback for reduced motion and for print.

**Acceptance:** the demo's figures come from a constant in the file, never from the API. They are labelled as a sample. It holds 60 fps on a mid-range laptop. It does not suggest advice or guaranteed returns.

### Phase 8 — Pinned five-stage journey (L)

**Goal:** the scroll-linked "how it works" section.

**Tasks:** `JourneyPinned.tsx` on desktop: a pinned stage with ScrollTrigger scrubbing between the five stages, progress bar, active highlight and a background tint that shifts per stage (existing tokens only). Phones use `JourneyCarousel.tsx` (Swiper, no autoplay). Clicking a step scrolls to it via Lenis. Content is real text in the DOM with proper headings, so it works without the effect.

**Acceptance:** keyboard users reach every step and its text. The page height is reserved before pinning, so there is no layout shift. ScrollTrigger refreshes after fonts and images load.

### Phase 9 — Capability grid, product strip, marquee and footer (M)

**Goal:** the remaining landing sections.

**Tasks:** ScrollTrigger batch entrance for the capability cards. Product strip (ELN, DCD, CPN) with a carousel on phones. `DataStrip` marquee in CSS, slowed on hover and paused off-screen. It names only sources the product really uses (decision D4). Footer wordmark reveal, once.

**Acceptance:** the marquee has no layout cost and does not announce itself to screen readers repeatedly (duplicate set is `aria-hidden`).

### Phase 10 — Optional ambience (L, only if approved)

An optional single effect on the landing hero background (a glyph-grid texture or a pointer ripple), canvas-based, desktop and fine-pointer only, off-screen pause, static CSS fallback. Decision D3.

### Phase 11 — Hardening and sign-off (M)

Bundle and Lighthouse check against `docs/DESIGN.md` section 9. Run the manual checklist in both themes, with and without reduced motion, at phone width, keyboard-only, with the custom cursor on and off, and in print preview. Update `IMPLEMENTATION_STATUS.md`, `README.md` (layout section) and the Playwright config note on reduced motion. Remove anything unused, including `locomotive-scroll` if decision D1 says so.

## 6. Dependencies between phases

```text
0 ─┬─ 1
   ├─ 2 ─ 3 ─ 4
   └─ 5 ─ 6 ─ 7
            ├─ 8
            └─ 9 ─ 10 (optional)
                    └─ 11 (all)
```

Recommended order: 0, 1, 2, 3, 4, then 5 to 9, then 10 if approved, then 11. Phases 1 to 4 improve the product the RMs use. Phases 5 to 10 only affect the landing page.

## 7. Testing plan

| Level           | What                                                                                                                             | Where                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Unit            | The motion hooks, `Reveal`, `StageTransition`, `Carousel` render the final state with motion off, clean up on unmount            | `apps/web/tests/motion/` |
| Component       | Landing sections render all text and buttons with GSAP, Lenis and Swiper stubbed. Auth props still work.                         | `apps/web/tests/`        |
| e2e             | The existing journeys, run with reduced motion enabled in the Playwright config so animation never causes flakes                 | `tests/e2e/`             |
| e2e (motion on) | A short spec: landing loads, pinned section scrolls, carousel swipes on a phone viewport, no console errors, sign-in still works | `tests/e2e/`             |
| Manual          | The checklist in `docs/DESIGN.md` section 10                                                                                     | per phase                |
| Build           | `npm run build:web` and compare chunk sizes against the budget                                                                   | per phase                |

Note: `tests/e2e/playwright.config.ts` may be covered by the repository's config-protection hook. If so, the reduced-motion setting is applied through a test fixture or an environment variable instead, or you make that one change by hand.

## 8. Risks and mitigations

| Risk                                                            | Mitigation                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lenis and Locomotive Scroll fight over scrolling                | Only Lenis is mounted. Locomotive is not instantiated (D1).                                                                      |
| Smooth scroll breaks nested scrolling, dialogs, or keyboard use | Landing route only. Test keyboard, find-in-page, anchors. Use `data-lenis-prevent` on scrollable panels if needed.               |
| GSAP and Framer Motion animate the same element                 | The one-engine-per-element rule, enforced in review.                                                                             |
| React 19 strict mode double-mounts effects                      | Every effect returns a full cleanup. Unit tests mount twice.                                                                     |
| Animation makes test assertions flaky                           | Motion off in tests. Data is in the DOM from the first frame.                                                                    |
| Bundle growth                                                   | Lazy-load the landing chunk. `LazyMotion`. Import Swiper modules individually. Check sizes every phase.                          |
| Motion makes a result look like a prediction or an endorsement  | Rules 2 and 3 in `docs/DESIGN.md`. Reviewed in Phases 3 and 7.                                                                   |
| Sample demo mistaken for real output                            | Visible "Sample, illustrative" label, fixed data in code, never from the API.                                                    |
| Layout shift from pinned sections                               | Reserve height, refresh ScrollTrigger after fonts and images load.                                                               |
| Licensing and copying                                           | Built from scratch with our own assets and copy. GSAP's current licence terms should be checked and recorded in the final phase. |

## 9. Decisions needed from you

| ID  | Question                                                                                           | My recommendation                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | Keep or remove Locomotive Scroll? It duplicates Lenis.                                             | Mount only Lenis. Remove Locomotive Scroll at Phase 11 unless you want it instead of Lenis. |
| D2  | Smooth scroll on the landing page only, or the whole app?                                          | Landing only. The simulator has forms, tables and dialogs where smooth scroll adds risk.    |
| D3  | Do you want the optional ambient background (Phase 10)?                                            | Decided: yes, built 2026-10-09 (first skipped, then reinstated at Karan's request).         |
| D4  | Which names may the "data and technology" strip show?                                              | Only ones in use today: Supabase, Gemini, the market-data providers actually configured.    |
| D5  | Landing copy: may I remove or reword claims that are not in the PRD (such as "Precision Pricing")? | Yes. `CLAUDE.md` rules out pricing, so that claim should go.                                |
| D6  | Product name in the UI: FinStrukt, Payoff Desk or MindSpark?                                       | Decided 2026-10-09: FinStrukt.                                                              |
| D7  | Scope: all phases, or only the in-app polish (0 to 4) first?                                       | Phases 0 to 4 first, then the landing page.                                                 |
| D8  | Any other approver needed for UI changes (AI/ML owner, others)?                                    | The UI is yours. The AI/ML owner is not affected.                                           |

## 10. What I will not do without asking

Change an API call or response shape, add a role or product, touch the Python services, edit `PRD.md` or `CLAUDE.md`, add another dependency beyond the five installed, or replace any existing design token.

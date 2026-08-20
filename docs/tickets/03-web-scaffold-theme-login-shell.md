---
ticket: 3
milestone: M1 Foundation
labels: web
---

## Story / Why

Ticket 2 built a door with a working lock and one endpoint behind it. This ticket builds the building: the admin web app that every supervisor-facing feature from here on lives inside.

Two things make it worth its own ticket rather than being folded into the first feature screen. First, **authentication is a genuine security boundary** — an authenticated Supabase user is not a supervisor, and the app must enforce that distinction at the routing layer, once, correctly. Second, **every layout decision made here is inherited by tickets 5, 6, 8 and 13 whether or not it was thought about.** The wizard in ticket 6 is the visually hardest screen in the product; it should slot into a shell that already handles navigation and responsiveness, not renegotiate them.

Nothing here is a feature. What you get is a signed-in supervisor looking at an empty, well-built frame.

## Context

Read `docs/PRD.md` §5.1 and §4.2 rule 6, and the Frontend section of `CLAUDE.md`.

**The auth rule that matters.** Signing in successfully is not the same as being authorised. Supabase Auth tells you *who* someone is; the `admins` table decides whether they're a supervisor. So the flow is: sign in → call `admin-me` (ticket 2) → only on a 200 does the app consider the session valid. A user who authenticates but gets `not_admin` is **signed out immediately** and shown a plain message. Do not leave them sitting in a broken shell.

**There is no signup route.** Not hidden, not disabled — absent. Supervisors are created by hand in the Supabase dashboard. If you find yourself building a registration form, stop and re-read this.

**Three decisions from the manager, and the reasoning, so you don't reverse them by accident:**

1. **No design is provided. Design it yourself against the brand kit.** This is the explicit exception in the UI standards below — the "match the design exactly" rule does not apply here because there is nothing to match. Use the tokens in `CLAUDE.md`, keep it plain, and let the product's own visual language start here. Restraint reads better than invention.

2. **Dark theme only.** PRD decision D-21 locks this, and it overrides the light+dark requirement in the standard UI checklist. The reason is concrete: humblecoders.in has no light mode to inherit a palette from, so "support light" would mean inventing one, then maintaining it across seven more UI tickets. **But define every colour as a token in one place anyway** — a future light theme should be a config change, not a refactor. No `bg-[#07090f]` anywhere in a component.

3. **All user-facing copy lives in a central strings module**, typed, with no string literals in components. Not an i18n library — English only, no locale files. The benefit we're buying is that ticket 15's error-copy sweep is a single file to review rather than a hunt across the codebase, and tone stays consistent because it's all visible at once.

**Shell scope.** Full navigation with stub pages, so tickets 5, 6 and 8 fill in content without touching layout or routing.

**Environment.** No Docker. `.env` holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — both public by nature, but still via `.env` with `.env.example` committed. The service role key must never appear in this app; if you ever find yourself wanting it here, the work belongs in an Edge Function.

Deployment to Vercel is **ticket 15**, not this one. `npm run dev` is enough.

## 🔑 Access & prerequisites

Request from the manager over a secure channel:

- **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** for the single Supabase project
- **A supervisor login** — email and password for an Auth user with an `active` row in `admins`
- **A non-supervisor login** — an Auth user with no `admins` row, to verify the rejection path. Create a throwaway one yourself if easier
- **The humblecoders.in logo asset** — the real file, in SVG if it exists. `CLAUDE.md` requires the actual asset, not a re-drawn approximation. Ask the manager for it at kickoff
- **Confirmation that `admin-me` is deployed** (ticket 2) — this ticket cannot be finished without it

## Scope

**1. Project scaffold — `web/`**

- Vite + React 18 + TypeScript in **strict** mode + Tailwind
- `@supabase/supabase-js`, React Router. **No UI kit, no state library** (`CLAUDE.md` rule 6)
- `.env.example` with both variable names and empty values; `.env` gitignored
- ESLint + Prettier, and an `npm run typecheck` script

**2. Theme — defined once**

- All tokens from `CLAUDE.md` in `tailwind.config.ts`: bg `#07090f` · card `#0f131c` · secondary `#161b27` · muted `#1a2030` · text `#f4f6fb` · muted-text `#94a0b8` · brand `#4263a6` · brand-2 `#5b7cc4` · border `#5b7cc424` · gold `#f5c451` · radius `0.875rem`
- Inter for UI, Caveat for the logo script
- The real logo asset

**3. Strings — `src/strings.ts`**

Every user-facing string, typed. Include copy for all ten supervisor error codes from PRD §4.7 now, even the ones no screen shows yet — later tickets should find the copy already written rather than inventing it inline.

**4. Routing and auth**

- Routes: `/login`, `/drivers`, `/plan`, `/trips`, `/trips/:id`, plus a catch-all 404
- `/drivers`, `/plan`, `/trips`, `/trips/:id` render styled placeholders naming what's coming and which ticket brings it
- A `ProtectedRoute` that requires both a Supabase session **and** a successful `admin-me`
- Session persists across reload; unauthenticated deep links redirect to `/login` and return to the intended page after signing in
- Logout clears the session and redirects

**5. Login page**

Email, password, submit, and a password-reset link using Supabase's reset flow. Distinct copy for wrong credentials versus authenticated-but-not-a-supervisor — they are different problems and the second one is not the user's fault.

**6. App shell**

Logo, current supervisor's name, logout, and navigation to the three sections. Sidebar on desktop, collapsing to a drawer or top bar below 768 px.

## 🖼️ UI standards

Adapted for web and for this project's constraints. Anything mobile-specific (notch, home indicator, Android gesture bar) is dropped as inapplicable.

### Design fidelity
- [ ] **No design is provided for this ticket — design against the brand kit.** The "match the design exactly" rule does not apply; it will apply to later UI tickets if a design is supplied
- [ ] Use the theme tokens for every colour, size, radius and font. **No one-off hex values, no ad-hoc spacing.** Build the shared primitives (button, input, card, page header) here — tickets 5, 6 and 8 must reuse them, not duplicate them

### Theming
- [ ] **Dark theme only**, per PRD D-21 — this deliberately overrides the usual light+dark requirement
- [ ] Every colour still comes from a token defined in one place, so a light theme remains a config change rather than a refactor

### Native components
- [ ] Prefer **semantic HTML and native form controls** — real `<form>`, `<button>`, `<label>`, `<input>`, `<select>`. Do not hand-roll what the browser provides
- [ ] Where a native control genuinely cannot do what's needed, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **Full-bleed background** — the page background covers the viewport with no letterboxing or stray light gutters
- [ ] **Responsive at 375 px, 768 px and 1280 px+** — an acceptance criterion, not a nice-to-have (PRD §6). Fluid layouts, not fixed pixel positions
- [ ] Content width capped and centred on wide screens; no full-width text lines on a 27-inch monitor
- [ ] The window resizes smoothly with a sensible minimum; no clipping, no horizontal scrollbar at any supported width
- [ ] **Correct truncation** — overflowing text ellipsizes cleanly rather than clipping, overlapping, or pushing layout

### Input and keyboard
- [ ] `type="email"` and `type="password"`; `autocomplete="username"` and `autocomplete="current-password"` so password managers work
- [ ] Autocapitalize and autocorrect off on email
- [ ] **Enter submits the form** — a real `<form>` with `onSubmit`, not a click handler on a div
- [ ] Tab moves through fields in logical order; the submit button is reachable by keyboard
- [ ] On a phone, the focused field stays visible above the on-screen keyboard

### States and feedback
- [ ] **Loading, error and disabled states** on the login form and the `admin-me` check. Disable submit and show progress during the request; never leave a dead-looking button
- [ ] Errors appear inline in the app's own styling — never a raw error object, an alert box, or a silent failure
- [ ] Stub pages have a deliberate empty state, not a blank screen
- [ ] Visible hover, focus and press feedback on every interactive element; **`prefers-reduced-motion` respected**
- [ ] Form input is not lost on a failed submit

### Accessibility and content
- [ ] Every input has a real `<label>`; icon-only buttons have accessible names
- [ ] **Visible focus rings** — do not remove outlines without replacing them
- [ ] Interactive targets at least ~44 px on touch
- [ ] **WCAG AA contrast** against the dark palette. Check `muted-text` on `bg` and on `card` specifically — it is the pairing most likely to fail
- [ ] Layout survives browser zoom to 200% and larger default font sizes; use `rem`, not fixed `px`, for type
- [ ] **No hardcoded user-facing strings** — everything through `src/strings.ts`

### Architecture and verification
- [ ] Functional components and hooks only; no business logic inside presentational components
- [ ] **No secrets in the app or committed.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] `npm run dev` starts from a clean clone using only `.env.example` as a guide
- [ ] `npm run typecheck` passes with TypeScript strict
- [ ] **No signup route exists anywhere in the app**
- [ ] Correct credentials for a supervisor land on the authenticated shell
- [ ] Wrong credentials show an inline error and keep the typed email
- [ ] **A user who authenticates but has no active `admins` row is signed out immediately** and shown a plain message that does not blame them
- [ ] Session survives a page reload; the user is not asked to sign in again
- [ ] Visiting `/trips` while signed out redirects to `/login`, and returns to `/trips` after signing in
- [ ] Logout clears the session; the back button does not restore the authenticated shell
- [ ] All four sections are reachable from the shell and render styled placeholders
- [ ] Unknown routes render a styled 404, not a crash or a blank page
- [ ] Every UI standard above is met
- [ ] `git grep` finds no hex colour in any component, and no user-facing string literal outside `src/strings.ts`
- [ ] `git grep` finds no service role key and no secret of any kind in `web/`

## Out of scope

- Driver management, the planning wizard, trip screens — tickets 5, 6, 8
- Vercel deployment and custom domain — ticket 15
- Light theme — deliberately excluded by PRD D-21
- Any i18n library or locale files
- Component or E2E tests. Verify manually and document what you checked in the handoff (per `CLAUDE.md`, tests are required on logic that can silently break; this ticket has little of that)

## Dependencies

**Ticket 2** must be merged and `admin-me` deployed — the authorisation check depends on it.
**Ticket 1** for the schema and the first supervisor account.

## References

- `docs/PRD.md` §5.1 (supervisor auth), §4.2 rule 6, §6 (non-functional), §4.7 (error codes for the strings module)
- `CLAUDE.md` — Frontend section and the theme tokens
- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)

## Kickoff prompt

```
/start-ticket 3
```

At kickoff, ask the manager for the Supabase URL and anon key, both test logins, and **the real humblecoders.in logo asset**. Confirm `admin-me` is deployed before starting, since the authorisation path cannot be built or verified without it.

There is no design to match on this ticket — build it against the brand kit, keep it plain, and make the shared primitives good, because four later tickets are going to live inside them.

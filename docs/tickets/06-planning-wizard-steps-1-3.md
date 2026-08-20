---
ticket: 6
milestone: M2 Route planning
labels: web
---

## Story / Why

This is the screen the product is really about. A supervisor types two addresses, compares real routes with real durations, drops in the rest stops their driver will need, and watches the total run time add up. Everything before this ticket was foundation; everything after it depends on the shape settled here.

It's also the hardest screen in the web app: a live map, three interactive route options, an ordered list that mutates and re-fetches, and a hard constraint from Google that the UI has to communicate honestly rather than hide.

Nothing is saved to the database in this ticket. Steps 1–3 are pure exploration — the supervisor can walk away and nothing has happened. Persistence, consignment details and driver assignment are ticket 7.

## Context

Read `docs/PRD.md` §4.3 and §5.3, and `CLAUDE.md` rules 3, 4 and 5. Ticket 4 built both endpoints this screen consumes; read its ticket too.

### The constraint you must design around, not hide

> **The Google Routes API returns alternative routes only when the request has no intermediate waypoints.**

So the wizard has an inherent shape, and it is not arbitrary:

1. **Step 2** asks for alternatives — no stops exist yet, so up to 3 come back.
2. **Step 3** adds stops, which means every request from then on returns exactly 1 route: the chosen corridor, refined.

The UI must say this plainly. When the supervisor adds their first stop, the three route cards **collapse into a single summary of the chosen route**, with a short line explaining that stops refine the selected route. What it must never do is silently drop two cards and leave the supervisor wondering where their options went, or keep showing three cards where two are stale.

If the supervisor goes back to step 2 and picks a different route, their stops are preserved — but the route must be re-fetched with those stops applied, because distance and duration will differ.

### Stops are driver breaks

Rest, food, fuel. Nothing is loaded or unloaded (PRD D-3). Each stop has a type and `planned_minutes`. This is the most commonly misread part of the domain — there are no recipients and no parcels at a stop.

### The maths shown to the supervisor

**Total run time = drive duration + sum of planned break minutes.** Both parts visible, not just the total. A supervisor needs to see that a 6-hour drive with 90 minutes of breaks is a 7.5-hour day.

### Manager's decisions

1. **No design provided.** Build against the brand kit and ticket 3's primitives. This screen sets the visual bar for the product, so favour restraint and clarity over invention.

2. **A second Google key renders the map** — `VITE_GOOGLE_MAPS_BROWSER_KEY`, restricted by HTTP referrer **and** restricted to the **Maps JavaScript API alone**. It cannot call Places or Routes; those stay behind ticket 4's Edge Functions. This is a deliberate, documented amendment to `CLAUDE.md` rule 3, recorded as PRD decision **D-25**. Read rule 3 before you start — the exception is narrow and the reasoning matters. OpenStreetMap is not an alternative: Google's terms forbid displaying Google-derived route data on a non-Google basemap.

3. **Wizard state persists in `sessionStorage`** — survives refresh and back/forward, clears when the tab closes. Losing three minutes of planning to a stray refresh is bad on its own, and re-fetching the route bills Google again.

4. **Stops reorder with up/down buttons.** Keyboard-accessible, screen-reader-accessible, touch-friendly, no new dependency. Drag-and-drop may be layered on later; if you add it, the buttons stay.

### Cost awareness

Step 3 re-fetches on **every** stop edit. Ticket 4 caches identical requests, but you should still debounce edits (~500 ms) so a supervisor typing a stop name doesn't fire five requests. Autocomplete debounces at ~300 ms and **must pass a Places session token** — generate one per search session and reuse it across keystrokes for that field, then discard it when a place is chosen. This is a real billing difference, not a micro-optimisation.

## 🔑 Access & prerequisites

- **`VITE_GOOGLE_MAPS_BROWSER_KEY`** — the manager creates this **second** key, referrer-restricted and limited to the Maps JavaScript API only. Ask for it at kickoff; confirm its API restriction before using it
- Supabase URL, anon key, and a supervisor login (tickets 1–3)
- **Confirmation that ticket 4 is merged and both `places-autocomplete` and `routes-preview` are deployed**
- A couple of realistic Indian origin/destination pairs to test with — long enough that Google actually returns three distinct alternatives

Add `VITE_GOOGLE_MAPS_BROWSER_KEY` to `.env.example` with an empty value.

## Scope

**1. Wizard shell — `/plan`**

Replaces ticket 3's placeholder. Three steps with visible progress, forward and back navigation, and state in `sessionStorage`. Going back never destroys later state unnecessarily.

**2. Step 1 — source and destination**

Two autocomplete inputs backed by `places-autocomplete`, debounced ~300 ms, with a session token per field.

**Store `placeId`, display name, and coordinates.** Never store only the typed string — the string is what the supervisor typed, the `placeId` is what they meant. Both are needed by ticket 7.

Selected places pin on the map. Next is disabled until both are chosen.

**3. Step 2 — choose the route**

Calls `routes-preview` with no stops. Draws all returned routes on one map, the selected one visually dominant and the others recessive. A card list beside the map shows duration, distance and summary — "1 hr 12 min · 46 km · via NH-44".

Selecting a card highlights its polyline, and hovering a card previews it. First route selected by default. Fewer than three alternatives is normal for short trips and must render correctly; one route is a valid result, not an error.

**4. Step 3 — add break stops**

An autocomplete input appends stops to an ordered list. Each stop carries a **type** (`break | food | fuel | other`) and **planned minutes**.

- Reorder with up/down buttons; remove with an explicit control
- Every change re-calls `routes-preview` **with** `stops`, debounced ~500 ms
- Route cards collapse to a single chosen-route summary, with the explanatory line described above
- Stops numbered and pinned on the map, visually distinct from origin and destination
- **Running total**: drive time + total break time = total run time, all three visible
- Maximum 10 stops, matching ticket 4's server-side cap, with the limit communicated before it is hit

**5. Strings**

All copy through `src/strings.ts`, including `routes_failed` and `places_failed`, which now get their first real screens.

## 🖼️ UI standards

Adapted for web and this project. Mobile-only items (notch, home indicator, Android gesture bar) dropped as inapplicable.

### Design fidelity
- [ ] **No design provided — build against the brand kit.** The "match exactly" rule does not apply on this ticket
- [ ] **Reuse ticket 3's primitives.** Extend them in place if they fall short; do not fork them

### Theming
- [ ] **Dark theme only** per PRD D-21 — deliberately overriding the usual light+dark requirement
- [ ] Every colour from a token. **This includes the map**: use a dark Google Maps style so it doesn't glare against the app, and take the polyline and marker colours from the brand tokens

### Native components
- [ ] Semantic HTML: real `<form>`, `<label>`, `<button>`, `<select>` for stop type, `<ol>` for the ordered stop list
- [ ] The autocomplete dropdown is the one genuinely custom control here. It must behave like a real combobox: `role="combobox"`, arrow keys to move, Enter to select, Escape to dismiss, and an active-descendant announcement
- [ ] If something can't be done natively, say so in the PR and use the smallest custom component that works

### Layout and responsiveness
- [ ] **375 px, 768 px, 1280 px+** all correct. **Map and list sit side by side above 768 px and stack vertically below it** (PRD §5.3)
- [ ] The map has a sensible minimum height when stacked — a 120 px letterbox is useless
- [ ] No horizontal scrollbar at any width; the window resizes smoothly and the map resizes with it
- [ ] **Long place names ellipsize cleanly** in cards and stop rows. Indian addresses are long; this will bite

### Input and keyboard
- [ ] **Planned minutes uses a numeric input** (`inputMode="numeric"`) so phones show a number pad
- [ ] Autocapitalize and autocorrect off on address search
- [ ] **Enter selects the highlighted suggestion**, not submits the form
- [ ] Full keyboard path through all three steps: choose places, pick a route, add and reorder stops, advance — **without a mouse**
- [ ] Focused field stays visible above an on-screen keyboard
- [ ] Reorder buttons keep focus on the moved stop, so repeated presses work

### States and feedback
- [ ] **Loading, empty, error and disabled** states for both endpoints. The map shows a loading state while a route is fetching; the previous route stays visible rather than flashing empty
- [ ] `routes_failed` and `places_failed` render as friendly inline messages with a retry — **never a raw error, never a silent empty result**. Ticket 4's quota cap makes this a genuinely reachable state
- [ ] Zero suggestions shows "no matches", not an empty dropdown
- [ ] **Wizard state survives refresh** via `sessionStorage`; back/forward within the wizard loses nothing
- [ ] Visible hover, focus and press feedback; `prefers-reduced-motion` respected, including map animation
- [ ] Removing a stop is immediate and reversible by re-adding — no confirmation dialog for something this cheap

### Accessibility and content
- [ ] Every input has a real `<label>`; icon-only buttons (reorder, remove) have accessible names that identify **which** stop
- [ ] Route cards are selectable by keyboard and announce which is chosen
- [ ] **The map is not the only way to understand the route** — the card list carries duration, distance and summary as text
- [ ] Visible focus rings; touch targets ~44 px; **WCAG AA contrast**, including text over the map
- [ ] Survives 200% browser zoom
- [ ] **No user-facing string literals outside `src/strings.ts`**

### Architecture and verification
- [ ] Functional components and hooks; route-fetching logic lives outside presentational components
- [ ] **Only the Maps-JS-restricted browser key is present in the client.** The server key must appear nowhere in `web/`
- [ ] Verified at 375 / 768 / 1280 px, at 200% zoom, and with a keyboard only

## Acceptance Criteria

- [ ] Typing an Indian address returns suggestions; selecting one stores `placeId`, name and coordinates
- [ ] Autocomplete debounces (~300 ms) and **passes a Places session token**, reused across keystrokes and discarded on selection
- [ ] Step 2 requests **no** stops and renders up to 3 alternatives with duration, distance and summary
- [ ] One or two alternatives render correctly and are not treated as an error
- [ ] Selecting a card highlights its polyline; hovering previews it
- [ ] **Adding the first stop collapses the three cards into a single chosen-route summary with a clear explanation** — no silent disappearance
- [ ] Every stop edit re-fetches with `stops` and updates polyline, distance and duration
- [ ] Stop order is preserved exactly as entered; reordering re-fetches
- [ ] **Running total shows drive time + break time = total run time**, all three visible
- [ ] Attempting an 11th stop is prevented with an explanation, matching ticket 4's server cap
- [ ] Returning to step 2 and choosing a different route keeps the stops and re-fetches with them applied
- [ ] Refreshing mid-wizard restores all state from `sessionStorage`; closing the tab clears it
- [ ] `routes_failed` and `places_failed` show friendly inline errors with retry
- [ ] The whole wizard is completable with a keyboard only
- [ ] Every UI standard above is met
- [ ] `git grep` in `web/` finds the browser key only, never the server key; no hex colours in components; no user-facing string literal outside `src/strings.ts`

## Out of scope

- **Saving anything to the database.** No `routes`, no `route_stops` rows — ticket 7
- Consignment details, driver assignment, code generation, email — ticket 7
- Step 4 of the wizard entirely
- Editing an already-saved route
- Waypoint optimisation — excluded by PRD D-22; the supervisor's order is the order
- Turn-by-turn directions — excluded by D-18 and by ticket 4's field mask
- Drag-and-drop reordering (may be added later; buttons remain either way)

## Dependencies

**Ticket 4** merged and both endpoints deployed — this ticket is a client for them.
**Ticket 3** for the shell, routing, primitives and strings.

## References

- `docs/PRD.md` §4.3 (the constraint), §5.3 (wizard steps 1–3), §4.7 (error codes), D-3, D-22, D-25
- `CLAUDE.md` — rules 3 (with its new exception), 4 and 5
- Ticket 4 for the exact request and response shapes
- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) · [Places session tokens](https://developers.google.com/maps/documentation/places/web-service/session-tokens)

## Kickoff prompt

```
/start-ticket 6
```

At kickoff, ask the manager for `VITE_GOOGLE_MAPS_BROWSER_KEY` and **confirm it is restricted to the Maps JavaScript API only** before using it. Confirm ticket 4's endpoints are deployed.

Two things to hold onto. Alternatives and stops are mutually exclusive, and the UI's job is to make that legible rather than to hide it — a supervisor should never wonder where their route options went. And stops are the driver's rest breaks, not deliveries.

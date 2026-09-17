# Hermes Mobile PWA — Implementation Plan

## Overview

Build a mobile-first iOS PWA that connects to a running Hermes Agent backend through Hermes' native API server. The product is **bot-first**: the home screen is a fast command/chat surface, while full sessions, approvals, tools, and profile switching are available without reproducing the cluttered Hermes Web UI.

This is a new client surface, not a fork or embedded view of Hermes Web UI.

## Product shape

### Primary user flow

1. Open the installed PWA.
2. See the active bot/profile and a single prominent composer.
3. Send a message or slash command.
4. Watch the response stream in place.
5. Approve, deny, stop, or steer a running turn from the same conversation.
6. Jump into Sessions only when history/context matters.

### Navigation

Use a compact iOS tab bar:

- **Bot** — default command surface and current conversation.
- **Sessions** — searchable session list, recent sessions, resume/fork.
- **Activity** — active/completed runs, approvals, tool progress, failures.
- **Settings** — connection, profile, model, appearance, notifications, security.

No admin dashboard navigation in MVP. No settings maze. Advanced controls stay behind contextual sheets.

## Architecture decisions

1. **PWA client:** React + TypeScript + Vite, mobile-first CSS, installable manifest, service worker, offline shell cache.
2. **Mobile gateway/BFF:** a small same-origin server holds `API_SERVER_KEY`, authenticates the PWA user, proxies only the allowlisted Hermes API routes, and normalizes SSE/run events for the client. The browser must not receive the Hermes bearer key.
3. **Hermes connection:** use Hermes API server native routes, not Web UI internals or screen scraping. The installed source currently exposes session CRUD, session messages, session chat and streaming, runs, run events via SSE, approval response, stop, steer, model options, models, skills, toolsets, and profile routing.
4. **Streaming:** consume Hermes SSE for run events. Render text incrementally; render tool progress and approval requests as structured event cards. Reconnect with backoff and resume/read the run state before declaring a stream lost.
5. **Auth boundary:** protect the BFF with the existing private access layer (Cloudflare Access/Tailscale path as appropriate). Use an HttpOnly, Secure, SameSite session cookie between PWA and BFF. Do not put API keys in localStorage, IndexedDB, URLs, analytics, or logs.
6. **Session identity:** treat Hermes session IDs/keys as opaque values returned by Hermes. Never construct session keys in the client.
7. **Bot-first state:** the active bot/profile and active session are URL-addressable and persisted in client state, but the default entry point remains the Bot tab.
8. **No background execution claim:** the PWA can show the last-known state and reconnect on foreground. Background push is a later enhancement and cannot be assumed to run Hermes turns on iOS.
9. **Public-project pairing:** the repository is self-hostable for any Hermes user. The gateway uses a one-time operator pairing code today; QR/deep-link pairing is a later enhancement that must never place `API_SERVER_KEY` in a URL or browser storage.
10. **Public-project defaults:** Apache-2.0 licensing, CI, Docker/Compose, security policy, contribution guide, route allowlisting, and production dependency audit are part of the project foundation rather than post-MVP cleanup.

## Hermes API contract to wrap

The BFF should expose a stable mobile contract over a narrow allowlist:

- `GET /health`, `GET /health/detailed`
- `GET /v1/capabilities`, `GET /v1/models`, `GET /api/model/options`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `GET /api/sessions/:id/messages`
- `POST /api/sessions/:id/fork`
- `POST /api/sessions/:id/chat`
- `POST /api/sessions/:id/chat/stream`
- `POST /api/sessions/:id/model`
- `POST /v1/runs`
- `GET /v1/runs/:id`
- `GET /v1/runs/:id/events` (SSE)
- `POST /v1/runs/:id/approval`
- `POST /v1/runs/:id/steer`
- `POST /v1/runs/:id/stop`
- `GET /v1/skills`, `GET /v1/toolsets`

The first implementation task must inspect the live `/v1/capabilities` response and lock the TypeScript types to observed payloads. The source contract is a starting point, not a substitute for a live compatibility test.

## UX and visual direction

### Design language

- Calm, dark, high-contrast operator tool; not a generic chatbot.
- Dense enough for real work, but with thumb-sized controls and clear hierarchy.
- One strong accent color for active state; semantic colors for approval, running, success, and failure.
- Flat surfaces, restrained radii, minimal shadows. No purple-gradient AI aesthetic.
- Use real Hermes vocabulary: bot, session, run, approval, tool, profile.

### Bot screen

- Header: connection indicator, active profile, overflow menu.
- Hero state: “What should Hermes do?” plus recent command chips such as Resume, New session, Status.
- Composer fixed above the safe-area inset; multiline, attachment-ready, send/stop toggle.
- Streaming response with a visible run state.
- Inline approval card with Once / Session / Always / Deny only when Hermes advertises those choices.
- Tool progress collapsed by default; tap to expand.
- Failed/disconnected state must explain whether the problem is connection, authentication, or agent/run state.

### Sessions screen

- Recent sessions first, with profile, last activity, run state, and short title.
- Search/filter by profile and active/completed.
- Swipe actions: resume, fork, archive/delete only after confirmation.
- Session detail is a focused conversation view, not a second dashboard.

### Activity screen

- Active runs at top.
- Approval queue is actionable.
- Completed activity grouped by today / earlier.
- Each row links back to its session.

### Settings screen

- Connection status and backend label.
- Profile selector.
- Model selector and reasoning controls only when supported by capabilities.
- Notification preference.
- “Open diagnostics” shows sanitized endpoint/health details, never secrets.

## Phased delivery

### Phase 0 — Contract spike and repository foundation

**Acceptance criteria**
- [ ] New app repository structure exists with PWA shell and BFF package.
- [ ] Live Hermes API health/capabilities/models/session calls are captured as sanitized fixtures.
- [ ] BFF can authenticate one user and proxy one read-only request.
- [ ] No Hermes Web UI dependency exists.

**Verification**
- Typecheck and unit tests pass.
- Local BFF integration test proves the Hermes bearer key is not returned to the browser.
- PWA installs in iOS Safari Add to Home Screen flow.

### Phase 1 — Bot-first vertical slice

**Acceptance criteria**
- [ ] User opens Bot screen, creates/resumes a session, sends a message, and receives a streamed response.
- [ ] Reconnect/readback handles a dropped stream without duplicating the final response.
- [ ] Loading, empty, offline, auth failure, backend unavailable, and run failure states are designed and tested.

**Verification**
- Mock contract tests for streaming and terminal events.
- Browser test at 320px and 390px widths.
- Manual iOS Safari installed-PWA test with keyboard and safe-area insets.

### Phase 2 — Real operator controls

**Acceptance criteria**
- [ ] Approval events render actionable controls and submit the selected Hermes choice.
- [ ] Stop and steer work on active runs.
- [ ] Tool progress and run status are visible without exposing raw secret-bearing tool output.
- [ ] Slash commands can be sent through the same composer with clear command styling.

**Verification**
- End-to-end tests against a disposable Hermes profile/session.
- Verify approval timeout and disconnected-client behavior.
- Verify the BFF allowlist rejects unknown routes and methods.

### Phase 3 — Sessions and profiles

**Acceptance criteria**
- [ ] Browse/search sessions, open history, fork, rename, and delete with confirmation.
- [ ] Switch profiles without session-key collisions.
- [ ] Preserve the active profile/session across app restarts.

**Verification**
- Fixture tests for multiple profiles.
- Verify opaque Hermes IDs are never synthesized client-side.
- Test long session titles, empty sessions, and pagination/large histories.

### Phase 4 — Install-quality polish

**Acceptance criteria**
- [ ] PWA manifest, icons, splash/theme colors, offline shell, update prompt, and safe-area handling are complete.
- [ ] Keyboard, VoiceOver, reduced-motion, contrast, focus, and touch-target checks pass.
- [ ] Performance budget is defined and met on a representative iPhone.
- [ ] Sanitized diagnostics and structured error reporting are available.

**Verification**
- Test at 320px, 390px, 768px, 1024px, and desktop fallback widths.
- Run axe/accessibility checks and real VoiceOver smoke test.
- Test airplane mode, expired auth, backend restart, and app resume.

### Phase 5 — Optional mobile-native enhancements

Only after the core PWA is stable:

- Web Push for completed-run/approval notifications where iOS support and deployment constraints are confirmed.
- Share-sheet inbound text/files.
- Voice input and audio attachments if the live Hermes capabilities advertise support.
- Multi-device presence and conflict resolution.

## Data and security model

### BFF rules

- Allowlist exact Hermes methods/routes; deny admin config writes by default.
- Enforce request body size, timeout, origin, CSRF, and rate limits.
- Redact authorization headers, API keys, cookies, prompt payloads where policy requires, and raw tool output from logs.
- Attach a request ID and Hermes run/session ID for diagnostics.
- Return typed errors: `unauthenticated`, `forbidden`, `backend_unavailable`, `invalid_request`, `run_failed`, `stream_interrupted`.
- Never proxy arbitrary URLs or expose a generic reverse proxy.

### Client storage

- Store only non-sensitive preferences and cached UI/session metadata.
- Treat conversation cache as sensitive; provide a clear-cache action and avoid persistent raw transcripts unless explicitly needed.
- Use memory-first auth state and HttpOnly cookies rather than storing tokens in JS-readable storage.

## Suggested repository layout

```text
hermes-mobile/
  apps/
    web/                 # React PWA
      src/
        app/
        features/bot/
        features/sessions/
        features/activity/
        features/settings/
        components/
        lib/hermes-client/
        styles/
      public/manifest.webmanifest
  packages/
    contract/             # shared BFF/client schemas and event types
    ui/                   # mobile primitives only after patterns stabilize
  services/
    mobile-gateway/       # same-origin BFF; Hermes key stays here
  tests/
    contract/
    e2e/
  tasks/
    plan.md
    todo.md
```

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| API server contract changes | High | Capability discovery, contract fixtures, versioned BFF adapter, integration tests against the installed Hermes build |
| Direct browser exposure of API key | Critical | Same-origin BFF, HttpOnly cookie, exact route allowlist, no direct API CORS in production |
| iOS PWA background limits | Medium | Foreground reconnect/readback first; treat push as optional and verify on supported iOS versions |
| Long-running runs outlive the PWA | High | Hermes run IDs + status/event readback; activity screen shows incomplete/recoverable runs |
| Tool output contains secrets or sensitive data | High | Preserve Hermes redaction, avoid raw logging, minimize client persistence, sanitize diagnostics |
| Recreating desktop UI clutter | Medium | Bot-first information architecture; sessions/activity are secondary and contextual |
| Multiple profiles/session collision | High | Use profile prefixes/routing returned by Hermes; opaque IDs; test cross-profile isolation |

## Definition of done for MVP

- A user can install the PWA on iPhone, open the Bot tab, send a real Hermes request, watch it stream, respond to an approval, stop/steer a run, and resume the session after closing/reopening the app.
- The app never loads Hermes Web UI.
- The browser never receives the Hermes API bearer key.
- The app has tested failure states, accessibility basics, safe-area handling, and live API compatibility evidence.

## Open decisions

1. **Deployment path:** private Tailscale-only PWA vs public hostname behind Cloudflare Access. Recommendation: private first, public only after the BFF/auth boundary is verified.
2. **BFF runtime:** Node/TypeScript service alongside the PWA vs Python service inside/alongside Hermes. Recommendation: use the stack that can share deployment/restart ownership with the Hermes host; do not modify Hermes core for MVP.
3. **Notification scope:** no push in MVP; add only after foreground recovery is solid.
4. **Initial profile scope:** default profile only for the first vertical slice; add profile switching in Phase 3.

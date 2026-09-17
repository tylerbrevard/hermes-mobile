# Hermes Mobile Build Checklist

## Foundation

- [x] Create public-project repository structure.
- [x] Add React/Vite PWA shell, manifest, service worker, and mobile-first visual system.
- [x] Add same-origin BFF with server-side Hermes API key and exact route allowlist.
- [x] Add one-time pairing code and HttpOnly session cookie.
- [x] Add Docker/Compose deployment path and public-project docs.
- [x] Add CI, security policy, contributing guide, and Apache-2.0 license.

## Next vertical slices

- [x] Validate live Hermes `/v1/capabilities`, session create/delete, and SSE stream against Hermes 0.21.3.
- [x] Add typed Hermes run adapter and robust SSE event normalization.
- [x] Complete Bot session create/send against a live Hermes API server; resume/readback remains next.
- [x] Add approval, stop, and steer controls.
- [x] Add session search/history browse/open plus fork/rename/delete.
- [x] Add local activity/run recovery view with known-run status refresh.
- [x] Add profile switching with Hermes multiplex routing and per-profile server-side credentials.
- [x] Add profile-aware sessions, run events, approvals, stop, steer, and activity recovery.
- [x] Add model/provider picker, profile-default model detection, reasoning control, and session model lock.
- [x] Add Settings diagnostics, appearance preference, local activity clearing, skill inventory, and toolset inventory.
- [x] Keep the Hermes `/v1/skills` compatibility failure from breaking the client with a local read-only inventory fallback.
- [x] Add cache-busting PWA update behavior and verify the live mobile shell; accessibility audit remains.
- [x] Redesign the Bots home as a bot-first command center with a featured operator, quick-switch rail, rich roster, and responsive mobile treatment.
- [x] Apply a Cadu-inspired iOS visual pass: semantic surfaces, restrained accent, appearance-aware light/dark/system modes, and touch-first grouped lists.
- [ ] Add QR/deep-link pairing without placing Hermes credentials in URLs.
- [ ] Add optional foreground-safe voice/file attachments only when Hermes capabilities advertise support.
- [ ] Add accessibility and installed-PWA keyboard/VoiceOver pass.

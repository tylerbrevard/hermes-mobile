# Hermes Mobile Build Checklist

## Foundation

- [x] Create public-project repository structure.
- [x] Add React/Vite PWA shell, manifest, service worker, and mobile-first visual system.
- [x] Add same-origin BFF with server-side Hermes API key and exact route allowlist.
- [x] Add one-time pairing code and HttpOnly session cookie.
- [x] Add Docker/Compose deployment path and public-project docs.
- [x] Add CI, security policy, contributing guide, and Apache-2.0 license.

## Next vertical slices

- [ ] Capture live Hermes `/v1/capabilities` and session payload fixtures.
- [ ] Add typed Hermes contract adapter and robust SSE event normalization.
- [ ] Complete Bot session create/send/resume against a live Hermes API server.
- [ ] Add approval, stop, and steer controls.
- [ ] Add session search/history/fork/rename/delete.
- [ ] Add activity/run recovery view.
- [ ] Add profile switching.
- [ ] Add PWA update UX and accessibility/browser QA.
- [ ] Add QR/deep-link pairing without placing Hermes credentials in URLs.

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
- [ ] Add typed Hermes contract adapter and robust SSE event normalization.
- [x] Complete Bot session create/send against a live Hermes API server; resume/readback remains next.
- [ ] Add approval, stop, and steer controls.
- [x] Add session search/history browse/open; fork/rename/delete remain.
- [ ] Add activity/run recovery view.
- [ ] Add profile switching.
- [ ] Add PWA update UX and accessibility/browser QA.
- [ ] Add QR/deep-link pairing without placing Hermes credentials in URLs.

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
- [ ] Add profile switching.
- [x] Add cache-busting PWA update behavior and verify the live mobile shell; accessibility audit remains.
- [ ] Add QR/deep-link pairing without placing Hermes credentials in URLs.

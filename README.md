# Hermes Mobile

A bot-first, mobile-first PWA for [Hermes Agent](https://github.com/NousResearch/hermes-agent). It is an independent client surface: it does **not** embed or depend on the Hermes Web UI.

> Early development: the gateway and PWA shell are functional, but the Hermes event renderer and production deployment guides are still being built.

## Architecture

- `src/` — React PWA
- `server/` — same-origin mobile gateway/BFF
- The gateway stores `HERMES_API_KEY` server-side and exposes an exact allowlist of Hermes API routes.
- The browser receives only an HttpOnly session cookie after one-time pairing.

## Run locally

1. Enable Hermes' API server and note its API key.
2. Copy `.env.example` to `.env` and set `HERMES_API_URL`, `HERMES_API_KEY`, and a long random `PAIRING_CODE`.
3. Install and start:

```bash
npm install
npm run dev
```

Open `http://localhost:4173`. The dev server proxies `/api` to the mobile gateway on port `8643`.

For a production build:

```bash
npm run build
WEB_DIST=dist npm start
```

Set `COOKIE_SECURE=true` whenever the gateway is served over HTTPS.

## Pairing model

The first release uses a one-time operator-provided pairing code. The code is exchanged once for a server-side session cookie; it is never sent to Hermes and is never stored in browser-readable storage. A future release can add a CLI-generated QR/deep-link flow without changing the Hermes credential boundary.

For public deployments, put the gateway behind HTTPS and an access layer such as Cloudflare Access or a private Tailscale path. Do not expose Hermes' API server directly to the public internet.

## Development

```bash
npm test
npm run typecheck
npm run build
```

## License

Apache-2.0. See `LICENSE`.

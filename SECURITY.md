# Security policy

## Scope

Hermes Mobile is a client and gateway for a user's own Hermes Agent instance. The gateway handles an Hermes API bearer key and may relay private conversation content.

## Deployment requirements

- Run behind HTTPS and an access layer (for example Cloudflare Access or a private Tailscale path).
- Keep `HERMES_API_KEY` and `PAIRING_CODE` only on the gateway host.
- Use a long, random pairing code and set `COOKIE_SECURE=true`.
- Do not expose Hermes' API server directly to the public internet.
- Do not enable wildcard CORS or add arbitrary proxy routes.

## Reporting a vulnerability

Please do not open a public issue for a credential leak, authentication bypass, or private-data disclosure. Use GitHub's private vulnerability reporting if enabled for the repository, or contact the repository owner through GitHub first. Include reproduction steps and impact without including live secrets.

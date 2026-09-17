# Contributing

Thanks for helping make Hermes easier to use on a phone.

## Before opening a PR

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

Keep changes focused. New behavior needs a test. Keep the Hermes API key server-side and preserve the route allowlist. Do not add a dependency for a one-off helper.

## Design bar

The app is mobile-first and bot-first. Prefer a clear action over a dashboard widget. Test at 320px and 390px widths, keyboard navigation, reduced motion, and VoiceOver-relevant labels.

## Commit and PR guidance

Explain the user-visible change, the security impact, and the verification you ran. Do not include credentials, private transcripts, or screenshots containing them.

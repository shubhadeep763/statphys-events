# StatPhys Events

A curated hub of statistical physics conferences, schools and workshops —
non-equilibrium, active matter, hydrodynamics, quantum non-equilibrium,
machine learning for statmech, and more.

Live site: https://statphys-events.vercel.app

## Updating events

### Automatic (monthly)
A GitHub Action (`.github/workflows/update-events.yml`) runs on the 1st of
every month at 03:00 UTC. It calls the Claude API (`scripts/update-events.mjs`) with web
search to find newly announced statmech events, validates and dedups them,
removes events that ended more than 6 months ago, and commits the updated
`src/events.json` — Vercel then redeploys automatically.

Setup: add an `ANTHROPIC_API_KEY` repository secret
(GitHub → Settings → Secrets and variables → Actions). You can also trigger a
run manually from the Actions tab ("Monthly event update" → Run workflow), or
locally with `ANTHROPIC_API_KEY=... npm run update-events`.

### Manual
Edit `src/events.json` and commit — Vercel redeploys automatically.

## Tech
Vite + React + Tailwind, deployed on Vercel.

---
Built with assistance from Claude (Anthropic).

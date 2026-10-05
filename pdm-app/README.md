# PdM Monitor — Predictive Maintenance web app

Answers one question in under five seconds: **which assets need attention now, why, and what should I do?**

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · Recharts 3

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

## Screens

| Route | Screen |
|---|---|
| `/` | Fleet overview: KPIs (assets at risk, predicted failures 7/30 d, MTBF, MTTR, OEE, unplanned downtime), ranked "Needs attention now" list, recent alerts, health by site, work orders due |
| `/assets` | Asset list: search, filter (status, line, type), sort; state kept in the URL (`?status=critical,warning&sort=rul`) |
| `/assets/[id]` | Asset detail: health score, RUL with 80% interval, failure mode, contributing factors, health trend + forecast cone, 4 sensor charts (thresholds + anomaly markers, 24 h–90 d), maintenance timeline |
| `/alerts` | Alert triage: status/severity filters, list + detail panel, acknowledge, assign, snooze, resolve, create work order, evidence chart, timeline |
| `/work-orders` | Board (Open / In progress / Done) with drag-and-drop **and** a "Move to" menu, detail sheet, parts availability |
| `/settings` | Alert thresholds (validated), notification rules, users and roles + permission matrix |

Every screen has loading, empty and error states. Preview them with **Demo** in the top bar (Live data / Loading / Empty / Error).

## Structure

```
src/
  app/                    routes (thin server components that render a view)
  components/
    app-shell/            side nav, top bar, skip link
    pdm/                  product components: status chips, KPI card, chart frame, states, dialogs
    charts/               Recharts components (sensor, health forecast, alert evidence)
    views/                one client view per screen
    ui/                   shadcn/ui primitives
  lib/
    types.ts              domain model
    api.ts                API facade — the only thing views call
    mock/                 deterministic mock data (50 assets, 3 sites, 90 days hourly sensor data)
    use-query.ts          tiny data hook (loading / error / silent refetch after mutations)
```

### Swapping in a real backend

Views only call `api.*` in `src/lib/api.ts` and only use the types in `src/lib/types.ts`.
Replace the function bodies with `fetch()` calls that return the same shapes and delete `src/lib/mock/`.
Mutations currently call `commit()` to trigger a refetch; with a real API, refetch the same way (or use React Query/SWR).

### Mock data

- `catalog.ts` — sites, lines, users, parts, sensor setups and failure modes per asset type
- `assets.ts` — the fleet and a power-law health model per asset; RUL and interval come from that model
- `sensors.ts` — hourly readings for 90 days, generated lazily, consistent with each asset's health model
- `records.ts` — alerts, work orders, maintenance history

Eight assets are degrading (3 critical, 5 warning) and two are offline; the rest are healthy.
Data is seeded, so it's the same on every load; "now" is the time the page was opened.
Edits (acknowledge, create work order, settings) live in memory and reset on reload.

## Design tokens

All colors, status colors, chart colors and radius are CSS variables in `src/app/globals.css`
(light and dark). Names map 1:1 to the planned Figma variable collections (`color/*`, `status/*`, `chart/*`, `radius/*`).
Every text/background pair was checked for WCAG 2.2 AA contrast.

## Accessibility

Target: WCAG 2.2 AA. Status is always icon + text, never color alone. Every chart has a text summary and a "View table" alternative.
Dialogs and sheets return focus to their opener. Tables use `th scope` and `aria-sort`. Reflows at 320 px.
QA scripts (headless Chrome over CDP) live in `../tools`: `task-axe.mjs`, `task-a11y.mjs`, `task-states.mjs`, `task-shots.mjs`.

```bash
node ../tools/cdp.mjs ../tools/task-axe.mjs   # needs the dev server running
```

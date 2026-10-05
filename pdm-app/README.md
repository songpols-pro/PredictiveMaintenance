# PdM Monitor — Predictive Maintenance web app

Answers one question in under five seconds: **which assets need attention now, why, and what should I do?**

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · Recharts 3

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Deploy: Firebase App Hosting, with the demo-request form saved to Cloud Firestore. Step-by-step guide (Thai): [`../DEPLOY.md`](../DEPLOY.md).

## Routes

| Route | Screen |
|---|---|
| `/` | **Public website** (marketing): hero with product preview, KPIs, approaches, how it works, features, product tour (real screenshots), supported equipment, roles, FAQ, demo-request form and contact channels |
| `/app` | Fleet overview: KPIs (assets at risk, predicted failures 7/30 d, MTBF, MTTR, OEE, unplanned downtime), ranked "Needs attention now" list, recent alerts, health by site, work orders due |
| `/app/assets` | Asset list: search, filter (status, line, type), sort; state kept in the URL (`?status=critical,warning&sort=rul`) |
| `/app/assets/[id]` | Asset detail: health score, RUL with 80% interval, failure mode, contributing factors, health trend + forecast cone, 4 sensor charts (thresholds + anomaly markers, 24 h–90 d), maintenance timeline |
| `/app/alerts` | Alert triage: status/severity filters, list + detail panel, acknowledge, assign, snooze, resolve, create work order, evidence chart, timeline |
| `/app/work-orders` | Board (Open / In progress / Done) with drag-and-drop **and** a "Move to" menu, detail sheet, parts availability |
| `/app/settings` | Alert thresholds (validated), notification rules, users and roles + permission matrix |

Every app screen has loading, empty and error states. Preview them with **Demo** in the top bar (Live data / Loading / Empty / Error).

## Structure

```
src/
  app/                    routes (thin server components that render a view)
  components/
    app-shell/            side nav, top bar, skip link
    pdm/                  product components: status chips, KPI card, chart frame, states, dialogs
    charts/               Recharts components (sensor, health forecast, alert evidence)
    views/                one client view per app screen
    marketing/            public website: header, footer, hero preview, landing sections, demo form
    ui/                   shadcn/ui primitives
  lib/
    types.ts              domain model
    api.ts                API facade — the only thing views call
    mock/                 deterministic mock data (50 assets, 3 sites, 90 days hourly sensor data)
    use-query.ts          tiny data hook (loading / error / silent refetch after mutations)
    site-config.ts        contact details shown on the website (placeholders — replace before launch)
    demo-request.ts       demo-request fields and validation, shared by the form and the server
    leads.ts              server action: stores demo requests in Firestore (+ optional email to sales)
    firebase-admin.ts     Firestore access for server code (no keys needed on App Hosting)
```

### Before the website goes live

1. Replace the placeholders in `src/lib/site-config.ts` (LINE ID and link, phone, email).
2. Deploy with Firestore and, if wanted, the sales email (see [`../DEPLOY.md`](../DEPLOY.md)). Without Firestore, `npm run dev` pretends to send and a production build shows "We couldn't send your request".
3. Have the short privacy notice and the consent text reviewed for PDPA.
4. Confirm the product claims in the copy (integrations, deployment options) in `src/lib/i18n/messages/marketing-*.ts`.
5. Re-capture the product tour images (`public/marketing/{en,th}/*.webp`) with `node ../tools/cdp.mjs ../tools/task-tour-shots.mjs` when the UI changes.

### Firebase

| File | Purpose |
|---|---|
| `apphosting.yaml` | App Hosting / Cloud Run settings (scale to zero, max 4 instances) and the optional `LEADS_NOTIFY_EMAIL` |
| `firestore.rules` | No direct browser access; only the server action (Admin SDK) writes |
| `firebase.json` | Firebase CLI: rules deploy and the local Firestore emulator (port 8085) |
| `.env.example` | Local settings for the emulator or a real project |

Firestore collections written by `submitDemoRequest`:
- `demoRequests`: the form fields, `locale`, a `consent` record (wording and time), `status` (`new`, or `spam` when the honeypot is filled), `createdAt`, `deleteAfter` (+12 months, for a TTL policy).
- `mail` (only when `LEADS_NOTIFY_EMAIL` is set): a message for the "Trigger Email from Firestore" extension, with `replyTo` set to the requester, and `deleteAfter` (+30 days).

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

## Languages (English / ไทย)

Switch from the language menu in the top bar. The choice is saved in the `pdm-locale` cookie; on a first visit the
browser's `Accept-Language` decides. The server sets `<html lang>` and page titles, so screen readers pick the right voice.

- UI text: `src/lib/i18n/messages/en.ts` and `th.ts` (TypeScript makes sure both have the same keys)
- Dates and numbers: `src/lib/i18n/format.ts` (Thai uses the Buddhist year, e.g. 5 ต.ค. 2569)
- Data from the API (asset names, failure modes, recommendations, alert text): `src/lib/mock/l10n.ts`,
  the same way a real backend would answer per `Accept-Language`
- Thai typography: Noto Sans Thai fallback, taller line-height and no letter-spacing on Thai text (`globals.css`)

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

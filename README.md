# Predictive Maintenance (PdM) Monitor

A web app for maintenance engineers, reliability engineers and plant managers that answers one question in under five seconds: **which assets need attention now, why, and what should I do?**

| Folder | What's inside |
|---|---|
| [`pdm-app/`](pdm-app) | Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui + Recharts: public website at `/` and the app (6 screens, mock data for 50 assets) at `/app`, in Thai and English. See [`pdm-app/README.md`](pdm-app/README.md). |
| [`screenshots/`](screenshots) | Every screen at 1440 and 1024 px, light and dark, loading / empty / error states, Thai (`th/`) and the website (`website/`) |
| [`tools/`](tools) | QA scripts that drive headless Chrome: axe-core audit, keyboard / reflow / reduced-motion checks, screenshots |
| [`NOTES.md`](NOTES.md) | Delivery notes in Thai: assumptions, differences from the brief, WCAG 2.2 AA report |
| [`DEPLOY.md`](DEPLOY.md) | Deploy guide in Thai: Firebase App Hosting, Firestore for the demo-request form, optional sales email |
| [`RUNNING.md`](RUNNING.md) | How to run everything locally, in Thai: start order, the three ways to simulate (full cloud path, web-only simulation, local broker), virtual PLC options, simulated events, stopping and troubleshooting |
| [`FLOW.md`](FLOW.md) | How the system works, in Thai, as sets ready for diagrams: an overview (architecture, the four data paths) and one flow per part (PLC, broker, ingestion, database, alarms, Firestore, sign-in, live and history screens, admin tasks, simulation), each with steps and Mermaid code |
| [`TELEMETRY.md`](TELEMETRY.md) | Spec in Thai for PLC programmers: MQTT topics, payloads, timing and the tag list per device kind (contract v1) |
| [`NEW-PLANT.md`](NEW-PLANT.md) | Manual in Thai for adding a new plant, for field technicians and operators: before the site visit, at the site, registering the plant on the admin page, checks before handover and devices added later, with screenshots and a local rehearsal |
| [`services/virtual-plc/`](services/virtual-plc) | Virtual PLC fleet that publishes the contract from the plant simulation, a local MQTT broker, and a checker (`npm run tap`) for commissioning real PLCs |
| [`services/ingest/`](services/ingest) | Ingestion service: MQTT (EMQX, persistent session, ack after commit) → TimescaleDB (Tiger Cloud: history, alarms from fault words) and Firestore (live values, gateway state, active alarms) |

```bash
cd pdm-app
npm install
npm run dev   # website: http://localhost:3000  ·  app: http://localhost:3000/app
```

![Fleet overview](screenshots/1-overview-1440-light.png)

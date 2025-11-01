# AGI Jobs v0 (v2) — Onebox Static Console v2

[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

The `v2` variant is a single-file static dashboard optimised for kiosks and minimal environments. It stores configuration entirely
in `localStorage`, renders orchestration transcripts inline, and provides an “expert mode” toggle for direct JSON editing.

## Key capabilities

- **Persistent settings** – Orchestrator URL, API token, and status refresh interval persist across sessions using storage keys
  such as `ORCH_URL` and `ONEBOX_STATUS_INTERVAL`.【F:apps/onebox-static/v2/app.js†L1-L40】
- **Expert mode** – Operators can toggle expert mode to unlock raw JSON intent editing, captured in the `ONEBOX_EXPERT_MODE` flag
  so the interface remembers the preference.【F:apps/onebox-static/v2/app.js†L6-L34】
- **Robust error context** – The console walks nested error objects to surface the most relevant message, status code, and error
  code, giving non-technical owners actionable feedback without browser devtools.【F:apps/onebox-static/v2/app.js†L41-L120】
- **Status polling** – Periodically fetches `/status` from the orchestrator and annotates the UI with the most recent events; the
  interval is adjustable from the settings dialog.【F:apps/onebox-static/v2/app.js†L13-L34】【F:apps/onebox-static/v2/app.js†L121-L200】

## Running locally

Open `index.html` directly in a browser or serve the folder from any static host:

```bash
cd apps/onebox-static/v2
python -m http.server 4173
# Visit http://localhost:4173
```

Use the Settings button to point the console at your orchestrator and supply the API token (if required). Expert mode exposes a raw
textbox for ICS payloads when you need to craft custom requests.

## Extending v2

1. Modify `app.js` to add new controls or validation logic.
2. Update `styles.css` for any layout changes; the stylesheet is intentionally minimal.
3. Keep the documentation in `apps/onebox-static/README.md` aligned if both static flavours should expose the same functionality.

This v2 bundle keeps the fallback experience simple yet powerful enough for owner-led interventions when the full Next.js console
is unavailable.

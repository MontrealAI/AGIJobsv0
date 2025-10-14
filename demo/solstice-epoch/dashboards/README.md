# Solstice Epoch Dashboard Kit

Solstice Epoch relies on the Aurora reporting tools that already ship with AGI Jobs v0 (v2). Follow this sequence to publish coordination dashboards with no custom code:

1. **Select scope.** Export data from the orchestrator and gateway using the existing demo harness: `AURORA_REPORT_SCOPE=solstice-epoch AURORA_REPORT_TITLE='Solstice Epoch Command Surface' npm run demo:aurora:report`.
2. **Attach manifests.** Drop the generated report under `storage/aurora/solstice-epoch/latest.json` so that the Aurora renderer can diff policy deltas across runs.
3. **Publish static bundle.** Run `npm run onebox:static:build` and `npm run onebox:static:publish` to distribute the dashboard to the same CDN workflows used for other demos.
4. **Wire CI notifications.** Reuse `.github/workflows/demo-aurora.yml` with `scope: solstice-epoch` so every CI execution emits an updated planetary status digest.

The resulting dashboard visualises labour quotas, treasury balances, ENS identity health, and sentinel alerts by consuming the same data pipelines as the existing demos.

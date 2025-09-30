# Owner Console Smoke Checklist

Run this checklist whenever deploying or upgrading the owner console. Each step should complete in under a minute.

1. **Authenticate**
   - Configure the orchestrator base URL and API token.
   - Connect an EIP-1193 wallet. Confirm the badge shows the connected address.
   - Register and verify a passkey (or confirm an existing one works).

2. **Snapshot refresh**
   - Press **Refresh Snapshot** on the *Protocol Policies* panel.
   - Verify fee, burn, treasury and duration figures populate from `/governance/snapshot`.

3. **Simulate a change**
   - In *Governance Actions*, select `stakeManager.setFeePct` and input a temporary percentage.
   - Submit the preview and confirm a bundle digest plus diff render.
   - Check `storage/governance` receives a new audit JSON file.

4. **Execute path sanity**
   - Call `/onebox/plan` and `/onebox/execute` through the console (or curl) using the preview payload.
   - Within one minute re-open the snapshot; confirm the updated value reflects the executed change.

5. **Receipts viewer**
   - Search by the plan hash returned from step 3.
   - Confirm the *Receipts Viewer* lists the plan/execution records with attestation links.

6. **Paymaster monitoring**
   - Refresh *Gas & Paymaster* metrics and ensure paymaster balance lines appear.
   - Enter a paymaster address and amount; verify the helper link resolves to an `ethereum:` URL.

7. **Pause controls**
   - Preview `systemPause.pauseAll`, confirm the diff indicates modules will halt.
   - Preview `systemPause.unpauseAll` to revert the plan.

Document any deviations before promoting the build.

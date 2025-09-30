# One-Pass Bootstrap with Helm

This guide bootstraps the entire AGI stack using the aggregated Helm chart located in `deploy/helm`.

## Prerequisites
- Kubernetes cluster >= v1.26 with cert-manager and nginx ingress controller installed.
- `helm` >= v3.12.
- Access to the secrets referenced in `values.yaml` (KMS-backed secrets delivered via your secret manager).
- Docker registry credentials for GHCR images.

## Steps
1. **Clone and configure values**
   ```bash
   git clone https://github.com/agi/jobs.git
   cd AGIJobsv0/deploy/helm
   cp values.yaml override.yaml
   ```
   Update `override.yaml` with:
   - Correct RPC URLs and contract addresses.
   - KMS key resource IDs for orchestrator, attester, and paymaster.
   - TLS secret name if using an existing certificate.

2. **Install dependencies**
   ```bash
   helm dependency update
   ```

3. **Install the stack**
   ```bash
   helm install agi-stack . -f override.yaml --create-namespace --namespace agi
   ```
   Within ~2 minutes all Deployments should report `AVAILABLE=1`. Validate with `kubectl get pods -n agi`.

4. **Post-install checks**
   - Confirm ingress routes issue valid certificates (`curl -I https://orchestrator.example.com/healthz`).
   - Verify `ServiceMonitor` objects exist in the monitoring namespace.
   - Ensure the pause switch ConfigMap is created: `kubectl get cm agi-operations -n agi`.

5. **Uninstall**
   ```bash
   helm uninstall agi-stack -n agi
   kubectl delete namespace agi --wait
   ```
   This removes all workloads and volumes. Persistent volumes are deleted because the chart provisions them as part of the release.

## Troubleshooting
- If cosigned images fail to pull, ensure the cluster trusts Sigstore fulcio roots.
- When RPC endpoints rate-limit, set `global.rpc.fallback` to a list of additional providers before reinstalling.
- To pause sponsorships during bootstrap, edit the `agi-operations` ConfigMap and set `pause=true`.

## Change Log
- v1.0 – Initial bootstrap guide.

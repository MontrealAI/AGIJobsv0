# One-Pass Bootstrap (Helm)

This procedure installs the entire stack in a brand new Kubernetes cluster.

## Prerequisites
- kubectl access to the target cluster
- `helm` v3.11+
- Access to the artifact registry containing signed container images
- Cosign public key (see `.cosign.pub` in the security vault)

## Steps
1. **Prepare secrets**
   ```bash
   kubectl create ns aa
   kubectl create secret generic subgraph-postgres-credentials \
     --from-literal=database=aa \
     --from-literal=username=aa \
     --from-literal=password=$(openssl rand -base64 32) \
     --from-literal=database-url=postgres://aa:...@postgres:5432/aa \
     -n aa
   ```
   Configure the CSI `SecretProviderClass` referenced in `values.yaml` to retrieve runtime secrets via KMS.

2. **Update dependencies**
   ```bash
   helm dependency update deploy/helm
   ```

3. **Validate image signatures and digests**
   ```bash
   cosign verify --key cosign.pub ghcr.io/agi/protocol/orchestrator@sha256:...
   ```
   Paste the verified digests into `deploy/helm/values.yaml` or supply via `--set` flags.

4. **Install**
   ```bash
   helm install aa-stack deploy/helm -n aa \
     --set global.environment=testnet \
     --set orchestrator.image.digest=sha256:... \
     --set bundler.image.digest=sha256:...
   ```

5. **Post-install checks**
   - `kubectl get pods -n aa` should show all workloads in `Running` or `Completed`.
   - Access Grafana → "AA Stack Overview". All panels should display data within 5 minutes.

6. **Uninstall**
   ```bash
   helm uninstall aa-stack -n aa
   kubectl delete ns aa
   ```
   Confirm that persistent volumes are gone or manually clean them up if retained.

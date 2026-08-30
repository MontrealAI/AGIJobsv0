# Full Stack Helm Deployment

This chart performs a one-pass bootstrap of the entire account abstraction stack. It bundles the FastAPI orchestrator, bundler, paymaster supervisor, attester, IPFS node, Graph Node, Postgres dependency, and TLS ingress.

## Usage

```bash
helm dependency update ./deploy/helm
helm install aa-stack ./deploy/helm -n aa --create-namespace \
  --set global.environment=mainnet \
  --set orchestrator.image.digest=sha256:deadbeef...
```

All workloads expose Prometheus annotations automatically when `global.observability.prometheusScrape` is enabled. Digests **must** be supplied to keep images immutable during upgrades.

### Values

See [`values.yaml`](./values.yaml) for a full list of tunables including chain metadata, RPC URLs, contract addresses, CORS policies, rate limits, secret providers, and autoscaling defaults.

### Uninstall

```bash
helm uninstall aa-stack -n aa
kubectl get all -n aa  # should be empty
```

For more operational guidance see the runbooks under [`docs/`](../../docs).

# CI Blueprint for Cosmic Omni-Sovereign Symphony

Integrate the demo into the AGI Jobs v0 (v2) continuous delivery pipeline by
adding the following GitHub Actions job. It leverages the `bin/orchestrate.sh`
wrapper to execute all relevant checks.

```yaml
cosmic-omni-sovereign:
  name: Cosmic Omni-Sovereign Symphony
  runs-on: ubuntu-latest
  env:
    ETH_RPC_URL: ${{ secrets.ETH_RPC_URL }}
    ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
    DEPLOYER_PRIVATE_KEY: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
      with:
        version: 8
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: demo/cosmic-omni-sovereign-symphony/bin/orchestrate.sh --ci
    - uses: actions/upload-artifact@v4
      with:
        name: cosmic-omni-logs
        path: demo/cosmic-omni-sovereign-symphony/logs
```

This job is compatible with branch protection rules and surfaces the logs needed
for compliance sign-off.

# Module Installer Usage

`ModuleInstaller` wires deployed modules together in a single transaction.
This is helpful when dependencies are unknown at deploy time.

## Initialize and return ownership

1. Deploy `ModuleInstaller`. The deployer is the temporary owner.
2. Transfer ownership to the governance address if the deployer should not
   perform initialization.
3. From the governance account, call `ModuleInstaller.initialize` with the
   addresses of all modules. Ownership of each module is automatically
   returned to the installer owner.

### Hardhat script

The repository includes `scripts/v2/initializeInstaller.ts` which
transfers ownership and invokes `initialize`:

```sh
npx hardhat run scripts/v2/initializeInstaller.ts --network <network> \
  --installer <installer> --governance <gov> --registry <registry> \
  --stake <stake> --validation <validation> --reputation <reputation> \
  --dispute <dispute> --nft <nft> --incentives <incentives> \
  --platformRegistry <platformRegistry> --jobRouter <jobRouter> \
  --feePool <feePool> --identity <identity>
```

After execution, each module is configured and owned by governance.

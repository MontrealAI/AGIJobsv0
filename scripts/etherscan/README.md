# Etherscan call plan

These helpers produce a JSON list of contract calls that can be executed with Etherscan's **Write Contract** tabs.

## Usage

1. Copy `addresses.sample.json` to `addresses.json` and fill in the deployed addresses and policy CID.
2. Generate the call plan:
   ```bash
   node scripts/etherscan/generate_calls.js > scripts/etherscan/calls.json
   ```
3. Follow the order in `calls.json` to perform each transaction in a browser.

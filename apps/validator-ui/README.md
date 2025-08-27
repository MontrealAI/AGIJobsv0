# Validator UI

A minimal Next.js interface for validators to view pending jobs, commit votes, and automatically reveal them.

## Setup

```bash
npm install --prefix apps/validator-ui
```

Create a `.env.local` file with:

```
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS=0xYourValidationModule
NEXT_PUBLIC_REVEAL_DELAY_MS=5000
```

## Running

```bash
npm run dev --prefix apps/validator-ui
```

Connect a browser wallet and use the interface to approve or reject jobs. Commits are signed with a random salt and the reveal transaction is scheduled automatically.

## Testing

Run the commit/reveal integration test against a local Hardhat network:

```bash
npx hardhat test test/validator-ui/commitReveal.test.js
```

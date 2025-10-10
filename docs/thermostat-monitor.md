# Thermostat Monitor

This monitor periodically calculates KPI errors and updates the on-chain `Thermostat`.

## Prerequisites

- Node.js 20.18.1
- access to an Ethereum RPC endpoint
- deployed `Thermostat` contract address
- governance timelock or authorised executor to call `tick`
- optional analytics service returning KPI errors

## Environment

Create an `.env` file with:

```env
RPC_URL=<rpc endpoint>
THERMOSTAT_ADDRESS=<thermostat address>
PRIVATE_KEY=<signer private key>
KPI_API_URL=<analytics endpoint>
MONITOR_INTERVAL_MS=600000 # optional, defaults to 10 min
KPI_BOUND=1000000000000000000 # optional input clamp
```

`KPI_API_URL` should respond with JSON:

```json
{
  "emissionError": 0,
  "backlogError": 0,
  "slaError": 0
}
```

## Deployment

Install dependencies then run the monitor:

```sh
npm install
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/monitor/thermostat-kpis.ts
```

Run it under a process manager or schedule with cron/automation. Each execution logs a tick transaction and resulting temperature to `scripts/monitor/thermostat-monitor.log`. When temperature equals `minTemp` or `maxTemp`, an alert line is written for operators.

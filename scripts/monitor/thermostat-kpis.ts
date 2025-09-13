import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL as string;
const THERMOSTAT_ADDRESS = process.env.THERMOSTAT_ADDRESS as string;
const KPI_API_URL = process.env.KPI_API_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS || '600000');
const KPI_BOUND = BigInt(process.env.KPI_BOUND || '1000000000000000000'); // 1e18 default

if (!RPC_URL || !THERMOSTAT_ADDRESS || !PRIVATE_KEY) {
  console.error('RPC_URL, THERMOSTAT_ADDRESS and PRIVATE_KEY must be set');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const abi = [
  'function tick(int256,int256,int256)',
  'function systemTemperature() view returns (int256)',
  'function minTemp() view returns (int256)',
  'function maxTemp() view returns (int256)',
];
const thermostat = new ethers.Contract(THERMOSTAT_ADDRESS, abi, wallet);

const LOG_FILE = path.join(__dirname, 'thermostat-monitor.log');
function log(msg: string) {
  const entry = `${new Date().toISOString()} ${msg}`;
  console.log(entry);
  try {
    fs.appendFileSync(LOG_FILE, entry + '\n');
  } catch (err) {
    console.error('Failed to write log file', err);
  }
}

function clamp(v: bigint, min: bigint, max: bigint): bigint {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

async function fetchKpis(): Promise<{
  emission: bigint;
  backlog: bigint;
  sla: bigint;
}> {
  if (KPI_API_URL) {
    try {
      const res = await fetch(KPI_API_URL);
      const data = await res.json();
      return {
        emission: BigInt(Math.round(data.emissionError || 0)),
        backlog: BigInt(Math.round(data.backlogError || 0)),
        sla: BigInt(Math.round(data.slaError || 0)),
      };
    } catch (err) {
      log(`Failed to fetch KPI API: ${err}`);
    }
  }
  // Fallback: zero errors
  return { emission: 0n, backlog: 0n, sla: 0n };
}

async function tickOnce() {
  const kpis = await fetchKpis();
  const emission = clamp(kpis.emission, -KPI_BOUND, KPI_BOUND);
  const backlog = clamp(kpis.backlog, -KPI_BOUND, KPI_BOUND);
  const sla = clamp(kpis.sla, -KPI_BOUND, KPI_BOUND);

  const tx = await thermostat.tick(emission, backlog, sla);
  log(`tick tx: ${tx.hash}`);
  await tx.wait();
  const temp: bigint = await thermostat.systemTemperature();
  log(`systemTemperature: ${temp}`);
  const [minTemp, maxTemp] = await Promise.all([
    thermostat.minTemp(),
    thermostat.maxTemp(),
  ]);
  if (temp === minTemp) log('ALERT: temperature hit minTemp');
  if (temp === maxTemp) log('ALERT: temperature hit maxTemp');
}

async function main() {
  await tickOnce();
  setInterval(tickOnce, MONITOR_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

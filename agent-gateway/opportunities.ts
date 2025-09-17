import fs from 'fs';
import path from 'path';
import { JobOpportunityForecast } from '../shared/opportunityModel';

const ANALYTICS_DIR = path.resolve(__dirname, '../storage/analytics');
const FORECAST_PATH = path.join(ANALYTICS_DIR, 'opportunities.json');
const HISTORY_LIMIT = Math.max(
  1,
  Number(process.env.OPPORTUNITY_HISTORY_LIMIT || '200')
);

export interface StoredOpportunityForecast extends JobOpportunityForecast {
  storedAt: string;
}

let loaded = false;
let cache: StoredOpportunityForecast[] = [];
const cacheByJob = new Map<string, StoredOpportunityForecast>();

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readForecastFile(): Promise<StoredOpportunityForecast[]> {
  try {
    const raw = await fs.promises.readFile(FORECAST_PATH, 'utf8');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredOpportunityForecast[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function writeForecastFile(
  records: StoredOpportunityForecast[]
): Promise<void> {
  ensureDirectory(path.dirname(FORECAST_PATH));
  await fs.promises.writeFile(
    FORECAST_PATH,
    JSON.stringify(records, null, 2),
    'utf8'
  );
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  cache = await readForecastFile();
  cacheByJob.clear();
  for (const record of cache) {
    cacheByJob.set(record.jobId, record);
  }
  loaded = true;
}

export async function recordOpportunityForecast(
  forecast: JobOpportunityForecast
): Promise<void> {
  await ensureLoaded();
  const stored: StoredOpportunityForecast = {
    ...forecast,
    storedAt: new Date().toISOString(),
  };
  const existing = cacheByJob.get(forecast.jobId);
  if (existing) {
    const index = cache.findIndex((entry) => entry.jobId === forecast.jobId);
    if (index !== -1) {
      cache[index] = stored;
    } else {
      cache.push(stored);
    }
  } else {
    cache.push(stored);
  }
  cacheByJob.set(forecast.jobId, stored);
  if (cache.length > HISTORY_LIMIT) {
    const overflow = cache.length - HISTORY_LIMIT;
    const removed = cache.splice(0, overflow);
    for (const record of removed) {
      if (record.jobId !== forecast.jobId) {
        cacheByJob.delete(record.jobId);
      }
    }
  }
  await writeForecastFile(cache);
}

export async function listOpportunityForecasts(
  limit?: number
): Promise<StoredOpportunityForecast[]> {
  await ensureLoaded();
  const records = cache.slice();
  records.sort((a, b) => b.storedAt.localeCompare(a.storedAt));
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    return records.slice(0, limit);
  }
  return records;
}

export async function getOpportunityForecast(
  jobId: string
): Promise<StoredOpportunityForecast | null> {
  await ensureLoaded();
  const key = jobId.toString();
  return cacheByJob.get(key) ?? null;
}

export function clearOpportunityCache(): void {
  loaded = false;
  cache = [];
  cacheByJob.clear();
}

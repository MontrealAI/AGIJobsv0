import fs from 'fs';
import path from 'path';
import {
  createTelemetryService,
  loadTelemetryConfig,
  TelemetryService,
  type TelemetryConfig,
} from '../../apps/operator/telemetry';

function resolveEnergyLogDir(config: TelemetryConfig): string {
  const dir = config.energyLogDir || path.resolve(process.cwd(), 'logs/energy');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function watchEnergyLogs(
  rootDir: string,
  service: TelemetryService
): () => void {
  const watchers: fs.FSWatcher[] = [];
  const observed = new Set<string>();

  const ensureWatcher = (dir: string): void => {
    if (observed.has(dir)) {
      return;
    }
    observed.add(dir);
    try {
      const watcher = fs.watch(dir, (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          const target = path.join(dir, filename.toString());
          try {
            const stats = fs.statSync(target);
            if (stats.isDirectory()) {
              ensureWatcher(target);
            }
          } catch {
            // ignore files removed between event and stat
          }
        }
        service.requestImmediateCycle();
      });
      watcher.on('error', (err) => {
        console.warn('Energy telemetry watcher error', { dir, err });
      });
      watchers.push(watcher);
    } catch (err) {
      console.warn('Failed to watch energy telemetry directory', { dir, err });
    }
  };

  ensureWatcher(rootDir);
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        ensureWatcher(path.join(rootDir, entry.name));
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn('Unable to enumerate energy telemetry directories', err);
    }
  }

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

async function start(): Promise<void> {
  try {
    const baseConfig = await loadTelemetryConfig();
    const service = await createTelemetryService(baseConfig);
    const energyLogDir = resolveEnergyLogDir(baseConfig);
    const stopWatching = watchEnergyLogs(energyLogDir, service);
    const shutdown = () => {
      console.info('Stopping energy telemetry daemon');
      stopWatching();
      service.stop();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    service.requestImmediateCycle();
    await service.start();
  } catch (err) {
    console.error('Telemetry daemon failed', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void start();
}

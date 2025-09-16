import http from 'http';
import { WebSocketServer } from 'ws';
import app from './routes';
import {
  verifyTokenDecimals,
  initWallets,
  PORT,
  walletManager,
  startSweeper,
  stopSweeper,
} from './utils';
import { registerEvents } from './events';
import { handleJobCreatedEvent } from './orchestrator';
import { startTelemetryService, stopTelemetryService } from './telemetry';
import {
  startAuditAnchoringService,
  stopAuditAnchoringService,
} from './auditAnchoring';

let server: http.Server;
let wss: WebSocketServer;

async function startGateway(): Promise<void> {
  await verifyTokenDecimals();
  await initWallets();
  await startTelemetryService();
  await startAuditAnchoringService();

  server = http.createServer(app);
  wss = new WebSocketServer({ server });
  registerEvents(wss, {
    onUnassignedJobCreated: handleJobCreatedEvent,
  });
  startSweeper();

  server.listen(PORT, () => {
    console.log(`Agent gateway listening on port ${PORT}`);
    console.log('Wallets:', walletManager.list());
  });
}

startGateway().catch((err) => {
  console.error('Gateway startup failed', err);
  process.exit(1);
});

function shutdown(): void {
  console.log('Shutting down agent gateway...');
  if (wss) wss.close();
  stopSweeper();
  stopTelemetryService();
  stopAuditAnchoringService();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app };
export const getServer = () => server;

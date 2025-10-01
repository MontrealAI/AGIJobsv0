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
import { initJobPlanner, resumeActivePlans } from './jobPlanner';
import { startGrpcServer, stopGrpcServer } from './grpc';

let server: http.Server;
let wss: WebSocketServer;

async function startGateway(): Promise<void> {
  await verifyTokenDecimals();
  await initWallets();
  await initJobPlanner();
  await startTelemetryService();
  await startAuditAnchoringService();
  await startGrpcServer();

  server = http.createServer(app);
  wss = new WebSocketServer({ server });
  registerEvents(wss, {
    onUnassignedJobCreated: handleJobCreatedEvent,
  });
  try {
    await resumeActivePlans();
  } catch (err) {
    console.error('Failed to resume job plans on startup', err);
  }
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

async function shutdown(): Promise<void> {
  console.log('Shutting down agent gateway...');
  if (wss) wss.close();
  stopSweeper();
  stopTelemetryService();
  stopAuditAnchoringService();
  await stopGrpcServer();
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown().catch((err) => {
    console.error('Shutdown failed', err);
    process.exit(1);
  });
});
process.on('SIGTERM', () => {
  shutdown().catch((err) => {
    console.error('Shutdown failed', err);
    process.exit(1);
  });
});

export { app };
export const getServer = () => server;

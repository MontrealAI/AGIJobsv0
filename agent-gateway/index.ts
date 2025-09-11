import http from 'http';
import { WebSocketServer } from 'ws';
import app from './routes';
import {
  verifyTokenDecimals,
  initWallets,
  PORT,
  walletManager,
  startSweeper,
} from './utils';
import { registerEvents } from './events';

let server: http.Server;
let wss: WebSocketServer;

async function startGateway(): Promise<void> {
  try {
    await verifyTokenDecimals();
    await initWallets();

    server = http.createServer(app);
    wss = new WebSocketServer({ server });
    registerEvents(wss);
    startSweeper();

    server.listen(PORT, () => {
      console.log(`Agent gateway listening on port ${PORT}`);
      console.log('Wallets:', walletManager.list());
    });
  } catch (err) {
    console.error('Gateway startup failed', err);
    process.exit(1);
  }
}

startGateway();

export { app };
export const getServer = () => server;

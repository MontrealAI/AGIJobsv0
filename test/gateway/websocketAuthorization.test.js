const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');
const ts = require('typescript');
const { ethers } = require('ethers');
const { compileAndRequireTsModule } = require('../utils/tsLoader');

function gateway(apiKey = 'operator-key') {
  const filename = path.resolve(__dirname, '../../agent-gateway/events.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const wallet = '0x1111111111111111111111111111111111111111';
  const agents = new Map([
    ['worker-a', { wallet, url: 'https://worker.invalid/jobs', ws: null }],
    ['worker-b', { wallet, ws: null }],
  ]);
  const pendingJobs = new Map([
    ['worker-a', [{ jobId: '7' }]],
    ['worker-b', [{ jobId: '8' }]],
  ]);
  const dependencies = {
    './requestBudget': compileAndRequireTsModule(
      path.resolve(__dirname, '../../agent-gateway/requestBudget.ts')
    ),
    './utils': {
      GATEWAY_API_KEY: apiKey,
      registry: new EventEmitter(),
      agents,
      pendingJobs,
    },
    './jobMetadata': {},
    '../shared/trainingRecords': {},
    './validator': {},
    './jobPlanner': {},
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(
    (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('.')) throw new Error(`Unstubbed I/O: ${name}`);
      return require(name);
    },
    module,
    module.exports
  );
  const wss = new EventEmitter();
  module.exports.registerEvents(wss);
  function connect(key, address = '127.0.0.1') {
    const socket = new EventEmitter();
    socket.messages = [];
    socket.send = (data) => socket.messages.push(JSON.parse(data));
    socket.close = (code) => {
      socket.closeCode = code;
      socket.emit('close');
    };
    socket.terminate = () => {
      socket.terminated = true;
      socket.emit('close');
    };
    socket.request = (message) =>
      socket.emit('message', Buffer.from(JSON.stringify(message)));
    wss.emit('connection', socket, {
      headers: { 'x-api-key': key },
      socket: { remoteAddress: address },
    });
    return socket;
  }
  return {
    wallet,
    agents,
    pendingJobs,
    connect,
    registerEvents: module.exports.registerEvents,
  };
}

describe('gateway WebSocket dispatch authorization', function () {
  for (const key of [undefined, 'wrong-key']) {
    it(`rejects unauthenticated dispatch registration (${key})`, function () {
      const app = gateway();
      const socket = app.connect(key);
      socket.request({ type: 'register', id: 'worker-a', wallet: app.wallet });
      expect(socket.closeCode).to.equal(1008);
      expect(app.agents.get('worker-a').ws).to.equal(null);
      expect(socket.messages).to.deep.equal([]);
      expect(app.pendingJobs.get('worker-a')).to.have.length(1);
    });
  }

  it('does not enable operator control when the API key is unconfigured', function () {
    const app = gateway('');
    const socket = app.connect('');
    socket.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    expect(socket.closeCode).to.equal(1008);
    expect(app.pendingJobs.get('worker-a')).to.have.length(1);
  });

  it('requires an existing exact operator-configured registration', function () {
    for (const registration of [
      { id: 'unknown', wallet: '0x1111111111111111111111111111111111111111' },
      { id: 'worker-a', wallet: ethers.ZeroAddress },
    ]) {
      const app = gateway();
      const socket = app.connect('operator-key');
      socket.request({ type: 'register', ...registration });
      expect(socket.closeCode).to.equal(1008);
      expect(app.agents.size).to.equal(2);
      expect(app.agents.get('worker-a').ws).to.equal(null);
    }
  });

  it('delivers the registered queue and acknowledges only that socket binding', function () {
    const app = gateway();
    const socket = app.connect('operator-key');
    socket.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    expect(app.pendingJobs.get('worker-a')).to.have.length(1);
    socket.request({ type: 'register', id: 'worker-a', wallet: app.wallet });
    expect(socket.messages).to.deep.equal([
      { type: 'job', job: { jobId: '7' } },
    ]);
    expect(app.agents.get('worker-a').url).to.equal(
      'https://worker.invalid/jobs'
    );
    socket.request({ type: 'ack', id: 'worker-b', jobId: '8' });
    expect(app.pendingJobs.get('worker-b')).to.have.length(1);
    socket.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    expect(app.pendingJobs.get('worker-a')).to.deep.equal([]);
  });

  it('rejects acknowledgements from a replaced connection', function () {
    const app = gateway();
    const old = app.connect('operator-key');
    const current = app.connect('operator-key');
    for (const socket of [old, current]) {
      socket.request({ type: 'register', id: 'worker-a', wallet: app.wallet });
    }
    old.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    old.emit('close');
    expect(app.pendingJobs.get('worker-a')).to.have.length(1);
    expect(app.agents.get('worker-a').ws).to.equal(current);
    current.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    expect(app.pendingJobs.get('worker-a')).to.deep.equal([]);
  });

  it('ignores malformed or unrelated public-listener messages', function () {
    const app = gateway();
    const socket = app.connect();
    for (const message of [null, [], 42, { type: 'ping' }])
      socket.request(message);
    socket.emit('message', Buffer.from('{'));
    expect(socket.closeCode).to.equal(undefined);
    expect(app.agents.get('worker-a').ws).to.equal(null);
    expect(app.pendingJobs.get('worker-a')).to.have.length(1);
  });

  it('bounds active peer connections and releases capacity on close', function () {
    const app = gateway();
    const sockets = Array.from({ length: 16 }, () => app.connect());
    const denied = app.connect();
    expect(denied.closeCode).to.equal(1013);
    expect(denied.terminated).to.equal(true);
    expect(app.connect(undefined, '127.0.0.2').closeCode).to.equal(undefined);
    sockets[0].emit('close');
    expect(app.connect().closeCode).to.equal(undefined);
  });

  it('bounds repeated connections even when each connection closes', function () {
    const app = gateway();
    for (let index = 0; index < 60; index++) {
      const socket = app.connect();
      expect(socket.closeCode).to.equal(undefined);
      socket.emit('close');
    }
    expect(app.connect().closeCode).to.equal(1013);
  });

  it('limits control work before parsing or mutating a queue', function () {
    const app = gateway();
    const socket = app.connect('operator-key');
    socket.request({ type: 'register', id: 'worker-a', wallet: app.wallet });
    for (let index = 1; index < 240; index++) socket.request({ type: 'ping' });
    socket.request({ type: 'ack', id: 'worker-a', jobId: '7' });
    expect(socket.closeCode).to.equal(1013);
    expect(socket.terminated).to.equal(true);
    expect(app.pendingJobs.get('worker-a')).to.have.length(1);
    expect(app.agents.get('worker-a').ws).to.equal(null);
  });

  it('releases a real denied socket even if the peer ignores the close handshake', async function () {
    this.timeout(5000);
    const app = gateway();
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    app.registerEvents(server);
    await new Promise((resolve) => server.once('listening', resolve));
    const sockets = [];
    const connectRaw = () =>
      new Promise((resolve, reject) => {
        const socket = net.connect(server.address().port, '127.0.0.1');
        sockets.push(socket);
        socket.once('error', reject);
        socket.once('connect', () =>
          socket.write(
            `GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(
              16
            ).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`
          )
        );
        // Consume bytes but never send a WebSocket close frame in reply.
        socket.once('data', () => resolve(socket));
        socket.on('data', () => {});
      });
    try {
      for (let index = 0; index < 16; index++) await connectRaw();
      expect(server.clients.size).to.equal(16);
      const denied = await connectRaw();
      await new Promise((resolve, reject) => {
        if (denied.destroyed) return resolve();
        const timer = setTimeout(
          () => reject(new Error('Denied transport retained')),
          500
        );
        denied.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      expect(server.clients.size).to.equal(16);
    } finally {
      for (const socket of sockets) socket.destroy();
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('survives an oversized real frame and accepts a subsequent client', async function () {
    this.timeout(5000);
    const app = gateway();
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      maxPayload: 64 * 1024,
    });
    app.registerEvents(server);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `ws://127.0.0.1:${server.address().port}`;
    const sockets = [];
    const connect = async () => {
      const socket = new WebSocket(url);
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      return socket;
    };
    try {
      const oversized = await connect();
      const closed = new Promise((resolve) => oversized.once('close', resolve));
      oversized.send(Buffer.alloc(64 * 1024 + 1));
      await closed;
      const healthy = await connect();
      expect(healthy.readyState).to.equal(WebSocket.OPEN);
      expect(server.clients.size).to.equal(1);
    } finally {
      for (const socket of sockets) socket.terminate();
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

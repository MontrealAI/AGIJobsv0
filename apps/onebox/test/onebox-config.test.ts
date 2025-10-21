import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExplorerUrl,
  createIpfsGatewayUrl,
  readOneboxConfig,
  resolveOrchestratorBase,
} from '../src/lib/environment';

test('readOneboxConfig falls back to environment values', () => {
  const originalEnv = {
    orchestrator: process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL,
    token: process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN,
    explorer: process.env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE,
    ipfs: process.env.NEXT_PUBLIC_ONEBOX_IPFS_GATEWAY_BASE,
  };

  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL = 'https://demo.example/orchestrator/';
  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN = 'secret-token';
  process.env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE = 'https://scan.example/tx/';
  process.env.NEXT_PUBLIC_ONEBOX_IPFS_GATEWAY_BASE = 'https://files.example/ipfs/';

  try {
    const config = readOneboxConfig();
    assert.equal(config.orchestratorUrl, 'https://demo.example/orchestrator');
    assert.equal(config.apiToken, 'secret-token');
    assert.equal(config.explorerTxBase, 'https://scan.example/tx');
    assert.equal(config.ipfsGatewayBase, 'https://files.example/ipfs');
  } finally {
    process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL = originalEnv.orchestrator;
    process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN = originalEnv.token;
    process.env.NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE = originalEnv.explorer;
    process.env.NEXT_PUBLIC_ONEBOX_IPFS_GATEWAY_BASE = originalEnv.ipfs;
  }
});

test('createExplorerUrl constructs clean URLs', () => {
  assert.equal(
    createExplorerUrl('0x1234', 'https://scan.example/tx'),
    'https://scan.example/tx/0x1234'
  );
  assert.equal(
    createExplorerUrl('0x5678', 'https://scan.example/tx/'),
    'https://scan.example/tx/0x5678'
  );
  assert.equal(createExplorerUrl(undefined, 'https://scan.example/tx'), undefined);
});

test('createIpfsGatewayUrl uses defaults and respects overrides', () => {
  assert.equal(
    createIpfsGatewayUrl('bafy123', 'https://gateway.example/ipfs'),
    'https://gateway.example/ipfs/bafy123'
  );
  assert.equal(createIpfsGatewayUrl('bafy456', undefined), 'https://ipfs.io/ipfs/bafy456');
  assert.equal(createIpfsGatewayUrl(undefined, 'https://gateway.example/ipfs'), undefined);
});

test('resolveOrchestratorBase normalises URLs', () => {
  assert.equal(
    resolveOrchestratorBase('https://example.com/api'),
    'https://example.com/api/onebox'
  );
  assert.equal(
    resolveOrchestratorBase('https://example.com/onebox'),
    'https://example.com/onebox'
  );
  assert.equal(resolveOrchestratorBase(undefined), undefined);
});

test('readOneboxConfig returns runtime deployment metadata when available', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const runtimeWindow = {
    __ONEBOX_CONFIG__: {
      networkName: 'OmniNet',
      chainId: '9999',
      contracts: [
        { id: 'jobRegistry', label: 'Job Registry', address: '0x1234' },
        { id: 'token', label: 'Token', address: '   ' },
      ],
    },
  } as unknown;

  (globalThis as Record<string, unknown>).window = runtimeWindow;

  try {
    const config = readOneboxConfig();
    assert.equal(config.networkName, 'OmniNet');
    assert.equal(config.chainId, '9999');
    assert.deepEqual(config.contracts, [
      { id: 'jobRegistry', label: 'Job Registry', address: '0x1234' },
    ]);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  }
});

test('readOneboxConfig falls back to NEXT_PUBLIC contract descriptors', () => {
  const originalEnv = {
    agialpha: process.env.NEXT_PUBLIC_AGIALPHA_TOKEN_ADDRESS,
    registry: process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS,
    pause: process.env.NEXT_PUBLIC_SYSTEM_PAUSE_ADDRESS,
  };

  process.env.NEXT_PUBLIC_AGIALPHA_TOKEN_ADDRESS = '0xaabb';
  process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS = '0xccdd';
  process.env.NEXT_PUBLIC_SYSTEM_PAUSE_ADDRESS = '  ';

  try {
    const config = readOneboxConfig();
    assert.equal(config.contracts?.length, 2);
    assert.deepEqual(config.contracts, [
      { id: 'agialphaToken', label: 'AGI-Alpha token', address: '0xaabb' },
      { id: 'jobRegistry', label: 'Job Registry', address: '0xccdd' },
    ]);
  } finally {
    process.env.NEXT_PUBLIC_AGIALPHA_TOKEN_ADDRESS = originalEnv.agialpha;
    process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS = originalEnv.registry;
    process.env.NEXT_PUBLIC_SYSTEM_PAUSE_ADDRESS = originalEnv.pause;
  }
});

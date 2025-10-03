/// <reference types="cypress" />

Cypress.on('window:before:load', (win) => {
  try {
    win.localStorage.setItem(
      'agi-console.api-config',
      JSON.stringify({ baseUrl: 'https://orchestrator.example', token: 'demo-token' })
    );
  } catch (error) {
    console.warn('Failed to seed localStorage for tests', error);
  }

  if (!('crypto' in win)) {
    Object.defineProperty(win, 'crypto', { value: require('crypto').webcrypto });
  }

  if (!('ethereum' in win)) {
    Object.defineProperty(win, 'ethereum', {
      configurable: true,
      value: {
        request: async ({ method }: { method: string }) => {
          if (method === 'eth_requestAccounts') {
            return ['0x7E57ed0000000000000000000000000000000001'];
          }
          return [];
        },
      },
    });
  }

  if (!('PublicKeyCredential' in win)) {
    class MockPublicKeyCredential {
      rawId: Uint8Array;
      constructor() {
        this.rawId = new Uint8Array([1, 2, 3, 4]);
      }
    }
    Object.defineProperty(win, 'PublicKeyCredential', {
      configurable: true,
      value: MockPublicKeyCredential,
    });
  }

  if (!win.navigator.credentials) {
    (win.navigator as any).credentials = {};
  }
  const credentials = win.navigator.credentials as any;
  if (!credentials.create) {
    credentials.create = async () => ({ rawId: new Uint8Array([1, 2, 3, 4]) });
  }
  if (!credentials.get) {
    credentials.get = async () => ({ rawId: new Uint8Array([1, 2, 3, 4]) });
  }
});

import { useEffect, useMemo, useState } from 'react';
import { ApiConfig, useApi } from '../context/ApiContext';

type WalletStatus =
  | { state: 'idle' }
  | { state: 'connected'; address: string }
  | { state: 'error'; message: string };

type PasskeyStatus =
  | { state: 'idle' }
  | { state: 'ready'; credentialId: string }
  | { state: 'verified'; timestamp: string }
  | { state: 'error'; message: string };

interface ConnectionPanelProps {
  onConfigSaved?: (config: ApiConfig | null) => void;
}

const PASSKEY_STORAGE_KEY = 'agi-console.passkey-id';

export function ConnectionPanel({ onConfigSaved }: ConnectionPanelProps) {
  const { config, setConfig } = useApi();
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '');
  const [token, setToken] = useState(config?.token ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>({
    state: 'idle',
  });
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyStatus>({
    state: 'idle',
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl);
      setToken(config.token);
    }
  }, [config]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (stored) {
      setPasskeyStatus({ state: 'ready', credentialId: stored });
    }
  }, []);

  const canSave = useMemo(
    () => baseUrl.trim().length > 0 && token.trim().length > 0,
    [baseUrl, token]
  );

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const cleaned: ApiConfig = {
        baseUrl: baseUrl.trim(),
        token: token.trim(),
      };
      setConfig(cleaned);
      setMessage('Configuration saved.');
      onConfigSaved?.(cleaned);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to store configuration'
      );
    } finally {
      setSaving(false);
    }
  }

  async function connectWallet() {
    if (!(window as any).ethereum) {
      setWalletStatus({
        state: 'error',
        message:
          'No EIP-1193 provider detected. Install MetaMask or another wallet.',
      });
      return;
    }
    try {
      setWalletStatus({ state: 'idle' });
      const accounts = (await (window as any).ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (accounts && accounts.length > 0) {
        setWalletStatus({ state: 'connected', address: accounts[0] });
      } else {
        setWalletStatus({
          state: 'error',
          message: 'Wallet connection rejected.',
        });
      }
    } catch (error) {
      setWalletStatus({
        state: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to connect wallet.',
      });
    }
  }

  async function registerPasskey() {
    const support = await ensurePasskeySupport();
    if (!support.ok) {
      setPasskeyStatus({ state: 'error', message: support.message });
      return;
    }
    try {
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'AGI Jobs Owner Console' },
          user: {
            id: userId,
            name: 'owner',
            displayName: 'Owner',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          timeout: 60000,
          authenticatorSelection: { userVerification: 'preferred' },
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
      if (!credential) {
        throw new Error('Passkey registration cancelled.');
      }
      const rawId = bufferToBase64Url(credential.rawId);
      window.localStorage.setItem(PASSKEY_STORAGE_KEY, rawId);
      setPasskeyStatus({ state: 'ready', credentialId: rawId });
    } catch (error) {
      setPasskeyStatus({
        state: 'error',
        message: formatPasskeyError(error, 'Failed to register passkey.'),
      });
    }
  }

  async function verifyPasskey() {
    const support = await ensurePasskeySupport();
    if (!support.ok) {
      setPasskeyStatus({ state: 'error', message: support.message });
      return;
    }
    try {
      const storedId = window.localStorage.getItem(PASSKEY_STORAGE_KEY);
      if (!storedId) {
        setPasskeyStatus({
          state: 'error',
          message: 'Register a passkey first.',
        });
        return;
      }
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: base64UrlToBuffer(storedId),
              type: 'public-key',
            },
          ],
          userVerification: 'preferred',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!credential) {
        throw new Error('Passkey authentication cancelled.');
      }
      setPasskeyStatus({
        state: 'verified',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setPasskeyStatus({
        state: 'error',
        message: formatPasskeyError(error, 'Failed to verify passkey.'),
      });
    }
  }

  function clearPasskey() {
    window.localStorage.removeItem(PASSKEY_STORAGE_KEY);
    setPasskeyStatus({ state: 'idle' });
  }

  return (
    <div className="panel">
      <h2>Connection &amp; Authentication</h2>
      <form onSubmit={handleSave} className="token-input">
        <div>
          <label htmlFor="base-url">Orchestrator Base URL</label>
          <input
            id="base-url"
            type="url"
            placeholder="https://orchestrator.example.com/onebox"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="api-token">API Token</label>
          <input
            id="api-token"
            type="password"
            placeholder="Owner console API token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </div>
        <div className="actions-row">
          <button type="submit" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save Connection'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setConfig(null);
              setMessage('Configuration cleared.');
              onConfigSaved?.(null);
            }}
          >
            Clear
          </button>
        </div>
      </form>
      {message && <p className="helper-text">{message}</p>}

      <section>
        <h3>Wallet Authentication</h3>
        <div className="actions-row">
          <button type="button" onClick={connectWallet}>
            Connect Wallet
          </button>
          {walletStatus.state === 'connected' && (
            <span className="badge" title="Connected wallet">
              Connected: {shorten(walletStatus.address)}
            </span>
          )}
        </div>
        {walletStatus.state === 'error' && (
          <p className="helper-text" role="alert">
            {walletStatus.message}
          </p>
        )}
      </section>

      <section>
        <h3>Passkey Authentication</h3>
        <div className="actions-row">
          <button type="button" onClick={registerPasskey}>
            Register Passkey
          </button>
          <button type="button" className="secondary" onClick={verifyPasskey}>
            Verify
          </button>
          <button type="button" className="secondary" onClick={clearPasskey}>
            Remove
          </button>
        </div>
        {passkeyStatus.state === 'ready' && (
          <p className="helper-text">
            Passkey stored: {shorten(passkeyStatus.credentialId)}
          </p>
        )}
        {passkeyStatus.state === 'verified' && (
          <p className="helper-text">
            Last verification:{' '}
            {new Date(passkeyStatus.timestamp).toLocaleString()}
          </p>
        )}
        {passkeyStatus.state === 'error' && (
          <p className="helper-text" role="alert">
            {passkeyStatus.message}
          </p>
        )}
      </section>
    </div>
  );
}

async function ensurePasskeySupport(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ok: false, message: 'Passkeys require a browser environment.' };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      message: 'Passkeys are only available in secure (https) contexts.',
    };
  }

  if (
    !('credentials' in navigator) ||
    typeof PublicKeyCredential === 'undefined'
  ) {
    return {
      ok: false,
      message: 'WebAuthn APIs are not available in this browser.',
    };
  }

  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
    'function'
  ) {
    try {
      const available =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        return {
          ok: false,
          message: 'No platform authenticator is available on this device.',
        };
      }
    } catch (error) {
      return {
        ok: false,
        message: formatPasskeyError(error, 'Unable to check passkey support.'),
      };
    }
  }

  return { ok: true };
}

function formatPasskeyError(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Passkey request was cancelled or timed out. Please try again.';
    }
    if (error.name === 'InvalidStateError') {
      return 'Passkey is already registered or unavailable. Remove it and try again.';
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded.padEnd(
    padded.length + ((4 - (padded.length % 4)) % 4),
    '='
  );
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function shorten(value: string, visible = 6) {
  if (!value) return 'unknown';
  if (value.length <= visible * 2 + 1) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export default ConnectionPanel;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useApi } from '../context/ApiContext';

function extractInterestingMetrics(metrics: string): string[] {
  return metrics
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('#') &&
        /paymaster|gas|sponsor|aa_|balance|eth_rpc/i.test(line)
    )
    .slice(0, 12);
}

function expandExponential(value: string): string {
  const trimmed = value.trim();
  if (!/[eE]/.test(trimmed)) {
    return trimmed;
  }
  const [mantissaRaw, exponentRaw] = trimmed.toLowerCase().split('e');
  const exponent = parseInt(exponentRaw, 10);
  if (!Number.isFinite(exponent)) {
    return trimmed;
  }
  const sign = mantissaRaw.startsWith('-') ? '-' : '';
  const mantissa = mantissaRaw.replace('-', '');
  const [intPartRaw, fracPartRaw = ''] = mantissa.split('.');
  const digits = `${intPartRaw}${fracPartRaw}`.replace(/^0+/, '') || '0';
  const intLength = intPartRaw.length;
  if (exponent >= 0) {
    const boundary = intLength + exponent;
    if (fracPartRaw.length <= exponent) {
      const zeros = '0'.repeat(exponent - fracPartRaw.length);
      return `${sign}${digits}${zeros}`;
    }
    const integer = digits.slice(0, boundary);
    const fraction = digits.slice(boundary);
    return fraction.length
      ? `${sign}${integer}.${fraction}`
      : `${sign}${integer}`;
  }
  const shift = Math.abs(exponent);
  if (shift >= intLength) {
    const zeros = '0'.repeat(shift - intLength);
    return `${sign}0.${zeros}${digits}`;
  }
  const integer = digits.slice(0, intLength - shift);
  const fraction = digits.slice(intLength - shift);
  return fraction.length
    ? `${sign}${integer}.${fraction}`
    : `${sign}${integer}`;
}

function formatBalance(raw?: string): {
  label: string;
  low: boolean;
  approx: number | null;
} {
  if (!raw) {
    return { label: '—', low: false, approx: null };
  }
  const expanded = expandExponential(raw);
  const numeric = Number(expanded);
  if (!Number.isFinite(numeric)) {
    return { label: raw, low: false, approx: null };
  }
  const agia = numeric / 1e18;
  const precision = agia >= 1 ? 2 : 4;
  const display = agia
    .toFixed(precision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');
  return { label: `${display} AGIA`, low: agia < 25, approx: agia };
}

function formatTimestamp(raw?: string): string | undefined {
  if (!raw) return undefined;
  const expanded = expandExponential(raw);
  const numeric = Number(expanded);
  if (!Number.isFinite(numeric)) return undefined;
  const milliseconds = numeric > 1e12 ? numeric : numeric * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleString();
}

interface PaymasterInfo {
  address?: string;
  balanceRaw?: string;
  balanceLabel?: string;
  lowBalance?: boolean;
  updatedLabel?: string;
}

function extractPaymasterInfo(metrics: string): PaymasterInfo | null {
  const lines = metrics.split('\n');
  const info: PaymasterInfo = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!info.balanceRaw) {
      const balanceMatch = line.match(
        /paymaster[_-]?balance(?:\{[^}]*address="([^"}]+)"[^}]*\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/i
      );
      if (balanceMatch) {
        info.address = info.address ?? balanceMatch[1];
        info.balanceRaw = balanceMatch[2];
        const { label, low } = formatBalance(balanceMatch[2]);
        info.balanceLabel = label;
        info.lowBalance = low;
        continue;
      }
    }
    if (!info.address && /paymaster/i.test(line)) {
      const addr = line.match(/0x[a-fA-F0-9]{40}/);
      if (addr) {
        info.address = addr[0];
        continue;
      }
    }
    if (
      !info.updatedLabel &&
      /paymaster/i.test(line) &&
      /(timestamp|updated)/i.test(line)
    ) {
      const ts = line.match(/([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?!.*\d)/);
      info.updatedLabel = formatTimestamp(ts?.[1]) ?? undefined;
    }
  }
  if (!info.address && !info.balanceRaw) {
    return null;
  }
  return info;
}

const PAYMASTER_STORAGE_KEY = 'agi-console.paymaster-address';

export function GasPanel() {
  const { request, config } = useApi();
  const [metrics, setMetrics] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymasterAddress, setPaymasterAddress] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [paymasterInfo, setPaymasterInfo] = useState<PaymasterInfo | null>(
    null
  );

  const interestingMetrics = useMemo(
    () => extractInterestingMetrics(metrics),
    [metrics]
  );

  const refreshMetrics = useCallback(
    async (signal?: AbortSignal) => {
      if (!config) return;
      setRefreshing(true);
      setError(null);
      try {
        const response = await request<string>('metrics', { signal }, 'text');
        if (signal?.aborted) return;
        setMetrics(response);
        const info = extractPaymasterInfo(response);
        setPaymasterInfo(info);
        if (info?.address && !paymasterAddress) {
          setPaymasterAddress(info.address);
        }
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        if (signal?.aborted) return;
        setRefreshing(false);
      }
    },
    [config, paymasterAddress, request]
  );

  useEffect(() => {
    if (!config) {
      setMetrics('');
      setPaymasterInfo(null);
      return;
    }
    const controller = new AbortController();
    refreshMetrics(controller.signal);
    return () => controller.abort();
  }, [config, refreshMetrics]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(PAYMASTER_STORAGE_KEY);
      if (stored) {
        setPaymasterAddress(stored);
      }
    } catch (storageError) {
      console.warn('Failed to read stored paymaster address', storageError);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (paymasterAddress) {
        window.localStorage.setItem(PAYMASTER_STORAGE_KEY, paymasterAddress);
      } else {
        window.localStorage.removeItem(PAYMASTER_STORAGE_KEY);
      }
    } catch (storageError) {
      console.warn('Failed to persist paymaster address', storageError);
    }
  }, [paymasterAddress]);

  const topUpResult = useMemo(() => {
    try {
      if (!paymasterAddress || !ethers.isAddress(paymasterAddress)) {
        return null;
      }
      const numeric = topUpAmount.trim();
      if (!numeric) {
        return null;
      }
      const wei = ethers.parseUnits(numeric, 18);
      const link = `ethereum:${paymasterAddress}?value=${ethers.toQuantity(
        wei
      )}`;
      return {
        wei: wei.toString(),
        formatted: `${numeric} AGIA`,
        link,
      };
    } catch {
      return {
        error: 'Invalid amount. Ensure it uses dot decimal notation.',
      } as const;
    }
  }, [paymasterAddress, topUpAmount]);

  const paymasterAlert = paymasterInfo?.lowBalance
    ? 'Balance below 25 AGIA. Top up soon to keep account-abstraction sponsorship healthy.'
    : null;

  const handleRefreshClick = useCallback(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  return (
    <div className="panel">
      <h2>Gas &amp; Paymaster</h2>
      <div className="actions-row">
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={refreshing || !config}
        >
          {refreshing ? 'Refreshing…' : 'Refresh Metrics'}
        </button>
      </div>
      {error && (
        <p className="helper-text" role="alert">
          {error}
        </p>
      )}
      {interestingMetrics.length > 0 ? (
        <section>
          <h3>Recent Metrics</h3>
          <pre className="json-inline">{interestingMetrics.join('\n')}</pre>
        </section>
      ) : (
        <p className="helper-text">
          Metrics will appear once the orchestrator exposes /metrics.
        </p>
      )}

      {paymasterInfo && (
        <section>
          <h3>Paymaster Balance</h3>
          <div className="paymaster-summary">
            <div>
              <span className="paymaster-label">Address</span>
              <code>{paymasterInfo.address ?? '—'}</code>
            </div>
            <div>
              <span className="paymaster-label">Approx. Balance</span>
              <span
                className={
                  paymasterInfo.lowBalance
                    ? 'paymaster-balance low'
                    : 'paymaster-balance'
                }
              >
                {paymasterInfo.balanceLabel ?? paymasterInfo.balanceRaw ?? '—'}
              </span>
            </div>
          </div>
          {paymasterInfo.updatedLabel && (
            <p className="helper-text">
              Last metric update: {paymasterInfo.updatedLabel}
            </p>
          )}
          {paymasterAlert && (
            <p className="paymaster-alert" role="alert">
              {paymasterAlert}
            </p>
          )}
          {paymasterInfo.address &&
            paymasterInfo.address !== paymasterAddress && (
              <div className="actions-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setPaymasterAddress(paymasterInfo.address ?? '')
                  }
                >
                  Use detected address
                </button>
              </div>
            )}
        </section>
      )}

      <section>
        <h3>Top-up Helper</h3>
        <p className="helper-text">
          Generate an ethereum: link for topping up the managed paymaster.
          Amounts are interpreted as AGIA (18 decimals).
        </p>
        <div className="token-input">
          <div>
            <label htmlFor="paymaster-address">Paymaster Address</label>
            <input
              id="paymaster-address"
              placeholder="0x…"
              value={paymasterAddress}
              onChange={(event) => setPaymasterAddress(event.target.value)}
            />
            {paymasterInfo?.address && (
              <p className="helper-text">Detected: {paymasterInfo.address}</p>
            )}
          </div>
          <div>
            <label htmlFor="topup-amount">Top-up Amount (AGIA)</label>
            <input
              id="topup-amount"
              placeholder="250"
              value={topUpAmount}
              onChange={(event) => setTopUpAmount(event.target.value)}
            />
          </div>
        </div>
        {topUpResult && 'error' in topUpResult && (
          <p className="helper-text" role="alert">
            {topUpResult.error}
          </p>
        )}
        {topUpResult && 'wei' in topUpResult && (
          <div>
            <p className="helper-text">Wei value: {topUpResult.wei}</p>
            <a href={topUpResult.link} target="_blank" rel="noreferrer">
              Send {topUpResult.formatted}
            </a>
          </div>
        )}
      </section>
    </div>
  );
}

export default GasPanel;

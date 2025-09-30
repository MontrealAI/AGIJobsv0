import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useApi } from '../context/ApiContext';

function extractInterestingMetrics(metrics: string): string[] {
  return metrics
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !line.startsWith('#') &&
      /paymaster|gas|sponsor|aa_|balance|eth_rpc/i.test(line)
    )
    .slice(0, 12);
}

export function GasPanel() {
  const { request, config } = useApi();
  const [metrics, setMetrics] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymasterAddress, setPaymasterAddress] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');

  const interestingMetrics = useMemo(() => extractInterestingMetrics(metrics), [metrics]);

  useEffect(() => {
    if (!config) {
      setMetrics('');
      return;
    }
    refreshMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.baseUrl, config?.token]);

  async function refreshMetrics() {
    if (!config) return;
    setRefreshing(true);
    setError(null);
    try {
      const response = await request<string>('metrics', undefined, 'text');
      setMetrics(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setRefreshing(false);
    }
  }

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
      const link = `ethereum:${paymasterAddress}?value=${ethers.toQuantity(wei)}`;
      return {
        wei: wei.toString(),
        formatted: `${numeric} AGIA`,
        link,
      };
    } catch (error) {
      return { error: 'Invalid amount. Ensure it uses dot decimal notation.' } as const;
    }
  }, [paymasterAddress, topUpAmount]);

  return (
    <div className="panel">
      <h2>Gas &amp; Paymaster</h2>
      <div className="actions-row">
        <button type="button" onClick={refreshMetrics} disabled={refreshing || !config}>
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
        <p className="helper-text">Metrics will appear once the orchestrator exposes /metrics.</p>
      )}

      <section>
        <h3>Top-up Helper</h3>
        <p className="helper-text">
          Generate an ethereum: link for topping up the managed paymaster. Amounts are interpreted as AGIA (18 decimals).
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

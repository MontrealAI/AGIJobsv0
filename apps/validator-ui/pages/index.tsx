import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import {
  UI_VALIDATION_ABI,
  VALIDATION_REGISTRY_ABI,
  recordKey,
  decodeRecord,
  loadRecords,
  saveRecord,
  commitVote,
  checkVote,
  revealVote,
} from '../lib/commit';
import { verifyEnsSubdomain } from '../lib/ens';
import agiConfig from '../../../config/agialpha.json';
import { useError } from '../lib/error';

interface Job {
  jobId: string;
  employer: string;
  agent: string;
  reward: string;
  stake: string;
  fee: string;
  specHash: string;
  specURI?: string;
  resultURI?: string;
}

const DECIMALS = Number(
  process.env.NEXT_PUBLIC_AGIALPHA_DECIMALS ?? agiConfig.decimals
);
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545';

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<
    Record<
      string,
      {
        id: string;
        agent: string;
        uri: string;
        hash: string;
        transaction: string;
      }[]
    >
  >({});
  const [message, setMessage] = useState(
    'Connect your wallet to load saved votes.'
  );
  const [busy, setBusy] = useState(false);
  const [subdomain, setSubdomain] = useState('');
  const [proofText, setProofText] = useState('[]');
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const { setError } = useError();

  useEffect(() => {
    const controller = new AbortController();
    const rawTimeout = Number(
      process.env.NEXT_PUBLIC_FETCH_TIMEOUT_MS || '5000'
    );
    const timeout =
      Number.isFinite(rawTimeout) && rawTimeout > 0
        ? Math.min(rawTimeout, 60000)
        : 5000;
    const timer = setTimeout(() => controller.abort(), timeout);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    async function loadJobs() {
      try {
        const token = new ethers.Contract(
          process.env.NEXT_PUBLIC_AGIALPHA_ADDRESS || agiConfig.address,
          ['function decimals() view returns (uint8)'],
          provider
        );
        const chainDecimals = Number(await token.decimals());
        if (chainDecimals !== DECIMALS)
          throw new Error(
            `Configured decimals (${DECIMALS}) do not match the token (${chainDecimals}).`
          );
        const response = await fetch('/api/jobs', {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`The jobs service returned HTTP ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data))
          throw new Error('The jobs service returned an invalid job list.');
        setJobs(
          data.map((job: any) => {
            if (
              !/^(0|[1-9][0-9]*)$/.test(String(job.jobId)) ||
              !ethers.isHexString(job.specHash, 32)
            )
              throw new Error(
                'A job is missing its identifier or specification hash.'
              );
            return {
              ...job,
              specURI: job.specURI ?? job.uri,
              jobId: String(job.jobId),
              reward: ethers.formatUnits(job.rewardRaw ?? job.reward, DECIMALS),
              stake: ethers.formatUnits(job.stakeRaw ?? job.stake, DECIMALS),
              fee: ethers.formatUnits(job.feeRaw ?? job.fee, DECIMALS),
            };
          })
        );
      } catch (error: any) {
        if (!controller.signal.aborted)
          setError(
            error.message ||
              'Could not load jobs. Check the RPC and gateway configuration.'
          );
        else
          setMessage(
            'The jobs request timed out. Refresh after checking your gateway connection.'
          );
      } finally {
        clearTimeout(timer);
        provider.destroy();
      }
    }
    void loadJobs();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [setError]);

  async function loadEvidence(jobId: string) {
    try {
      const response = await fetch(
        `/api/jobs?jobId=${encodeURIComponent(jobId)}`
      );
      if (!response.ok)
        throw new Error('Could not load delivered evidence from the gateway.');
      const data = await response.json();
      if (!Array.isArray(data))
        throw new Error('Invalid delivered evidence list.');
      const field = (value: unknown) =>
        typeof value === 'string' ? value : '';
      setEvidence((current) => ({
        ...current,
        [jobId]: data.map((item, index) => ({
          id: field(item.id) || String(index),
          agent: field(item.agent),
          uri: field(item.resultUri || item.resultRef),
          hash: field(item.resultHash || item.digest),
          transaction: field(item.txHash),
        })),
      }));
    } catch (error: any) {
      setError(error.message || 'Could not load evidence.');
    }
  }

  function evidenceLink(value: string) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' || url.protocol === 'http:')
        return (
          <a href={url.href} target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        );
    } catch {}
    return value;
  }

  async function walletContext() {
    if (!(window as any).ethereum)
      throw new Error('Connect an Ethereum wallet browser extension first.');
    const moduleAddress = process.env.NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS;
    if (!moduleAddress || !ethers.isAddress(moduleAddress))
      throw new Error('The validation module address is not configured.');
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const configured = new ethers.JsonRpcProvider(RPC_URL);
    try {
      const [walletNetwork, configuredNetwork] = await Promise.all([
        provider.getNetwork(),
        configured.getNetwork(),
      ]);
      if (walletNetwork.chainId !== configuredNetwork.chainId)
        throw new Error(
          `Switch your wallet to chain ${configuredNetwork.chainId}.`
        );
    } finally {
      configured.destroy();
    }
    const validation = new ethers.Contract(
      moduleAddress,
      UI_VALIDATION_ABI,
      provider
    );
    const registryAddress = await validation.jobRegistry();
    const configuredRegistry = process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS;
    if (
      configuredRegistry &&
      configuredRegistry.toLowerCase() !== registryAddress.toLowerCase()
    )
      throw new Error(
        'The configured registry does not match the validation module.'
      );
    const registry = new ethers.Contract(
      registryAddress,
      VALIDATION_REGISTRY_ABI,
      provider
    );
    return {
      provider,
      signer,
      validation,
      registry,
      storage: window.localStorage,
    };
  }

  async function refreshRecords(
    context: Awaited<ReturnType<typeof walletContext>>
  ) {
    const address = (await context.signer.getAddress()).toLowerCase();
    const network = await context.provider.getNetwork();
    const moduleAddress = (await context.validation.getAddress()).toLowerCase();
    setRecords(
      loadRecords(window.localStorage).filter(
        (record: any) =>
          record.validator.toLowerCase() === address &&
          record.chainId === String(network.chainId) &&
          record.module.toLowerCase() === moduleAddress
      )
    );
  }

  async function act(
    action: (
      context: Awaited<ReturnType<typeof walletContext>>
    ) => Promise<void>
  ) {
    if (busy) return;
    setBusy(true);
    try {
      if (!navigator.locks)
        throw new Error(
          'Use a current browser over HTTPS or localhost with Web Locks support. This prevents conflicting votes across tabs.'
        );
      await navigator.locks.request('agi-jobs.validator.v2', async () => {
        const context = await walletContext();
        try {
          await action(context);
        } finally {
          await refreshRecords(context);
        }
      });
    } catch (error: any) {
      setError(
        error.shortMessage ||
          error.message ||
          'The operation failed. Preserve saved votes and check wallet transactions before trying anything else.'
      );
      setMessage(
        'No automatic resend will occur. Check saved votes and your wallet transaction history.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function vote(job: Job, approve: boolean) {
    await act(async (context) => {
      if (!reviewed[job.jobId])
        throw new Error(
          'Review the specification and delivered evidence before deciding.'
        );
      const proof = JSON.parse(proofText);
      if (
        !Array.isArray(proof) ||
        proof.length > 64 ||
        proof.some((item) => !ethers.isHexString(item, 32))
      )
        throw new Error(
          'Identity proof must be a JSON array of bytes32 hashes.'
        );
      const warning = await verifyEnsSubdomain(
        context.provider,
        await context.signer.getAddress()
      );
      if (warning) setError(warning);
      setMessage(
        'Saving the private vote, then requesting wallet confirmation.'
      );
      const record = await commitVote({
        ...context,
        jobId: job.jobId,
        approve,
        expectedSpecHash: job.specHash,
        subdomain: subdomain.trim(),
        proof,
      });
      setMessage(
        `Job ${record.jobId}: commitment confirmed. Return after ${new Date(
          Number(record.commitDeadline) * 1000
        ).toISOString()} and select Reveal. Keep a private backup.`
      );
    });
  }

  function download(record: any) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `private-validator-vote-${record.chainId}-${record.jobId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file?: File) {
    if (!file) return;
    await act(async (context) => {
      if (file.size > 16384) throw new Error('Recovery file is too large.');
      const record = decodeRecord(await file.text());
      const network = await context.provider.getNetwork();
      if (
        record.chainId !== String(network.chainId) ||
        record.validator.toLowerCase() !==
          (await context.signer.getAddress()).toLowerCase() ||
        record.module.toLowerCase() !==
          (await context.validation.getAddress()).toLowerCase()
      )
        throw new Error(
          'This recovery file belongs to another wallet, network or module.'
        );
      const current = context.storage.getItem(recordKey(record));
      if (current)
        throw new Error(
          'A saved record already exists. Import will not overwrite a vote or reset its transaction status.'
        );
      // Backups may predate a broadcast. Preserve uncertainty instead of allowing another send.
      record.status = 'reveal-intent';
      saveRecord(context.storage, record);
      setMessage(
        'Recovery record imported for status reconciliation. A backup cannot prove whether another transaction was sent after export, so imported records cannot broadcast again. Consult your wallet history and operator runbook.'
      );
    });
  }

  return (
    <main>
      <h1>Validator review console</h1>
      <p>
        Review authorized work and its evidence, commit your own decision, then
        reveal it during the on-chain reveal window. This console never decides
        whether work is acceptable.
      </p>
      <p>
        <strong>Keep your recovery data private.</strong> Votes and salts are
        stored unencrypted in this browser profile. Use a trusted device and
        origin; do not clear site data before revealing. Download a private
        backup. This console does not automatically submit or resend
        transactions.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void act(async (context) => {
            await refreshRecords(context);
            setMessage('Wallet connected; saved votes loaded.');
          })
        }
      >
        Connect wallet / Refresh saved votes
      </button>
      <p>
        <a href="/attest">Manage identity attestations</a>
      </p>
      <details>
        <summary>Validator identity</summary>
        <label>
          Validator subdomain label (for example, validator01)
          <input
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value)}
          />
        </label>
        <label>
          Merkle proof, if required (JSON array)
          <textarea
            value={proofText}
            onChange={(event) => setProofText(event.target.value)}
          />
        </label>
        <p>
          Use your validator identity under club.agi.eth. The contract verifies
          eligibility; ENS reverse lookup is informational.
        </p>
      </details>
      <h2>Jobs for review</h2>
      {jobs.length === 0 && (
        <p>
          No jobs loaded. Confirm that the gateway and configured chain are
          available.
        </p>
      )}
      <ul>
        {jobs.map((job) => (
          <li key={job.jobId}>
            <h3>Job {job.jobId}</h3>
            <p>
              Reward {job.reward} · stake {job.stake} · fee {job.fee}
            </p>
            <p>
              Employer: {job.employer} · Agent: {job.agent}
            </p>
            <p>
              Specification hash: <code>{job.specHash}</code>
            </p>
            {job.specURI && <p>Specification: {evidenceLink(job.specURI)}</p>}
            {job.resultURI && (
              <p>Delivered evidence: {evidenceLink(job.resultURI)}</p>
            )}
            <button
              disabled={busy}
              onClick={() => void loadEvidence(job.jobId)}
            >
              Load delivered evidence
            </button>
            {evidence[job.jobId] && (
              <div>
                <p>
                  Gateway-reported evidence: independently verify its hashes,
                  author and transaction against the chain. A reported success
                  is not an acceptance decision.
                </p>
                {evidence[job.jobId].length === 0 && (
                  <p>No delivered evidence is available from this gateway.</p>
                )}
                <ul>
                  {evidence[job.jobId].map((item) => (
                    <li key={item.id}>
                      <p>Agent: {item.agent}</p>
                      <p>Result: {evidenceLink(item.uri)}</p>
                      <p>
                        Hash: <code>{item.hash}</code>
                      </p>
                      <p>
                        Transaction: <code>{item.transaction}</code>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label>
              <input
                type="checkbox"
                checked={!!reviewed[job.jobId]}
                onChange={(event) =>
                  setReviewed({
                    ...reviewed,
                    [job.jobId]: event.target.checked,
                  })
                }
              />
              I independently reviewed the authoritative specification and
              delivered evidence.
            </label>
            <p>
              <button
                disabled={busy || !reviewed[job.jobId]}
                onClick={() => void vote(job, true)}
              >
                Commit approval
              </button>{' '}
              <button
                disabled={busy || !reviewed[job.jobId]}
                onClick={() => void vote(job, false)}
              >
                Commit rejection
              </button>
            </p>
          </li>
        ))}
      </ul>
      <h2>Saved votes and recovery</h2>
      <label>
        Import a private recovery backup
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            void importBackup(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      <ul>
        {records.map((record) => (
          <li key={recordKey(record)}>
            <p>
              Job {record.jobId} · {record.approve ? 'Approval' : 'Rejection'} ·{' '}
              {record.status}
            </p>
            <p>
              Reveal deadline:{' '}
              {new Date(Number(record.revealDeadline) * 1000).toISOString()}
            </p>
            {record.commitTx && (
              <p>
                Commit transaction: <code>{record.commitTx}</code>
              </p>
            )}
            {record.revealTx && (
              <p>
                Reveal transaction: <code>{record.revealTx}</code>
              </p>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void act(async (context) => {
                  const checked = await checkVote({
                    ...context,
                    record: { ...record },
                  });
                  setMessage(checked.message);
                })
              }
            >
              Check status
            </button>{' '}
            <button
              disabled={busy || record.status.startsWith('reveal')}
              onClick={() =>
                void act(async (context) => {
                  await revealVote({ ...context, record: { ...record } });
                  setMessage(`Job ${record.jobId}: reveal confirmed.`);
                })
              }
            >
              Reveal
            </button>{' '}
            <button disabled={busy} onClick={() => download(record)}>
              Download private backup
            </button>
          </li>
        ))}
      </ul>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </main>
  );
}

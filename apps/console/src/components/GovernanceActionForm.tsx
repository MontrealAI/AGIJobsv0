import { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useApi } from '../context/ApiContext';
import { GovernancePreviewResult } from '../types';

interface ActionDefinition {
  key: string;
  label: string;
  hint?: string;
  kind:
    | 'string'
    | 'number'
    | 'token'
    | 'percent'
    | 'json'
    | 'address'
    | 'bytes32'
    | 'none';
}

const ACTIONS: ActionDefinition[] = [
  {
    key: 'stakeManager.setFeePct',
    label: 'StakeManager · setFeePct',
    kind: 'percent',
    hint: 'Percentage (0-100).',
  },
  {
    key: 'stakeManager.setBurnPct',
    label: 'StakeManager · setBurnPct',
    kind: 'percent',
    hint: 'Percentage (0-100).',
  },
  {
    key: 'stakeManager.setValidatorRewardPct',
    label: 'StakeManager · setValidatorRewardPct',
    kind: 'percent',
    hint: 'Percentage (0-100).',
  },
  {
    key: 'stakeManager.setTreasury',
    label: 'StakeManager · setTreasury',
    kind: 'address',
    hint: '0x-prefixed address.',
  },
  {
    key: 'jobRegistry.setJobStake',
    label: 'JobRegistry · setJobStake',
    kind: 'token',
    hint: 'AGIA amount (decimals allowed).',
  },
  {
    key: 'jobRegistry.setMaxJobReward',
    label: 'JobRegistry · setMaxJobReward',
    kind: 'token',
    hint: 'Maximum reward in AGIA.',
  },
  {
    key: 'jobRegistry.setJobDurationLimit',
    label: 'JobRegistry · setJobDurationLimit',
    kind: 'number',
    hint: 'Duration in seconds or whole days (e.g. 86400).',
  },
  {
    key: 'jobRegistry.setJobParameters',
    label: 'JobRegistry · setJobParameters',
    kind: 'json',
    hint: 'JSON object with { "maxReward": "500", "jobStake": "50" } in AGIA.',
  },
  {
    key: 'jobRegistry.setValidatorRewardPct',
    label: 'JobRegistry · setValidatorRewardPct',
    kind: 'percent',
    hint: 'Percentage (0-100).',
  },
  {
    key: 'feePool.setBurnPct',
    label: 'FeePool · setBurnPct',
    kind: 'percent',
    hint: 'Percentage (0-100).',
  },
  {
    key: 'feePool.setTreasury',
    label: 'FeePool · setTreasury',
    kind: 'address',
    hint: '0x-prefixed address.',
  },
  {
    key: 'systemPause.pauseAll',
    label: 'SystemPause · pauseAll',
    kind: 'none',
    hint: 'Halts JobRegistry, StakeManager, validators and fee flow.',
  },
  {
    key: 'systemPause.unpauseAll',
    label: 'SystemPause · unpauseAll',
    kind: 'none',
    hint: 'Restores normal protocol operations.',
  },
  {
    key: 'identityRegistry.setAgentRootNode',
    label: 'IdentityRegistry · setAgentRootNode',
    kind: 'bytes32',
    hint: 'Namehash for agent.agi.eth.',
  },
  {
    key: 'identityRegistry.setClubRootNode',
    label: 'IdentityRegistry · setClubRootNode',
    kind: 'bytes32',
    hint: 'Namehash for club.agi.eth.',
  },
  {
    key: 'identityRegistry.setAgentMerkleRoot',
    label: 'IdentityRegistry · setAgentMerkleRoot',
    kind: 'bytes32',
    hint: 'Merkle root for emergency agent allowlist.',
  },
  {
    key: 'identityRegistry.setValidatorMerkleRoot',
    label: 'IdentityRegistry · setValidatorMerkleRoot',
    kind: 'bytes32',
    hint: 'Merkle root for validator allowlist.',
  },
  {
    key: 'identityRegistry.setENS',
    label: 'IdentityRegistry · setENS',
    kind: 'address',
    hint: 'ENS registry address.',
  },
  {
    key: 'identityRegistry.setNameWrapper',
    label: 'IdentityRegistry · setNameWrapper',
    kind: 'address',
    hint: 'NameWrapper contract address.',
  },
  {
    key: 'identityRegistry.addAdditionalAgent',
    label: 'IdentityRegistry · addAdditionalAgent',
    kind: 'address',
    hint: 'Whitelisted agent address.',
  },
  {
    key: 'identityRegistry.removeAdditionalAgent',
    label: 'IdentityRegistry · removeAdditionalAgent',
    kind: 'address',
    hint: 'Address to remove from agent allowlist.',
  },
  {
    key: 'identityRegistry.addAdditionalValidator',
    label: 'IdentityRegistry · addAdditionalValidator',
    kind: 'address',
    hint: 'Whitelisted validator address.',
  },
  {
    key: 'identityRegistry.removeAdditionalValidator',
    label: 'IdentityRegistry · removeAdditionalValidator',
    kind: 'address',
    hint: 'Address to remove from validator allowlist.',
  },
];

interface GovernanceActionFormProps {
  onPreview?: (preview: GovernancePreviewResult) => void;
  onAfterSubmit?: () => void;
}

export function GovernanceActionForm({
  onPreview,
  onAfterSubmit,
}: GovernanceActionFormProps) {
  const { request } = useApi();
  const [selectedKey, setSelectedKey] = useState<string>(ACTIONS[0].key);
  const [value, setValue] = useState('');
  const [traceId, setTraceId] = useState('');
  const [persist, setPersist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GovernancePreviewResult | null>(null);

  const definition = useMemo(
    () => ACTIONS.find((action) => action.key === selectedKey) ?? ACTIONS[0],
    [selectedKey]
  );

  const requiresValue = definition.kind !== 'none';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    setPreview(null);
    try {
      const parsedValue = requiresValue
        ? normaliseValue(value, definition.kind)
        : null;
      const body = {
        key: selectedKey,
        value: parsedValue,
        meta: {
          traceId: traceId || crypto.randomUUID?.() || undefined,
        },
        persist,
      };
      const result = await request<GovernancePreviewResult>(
        'governance/preview',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      setPreview(result);
      onPreview?.(result);
      onAfterSubmit?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Preview failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Governance Actions</h2>
      <form onSubmit={handleSubmit} className="token-input">
        <div>
          <label htmlFor="governance-key">Action</label>
          <select
            id="governance-key"
            value={selectedKey}
            onChange={(event) => {
              setSelectedKey(event.target.value);
              setValue('');
              setPreview(null);
            }}
          >
            {ACTIONS.map((action) => (
              <option key={action.key} value={action.key}>
                {action.label}
              </option>
            ))}
          </select>
        </div>

        {requiresValue && (
          <div>
            <label htmlFor="governance-value">Value</label>
            <textarea
              id="governance-value"
              placeholder={definition.hint}
              value={value}
              rows={definition.kind === 'json' ? 6 : 3}
              onChange={(event) => setValue(event.target.value)}
              required
            />
            <p className="helper-text">{definition.hint}</p>
          </div>
        )}

        <div>
          <label htmlFor="trace-id">Trace ID (optional)</label>
          <input
            id="trace-id"
            placeholder="auto-generated when left blank"
            value={traceId}
            onChange={(event) => setTraceId(event.target.value)}
          />
        </div>

        <label>
          <input
            type="checkbox"
            checked={persist}
            onChange={(event) => setPersist(event.target.checked)}
            style={{ width: 'auto', marginRight: '0.5rem' }}
          />
          Persist audit trail to storage/governance
        </label>

        <div className="actions-row">
          <button type="submit" disabled={loading}>
            {loading ? 'Preparing…' : 'Preview Change'}
          </button>
        </div>
      </form>

      {error && (
        <p className="helper-text" role="alert">
          {error}
        </p>
      )}

      {preview && (
        <section>
          <h3>Preview Result</h3>
          <p className="helper-text">
            Bundle digest: {preview.bundle?.digest ?? 'n/a'}
          </p>
          {preview.diff && (
            <>
              <h4>Diff</h4>
              <pre className="json-inline">
                {JSON.stringify(preview.diff, null, 2)}
              </pre>
            </>
          )}
          <h4>Call Parameters</h4>
          <pre className="json-inline">
            {JSON.stringify(preview.args, null, 2)}
          </pre>
          {preview.auditFile && (
            <p className="helper-text">Audit stored at: {preview.auditFile}</p>
          )}
        </section>
      )}
    </div>
  );
}

function normaliseValue(raw: string, kind: ActionDefinition['kind']) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  switch (kind) {
    case 'json': {
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error('Provide valid JSON payload.');
      }
    }
    case 'number': {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        throw new Error('Value must be a valid number.');
      }
      return numeric;
    }
    case 'percent': {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        throw new Error('Percentage must be numeric.');
      }
      if (numeric < 0 || numeric > 100) {
        throw new Error('Percentage must be between 0 and 100.');
      }
      return numeric;
    }
    case 'address': {
      if (!ethers.isAddress(trimmed)) {
        throw new Error('Provide a valid 0x-prefixed address.');
      }
      return ethers.getAddress(trimmed);
    }
    case 'bytes32': {
      if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
        throw new Error('Provide a 32-byte hex value (0x + 64 hex chars).');
      }
      return trimmed.toLowerCase();
    }
    case 'token': {
      try {
        // Validate numeric shape without converting to wei for downstream flexibility.
        ethers.parseUnits(trimmed, 18);
        return trimmed;
      } catch {
        throw new Error('Token amounts must be numeric (decimals allowed).');
      }
    }
    case 'string':
      return trimmed;
    default:
      return trimmed;
  }
}

export default GovernanceActionForm;

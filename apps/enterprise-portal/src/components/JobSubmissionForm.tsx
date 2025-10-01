'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { parseUnits } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { getJobRegistryContract, portalConfig } from '../lib/contracts';
import { computeSpecHash } from '../lib/crypto';

interface FormState {
  title: string;
  description: string;
  reward: string;
  deadline: string;
  ttl: string;
  skills: string;
  uri: string;
  requiresSla: boolean;
  slaUri: string;
  agentTypes: string;
}

const initialState: FormState = {
  title: '',
  description: '',
  reward: '',
  deadline: '',
  ttl: '72',
  skills: '',
  uri: '',
  requiresSla: false,
  slaUri: '',
  agentTypes: '3'
};

export const JobSubmissionForm = () => {
  const { signer, address, hasAcknowledged } = useWeb3();
  const [form, setForm] = useState<FormState>(initialState);
  const [creating, setCreating] = useState(false);
  const [txHash, setTxHash] = useState<string>();
  const [jobId, setJobId] = useState<bigint>();
  const [error, setError] = useState<string>();

  const rewardInWei = useMemo(() => {
    if (!form.reward) return 0n;
    try {
      return parseUnits(form.reward, 18);
    } catch (err) {
      return 0n;
    }
  }, [form.reward]);

  const specPayload = useMemo(() => {
    const skills = form.skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);
    return {
      title: form.title,
      description: form.description,
      requiredSkills: skills,
      ttlHours: Number(form.ttl) || 0,
      metadataURI: form.uri,
      sla: form.requiresSla ? { uri: form.slaUri } : undefined
    };
  }, [form]);

  const specHash = useMemo(() => computeSpecHash(specPayload), [specPayload]);

  const handleChange = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.type === 'checkbox' ? (event.target as HTMLInputElement).checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleAgentTypesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setForm((current) => ({ ...current, agentTypes: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signer || !address) {
      setError('Connect a verified wallet before submitting a job.');
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      const contract = getJobRegistryContract(signer);
      const now = Math.floor(Date.now() / 1000);
      const ttlSeconds = Number(form.ttl) * 3600;
      const deadlineSeconds = form.deadline
        ? Math.floor(new Date(form.deadline).getTime() / 1000)
        : now + ttlSeconds;
      const uri = form.uri || `ipfs://job-spec/${specHash}`;
      const agentTypes = Number(form.agentTypes);
      const method = hasAcknowledged ? 'createJobWithAgentTypes' : 'acknowledgeAndCreateJobWithAgentTypes';
      const registryAddress = await contract.getAddress();
      const tx = await contract[method](rewardInWei, BigInt(deadlineSeconds), agentTypes, specHash, uri);
      setTxHash(tx.hash);
      const receipt = await tx.wait?.();
      const jobLog = receipt?.logs?.find(
        (log: any) => typeof log.address === 'string' && log.address.toLowerCase() === registryAddress.toLowerCase()
      );
      if (jobLog) {
        try {
          const parsed = contract.interface.parseLog(jobLog);
          if (parsed?.name === 'JobCreated' && parsed.args?.jobId) {
            setJobId(BigInt(parsed.args.jobId));
          }
        } catch (parseError) {
          console.error('Failed to parse JobCreated log', parseError);
        }
      }
      setForm(initialState);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Verified Job Submission</h2>
          <p>Guide your organisation through compliant job creation with structured metadata and SLA attachments.</p>
        </div>
        <div className="tag purple">On-chain</div>
      </div>
      <form onSubmit={handleSubmit} className="grid">
        <div className="grid two-column">
          <div>
            <label className="stat-label" htmlFor="job-title">
              Job Title
            </label>
            <input
              id="job-title"
              placeholder="e.g. Enterprise Risk Report Automation"
              value={form.title}
              onChange={handleChange('title')}
              required
            />
          </div>
          <div>
            <label className="stat-label" htmlFor="reward">
              Reward ({portalConfig.stakingTokenSymbol})
            </label>
            <input
              id="reward"
              placeholder="1000"
              type="number"
              min="0"
              step="0.01"
              value={form.reward}
              onChange={handleChange('reward')}
              required
            />
          </div>
        </div>
        <div>
          <label className="stat-label" htmlFor="description">
            Job Description
          </label>
          <textarea
            id="description"
            placeholder="Outline deliverables, compliance requirements, and datasets provided to the agent."
            rows={5}
            value={form.description}
            onChange={handleChange('description')}
            required
          />
        </div>
        <div className="grid two-column">
          <div>
            <label className="stat-label" htmlFor="skills">
              Required Agent Skills (comma separated)
            </label>
            <input
              id="skills"
              placeholder="Solidity, ZK proofs, reporting"
              value={form.skills}
              onChange={handleChange('skills')}
            />
          </div>
          <div>
            <label className="stat-label" htmlFor="ttl">
              Validation TTL (hours)
            </label>
            <input
              id="ttl"
              type="number"
              min="12"
              step="1"
              value={form.ttl}
              onChange={handleChange('ttl')}
              required
            />
          </div>
        </div>
        <div className="grid two-column">
          <div>
            <label className="stat-label" htmlFor="deadline">
              Deadline (optional)
            </label>
            <input id="deadline" type="datetime-local" value={form.deadline} onChange={handleChange('deadline')} />
          </div>
          <div>
            <label className="stat-label" htmlFor="uri">
              Specification URI
            </label>
            <input id="uri" placeholder="ipfs://…" value={form.uri} onChange={handleChange('uri')} />
          </div>
        </div>
        <div className="grid two-column">
          <div>
            <label className="stat-label" htmlFor="agent-types">
              Agent Archetype Mask
            </label>
            <select id="agent-types" value={form.agentTypes} onChange={handleAgentTypesChange}>
              <option value="1">Generalist</option>
              <option value="3">Generalist + Specialist</option>
              <option value="7">Multi-role (Research + Engineer + Validator)</option>
            </select>
          </div>
          <div>
            <label className="stat-label" htmlFor="sla">
              Attach SLA document
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                id="sla"
                type="checkbox"
                checked={form.requiresSla}
                onChange={handleChange('requiresSla')}
              />
              <span className="small">Require agent signature on SLA prior to assignment</span>
            </div>
            {form.requiresSla && (
              <input
                style={{ marginTop: '0.75rem' }}
                placeholder="ipfs://sla"
                value={form.slaUri}
                onChange={handleChange('slaUri')}
                required
              />
            )}
          </div>
        </div>
        <div className="code-block">
          <strong>Spec Hash:</strong> {specHash}
        </div>
        <div className="inline-actions">
          <button className="primary" type="submit" disabled={creating || !signer}>
            {creating ? 'Submitting job…' : 'Register job on-chain'}
          </button>
          {txHash && (
            <a className="tag purple" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </div>
        {jobId && <div className="alert success">Job #{jobId.toString()} created successfully.</div>}
        {error && <div className="alert error">{error}</div>}
      </form>
    </section>
  );
};

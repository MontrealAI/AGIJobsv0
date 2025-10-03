'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { portalConfig } from '../lib/contracts';
import { defaultJobDraft, JobDraft, useJobCreation } from '../hooks/useJobCreation';

export const JobSubmissionForm = () => {
  const [form, setForm] = useState<JobDraft>(defaultJobDraft);
  const [txHash, setTxHash] = useState<string>();
  const [jobId, setJobId] = useState<bigint>();
  const { creating, error, submit, resetError, specHash } = useJobCreation(form);

  const handleChange = (field: keyof JobDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.type === 'checkbox' ? (event.target as HTMLInputElement).checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (error) {
      resetError();
    }
  };

  const handleAgentTypesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setForm((current) => ({ ...current, agentTypes: event.target.value }));
    if (error) {
      resetError();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await submit();
      setTxHash(result.txHash);
      setJobId(result.jobId);
      setForm(defaultJobDraft);
    } catch (err) {
      console.error(err);
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
          <button className="primary" type="submit" disabled={creating}>
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

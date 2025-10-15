'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './GovernanceCockpit.module.css';
import {
  DEFAULT_ACTORS,
  DEFAULT_MILESTONES,
  GovernanceActor,
  GovernanceJobBlueprint,
  GovernanceMilestone,
  GovernanceScenarioContext,
  MilestoneStatus,
  buildMilestonePrompt,
  cloneActors,
  isWalletReady,
  sanitiseActors,
  sanitiseJobBlueprint,
  sanitiseMilestoneState,
} from '../lib/governanceScenario';

const ACTORS_KEY = 'onebox:solving-governance:actors';
const JOB_KEY = 'onebox:solving-governance:job';
const NETWORK_KEY = 'onebox:solving-governance:network';
const SPONSOR_KEY = 'onebox:solving-governance:sponsor';
const OWNER_KEY = 'onebox:solving-governance:owner';
const VALIDATORS_KEY = 'onebox:solving-governance:validators';
const CONNECTIONS_KEY = 'onebox:solving-governance:connections';
const MILESTONES_KEY = 'onebox:solving-governance:milestones';

const readStorage = (key: string): unknown => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn(`Failed to parse storage for ${key}`, error);
    return undefined;
  }
};

const writeStorage = (key: string, value: unknown) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to persist storage for ${key}`, error);
  }
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const uniqueStrings = (values: string[]) => Array.from(new Set(values));

const DEFAULT_STATUS: Record<string, MilestoneStatus> = DEFAULT_MILESTONES.reduce(
  (acc, milestone, index) => {
    acc[milestone.id] = index === 0 ? 'active' : 'todo';
    return acc;
  },
  {} as Record<string, MilestoneStatus>
);

const statusLabels: Record<MilestoneStatus, string> = {
  todo: 'To do',
  active: 'In progress',
  done: 'Completed',
};

const fallbackActorByRole = (role: GovernanceActor['role']): GovernanceActor => {
  const fallback = DEFAULT_ACTORS.find((actor) => actor.role === role);
  if (fallback) {
    return { ...fallback };
  }
  throw new Error(`No default actor defined for role ${role}`);
};

export function GovernanceCockpit() {
  const [actors, setActors] = useState<GovernanceActor[]>(() =>
    sanitiseActors(readStorage(ACTORS_KEY))
  );
  const [job, setJob] = useState<GovernanceJobBlueprint>(() =>
    sanitiseJobBlueprint(readStorage(JOB_KEY))
  );
  const [network, setNetwork] = useState<string>(() => {
    const stored = readStorage(NETWORK_KEY);
    if (typeof stored === 'string' && stored.trim().length > 0) {
      return stored;
    }
    return 'mainnet';
  });
  const [sponsorId, setSponsorId] = useState<string>(() => {
    const stored = readStorage(SPONSOR_KEY);
    if (typeof stored === 'string' && stored.trim().length > 0) {
      return stored;
    }
    const fallback = DEFAULT_ACTORS.find((actor) => actor.role === 'nation');
    return fallback ? fallback.id : '';
  });
  const [ownerId, setOwnerId] = useState<string>(() => {
    const stored = readStorage(OWNER_KEY);
    if (typeof stored === 'string' && stored.trim().length > 0) {
      return stored;
    }
    const fallback = DEFAULT_ACTORS.find((actor) => actor.role === 'owner');
    return fallback ? fallback.id : '';
  });
  const [selectedValidatorIds, setSelectedValidatorIds] = useState<string[]>(() => {
    const stored = readStorage(VALIDATORS_KEY);
    if (Array.isArray(stored)) {
      const filtered = stored.filter((value): value is string => typeof value === 'string');
      if (filtered.length > 0) {
        return uniqueStrings(filtered);
      }
    }
    const defaults = DEFAULT_ACTORS.filter((actor) => actor.role === 'validator')
      .slice(0, 2)
      .map((actor) => actor.id);
    return defaults.length > 0 ? defaults : [];
  });
  const [connectedIds, setConnectedIds] = useState<string[]>(() => {
    const stored = readStorage(CONNECTIONS_KEY);
    if (Array.isArray(stored)) {
      return uniqueStrings(
        stored.filter((value): value is string => typeof value === 'string')
      );
    }
    return [];
  });
  const [milestoneState, setMilestoneState] = useState<Record<string, MilestoneStatus>>(
    () => {
      const stored = sanitiseMilestoneState(readStorage(MILESTONES_KEY));
      const merged = { ...DEFAULT_STATUS, ...stored };
      return merged;
    }
  );
  const [copiedMilestoneId, setCopiedMilestoneId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    writeStorage(ACTORS_KEY, actors);
  }, [actors]);

  useEffect(() => {
    writeStorage(JOB_KEY, job);
  }, [job]);

  useEffect(() => {
    writeStorage(NETWORK_KEY, network);
  }, [network]);

  useEffect(() => {
    writeStorage(SPONSOR_KEY, sponsorId);
  }, [sponsorId]);

  useEffect(() => {
    writeStorage(OWNER_KEY, ownerId);
  }, [ownerId]);

  useEffect(() => {
    writeStorage(VALIDATORS_KEY, selectedValidatorIds);
  }, [selectedValidatorIds]);

  useEffect(() => {
    writeStorage(CONNECTIONS_KEY, connectedIds);
  }, [connectedIds]);

  useEffect(() => {
    writeStorage(MILESTONES_KEY, milestoneState);
  }, [milestoneState]);

  const nations = useMemo(
    () => actors.filter((actor) => actor.role === 'nation'),
    [actors]
  );
  const validators = useMemo(
    () => actors.filter((actor) => actor.role === 'validator'),
    [actors]
  );
  const owners = useMemo(
    () => actors.filter((actor) => actor.role === 'owner'),
    [actors]
  );

  useEffect(() => {
    if (!nations.some((actor) => actor.id === sponsorId)) {
      const fallback = nations[0];
      if (fallback) {
        setSponsorId(fallback.id);
      }
    }
  }, [nations, sponsorId]);

  useEffect(() => {
    if (!owners.some((actor) => actor.id === ownerId)) {
      const fallback = owners[0];
      if (fallback) {
        setOwnerId(fallback.id);
      }
    }
  }, [owners, ownerId]);

  useEffect(() => {
    setSelectedValidatorIds((current) => {
      if (validators.length === 0) {
        return [];
      }
      const allowed = new Set(validators.map((actor) => actor.id));
      const filtered = current.filter((id) => allowed.has(id));
      if (filtered.length === 0) {
        const fallback = validators.slice(0, 2).map((actor) => actor.id);
        return fallback.length > 0 ? fallback : [validators[0].id];
      }
      if (arraysEqual(filtered, current)) {
        return current;
      }
      return filtered;
    });
  }, [validators]);

  useEffect(() => {
    setConnectedIds((current) => {
      const allowed = new Set(actors.map((actor) => actor.id));
      const filtered = current.filter((id) => allowed.has(id));
      if (arraysEqual(filtered, current)) {
        return current;
      }
      return filtered;
    });
  }, [actors]);

  useEffect(() => {
    if (!copiedMilestoneId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopiedMilestoneId(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [copiedMilestoneId]);

  const sponsor = useMemo(() => {
    const selected = nations.find((actor) => actor.id === sponsorId);
    return selected ? { ...selected } : cloneActors(nations)[0] ?? fallbackActorByRole('nation');
  }, [nations, sponsorId]);

  const owner = useMemo(() => {
    const selected = owners.find((actor) => actor.id === ownerId);
    return selected ? { ...selected } : cloneActors(owners)[0] ?? fallbackActorByRole('owner');
  }, [owners, ownerId]);

  const selectedValidators = useMemo(() => {
    const pool = new Map(validators.map((actor) => [actor.id, actor] as const));
    const resolved = selectedValidatorIds
      .map((id) => pool.get(id))
      .filter((actor): actor is GovernanceActor => Boolean(actor));
    if (resolved.length > 0) {
      return resolved.map((actor) => ({ ...actor }));
    }
    if (validators.length > 0) {
      return cloneActors(validators.slice(0, 1));
    }
    return [fallbackActorByRole('validator')];
  }, [selectedValidatorIds, validators]);

  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds]);

  const scenarioContext = useMemo<GovernanceScenarioContext>(
    () => ({
      network,
      sponsor,
      validators: selectedValidators,
      owner,
      job,
      connectedActorIds: connectedSet,
    }),
    [network, sponsor, selectedValidators, owner, job, connectedSet]
  );

  const walletStats = useMemo(() => {
    const relevant = [sponsor, owner, ...selectedValidators];
    const ready = relevant.filter((actor) => isWalletReady(actor)).length;
    return {
      ready,
      total: relevant.length,
    };
  }, [owner, sponsor, selectedValidators]);

  const connectedCount = connectedSet.size;

  const updateJob = useCallback(<K extends keyof GovernanceJobBlueprint>(
    key: K,
    value: GovernanceJobBlueprint[K]
  ) => {
    setJob((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const handleWalletChange = useCallback((id: string, wallet: string) => {
    setActors((current) =>
      current.map((actor) =>
        actor.id === id
          ? {
              ...actor,
              wallet,
            }
          : actor
      )
    );
  }, []);

  const handleToggleConnected = useCallback((id: string) => {
    setConnectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }, []);

  const handleToggleValidator = useCallback((id: string) => {
    setSelectedValidatorIds((current) => {
      if (current.includes(id)) {
        if (current.length <= 1) {
          return current;
        }
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }, []);

  const handleStatusChange = useCallback(
    (id: string, status: MilestoneStatus) => {
      setMilestoneState((current) => {
        if (current[id] === status) {
          return current;
        }
        return {
          ...current,
          [id]: status,
        };
      });
    },
    []
  );

  const handleCopyPrompt = useCallback(
    async (milestone: GovernanceMilestone, prompt: string) => {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(prompt);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = prompt;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setCopiedMilestoneId(milestone.id);
        setCopyError(null);
      } catch (error) {
        console.error('Failed to copy prompt', error);
        setCopyError('Clipboard copy failed. Select and copy manually.');
      }
    },
    []
  );

  const renderActorControls = (actor: GovernanceActor) => {
    const walletStatus = isWalletReady(actor)
      ? 'ready'
      : actor.wallet && actor.wallet.trim().length > 0
      ? 'warning'
      : 'pending';
    const statusLabel =
      walletStatus === 'ready'
        ? 'Wallet verified'
        : walletStatus === 'warning'
        ? 'Wallet format needs review'
        : 'Wallet pending';
    const connected = connectedSet.has(actor.id);

    return (
      <div key={actor.id} className={styles.actorCard}>
        <div className={styles.actorHeader}>
          <span className={styles.actorIcon}>{actor.icon}</span>
          <div className={styles.actorHeading}>
            <span className={styles.actorRole}>{actor.role.toUpperCase()}</span>
            <h3 className={styles.actorName}>{actor.name}</h3>
          </div>
        </div>
        <p className={styles.actorMission}>{actor.mission}</p>
        <label className={styles.actorWalletLabel} htmlFor={`wallet-${actor.id}`}>
          Wallet address
        </label>
        <input
          id={`wallet-${actor.id}`}
          value={actor.wallet ?? ''}
          placeholder="0x..."
          onChange={(event) => handleWalletChange(actor.id, event.target.value)}
          className={styles.actorWalletInput}
          autoComplete="off"
        />
        <div
          className={`${styles.actorStatus} ${
            walletStatus === 'ready'
              ? styles.actorStatusReady
              : walletStatus === 'warning'
              ? styles.actorStatusWarning
              : styles.actorStatusPending
          }`}
        >
          {statusLabel}
        </div>
        <div className={styles.actorActions}>
          {actor.role === 'nation' ? (
            <label className={styles.selectionRow}>
              <input
                type="radio"
                name="sponsor"
                value={actor.id}
                checked={sponsorId === actor.id}
                onChange={() => setSponsorId(actor.id)}
              />
              Lead proposal sponsor
            </label>
          ) : null}
          {actor.role === 'validator' ? (
            <label className={styles.selectionRow}>
              <input
                type="checkbox"
                value={actor.id}
                checked={selectedValidatorIds.includes(actor.id)}
                onChange={() => handleToggleValidator(actor.id)}
              />
              Participate in this vote
            </label>
          ) : null}
          {actor.role === 'owner' && owners.length > 1 ? (
            <label className={styles.selectionRow}>
              <input
                type="radio"
                name="owner"
                value={actor.id}
                checked={ownerId === actor.id}
                onChange={() => setOwnerId(actor.id)}
              />
              Assign owner authority
            </label>
          ) : null}
          <button
            type="button"
            className={connected ? styles.connectedButton : styles.connectButton}
            onClick={() => handleToggleConnected(actor.id)}
          >
            {connected ? 'Mark as disconnected' : 'Mark as connected'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.cockpit}>
      <header className={styles.header}>
        <h1 className={styles.title}>Solving α‑AGI Governance cockpit</h1>
        <p className={styles.subtitle}>
          Configure multinational actors, craft the unstoppable governance proposal, and orchestrate commit-reveal execution using existing AGI Jobs tooling. Everything here is wallet-first and owner-governed.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Mission overview</h2>
          <p className={styles.sectionSubtitle}>
            Select the execution network and ensure every participant wallet is funded, verified, and ready to act.
          </p>
        </div>
        <label className={styles.inputLabel} htmlFor="network-input">
          Execution network
        </label>
        <input
          id="network-input"
          list="governance-networks"
          value={network}
          onChange={(event) => setNetwork(event.target.value)}
          className={styles.networkInput}
          placeholder="mainnet"
        />
        <datalist id="governance-networks">
          <option value="mainnet" />
          <option value="sepolia" />
          <option value="local" />
        </datalist>
        <div className={styles.metricsRow}>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>
              {walletStats.ready}/{walletStats.total}
            </span>
            <span className={styles.metricLabel}>Wallets ready</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{connectedCount}</span>
            <span className={styles.metricLabel}>Actors connected</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{selectedValidators.length}</span>
            <span className={styles.metricLabel}>Validators voting</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Actor readiness</h2>
          <p className={styles.sectionSubtitle}>
            Provide each actor’s controlling wallet. Toggle “connected” once the wallet is funded and authenticated with the validator CLI or owner console.
          </p>
        </div>
        <div className={styles.actorGrid}>{actors.map(renderActorControls)}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Proposal blueprint</h2>
          <p className={styles.sectionSubtitle}>
            These parameters feed directly into the mission prompt. They map to existing JobRegistry, StakeManager, ValidationModule, and DisputeModule controls.
          </p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.inputGroup} htmlFor="job-title">
            <span className={styles.inputLabel}>Job title</span>
            <input
              id="job-title"
              value={job.title}
              onChange={(event) => updateJob('title', event.target.value)}
              className={styles.inputControl}
            />
            <span className={styles.inputDescription}>
              Appears in JobRegistry events and validator receipts.
            </span>
          </label>
          <label className={styles.inputGroup} htmlFor="job-policy">
            <span className={styles.inputLabel}>Policy focus</span>
            <textarea
              id="job-policy"
              rows={4}
              value={job.policyFocus}
              onChange={(event) => updateJob('policyFocus', event.target.value)}
              className={styles.textareaControl}
            />
            <span className={styles.inputDescription}>
              High-level problem statement used for simulation + validator context packets.
            </span>
          </label>
          <label className={styles.inputGroup} htmlFor="job-reward">
            <span className={styles.inputLabel}>Reward (AGIALPHA)</span>
            <input
              id="job-reward"
              value={job.rewardAgialpha}
              onChange={(event) => updateJob('rewardAgialpha', event.target.value)}
              className={styles.inputControl}
            />
            <span className={styles.inputDescription}>
              Amount escrowed by the sponsor when calling JobRegistry.createJob.
            </span>
          </label>
          <label className={styles.inputGroup} htmlFor="job-stake">
            <span className={styles.inputLabel}>Validator stake (AGIALPHA)</span>
            <input
              id="job-stake"
              value={job.validatorStakeAgialpha}
              onChange={(event) => updateJob('validatorStakeAgialpha', event.target.value)}
              className={styles.inputControl}
            />
            <span className={styles.inputDescription}>
              Mirrors StakeManager.setStakeAmount requirements for validator role.
            </span>
          </label>
          <label className={styles.inputGroup} htmlFor="job-quorum">
            <span className={styles.inputLabel}>Approval threshold (%)</span>
            <input
              id="job-quorum"
              type="number"
              min={1}
              max={100}
              value={job.quorumPercent}
              onChange={(event) =>
                updateJob('quorumPercent', Number(event.target.value) || 0)
              }
              className={styles.inputControl}
            />
            <span className={styles.inputDescription}>
              Used with ValidationModule.setApprovalThreshold.
            </span>
          </label>
          <label className={styles.inputGroup} htmlFor="job-commit">
            <span className={styles.inputLabel}>Commit window (hours)</span>
            <input
              id="job-commit"
              type="number"
              min={1}
              value={job.commitWindowHours}
              onChange={(event) =>
                updateJob('commitWindowHours', Number(event.target.value) || 0)
              }
              className={styles.inputControl}
            />
          </label>
          <label className={styles.inputGroup} htmlFor="job-reveal">
            <span className={styles.inputLabel}>Reveal window (hours)</span>
            <input
              id="job-reveal"
              type="number"
              min={1}
              value={job.revealWindowHours}
              onChange={(event) =>
                updateJob('revealWindowHours', Number(event.target.value) || 0)
              }
              className={styles.inputControl}
            />
          </label>
          <label className={styles.inputGroup} htmlFor="job-dispute">
            <span className={styles.inputLabel}>Dispute window (hours)</span>
            <input
              id="job-dispute"
              type="number"
              min={1}
              value={job.disputeWindowHours}
              onChange={(event) =>
                updateJob('disputeWindowHours', Number(event.target.value) || 0)
              }
              className={styles.inputControl}
            />
          </label>
          <label className={styles.inputGroup} htmlFor="job-reference">
            <span className={styles.inputLabel}>Specification URI</span>
            <input
              id="job-reference"
              value={job.referenceUri ?? ''}
              onChange={(event) => updateJob('referenceUri', event.target.value)}
              className={styles.inputControl}
              placeholder="ipfs://..."
            />
            <span className={styles.inputDescription}>
              CID or HTTPS link referenced in the mission prompt + receipts.
            </span>
          </label>
        </div>
      </section>

      {copyError ? (
        <div className={styles.feedback} role="alert">
          {copyError}
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Mission timeline</h2>
          <p className={styles.sectionSubtitle}>
            Track every stage from proposal authoring to owner sign-off. Copy prompts directly into the Onebox chat or your own orchestrator runbooks.
          </p>
        </div>
        <ol className={styles.milestoneList}>
          {DEFAULT_MILESTONES.map((milestone) => {
            const status = milestoneState[milestone.id] ?? DEFAULT_STATUS[milestone.id] ?? 'todo';
            const prompt = buildMilestonePrompt(milestone, scenarioContext);
            const copied = copiedMilestoneId === milestone.id;
            const ownerCalls =
              typeof milestone.ownerCalls === 'function'
                ? milestone.ownerCalls(scenarioContext)
                : milestone.ownerCalls ?? [];
            return (
              <li key={milestone.id} className={styles.milestoneCard}>
                <div className={styles.milestoneHeader}>
                  <div>
                    <h3 className={styles.milestoneTitle}>{milestone.title}</h3>
                    <p className={styles.milestoneSummary}>{milestone.summary}</p>
                  </div>
                  <div className={styles.milestoneControls}>
                    <span
                      className={`${styles.statusBadge} ${
                        status === 'done'
                          ? styles.statusDone
                          : status === 'active'
                          ? styles.statusActive
                          : styles.statusTodo
                      }`}
                    >
                      {statusLabels[status]}
                    </span>
                    <label className={styles.statusSelectLabel}>
                      <span className={styles.statusSelectText}>Update status</span>
                      <select
                        value={status}
                        onChange={(event) =>
                          handleStatusChange(
                            milestone.id,
                            event.target.value as MilestoneStatus
                          )
                        }
                        className={styles.statusSelect}
                      >
                        <option value="todo">To do</option>
                        <option value="active">In progress</option>
                        <option value="done">Completed</option>
                      </select>
                    </label>
                  </div>
                </div>
                <ul className={styles.criteriaList}>
                  {milestone.successCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
                <label className={styles.promptLabel} htmlFor={`prompt-${milestone.id}`}>
                  Mission prompt
                </label>
                <textarea
                  id={`prompt-${milestone.id}`}
                  value={prompt}
                  readOnly
                  className={styles.promptTextarea}
                  rows={Math.min(16, Math.max(6, prompt.split('\n').length + 2))}
                />
                <div className={styles.promptActions}>
                  <button
                    type="button"
                    className={copied ? styles.copyButtonCopied : styles.copyButton}
                    onClick={() => handleCopyPrompt(milestone, prompt)}
                  >
                    {copied ? 'Copied' : 'Copy prompt'}
                  </button>
                  {ownerCalls.length > 0 ? (
                    <div className={styles.ownerCallouts}>
                      <span className={styles.ownerCalloutsTitle}>Owner command deck</span>
                      <ul className={styles.ownerCalloutsList}>
                        {ownerCalls.map((call) => (
                          <li key={call}>
                            <code className={styles.ownerCommand}>{call}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

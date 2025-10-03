'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { portalConfig } from '../lib/contracts';
import { defaultJobDraft, JobDraft, useJobCreation } from '../hooks/useJobCreation';
import { useLocalization } from '../context/LocalizationContext';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface Step {
  id: string;
  field?: keyof JobDraft;
  promptKey: string;
  placeholderKey?: string;
  type: 'text' | 'textarea' | 'number' | 'datetime' | 'optionalText' | 'sla' | 'select';
  optional?: boolean;
}

const steps: Step[] = [
  {
    id: 'task',
    field: 'title',
    promptKey: 'employer.prompt.task',
    placeholderKey: 'employer.placeholder.task',
    type: 'text'
  },
  {
    id: 'description',
    field: 'description',
    promptKey: 'employer.prompt.description',
    placeholderKey: 'employer.placeholder.description',
    type: 'textarea'
  },
  {
    id: 'skills',
    field: 'skills',
    promptKey: 'employer.prompt.skills',
    placeholderKey: 'employer.placeholder.skills',
    type: 'text',
    optional: true
  },
  {
    id: 'reward',
    field: 'reward',
    promptKey: 'employer.prompt.reward',
    placeholderKey: 'employer.placeholder.reward',
    type: 'number'
  },
  {
    id: 'deadline',
    field: 'deadline',
    promptKey: 'employer.prompt.deadline',
    type: 'datetime',
    optional: true
  },
  {
    id: 'ttl',
    field: 'ttl',
    promptKey: 'employer.prompt.ttl',
    placeholderKey: 'employer.placeholder.ttl',
    type: 'number'
  },
  {
    id: 'attachments',
    field: 'uri',
    promptKey: 'employer.prompt.attachments',
    placeholderKey: 'employer.placeholder.attachments',
    type: 'optionalText',
    optional: true
  },
  {
    id: 'sla',
    promptKey: 'employer.prompt.sla',
    type: 'sla'
  },
  {
    id: 'agents',
    field: 'agentTypes',
    promptKey: 'employer.prompt.agents',
    type: 'select'
  }
];

const formatValue = (step: Step, value: string, t: ReturnType<typeof useLocalization>['t']) => {
  if (!value) return step.optional ? t('employer.summary.none') : '';
  if (step.id === 'reward') {
    return `${value} ${portalConfig.stakingTokenSymbol}`;
  }
  if (step.id === 'deadline') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  if (step.id === 'ttl') {
    return `${value}h`;
  }
  return value;
};

export const ConversationalJobComposer = () => {
  const { t } = useLocalization();
  const [draft, setDraft] = useState<JobDraft>(defaultJobDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [slaRequired, setSlaRequired] = useState<boolean>(defaultJobDraft.requiresSla);
  const [slaUri, setSlaUri] = useState<string>(defaultJobDraft.slaUri);
  const [txHash, setTxHash] = useState<string>();
  const [jobId, setJobId] = useState<bigint>();
  const [completed, setCompleted] = useState(false);

  const { creating, error, submit, resetError, specHash } = useJobCreation({
    ...draft,
    requiresSla: slaRequired,
    slaUri
  });

  const initialMessages = useMemo<ChatMessage[]>(
    () => [
      { role: 'assistant', content: t('employer.greeting') },
      { role: 'assistant', content: t(steps[0].promptKey) }
    ],
    [t]
  );

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (!currentStep) return;
    if (currentStep.type !== 'sla') {
      const existing = draft[currentStep.field as keyof JobDraft];
      setInputValue(typeof existing === 'string' ? existing : '');
    } else {
      setInputValue('');
    }
  }, [currentStep, draft]);

  const advanceStep = (nextDraft: Partial<JobDraft>, userMessage: string) => {
    setDraft((prev) => ({ ...prev, ...nextDraft }));
    setMessages((prev) => {
      const log = [...prev];
      if (userMessage) {
        log.push({ role: 'user', content: userMessage });
      }
      const next = steps[stepIndex + 1];
      if (next) {
        log.push({ role: 'assistant', content: t(next.promptKey) });
      }
      return log;
    });
    setStepIndex((index) => index + 1);
    if (error) {
      resetError();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentStep) return;

    if (currentStep.type === 'sla') {
      const summary = slaRequired
        ? `${t('employer.summary.sla')}: ${slaUri || t('employer.summary.none')}`
        : t('employer.summary.sla') + ': ' + t('employer.summary.none');
      advanceStep(
        {
          requiresSla: slaRequired,
          slaUri
        },
        summary
      );
      setCompleted(false);
      return;
    }

    const value = inputValue.trim();
    if (!value && !currentStep.optional) {
      return;
    }

    const displayValue = formatValue(currentStep, value, t);
    advanceStep(
      {
        [currentStep.field as keyof JobDraft]: value
      },
      displayValue
    );
    setCompleted(false);
  };

  const isSummary = stepIndex >= steps.length;

  const summaryRows = useMemo(() => {
    return [
      { label: t('employer.summary.reward'), value: formatValue(steps[3], draft.reward, t) },
      { label: t('employer.summary.deadline'), value: formatValue(steps[4], draft.deadline, t) },
      { label: t('employer.summary.skills'), value: draft.skills || t('employer.summary.none') },
      { label: t('employer.summary.attachments'), value: draft.uri || t('employer.summary.none') },
      {
        label: t('employer.summary.sla'),
        value: slaRequired ? slaUri || t('employer.summary.none') : t('employer.summary.none')
      },
      {
        label: t('employer.summary.ttl'),
        value: formatValue(steps[5], draft.ttl, t)
      },
      {
        label: t('employer.summary.agents'),
        value: agentTypeLabels[draft.agentTypes] ?? draft.agentTypes
      }
    ];
  }, [draft, slaRequired, slaUri, t]);

  const handleConfirm = async () => {
    try {
      const result = await submit();
      setTxHash(result.txHash);
      setJobId(result.jobId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('employer.status.success')
        }
      ]);
      setCompleted(true);
    } catch (err) {
      console.error(err);
    }
  };

  const agentTypeLabels = useMemo(
    () => ({
      '1': t('employer.agentLabels.1'),
      '3': t('employer.agentLabels.3'),
      '7': t('employer.agentLabels.7')
    }),
    [t]
  );

  const handleAgentTypeChange = (value: string) => {
    setDraft((prev) => ({ ...prev, agentTypes: value }));
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: agentTypeLabels[value] ?? value },
      { role: 'assistant', content: t('employer.summary.title') }
    ]);
    setStepIndex(steps.length);
    setCompleted(false);
    if (error) {
      resetError();
    }
  };

  const handleReset = () => {
    setDraft(defaultJobDraft);
    setSlaRequired(defaultJobDraft.requiresSla);
    setSlaUri(defaultJobDraft.slaUri);
    setTxHash(undefined);
    setJobId(undefined);
    setStepIndex(0);
    setMessages(initialMessages);
    setCompleted(false);
    setInputValue('');
    if (error) {
      resetError();
    }
  };

  const renderInput = () => {
    if (!currentStep) return null;

    switch (currentStep.type) {
      case 'text':
      case 'optionalText':
        return (
          <input
            aria-label={t(currentStep.promptKey)}
            value={inputValue}
            placeholder={currentStep.placeholderKey ? t(currentStep.placeholderKey) : ''}
            onChange={(event) => setInputValue(event.target.value)}
          />
        );
      case 'textarea':
        return (
          <textarea
            aria-label={t(currentStep.promptKey)}
            value={inputValue}
            rows={4}
            placeholder={currentStep.placeholderKey ? t(currentStep.placeholderKey) : ''}
            onChange={(event) => setInputValue(event.target.value)}
          />
        );
      case 'number':
        return (
          <input
            aria-label={t(currentStep.promptKey)}
            type="number"
            value={inputValue}
            placeholder={currentStep.placeholderKey ? t(currentStep.placeholderKey) : ''}
            onChange={(event) => setInputValue(event.target.value)}
          />
        );
      case 'datetime':
        return (
          <input
            aria-label={t(currentStep.promptKey)}
            type="datetime-local"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
        );
      case 'sla':
        return (
          <div className="sla-step">
            <div className="toggle-group" role="group" aria-label={t(currentStep.promptKey)}>
              <button
                type="button"
                className={slaRequired ? 'toggle active' : 'toggle'}
                onClick={() => setSlaRequired(true)}
              >
                {t('common.yes')}
              </button>
              <button
                type="button"
                className={!slaRequired ? 'toggle active' : 'toggle'}
                onClick={() => setSlaRequired(false)}
              >
                {t('common.no')}
              </button>
            </div>
            {slaRequired && (
              <input
                aria-label={t('employer.summary.sla')}
                placeholder="ipfs://sla"
                value={slaUri}
                onChange={(event) => setSlaUri(event.target.value)}
              />
            )}
          </div>
        );
        case 'select':
          return (
            <select
              aria-label={t(currentStep.promptKey)}
              value={draft.agentTypes}
              onChange={(event) => handleAgentTypeChange(event.target.value)}
            >
              <option value="1">{agentTypeLabels['1']}</option>
              <option value="3">{agentTypeLabels['3']}</option>
              <option value="7">{agentTypeLabels['7']}</option>
            </select>
          );
      default:
        return null;
    }
  };

  return (
    <section className="chat-composer">
      <header className="card-title">
        <div>
          <h2>{t('app.title')}</h2>
          <p>{t('app.subtitle')}</p>
        </div>
      </header>
      <div className="chat-thread" role="log" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={`chat-bubble ${message.role}`}>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      {!isSummary && (
        <form onSubmit={handleSubmit} className="chat-input">
          {renderInput()}
          {currentStep.type !== 'select' && (
            <div className="chat-actions">
              <button className="primary" type="submit" disabled={creating}>
                {creating ? t('employer.status.submitting') : t('employer.actions.continue')}
              </button>
            </div>
          )}
        </form>
      )}
      {isSummary && (
        <div className="chat-summary">
          <h3>{t('employer.summary.title')}</h3>
          <ul>
            {summaryRows.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </li>
            ))}
          </ul>
          {specHash && (
            <div className="code-block">
              <strong>Spec hash:</strong> {specHash}
            </div>
          )}
          <div className="chat-actions">
            <button className="primary" onClick={handleConfirm} disabled={creating}>
              {creating ? t('employer.status.submitting') : t('employer.actions.confirm')}
            </button>
          </div>
          {txHash && (
            <a
              className="tag purple"
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('employer.status.tx')}
            </a>
          )}
          {jobId && <div className="alert success">#{jobId.toString()}</div>}
          {error && <div className="alert error">{error}</div>}
          {completed && (
            <div className="chat-actions">
              <button className="secondary" type="button" onClick={handleReset}>
                {t('employer.actions.restart')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

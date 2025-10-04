'use client';

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { parseUnits } from 'ethers';
import { useTranslation } from '../context/LanguageContext';
import { useWeb3 } from '../context/Web3Context';
import { getJobRegistryContract, portalConfig } from '../lib/contracts';
import { computeSpecHash } from '../lib/crypto';

const dateLocales: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

type StepId =
  | 'title'
  | 'description'
  | 'attachments'
  | 'reward'
  | 'deadline'
  | 'skills'
  | 'ttl'
  | 'agentTypes'
  | 'sla'
  | 'slaUri'
  | 'summary'
  | 'complete';

interface FormState {
  title: string;
  description: string;
  reward: string;
  deadline: string;
  ttl: string;
  skills: string;
  agentTypes: string;
  requiresSla: boolean;
  slaUri: string;
  uri: string;
}

interface AttachmentInfo {
  id: string;
  file: File;
}

interface AttachmentSnapshot {
  name: string;
  size: number;
}

type AssistantTextMessage = {
  id: string;
  role: 'assistant';
  kind: 'text';
  key: string;
  params?: Record<string, string | number>;
};

type AssistantSummaryMessage = {
  id: string;
  role: 'assistant';
  kind: 'summary';
  form: FormState;
  attachments: AttachmentSnapshot[];
  specHash: string;
};

type AssistantStatusMessage = {
  id: string;
  role: 'assistant';
  kind: 'status';
  key: string;
  params?: Record<string, string | number>;
  txHash?: string;
};

type UserTextMessage = {
  id: string;
  role: 'user';
  kind: 'text';
  text: string;
};

type UserAttachmentsMessage = {
  id: string;
  role: 'user';
  kind: 'attachments';
  attachments: AttachmentSnapshot[];
  uri?: string;
};

type ChatMessage =
  | AssistantTextMessage
  | AssistantSummaryMessage
  | AssistantStatusMessage
  | UserTextMessage
  | UserAttachmentsMessage;

const initialForm: FormState = {
  title: '',
  description: '',
  reward: '',
  deadline: '',
  ttl: '72',
  skills: '',
  agentTypes: '3',
  requiresSla: false,
  slaUri: '',
  uri: '',
};

const stepSequence: StepId[] = [
  'title',
  'description',
  'attachments',
  'reward',
  'deadline',
  'skills',
  'ttl',
  'agentTypes',
  'sla',
  'slaUri',
];

const promptKeyByStep: Partial<Record<StepId, string>> = {
  title: 'chat.prompts.title',
  description: 'chat.prompts.description',
  attachments: 'chat.prompts.attachments',
  reward: 'chat.prompts.reward',
  deadline: 'chat.prompts.deadline',
  skills: 'chat.prompts.skills',
  ttl: 'chat.prompts.ttl',
  agentTypes: 'chat.prompts.agentTypes',
  sla: 'chat.prompts.sla',
  slaUri: 'chat.prompts.slaUri',
};

const agentTypeOptions = [
  { value: '1', labelKey: 'chat.agentTypeOptions.generalist' },
  { value: '3', labelKey: 'chat.agentTypeOptions.hybrid' },
  { value: '7', labelKey: 'chat.agentTypeOptions.multi' },
];

const getNextStepId = (current: StepId, form: FormState): StepId => {
  if (current === 'sla') {
    return form.requiresSla ? 'slaUri' : 'summary';
  }
  if (current === 'slaUri') {
    return 'summary';
  }
  const index = stepSequence.indexOf(current);
  const next = stepSequence[index + 1];
  return next ?? 'summary';
};

const toAttachmentSnapshot = (items: AttachmentInfo[]): AttachmentSnapshot[] =>
  items.map((item) => ({ name: item.file.name, size: item.file.size }));

const buildSpecPayload = (form: FormState, attachments: AttachmentInfo[]) => {
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
    attachments: attachments.map((item) => item.file.name),
    sla: form.requiresSla
      ? {
          uri: form.slaUri,
          requiresSignature: true,
        }
      : undefined,
  };
};

const initialMessages: ChatMessage[] = [
  { id: 'assistant-0', role: 'assistant', kind: 'text', key: 'chat.intro' },
  {
    id: 'assistant-1',
    role: 'assistant',
    kind: 'text',
    key: 'chat.prompts.title',
  },
];

export const ConversationalJobCreator = () => {
  const { t, locale } = useTranslation();
  const { signer, address, hasAcknowledged, refreshAcknowledgement } =
    useWeb3();
  const [form, setForm] = useState<FormState>(initialForm);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [currentStep, setCurrentStep] = useState<StepId>('title');
  const [txHash, setTxHash] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const messageCounter = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pushMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
  );

  const pushAssistantText = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const id = `assistant-${messageCounter.current++}`;
      pushMessage({ id, role: 'assistant', kind: 'text', key, params });
    },
    [pushMessage]
  );

  const pushUserText = useCallback(
    (text: string) => {
      const id = `user-${messageCounter.current++}`;
      pushMessage({ id, role: 'user', kind: 'text', text });
    },
    [pushMessage]
  );

  const pushUserAttachments = useCallback(
    (snapshot: AttachmentSnapshot[], uri?: string) => {
      const id = `user-${messageCounter.current++}`;
      pushMessage({
        id,
        role: 'user',
        kind: 'attachments',
        attachments: snapshot,
        uri,
      });
    },
    [pushMessage]
  );

  const pushSummary = useCallback(
    (snapshotForm: FormState, snapshotAttachments: AttachmentInfo[]) => {
      const summaryForm: FormState = { ...snapshotForm };
      const specPayload = buildSpecPayload(summaryForm, snapshotAttachments);
      const specHash = computeSpecHash(specPayload);
      const summaryMessage: AssistantSummaryMessage = {
        id: `assistant-${messageCounter.current++}`,
        role: 'assistant',
        kind: 'summary',
        form: summaryForm,
        attachments: toAttachmentSnapshot(snapshotAttachments),
        specHash,
      };
      pushMessage(summaryMessage);
    },
    [pushMessage]
  );

  const pushStatus = useCallback(
    (key: string, params?: Record<string, string | number>, hash?: string) => {
      const id = `assistant-${messageCounter.current++}`;
      pushMessage({
        id,
        role: 'assistant',
        kind: 'status',
        key,
        params,
        txHash: hash,
      });
    },
    [pushMessage]
  );

  const resetConversation = useCallback(() => {
    setForm(initialForm);
    setAttachments([]);
    setMessages(initialMessages);
    setCurrentStep('title');
    setTxHash(undefined);
    setSubmitting(false);
    setError(undefined);
    messageCounter.current = 2;
  }, []);

  const goToStep = useCallback(
    (next: StepId) => {
      setCurrentStep(next);
      const promptKey = promptKeyByStep[next];
      if (promptKey) {
        pushAssistantText(promptKey);
      }
    },
    [pushAssistantText]
  );

  const routeNext = useCallback(
    (
      current: StepId,
      nextFormState: FormState,
      nextAttachments: AttachmentInfo[]
    ) => {
      const nextStep = getNextStepId(current, nextFormState);
      if (nextStep === 'summary') {
        setCurrentStep('summary');
        setTxHash(undefined);
        setError(undefined);
        pushSummary(nextFormState, nextAttachments);
      } else {
        goToStep(nextStep);
      }
    },
    [goToStep, pushSummary]
  );

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, title: event.target.value }));
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, description: event.target.value }));
  };

  const handleRewardChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, reward: event.target.value }));
  };

  const handleDeadlineChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, deadline: event.target.value }));
  };

  const handleSkillsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, skills: event.target.value }));
  };

  const handleTtlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, ttl: event.target.value }));
  };

  const handleAgentTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, agentTypes: event.target.value }));
  };

  const handleSlaUriChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, slaUri: event.target.value }));
  };

  const handleReferenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, uri: event.target.value }));
  };

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
      })),
    ]);
    event.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleTitleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.title.trim();
    if (!trimmed) return;
    const nextForm = { ...form, title: trimmed };
    setForm(nextForm);
    pushUserText(trimmed);
    routeNext('title', nextForm, attachments);
  };

  const handleDescriptionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.description.trim();
    if (!trimmed) return;
    const nextForm = { ...form, description: trimmed };
    setForm(nextForm);
    pushUserText(trimmed);
    routeNext('description', nextForm, attachments);
  };

  const handleAttachmentsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUri = form.uri.trim();
    const nextForm = { ...form, uri: trimmedUri };
    setForm(nextForm);
    pushUserAttachments(
      toAttachmentSnapshot(attachments),
      trimmedUri || undefined
    );
    routeNext('attachments', nextForm, attachments);
  };

  const handleRewardSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = form.reward.trim();
    if (!value) return;
    const nextForm = { ...form, reward: value };
    setForm(nextForm);
    const symbol = portalConfig.stakingTokenSymbol ?? '';
    const display = symbol ? `${value} ${symbol}` : value;
    pushUserText(display);
    routeNext('reward', nextForm, attachments);
  };

  const handleDeadlineSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = form.deadline.trim();
    const nextForm = { ...form, deadline: raw };
    setForm(nextForm);
    let display = raw;
    if (!raw) {
      display = t('chat.summary.deadlineUnset');
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        const localeId = dateLocales[locale] ?? locale;
        display = new Intl.DateTimeFormat(localeId, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(parsed);
      }
    }
    pushUserText(display);
    routeNext('deadline', nextForm, attachments);
  };

  const handleSkillsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)
      .join(', ');
    const nextForm = { ...form, skills: trimmed };
    setForm(nextForm);
    pushUserText(trimmed || t('chat.summary.skillsUnset'));
    routeNext('skills', nextForm, attachments);
  };

  const handleTtlSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(form.ttl);
    const safeValue =
      Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 72;
    const nextForm = { ...form, ttl: String(safeValue) };
    setForm(nextForm);
    pushUserText(t('chat.summary.ttlHours', { hours: safeValue }));
    routeNext('ttl', nextForm, attachments);
  };

  const handleAgentTypeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextForm = { ...form };
    setForm(nextForm);
    const selected =
      agentTypeOptions.find((option) => option.value === nextForm.agentTypes) ??
      agentTypeOptions[0];
    pushUserText(t(selected.labelKey));
    routeNext('agentTypes', nextForm, attachments);
  };

  const handleSlaChoice = (requires: boolean) => {
    const nextForm = {
      ...form,
      requiresSla: requires,
      slaUri: requires ? form.slaUri : '',
    };
    setForm(nextForm);
    pushUserText(
      requires ? t('chat.summary.slaRequired') : t('chat.boolean.no')
    );
    routeNext('sla', nextForm, attachments);
  };

  const handleSlaUriSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = form.slaUri.trim();
    if (!trimmed) return;
    const nextForm = { ...form, slaUri: trimmed };
    setForm(nextForm);
    pushUserText(trimmed);
    routeNext('slaUri', nextForm, attachments);
  };

  const rewardInWei = useMemo(() => {
    if (!form.reward) return 0n;
    try {
      return parseUnits(form.reward, 18);
    } catch (err) {
      console.warn('Unable to parse reward', err);
      return 0n;
    }
  }, [form.reward]);

  const submitJob = useCallback(async () => {
    if (!signer || !address) {
      pushAssistantText('chat.acknowledgements.walletMissing');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    pushStatus('chat.status.submitting');
    try {
      const contract = getJobRegistryContract(signer);
      const now = Math.floor(Date.now() / 1000);
      const ttlSeconds = Number(form.ttl) * 3600;
      const safeTtl =
        Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 72 * 3600;
      const deadlineSeconds = form.deadline
        ? Math.floor(new Date(form.deadline).getTime() / 1000)
        : now + safeTtl;
      const payload = buildSpecPayload(form, attachments);
      const specHash = computeSpecHash(payload);
      const fallbackUri = `ipfs://job-spec/${specHash.replace(/^0x/, '')}`;
      const uri = form.uri || fallbackUri;
      const agentTypes = Number(form.agentTypes) || 1;
      const method = hasAcknowledged
        ? 'createJobWithAgentTypes'
        : 'acknowledgeAndCreateJobWithAgentTypes';
      const tx = await contract[method](
        rewardInWei,
        BigInt(deadlineSeconds),
        agentTypes,
        specHash,
        uri
      );
      setTxHash(tx.hash);
      pushStatus('chat.status.success', undefined, tx.hash);
      await tx.wait?.();
      await refreshAcknowledgement().catch(() => undefined);
      setCurrentStep('complete');
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      setError(message);
      pushStatus('chat.status.error', { message });
    } finally {
      setSubmitting(false);
    }
  }, [
    address,
    attachments,
    form,
    hasAcknowledged,
    pushStatus,
    pushAssistantText,
    refreshAcknowledgement,
    rewardInWei,
    signer,
    submitting,
  ]);

  const explorerBase = useMemo(() => {
    switch (portalConfig.chainId) {
      case 1:
        return 'https://etherscan.io';
      case 10:
        return 'https://optimistic.etherscan.io';
      case 137:
        return 'https://polygonscan.com';
      case 11155111:
        return 'https://sepolia.etherscan.io';
      default:
        return undefined;
    }
  }, []);

  const renderMessageContent = (message: ChatMessage): ReactNode => {
    switch (message.kind) {
      case 'text': {
        if ('key' in message) {
          return <p>{t(message.key, message.params)}</p>;
        }
        if ('text' in message) {
          return <p>{message.text}</p>;
        }
        return null;
      }
      case 'status':
        return (
          <div className="chat-status">
            <p>{t(message.key, message.params)}</p>
            {message.txHash && explorerBase && (
              <a
                className="chat-link"
                href={`${explorerBase}/tx/${message.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {message.txHash.slice(0, 10)}…
              </a>
            )}
          </div>
        );
      case 'attachments':
        return (
          <div>
            <p>
              {message.attachments.length > 0
                ? t('chat.attachments.added')
                : t('chat.attachments.none')}
            </p>
            {message.attachments.length > 0 && (
              <ul className="chat-list">
                {message.attachments.map((file) => (
                  <li key={file.name}>
                    {file.name}{' '}
                    <span className="chat-meta">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {message.uri && <p className="chat-meta">{message.uri}</p>}
          </div>
        );
      case 'summary': {
        const summary = message;
        const skills = summary.form.skills
          ? summary.form.skills
              .split(',')
              .map((skill) => skill.trim())
              .filter(Boolean)
          : [];
        const deadlineText = summary.form.deadline
          ? (() => {
              const parsed = new Date(summary.form.deadline);
              if (!Number.isNaN(parsed.getTime())) {
                const localeId = dateLocales[locale] ?? locale;
                return new Intl.DateTimeFormat(localeId, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(parsed);
              }
              return summary.form.deadline;
            })()
          : t('chat.summary.deadlineUnset');
        return (
          <div>
          <h3 className="chat-heading">{t('chat.summary.heading')}</h3>
          <dl className="chat-summary">
            <div>
              <dt>{t('chat.summary.reward')}</dt>
              <dd>
                {summary.form.reward}
                {portalConfig.stakingTokenSymbol
                  ? ` ${portalConfig.stakingTokenSymbol}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>{t('chat.summary.deadline')}</dt>
              <dd>{deadlineText}</dd>
            </div>
            <div>
              <dt>{t('chat.summary.ttl')}</dt>
              <dd>
                {t('chat.summary.ttlHours', { hours: summary.form.ttl || '0' })}
              </dd>
            </div>
            <div>
              <dt>{t('chat.summary.skills')}</dt>
              <dd>
                {skills.length > 0
                  ? skills.join(', ')
                  : t('chat.summary.skillsUnset')}
              </dd>
            </div>
            <div>
              <dt>{t('chat.summary.agentTypes')}</dt>
              <dd>
                {(() => {
                  const option =
                    agentTypeOptions.find(
                      (entry) => entry.value === summary.form.agentTypes
                    ) ?? agentTypeOptions[0];
                  return t(option.labelKey);
                })()}
              </dd>
            </div>
            <div>
              <dt>{t('chat.summary.attachments')}</dt>
              <dd>
                {summary.attachments.length > 0 ? (
                  <ul className="chat-list">
                    {summary.attachments.map((file) => (
                      <li key={file.name}>
                        {file.name}{' '}
                        <span className="chat-meta">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  t('chat.summary.attachmentsUnset')
                )}
              </dd>
            </div>
            <div>
              <dt>{t('chat.summary.reference')}</dt>
              <dd>{summary.form.uri || t('chat.summary.referenceUnset')}</dd>
            </div>
            <div>
              <dt>{t('chat.summary.sla')}</dt>
              <dd>
                {summary.form.requiresSla
                  ? t('chat.summary.slaRequired')
                  : t('chat.boolean.no')}
              </dd>
            </div>
            {summary.form.requiresSla && (
              <div>
                <dt>{t('chat.summary.slaLink')}</dt>
                <dd>{summary.form.slaUri}</dd>
              </div>
            )}
            <div>
              <dt>{t('chat.summary.specHash')}</dt>
              <dd className="chat-mono">{summary.specHash}</dd>
            </div>
          </dl>
        </div>
        );
      }
      default: {
        const exhaustiveCheck: never = message;
        return null;
      }
    }
  };

  const renderMessage = (message: ChatMessage) => (
    <div
      key={message.id}
      className={`chat-bubble chat-bubble--${message.role}`}
      role="listitem"
    >
      {renderMessageContent(message)}
    </div>
  );

  const renderInputArea = () => {
    if (currentStep === 'summary') {
      return (
        <div className="chat-actions">
          <button
            type="button"
            className="primary"
            onClick={submitJob}
            disabled={submitting}
          >
            {submitting
              ? t('chat.status.submitting')
              : t('chat.summary.confirm')}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => goToStep('title')}
          >
            {t('chat.summary.edit')}
          </button>
          <button type="button" className="ghost" onClick={resetConversation}>
            {t('chat.summary.startOver')}
          </button>
          {!signer && (
            <p className="chat-helper warning">
              {t('chat.acknowledgements.walletMissing')}
            </p>
          )}
          {signer && !hasAcknowledged && (
            <p className="chat-helper">{t('chat.acknowledgements.needsAck')}</p>
          )}
          {error && (
            <p className="chat-helper warning">
              {t('chat.status.error', { message: error })}
            </p>
          )}
        </div>
      );
    }

    if (currentStep === 'complete') {
      return (
        <div className="chat-actions">
          <button type="button" className="primary" onClick={resetConversation}>
            {t('chat.summary.startOver')}
          </button>
          {txHash && explorerBase && (
            <a
              className="chat-link"
              href={`${explorerBase}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash.slice(0, 10)}…
            </a>
          )}
        </div>
      );
    }

    switch (currentStep) {
      case 'title':
        return (
          <form className="chat-form" onSubmit={handleTitleSubmit}>
            <label htmlFor="chat-title" className="chat-label">
              {t('chat.prompts.title')}
            </label>
            <input
              id="chat-title"
              value={form.title}
              onChange={handleTitleChange}
              placeholder={t('chat.placeholders.title')}
              required
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'description':
        return (
          <form className="chat-form" onSubmit={handleDescriptionSubmit}>
            <label htmlFor="chat-description" className="chat-label">
              {t('chat.prompts.description')}
            </label>
            <textarea
              id="chat-description"
              value={form.description}
              onChange={handleDescriptionChange}
              placeholder={t('chat.placeholders.description')}
              rows={4}
              required
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'attachments':
        return (
          <form className="chat-form" onSubmit={handleAttachmentsSubmit}>
            <label htmlFor="chat-files" className="chat-label">
              {t('chat.attachments.upload')}
            </label>
            <input
              id="chat-files"
              type="file"
              multiple
              onChange={handleFilesChange}
            />
            {attachments.length > 0 && (
              <ul className="chat-list">
                {attachments.map((item) => (
                  <li key={item.id}>
                    {item.file.name}{' '}
                    <span className="chat-meta">
                      ({(item.file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleRemoveAttachment(item.id)}
                    >
                      {t('chat.attachments.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="chat-reference" className="chat-label">
              {t('chat.summary.reference')}
            </label>
            <input
              id="chat-reference"
              value={form.uri}
              onChange={handleReferenceChange}
              placeholder={t('chat.placeholders.referenceLink')}
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'reward':
        return (
          <form className="chat-form" onSubmit={handleRewardSubmit}>
            <label htmlFor="chat-reward" className="chat-label">
              {t('chat.prompts.reward')}
            </label>
            <input
              id="chat-reward"
              type="number"
              min="0"
              step="0.01"
              value={form.reward}
              onChange={handleRewardChange}
              placeholder={t('chat.placeholders.reward')}
              required
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'deadline':
        return (
          <form className="chat-form" onSubmit={handleDeadlineSubmit}>
            <label htmlFor="chat-deadline" className="chat-label">
              {t('chat.prompts.deadline')}
            </label>
            <input
              id="chat-deadline"
              type="datetime-local"
              value={form.deadline}
              onChange={handleDeadlineChange}
              placeholder={t('chat.placeholders.deadline')}
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'skills':
        return (
          <form className="chat-form" onSubmit={handleSkillsSubmit}>
            <label htmlFor="chat-skills" className="chat-label">
              {t('chat.prompts.skills')}
            </label>
            <input
              id="chat-skills"
              value={form.skills}
              onChange={handleSkillsChange}
              placeholder={t('chat.placeholders.skills')}
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'ttl':
        return (
          <form className="chat-form" onSubmit={handleTtlSubmit}>
            <label htmlFor="chat-ttl" className="chat-label">
              {t('chat.prompts.ttl')}
            </label>
            <input
              id="chat-ttl"
              type="number"
              min="1"
              value={form.ttl}
              onChange={handleTtlChange}
              placeholder={t('chat.placeholders.ttl')}
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'agentTypes':
        return (
          <form className="chat-form" onSubmit={handleAgentTypeSubmit}>
            <label htmlFor="chat-agent-types" className="chat-label">
              {t('chat.prompts.agentTypes')}
            </label>
            <select
              id="chat-agent-types"
              value={form.agentTypes}
              onChange={handleAgentTypeChange}
            >
              {agentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      case 'sla':
        return (
          <div className="chat-actions">
            <button
              type="button"
              className="primary"
              onClick={() => handleSlaChoice(true)}
            >
              {t('chat.boolean.yes')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => handleSlaChoice(false)}
            >
              {t('chat.boolean.no')}
            </button>
          </div>
        );
      case 'slaUri':
        return (
          <form className="chat-form" onSubmit={handleSlaUriSubmit}>
            <label htmlFor="chat-sla" className="chat-label">
              {t('chat.prompts.slaUri')}
            </label>
            <input
              id="chat-sla"
              value={form.slaUri}
              onChange={handleSlaUriChange}
              placeholder={t('chat.placeholders.slaUri')}
              required
            />
            <button type="submit" className="primary">
              {t('chat.actions.next')}
            </button>
          </form>
        );
      default:
        return null;
    }
  };

  return (
    <section className="chat-panel" aria-live="polite">
      <div className="card-title">
        <div>
          <h2>{t('chat.title')}</h2>
          <p>{t('chat.intro')}</p>
        </div>
        <div className="tag purple">UX</div>
      </div>
      <div className="chat-window" role="list">
        {messages.map(renderMessage)}
        <div ref={endRef} />
      </div>
      {renderInputArea()}
    </section>
  );
};

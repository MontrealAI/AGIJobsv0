import { isDemoMode } from '../lib/api.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ChatMessage,
  type MintResult,
  type IpfsUploadResult,
  streamLLMCompletion,
  uploadToIpfs,
  mintCultureArtifact,
  createDerivativeJob,
  type DerivativeJobResult,
  type ServiceCapabilities,
  fetchArtifacts,
  type Artifact,
} from '../lib/api.js';

const personas = [
  'Friendly research partner',
  'Curriculum designer',
  'Community storyteller',
];

const artifactKinds = [
  { value: 'book', label: 'Field guide' },
  { value: 'prompt', label: 'Prompt pack' },
  { value: 'dataset', label: 'Learning dataset' },
  { value: 'curriculum', label: 'Micro-course' },
];

interface TimelineItem {
  readonly label: string;
  readonly status: 'pending' | 'active' | 'complete';
  readonly description: string;
}

export function CreateBook({
  capabilities,
  revision = 0,
}: {
  capabilities?: ServiceCapabilities;
  revision?: number;
}) {
  const [title, setTitle] = useState('A field guide to shared knowledge');
  const [parentId, setParentId] = useState(1);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    fetchArtifacts()
      .then((items) => {
        setArtifacts(items);
        setParentId((current) =>
          current === 0 || items.some((item) => item.id === current)
            ? current
            : (items[0]?.id ?? 0),
        );
      })
      .catch(() => setArtifacts([]));
  }, [revision]);
  const allowed = (
    operation: 'generation' | 'upload' | 'mint' | 'derivativeJobs',
  ) => isDemoMode() || !!capabilities?.[operation];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(
    'Draft a playbook that explains how culture registries empower on-chain creatives.',
  );
  const [persona, setPersona] = useState(personas[0]);
  const [kind, setKind] = useState(artifactKinds[0].value);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [uploadResult, setUploadResult] = useState<IpfsUploadResult | null>(
    null,
  );
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [jobResult, setJobResult] = useState<DerivativeJobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeline: TimelineItem[] = useMemo(() => {
    return [
      {
        label: 'Shape the outline',
        description:
          'Ask for the structure you need. The assistant replies in everyday language while streaming ideas.',
        status:
          messages.length === 0
            ? 'active'
            : isStreaming
              ? 'active'
              : 'complete',
      },
      {
        label: 'Store the draft',
        description:
          'Preview a content fingerprint, or use a configured storage provider. IPFS persistence requires a pinning policy.',
        status: uploadResult ? 'complete' : draft ? 'active' : 'pending',
      },
      {
        label: 'Mint on CultureRegistry',
        description:
          'Register a reviewed artifact and its source; preview registration stays in this session.',
        status: mintResult ? 'complete' : uploadResult ? 'active' : 'pending',
      },
      {
        label: 'Spin up follow-on job',
        description:
          'Hand the fresh artifact to the orchestrator to generate the next learning task.',
        status: jobResult ? 'complete' : mintResult ? 'active' : 'pending',
      },
    ];
  }, [
    messages.length,
    isStreaming,
    draft,
    uploadResult,
    mintResult,
    jobResult,
  ]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isStreaming || pending) {
      return;
    }

    setError(null);
    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    const withUser = [...messages, userMessage];
    setMessages([...withUser, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);
    setDraft('');
    setUploadResult(null);
    setMintResult(null);
    setJobResult(null);

    let assembled = '';
    const context = withUser.map(
      (message) => `${message.role}: ${message.content}`,
    );
    try {
      for await (const chunk of streamLLMCompletion({
        prompt: userMessage.content,
        persona,
        context,
      })) {
        assembled += chunk;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: assembled };
          return next;
        });
      }
      setDraft(assembled);
    } catch (cause) {
      console.error(cause);
      setError('The assistant could not finish streaming. Please try again.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleUpload = async () => {
    if (!draft || uploadResult || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await uploadToIpfs(draft);
      setUploadResult(result);
    } catch (cause) {
      console.error(cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The operation failed. Please retry.',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  const handleMint = async () => {
    if (!uploadResult || mintResult || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await mintCultureArtifact({
        title: title.trim(),
        parentId: parentId || undefined,
        kind,
        cid: uploadResult.cid,
      });
      setMintResult(result);
    } catch (cause) {
      console.error(cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The operation failed. Please retry.',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  const handleCreateJob = async () => {
    if (!mintResult || jobResult || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createDerivativeJob(mintResult.artifactId);
      setJobResult(result);
    } catch (cause) {
      console.error(cause);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The operation failed. Please retry.',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  return (
    <section className="card">
      <header className="section-header">
        <div>
          <h2>Create knowledge artifact</h2>
          <p className="subtitle">
            Guide the assistant, watch the response stream in, and mint the
            result in one guided workflow. The preview uses a local template,
            not an LLM.
          </p>
        </div>
        <div className="persona-picker">
          <label>
            Artifact title
            <input
              value={title}
              maxLength={120}
              disabled={pending || !!mintResult}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Source artifact
            <select
              value={parentId}
              disabled={pending || !!mintResult}
              onChange={(event) => setParentId(Number(event.target.value))}
            >
              <option value={0}>Original work (no parent)</option>
              {artifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  #{artifact.id} — {artifact.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assistant tone
            <select
              value={persona}
              onChange={(event) => setPersona(event.target.value)}
            >
              {personas.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Artifact format
            <select
              value={kind}
              disabled={pending || !!mintResult}
              onChange={(event) => setKind(event.target.value)}
            >
              {artifactKinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!allowed('generation') && (
        <p className="capability-note">
          The bundled orchestrator has no writing, IPFS upload, mint, or
          derivative-job provider endpoints. Run the browser preview to explore
          the complete journey, or integrate and advertise those capabilities
          before enabling these actions.
        </p>
      )}
      <div className="timeline">
        {timeline.map((item) => (
          <div key={item.label} className={`timeline-item ${item.status}`}>
            <span className="badge">{item.label}</span>
            <p>{item.description}</p>
          </div>
        ))}
      </div>

      <div className="chat-card">
        <div
          className="chat-log"
          aria-live="polite"
          role="textbox"
          aria-readonly="true"
          aria-multiline="true"
          tabIndex={0}
          aria-label="Writing conversation"
        >
          {messages.length === 0 && !isStreaming && (
            <div className="chat-message assistant">
              <p>
                Start by describing the cultural story you want this {kind} to
                tell. Mention the audience, the tone, or milestones it should
                cover.
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              <span className="chat-role">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <p>{message.content}</p>
              {isStreaming && index === messages.length - 1 && (
                <span className="typing-indicator">Streaming…</span>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={handleSendMessage}
          className="chat-input"
          aria-label="Send instructions to the writing assistant"
        >
          <textarea
            aria-label="Lesson instructions"
            maxLength={4000}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Explain the focus for this artifact in plain words."
            rows={3}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={
              isStreaming ||
              pending ||
              input.trim().length === 0 ||
              !allowed('generation')
            }
          >
            {isStreaming ? 'Listening…' : 'Send to assistant'}
          </button>
        </form>
      </div>

      {draft && (
        <div className="draft-preview">
          <h3>Draft snapshot</h3>
          <p className="subtitle">
            Quick skim of the generated text so you can decide whether to keep
            refining or mint it.
          </p>
          <textarea
            readOnly
            rows={10}
            aria-label="Complete draft"
            value={draft}
          />
        </div>
      )}

      <div className="actions-grid">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!draft || !!uploadResult || pending || !allowed('upload')}
        >
          {uploadResult
            ? isDemoMode()
              ? 'Upload preview complete'
              : 'Stored on IPFS'
            : isDemoMode()
              ? 'Preview IPFS upload'
              : 'Save draft to IPFS'}
        </button>
        <button
          type="button"
          onClick={handleMint}
          disabled={
            !uploadResult ||
            !!mintResult ||
            !title.trim() ||
            pending ||
            !allowed('mint')
          }
        >
          {mintResult
            ? isDemoMode()
              ? 'Mint preview complete'
              : 'Minted on-chain'
            : isDemoMode()
              ? 'Preview artifact mint'
              : 'Mint artifact'}
        </button>
        <button
          type="button"
          onClick={handleCreateJob}
          disabled={
            !mintResult || !!jobResult || pending || !allowed('derivativeJobs')
          }
        >
          {jobResult
            ? isDemoMode()
              ? 'Job preview complete'
              : 'Follow-on job scheduled'
            : isDemoMode()
              ? 'Preview follow-on job'
              : 'Launch follow-on job'}
        </button>
      </div>

      <div className="status-panel">
        {uploadResult && (
          <p>
            <strong>{isDemoMode() ? 'Simulated CID:' : 'IPFS CID:'}</strong>{' '}
            {uploadResult.cid} ({uploadResult.bytes} bytes)
          </p>
        )}
        {mintResult && (
          <p>
            <strong>
              {isDemoMode() ? 'Simulated artifact ID:' : 'CultureRegistry ID:'}
            </strong>{' '}
            #{mintResult.artifactId} — receipt {mintResult.transactionHash}
          </p>
        )}
        {jobResult && (
          <p>
            <strong>Next job:</strong> {jobResult.title} ({jobResult.jobId})
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

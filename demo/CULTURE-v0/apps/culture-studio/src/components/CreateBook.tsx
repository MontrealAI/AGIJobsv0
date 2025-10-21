import { useMemo, useState } from 'react';
import {
  type ChatMessage,
  type MintResult,
  type IpfsUploadResult,
  streamLLMCompletion,
  uploadToIpfs,
  mintCultureArtifact,
  createDerivativeJob,
  type DerivativeJobResult
} from '../lib/api.js';

const personas = [
  'Friendly research partner',
  'Curriculum designer',
  'Community storyteller'
];

const artifactKinds = [
  { value: 'book', label: 'Field guide' },
  { value: 'prompt', label: 'Prompt pack' },
  { value: 'dataset', label: 'Learning dataset' },
  { value: 'curriculum', label: 'Micro-course' }
];

interface TimelineItem {
  readonly label: string;
  readonly status: 'pending' | 'active' | 'complete';
  readonly description: string;
}

export function CreateBook() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('Draft a playbook that explains how culture registries empower on-chain creatives.');
  const [persona, setPersona] = useState(personas[0]);
  const [kind, setKind] = useState(artifactKinds[0].value);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [uploadResult, setUploadResult] = useState<IpfsUploadResult | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [jobResult, setJobResult] = useState<DerivativeJobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeline: TimelineItem[] = useMemo(() => {
    return [
      {
        label: 'Shape the outline',
        description: 'Ask for the structure you need. The assistant replies in everyday language while streaming ideas.',
        status: messages.length === 0 ? 'active' : isStreaming ? 'active' : 'complete'
      },
      {
        label: 'Store the draft',
        description: 'Upload the generated text to IPFS for a permanent record.',
        status: uploadResult ? 'complete' : draft ? 'active' : 'pending'
      },
      {
        label: 'Mint on CultureRegistry',
        description: 'Mint the artifact so arenas can use it immediately.',
        status: mintResult ? 'complete' : uploadResult ? 'active' : 'pending'
      },
      {
        label: 'Spin up follow-on job',
        description: 'Hand the fresh artifact to the orchestrator to generate the next learning task.',
        status: jobResult ? 'complete' : mintResult ? 'active' : 'pending'
      }
    ];
  }, [messages.length, isStreaming, draft, uploadResult, mintResult, jobResult]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isStreaming) {
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
    const context = withUser.map((message) => `${message.role}: ${message.content}`);
    try {
      for await (const chunk of streamLLMCompletion({ prompt: userMessage.content, persona, context })) {
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
    if (!draft || uploadResult) return;
    setError(null);
    try {
      const result = await uploadToIpfs(draft);
      setUploadResult(result);
    } catch (cause) {
      console.error(cause);
      setError('Upload failed. Please retry in a moment.');
    }
  };

  const handleMint = async () => {
    if (!uploadResult || mintResult) return;
    setError(null);
    try {
      const result = await mintCultureArtifact({
        title: draft.slice(0, 80) || 'Culture Artifact Draft',
        kind,
        cid: uploadResult.cid
      });
      setMintResult(result);
    } catch (cause) {
      console.error(cause);
      setError('Minting did not complete. Re-run when the network is ready.');
    }
  };

  const handleCreateJob = async () => {
    if (!mintResult || jobResult) return;
    setError(null);
    try {
      const result = await createDerivativeJob(mintResult.artifactId);
      setJobResult(result);
    } catch (cause) {
      console.error(cause);
      setError('Unable to schedule the follow-on job. Give it another try.');
    }
  };

  return (
    <section className="card">
      <header className="section-header">
        <div>
          <h2>Create knowledge artifact</h2>
          <p className="subtitle">Guide the assistant, watch the response stream in, and mint the result without leaving this page.</p>
        </div>
        <div className="persona-picker">
          <label>
            Assistant tone
            <select value={persona} onChange={(event) => setPersona(event.target.value)}>
              {personas.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Artifact format
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {artifactKinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="timeline">
        {timeline.map((item) => (
          <div key={item.label} className={`timeline-item ${item.status}`}>
            <span className="badge">{item.label}</span>
            <p>{item.description}</p>
          </div>
        ))}
      </div>

      <div className="chat-card">
        <div className="chat-log" aria-live="polite">
          {messages.length === 0 && !isStreaming && (
            <div className="chat-message assistant">
              <p>
                Start by describing the cultural story you want this {kind} to tell. Mention the audience, the tone, or milestones
                it should cover.
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              <span className="chat-role">{message.role === 'user' ? 'You' : 'Assistant'}</span>
              <p>{message.content}</p>
              {isStreaming && index === messages.length - 1 && <span className="typing-indicator">Streaming…</span>}
            </div>
          ))}
        </div>
        <form onSubmit={handleSendMessage} className="chat-input" aria-label="Send instructions to the writing assistant">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Explain the focus for this artifact in plain words."
            rows={3}
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming || input.trim().length === 0}>
            {isStreaming ? 'Listening…' : 'Send to assistant'}
          </button>
        </form>
      </div>

      {draft && (
        <div className="draft-preview">
          <h3>Draft snapshot</h3>
          <p className="subtitle">Quick skim of the generated text so you can decide whether to keep refining or mint it.</p>
          <pre>{draft}</pre>
        </div>
      )}

      <div className="actions-grid">
        <button type="button" onClick={handleUpload} disabled={!draft || !!uploadResult}>
          {uploadResult ? 'Stored on IPFS' : 'Save draft to IPFS'}
        </button>
        <button type="button" onClick={handleMint} disabled={!uploadResult || !!mintResult}>
          {mintResult ? 'Minted on-chain' : 'Mint artifact'}
        </button>
        <button type="button" onClick={handleCreateJob} disabled={!mintResult || !!jobResult}>
          {jobResult ? 'Follow-on job scheduled' : 'Launch follow-on job'}
        </button>
      </div>

      <div className="status-panel">
        {uploadResult && (
          <p>
            <strong>IPFS CID:</strong> {uploadResult.cid} ({uploadResult.bytes} bytes)
          </p>
        )}
        {mintResult && (
          <p>
            <strong>CultureRegistry ID:</strong> #{mintResult.artifactId} — tx {mintResult.transactionHash.slice(0, 12)}…
          </p>
        )}
        {jobResult && (
          <p>
            <strong>Next job:</strong> {jobResult.title} ({jobResult.jobId})
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </section>
  );
}

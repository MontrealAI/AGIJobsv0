import { useEffect, useState } from 'react';
import {
  closeServiceRound,
  fetchScoreboard,
  finalizeServiceRound,
  loadServiceRound,
  startServiceRound,
  submitServiceWork,
  type ScoreboardResponse,
  type ServiceRound,
} from '../lib/api.js';
const split = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
export function ServiceArena({
  onScoreboardUpdated,
}: {
  onScoreboardUpdated: (value: ScoreboardResponse) => void;
}) {
  const [artifactId, setArtifactId] = useState(1);
  const [difficulty, setDifficulty] = useState(1);
  const [teacher, setTeacher] = useState('');
  const [students, setStudents] = useState('');
  const [validators, setValidators] = useState('');
  const [roundId, setRoundId] = useState(1);
  const [round, setRound] = useState<ServiceRound>();
  const [participant, setParticipant] = useState('');
  const [cid, setCid] = useState('');
  const [winners, setWinners] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('No round selected.');
  useEffect(() => {
    fetchScoreboard()
      .then(onScoreboardUpdated)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Cannot load telemetry.',
        ),
      );
  }, [onScoreboardUpdated]);
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await operation();
      onScoreboardUpdated(await fetchScoreboard());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The operation failed.',
      );
    } finally {
      setPending(false);
    }
  };
  const refresh = async (id: number) => {
    const next = await loadServiceRound(id);
    if (next.id !== round?.id) {
      setParticipant('');
      setCid('');
      setWinners('');
    }
    setRound(next);
    setRoundId(next.id);
    setStatus(`Round ${next.id}: ${next.status}`);
  };
  return (
    <section className="card">
      <h2>Start arena round</h2>
      <p>
        Service lifecycle · supply real participant addresses and evidence
        explicitly. The bundled job and storage adapters remain local fixtures.
        A submitted CID is an operator assertion, not independent validation.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const created = await startServiceRound({
              artifactId,
              difficultyOverride: difficulty,
              teacher,
              students: split(students),
              validators: split(validators),
            });
            await refresh(created.id);
          });
        }}
      >
        <fieldset disabled={pending}>
          <legend>1. Configure and start</legend>
          <div className="grid two-columns">
            <label>
              Artifact ID
              <input
                type="number"
                min={1}
                required
                value={artifactId}
                onChange={(event) => setArtifactId(Number(event.target.value))}
              />
            </label>
            <label>
              Difficulty override (integer)
              <input
                type="number"
                min={1}
                max={9}
                required
                value={difficulty}
                onChange={(event) => setDifficulty(Number(event.target.value))}
              />
            </label>
          </div>
          <label>
            Teacher address
            <input
              required
              pattern="0x[0-9a-fA-F]{40}"
              value={teacher}
              onChange={(event) => setTeacher(event.target.value.trim())}
              placeholder="0x… (40 hexadecimal digits)"
            />
          </label>
          <label>
            Student addresses (comma or newline separated)
            <textarea
              required
              value={students}
              onChange={(event) => setStudents(event.target.value)}
            />
          </label>
          <label>
            Validator addresses (optional, comma or newline separated)
            <textarea
              value={validators}
              onChange={(event) => setValidators(event.target.value)}
            />
          </label>
          <button>Start service round</button>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => refresh(roundId));
        }}
      >
        <fieldset disabled={pending}>
          <legend>2. Inspect an existing round</legend>
          <label>
            Round ID
            <input
              required
              type="number"
              min={1}
              value={roundId}
              onChange={(event) => setRoundId(Number(event.target.value))}
            />
          </label>
          <button className="secondary">Load round</button>
        </fieldset>
      </form>
      <p role="status">{status}</p>
      {round && (
        <>
          {round.deadlineAt && (
            <p>
              Submission deadline:{' '}
              <time dateTime={round.deadlineAt}>
                {new Date(round.deadlineAt).toLocaleString()}
              </time>
              . Evidence must arrive before this time. Close and review the
              round after submissions finish.
            </p>
          )}
          {round.status === 'failed' && (
            <p role="alert" className="error-text">
              This round requires reconciliation. Preserve its evidence and
              inspect service logs and transaction receipts before taking
              further action.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <caption>Participant evidence status · round {round.id}</caption>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { ...round.teacher, role: 'teacher' },
                  ...round.students.map((p) => ({ ...p, role: 'student' })),
                  ...round.validators.map((p) => ({ ...p, role: 'validator' })),
                ].map((p) => (
                  <tr key={p.address}>
                    <td>{p.role}</td>
                    <td>{p.address}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await submitServiceWork(round.id, participant, cid);
                await refresh(round.id);
                setParticipant('');
                setCid('');
              });
            }}
          >
            <fieldset disabled={pending || round.status !== 'open'}>
              <legend>3. Record actual evidence before closing</legend>
              <label>
                Participant
                <select
                  required
                  value={participant}
                  onChange={(event) => setParticipant(event.target.value)}
                >
                  <option value="">Choose a participant</option>
                  {[round.teacher, ...round.students, ...round.validators].map(
                    (p) => (
                      <option
                        key={p.address}
                        value={p.address}
                        disabled={p.status !== 'pending'}
                      >
                        {p.address} · {p.status}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Submission CID
                <input
                  required
                  minLength={5}
                  maxLength={512}
                  value={cid}
                  onChange={(event) => setCid(event.target.value)}
                />
              </label>
              <button>Record submission</button>
            </fieldset>
          </form>
          <fieldset disabled={pending}>
            <legend>4. Close, review, then finalize</legend>
            <button
              className="secondary"
              disabled={round.status !== 'open'}
              onClick={() =>
                void run(async () => {
                  await closeServiceRound(round.id);
                  await refresh(round.id);
                })
              }
            >
              Close submissions
            </button>
            <label>
              Approved student winners (leave empty if none)
              <textarea
                value={winners}
                onChange={(event) => setWinners(event.target.value)}
              />
            </label>
            <p>
              Review all evidence before finalizing. Only submitted students may
              win. This manual operator decision does not prove validator
              consensus.
            </p>
            <button
              disabled={round.status !== 'closed'}
              onClick={() =>
                void run(async () => {
                  await finalizeServiceRound(round.id, split(winners));
                  await refresh(round.id);
                })
              }
            >
              Finalize reviewed round
            </button>
          </fieldset>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}

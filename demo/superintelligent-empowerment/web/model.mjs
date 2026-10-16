// Browser counterpart of code/evidence.py. No remote observations or approvals.
export const MAX_BYTES = 262144;
export const BUNDLE_MAX_BYTES = 1500000;
const enc = new TextEncoder();
export const bytes = (value) => enc.encode(value);
export const decode = (raw) =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
const fail = (message) => {
  throw new Error(message);
};
export async function digest(raw) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
// JSON.parse loses lexical integer types (1.0 / 1e0). Preserve them and reject duplicate keys.
export function strictJSON(raw, max = MAX_BYTES) {
  if (!(raw instanceof Uint8Array) || raw.length > max)
    fail('UTF-8 JSON byte limit exceeded');
  const s = decode(raw);
  let p = 0;
  const ws = () => {
    while (/[\x20\t\n\r]/.test(s[p] || '!')) p++;
  };
  const string = () => {
    const start = p++;
    while (p < s.length) {
      const c = s[p++];
      if (c === '"') return JSON.parse(s.slice(start, p));
      if (c === '\\') p++;
    }
    fail('Unterminated JSON string');
  };
  const value = (depth = 0) => {
    if (depth > 100) fail('JSON nesting limit');
    ws();
    const c = s[p];
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      p++;
      const obj = c === '{' ? Object.create(null) : [];
      ws();
      const end = c === '{' ? '}' : ']';
      if (s[p] === end) {
        p++;
        return obj;
      }
      while (true) {
        ws();
        if (c === '{') {
          if (s[p] !== '"') fail('Expected field');
          const k = string();
          if (Object.hasOwn(obj, k)) fail('Duplicate JSON field: ' + k);
          ws();
          if (s[p++] !== ':') fail('Expected colon');
          obj[k] = value(depth + 1);
        } else obj.push(value(depth + 1));
        ws();
        const t = s[p++];
        if (t === end) return obj;
        if (t !== ',') fail('Expected comma');
      }
    }
    for (const [token, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ])
      if (s.startsWith(token, p)) {
        p += token.length;
        return result;
      }
    const m = s.slice(p).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!m) fail('Invalid JSON value');
    p += m[0].length;
    return /[.eE]/.test(m[0])
      ? Object.freeze({ nonIntegerToken: m[0] })
      : Number(m[0]);
  };
  const result = value();
  ws();
  if (p !== s.length) fail('Unexpected JSON content');
  return result;
}
const fields = (v, keys, label) => {
  if (
    !v ||
    Array.isArray(v) ||
    typeof v !== 'object' ||
    Object.keys(v).sort().join('|') !== [...keys].sort().join('|')
  )
    fail(label + ' has missing or unknown fields');
};
const text = (v, max, label) => {
  if (
    typeof v !== 'string' ||
    !v.replace(
      /[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g,
      ''
    ) ||
    [...v].length > max ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      v
    )
  )
    fail(label + ' must be nonempty bounded Unicode text');
};
const identifier = (v) => {
  if (typeof v !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(v))
    fail('Invalid identifier');
};
const integer = (v) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e9)
    fail('Values and thresholds must be lexical integers from 0 to 1000000000');
};
export const canonical = (v) =>
  bytes(
    JSON.stringify(v, (_, x) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, x[k]])
          )
        : x
    ) + '\n'
  );
export async function evaluate(packet) {
  fields(packet, ['schema', 'title', 'initiatives', 'evidence'], 'Packet');
  if (packet.schema !== 'agijobsv0.initiative-evidence.v1')
    fail('Unsupported packet schema');
  text(packet.title, 200, 'Title');
  const { initiatives, evidence } = packet;
  if (
    !Array.isArray(initiatives) ||
    !initiatives.length ||
    initiatives.length > 30
  )
    fail('Supply 1–30 initiatives');
  if (!Array.isArray(evidence) || evidence.length > 30)
    fail('Supply at most 30 evidence records');
  const sources = new Map(),
    byId = new Map();
  for (const e of evidence) {
    fields(e, ['id', 'label', 'sourceText', 'sha256'], 'Evidence');
    identifier(e.id);
    if (sources.has(e.id)) fail('Duplicate evidence identifier');
    text(e.label, 200, 'Evidence label');
    text(e.sourceText, 16384, 'Evidence source');
    const raw = bytes(e.sourceText);
    if (raw.length > 16384 || e.sha256 !== (await digest(raw)))
      fail('Evidence byte hash mismatch or source exceeds 16 KiB');
    const o = strictJSON(raw);
    fields(o, ['metric', 'unit', 'value'], 'Observation');
    text(o.metric, 80, 'Metric');
    text(o.unit, 40, 'Unit');
    integer(o.value);
    sources.set(e.id, { e, o });
  }
  for (const i of initiatives) {
    fields(
      i,
      ['id', 'title', 'claim', 'dependencies', 'criterion', 'evidenceId'],
      'Initiative'
    );
    identifier(i.id);
    if (byId.has(i.id)) fail('Duplicate initiative identifier');
    text(i.title, 160, 'Initiative title');
    text(i.claim, 500, 'Reported claim');
    if (
      !Array.isArray(i.dependencies) ||
      i.dependencies.length > 29 ||
      new Set(i.dependencies).size !== i.dependencies.length
    )
      fail('Dependencies must be unique identifiers');
    i.dependencies.forEach(identifier);
    const c = i.criterion;
    fields(c, ['metric', 'unit', 'operator', 'threshold'], 'Criterion');
    text(c.metric, 80, 'Metric');
    text(c.unit, 40, 'Unit');
    if (!['gte', 'lte'].includes(c.operator))
      fail('Criterion operator must be gte or lte');
    integer(c.threshold);
    if (
      i.evidenceId !== null &&
      (typeof i.evidenceId !== 'string' || !sources.has(i.evidenceId))
    )
      fail('Unknown evidence identifier');
    byId.set(i.id, i);
  }
  for (const i of initiatives)
    if (i.dependencies.some((d) => !byId.has(d)))
      fail('Unknown initiative dependency');
  let pending = [...initiatives];
  const ordered = [],
    resolved = new Set();
  while (pending.length) {
    const next = [];
    for (const i of pending) {
      if (i.dependencies.every((d) => resolved.has(d))) {
        ordered.push(i);
        resolved.add(i.id);
      } else next.push(i);
    }
    if (next.length === pending.length) fail('Cyclic dependencies detected');
    pending = next;
  }
  const ready = new Set(),
    entries = [];
  for (const i of ordered) {
    const c = i.criterion;
    const source = sources.get(i.evidenceId);
    let outcome = 'no-evidence';
    if (source) {
      if (source.o.metric !== c.metric || source.o.unit !== c.unit)
        fail('Evidence metric/unit must match its criterion exactly');
      outcome = (
        c.operator === 'gte'
          ? source.o.value >= c.threshold
          : source.o.value <= c.threshold
      )
        ? 'criterion-met'
        : 'criterion-unmet';
    }
    const blockedBy = i.dependencies.filter((d) => !ready.has(d));
    const readyForHumanReview =
      outcome === 'criterion-met' && !blockedBy.length;
    if (readyForHumanReview) ready.add(i.id);
    entries.push({
      id: i.id,
      title: i.title,
      reportedClaim: i.claim,
      criterion: c,
      evidenceId: i.evidenceId,
      sourceSha256: source?.e.sha256 ?? null,
      reportedValue: source?.o.value ?? null,
      criterionOutcome: outcome,
      blockedBy,
      readyForHumanReview,
    });
  }
  return {
    schema: 'agijobsv0.initiative-ledger.v1',
    title: packet.title,
    entries,
    readyCount: ready.size,
    initiativeCount: initiatives.length,
    allReadyForHumanReview: ready.size === initiatives.length,
    scope:
      'Consistency of supplied observations and criteria; input-order ties in dependency ordering.',
    sourceAuthenticityVerified: false,
    realWorldImpactVerified: false,
    providerCalls: 0,
    chainTransactions: 0,
    settlementApproved: false,
  };
}
export async function artifacts(raw) {
  const ledger = await evaluate(strictJSON(raw));
  let report =
    '# Initiative evidence ledger\n\nSupplied observations only. Source authenticity and real-world impact are unverified.\n\n';
  for (const i of ledger.entries)
    report += `- ${i.id}: ${i.criterionOutcome}; ready for human review: ${
      i.readyForHumanReview ? 'True' : 'False'
    }; blocked by: ${i.blockedBy.join(', ') || 'none'}\n`;
  const files = {
    'packet.json': raw,
    'ledger.json': canonical(ledger),
    'report.md': bytes(report),
  };
  const hashes = {};
  for (const [name, data] of Object.entries(files))
    hashes[name] = await digest(data);
  files['receipt.json'] = canonical({
    schema: 'agijobsv0.initiative-artifacts.v1',
    artifacts: hashes,
  });
  return { ledger, files };
}
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export async function review(files) {
  fields(
    files,
    ['packet.json', 'ledger.json', 'report.md', 'receipt.json'],
    'Bundle files'
  );
  for (const raw of Object.values(files))
    if (!(raw instanceof Uint8Array) || raw.length > MAX_BYTES)
      fail('Artifact exceeds 256 KiB');
  const result = await artifacts(files['packet.json']);
  const receipt = strictJSON(files['receipt.json']);
  fields(receipt, ['schema', 'artifacts'], 'Receipt');
  if (
    !equal(canonical(receipt), result.files['receipt.json']) ||
    Object.entries(result.files).some(
      ([n, b]) => n !== 'receipt.json' && !equal(files[n], b)
    )
  )
    fail('Artifact content/hash differs from recomputed supplied-input result');
  return { ...result, files, accepted: true };
}
export function pack(files) {
  const content = {};
  for (const [n, b] of Object.entries(files)) {
    if (b.length > MAX_BYTES) fail('Artifact exceeds 256 KiB');
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    content[n] = btoa(s);
  }
  const raw = canonical({
    schema: 'agijobsv0.initiative-browser-bundle.v1',
    files: content,
  });
  if (raw.length > BUNDLE_MAX_BYTES) fail('Bundle exceeds byte limit');
  return raw;
}
export function unpack(raw) {
  const envelope = strictJSON(raw, BUNDLE_MAX_BYTES);
  fields(envelope, ['schema', 'files'], 'Bundle');
  if (envelope.schema !== 'agijobsv0.initiative-browser-bundle.v1')
    fail('Unsupported bundle schema');
  fields(
    envelope.files,
    ['packet.json', 'ledger.json', 'report.md', 'receipt.json'],
    'Bundle files'
  );
  return Object.fromEntries(
    Object.entries(envelope.files).map(([n, s]) => {
      if (
        typeof s !== 'string' ||
        s.length > 349528 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          s
        )
      )
        fail('Invalid base64 artifact');
      const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      if (b.length > MAX_BYTES) fail('Artifact exceeds 256 KiB');
      return [n, b];
    })
  );
}

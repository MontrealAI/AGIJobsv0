// Display adapters for preserved legacy Mermaid. Original text is never rewritten.
const quoted = (text) =>
  '"' + text.replace(/"/g, '#quot;').replace(/`/g, '#96;') + '"';

function legacyMindmap(source) {
  // Older generators mixed flowchart edges/classes into mindmap syntax.
  // Render the same labeled hierarchy as a top-down flowchart.
  const lines = ['flowchart TD'];
  const stack = [];
  let root,
    index = 0;
  for (const line of source.split('\n').slice(1)) {
    if (!line.trim() || /^\s*(?:classDef|%%)/.test(line)) continue;
    const indent = line.match(/^\s*/)[0].length;
    const parts = line.trim().split(/\s+-->\s+/);
    let first;
    for (const part of parts) {
      let label = part.replace(/:::[\w-]+/g, '').trim();
      label = label
        .replace(/^root\(\(([\s\S]*)\)\)$/, '$1')
        .replace(/^"([\s\S]*)"$/, '$1');
      const id = `legacy_mind_${index++}`;
      lines.push(`${id}[${quoted(label)}]`);
      if (first) lines.push(`${first} --> ${id}`);
      else {
        first = id;
        if (!root) root = id;
        else {
          while (stack.length && stack.at(-1).indent >= indent) stack.pop();
          lines.push(`${stack.at(-1)?.id || root} --> ${id}`);
        }
      }
    }
    stack.push({ indent, id: first });
  }
  return lines.join('\n');
}

export function relativeSchedule(source) {
  if (!/^\s*gantt\s*$/m.test(source) || !/^\s*dateFormat\s+X\s*$/m.test(source))
    return null;
  // Valid epoch-based Gantt syntax continues through Mermaid unchanged.
  if (
    !/:\s*(?:(?:done|active|crit)\s*,\s*)?[\w-]+\s*,\s*\d+(?:\.\d+)?h(?:\s*,\s*\d+(?:\.\d+)?h)?\s*$/m.test(
      source
    )
  )
    return null;
  const tasks = [];
  let section = '';
  const title = source.match(/^\s*title\s+(.+)$/m)?.[1] || 'Relative schedule';
  for (const line of source.split('\n')) {
    if (/^\s*section\s+/.test(line)) {
      section = line.replace(/^\s*section\s+/, '');
      continue;
    }
    const match = line.match(/^\s*([^:]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const parts = match[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (/^(?:active|done|crit)$/.test(parts[0])) parts.shift();
    const id = parts.shift();
    const hours = parts.map((p) =>
      /^\d+(?:\.\d+)?h$/.test(p) ? Number(p.slice(0, -1)) : NaN
    );
    if (
      !id ||
      hours.length < 1 ||
      hours.length > 2 ||
      hours.some((n) => !Number.isFinite(n))
    )
      throw new Error('Unsupported relative Gantt task: ' + line);
    tasks.push({
      id,
      label: match[1].trim(),
      section,
      start: hours.length === 2 ? hours[0] : null,
      duration: hours.at(-1),
    });
  }
  if (!tasks.length) throw new Error('Relative schedule contains no tasks');
  return { title, tasks };
}

export function displaySource(original) {
  let source = original
    .replace(/^\s*```mermaid\s*\n/, '')
    .replace(/\n```\s*$/, '');
  // Malformed historical init directives can cause the parser to swallow chart data.
  source = source.replace(/^\s*%%\{init:.*$/gm, '').trimStart();
  if (/^lineChart\s*$/m.test(source)) {
    const title = source.match(/^\s*title\s+(.+)$/m)?.[1] || 'Recorded series';
    const points = [...source.matchAll(/^\s*(\d+):([\d.]+)\s*$/gm)];
    if (!points.length) throw new Error('Legacy line chart has no points');
    return `xychart-beta\n title ${quoted(title)}\n x-axis "Iteration" [${points
      .map((p) => p[1])
      .join(', ')}]\n y-axis "Success" 0 --> 1\n line [${points
      .map((p) => p[2])
      .join(', ')}]`;
  }
  if (
    /^\s*mindmap\s*$/m.test(source) &&
    /:::\w|\s-->|root\(\(.*\([^)]*\).*\)\)|\n  root[^\n]*\n  \S/.test(source)
  )
    return legacyMindmap(source.trim());
  if (/^\s*gantt\s*$/m.test(source)) return source.replace(/:\s*,\s*/g, ': ');
  if (/^\s*timeline\s*$/m.test(source))
    return source.replace(
      /(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z/g,
      '$1 $2h$3m$4s UTC'
    );
  if (/^\s*stateDiagram-v2\s*$/m.test(source))
    return source.replace(/(:\s+[^\n]*):([^\n]*)/g, '$1#58;$2');
  if (!/^\s*(?:flowchart|graph)\s/m.test(source)) return source;
  source = source
    .replace(/✅(?=\[)/g, 'legacy_approval')
    .replace(/🛑(?=\[)/g, 'legacy_escalation');
  source = source.replace(
    /(\b[\w-]+)(\[\[([^\]]*)\]\]|\[\(([^\]]*)\)\]|\[([^\]]*)\])/g,
    (match, id, shape, subroutine, cylinder, rectangle) => {
      const label = subroutine ?? cylinder ?? rectangle;
      if (label.trim().startsWith('"') || !/[(){}"`|\n]/.test(label))
        return match;
      const open =
        subroutine !== undefined ? '[[' : cylinder !== undefined ? '[(' : '[';
      const close =
        subroutine !== undefined ? ']]' : cylinder !== undefined ? ')]' : ']';
      return `${id}${open}${quoted(label.trim().replace(/\n/g, ' '))}${close}`;
    }
  );
  return source.replace(/\|([^|\n]+)\|/g, (match, label) =>
    label.trim().startsWith('"') || !/[()]/.test(label)
      ? match
      : '|' + quoted(label) + '|'
  );
}

export function displaySources(source) {
  const displayed = displaySource(source);
  const headers = [
    ...displayed.matchAll(/^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\s*$/gm),
  ];
  if (headers.length < 2) return [displayed];
  return headers.map((header, i) =>
    displayed
      .slice(
        i === 0 ? 0 : header.index,
        headers[i + 1]?.index ?? displayed.length
      )
      .trim()
  );
}

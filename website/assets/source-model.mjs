// Read-only source inspection: never evaluate source or recalculate scenario outcomes.
export function sourceFields(value, prefix = '$') {
  const rows = [];
  const visit = (item, pointer) => {
    if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item);
      if (!entries.length)
        rows.push({
          path: pointer,
          value: Array.isArray(item) ? '[]' : '{}',
          type: Array.isArray(item) ? 'array' : 'object',
        });
      for (const [key, child] of entries)
        visit(
          child,
          `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
        );
    } else
      rows.push({
        path: pointer,
        value: item === null ? 'null' : String(item),
        type: item === null ? 'null' : typeof item,
      });
  };
  visit(value, prefix);
  return rows;
}
export function findFields(rows, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) =>
    terms.every((term) =>
      `${row.path} ${row.value}`.toLowerCase().includes(term)
    )
  );
}

import { sourceFields, findFields } from './source-model.mjs';
export function initSourceLab() {
  const template = document.querySelector('#lab-data');
  if (!template) return;
  const { sources } = JSON.parse(template.content.textContent);
  const $ = (id) => document.getElementById(id);
  const select = $('lab-source'),
    search = $('lab-search'),
    fields = $('lab-fields');
  let rows = [],
    limit = 60;
  function renderFields() {
    const source = sources[Number(select.value)];
    const query = search.value.trim();
    const matches = findFields(rows, query);
    fields.replaceChildren();
    fields.hidden = source.format !== 'json';
    $('lab-more').hidden = source.format !== 'json' || matches.length <= limit;
    if (source.format === 'json') {
      for (const row of matches.slice(0, limit)) {
        const item = document.createElement('div');
        item.className = 'lab-field';
        const key = document.createElement('code');
        key.textContent = row.path;
        const type = document.createElement('span');
        type.className = 'field-type';
        type.textContent = row.type;
        const value = document.createElement('span');
        value.className = 'field-value';
        value.textContent =
          row.value.length > 500
            ? row.value.slice(0, 500) + '… (full value in source text)'
            : row.value;
        item.append(key, type, value);
        fields.append(item);
      }
      $('lab-summary').textContent = `${matches.length} of ${
        rows.length
      } fields match${query ? ' “' + query + '”' : ''}. Showing ${Math.min(
        limit,
        matches.length
      )}. Paths use JSON Pointer escaping (~1 for /, ~0 for ~).`;
    } else {
      const lines = (source.content || '').split('\n');
      const matches = query
        ? lines
            .map((text, i) => ({ text, i }))
            .filter(({ text }) =>
              text.toLowerCase().includes(query.toLowerCase())
            )
        : [];
      $('lab-summary').textContent =
        source.content === null
          ? 'Binary presentation: open or download the original file.'
          : query
          ? `${matches.length} matching source lines${
              matches.length
                ? '; first match at line ' + (matches[0].i + 1)
                : ''
            }. Full source remains visible below.`
          : `${lines.length} source lines. Read the full text below; no code is executed.`;
    }
  }
  function choose() {
    const source = sources[Number(select.value)];
    rows =
      source.format === 'json' ? sourceFields(JSON.parse(source.content)) : [];
    limit = 60;
    search.value = '';
    $('lab-path').textContent = source.file;
    $('lab-code').textContent =
      source.content ??
      'This binary presentation is available through the source link above.';
    $('lab-kind').textContent =
      source.format === 'json' ? 'JSON source' : 'Repository source';
    $('lab-size').textContent = `${source.bytes.toLocaleString()} bytes`;
    $('lab-hash').textContent = source.sha256;
    $('lab-download').href = source.download;
    if (source.content === null) $('lab-download').removeAttribute('download');
    else $('lab-download').setAttribute('download', '');
    $('lab-original').href = source.source;
    document.querySelector('.lab-raw').open = source.format !== 'json';
    document
      .querySelectorAll('[data-inspect-source]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.inspectSource === select.value)
        )
      );
    renderFields();
  }
  select.addEventListener('change', choose);
  search.addEventListener('input', () => {
    limit = 60;
    renderFields();
  });
  $('lab-more').addEventListener('click', () => {
    limit += 60;
    renderFields();
  });
  document.querySelector('.lab-toolbar').hidden = false;
  document.querySelectorAll('[data-inspect-source]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => {
      select.value = button.dataset.inspectSource;
      choose();
      select.focus();
      $('inspect').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
    });
  });
  choose();
}

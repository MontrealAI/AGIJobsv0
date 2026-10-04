// Legacy guides contain unquoted punctuation that newer Mermaid parsers reject.
// Adapt label quoting for display only; keep the original source beside each SVG.
export function displaySource(source) {
  if (!/^\s*(?:flowchart|graph)\s/m.test(source)) return source;
  return source.replace(
    /(\b[\w-]+)(\[\[([^\]\n]*)\]\]|\[\(([^\]\n]*)\)\]|\[([^\]\n]*)\])/g,
    (match, id, shape, subroutine, cylinder, rectangle) => {
      const label = subroutine ?? cylinder ?? rectangle;
      if (label.trim().startsWith('"') || !/[(){}"`]/.test(label)) return match;
      const open =
        subroutine !== undefined ? '[[' : cylinder !== undefined ? '[(' : '[';
      const close =
        subroutine !== undefined ? ']]' : cylinder !== undefined ? ')]' : ']';
      return `${id}${open}"${label
        .replace(/"/g, '#quot;')
        .replace(/`/g, '#96;')}"${close}`;
    }
  );
}

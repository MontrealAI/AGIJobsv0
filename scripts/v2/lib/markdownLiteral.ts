/** Keep report data literal while the surrounding report supplies its markup. */
export function escapeMarkdownLiteral(value: string): string {
  // ASCII punctuation includes Markdown delimiters, HTML syntax and entities.
  // Decode it only after Markdown parsing so it cannot change table structure.
  return value.replace(
    /[!-/:-@[-`{-~]/g,
    (character) => `&#${character.charCodeAt(0)};`
  );
}

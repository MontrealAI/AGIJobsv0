/** Mermaid entities are decoded after graph syntax, so labels cannot add nodes. */
export function escapeMermaidLiteral(value: string): string {
  return value.replace(/[\u0000-\u002f:-@[-`{-~]/g, (character) => `#${character.charCodeAt(0)};`);
}

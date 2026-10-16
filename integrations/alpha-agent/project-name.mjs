import { canonical, parseBounded } from './vendor/alpha/docs/assets/successor/engine.mjs';
export function adaptExecutionSpec(spec) {
  let compiledName = '';
  for (const scalar of spec.name) {
    if (compiledName.length + scalar.length > 48) break;
    compiledName += scalar;
  }
  if (!compiledName.trim()) compiledName = 'SUCCESSOR Ω';
  const adapted = parseBounded(canonical(spec));
  adapted.name = compiledName;
  return { spec: adapted, mapping: { policy: 'unicode-scalar-prefix-48-or-successor-label/v1', originalName: spec.name, compiledName, maximumUtf16Units: 48 } };
}

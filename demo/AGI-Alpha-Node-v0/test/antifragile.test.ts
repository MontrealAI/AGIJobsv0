import test from 'node:test';
import assert from 'node:assert/strict';
import { AntifragileShell } from '../src/ai/antifragile';

test('antifragile shell escalates severity after passing', () => {
  const shell = new AntifragileShell();
  const initial = shell.run();
  shell.escalate(true);
  const after = shell.run();
  assert(after.length <= initial.length);
});

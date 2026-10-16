import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SOURCE_PATHS, SOURCE_SELECTOR_PATH, pendingSourceSelection, readSourceSelection, renderSourceSelector, validateSelectorModule, assertPinnedSelection } from '../project-source-policy.mjs';
import { RECEIVER_SOURCE } from '../project-native-source.mjs';
import { canonical } from '../vendor/alpha/docs/assets/successor/engine.mjs';
import { verifySelectedSource } from '../generate-project-source.mjs';
const require = createRequire(import.meta.url), { parsers } = require('prettier/parser-babel');
const root = fileURLToPath(new URL('../../..',import.meta.url));
test('selector is exactly a generated primitive string and cannot carry excluded executable code',()=>{
  const pending = pendingSourceSelection(), bytes = renderSourceSelector(pending);
  assert.equal(validateSelectorModule(bytes).status,'pending-source-pin');
  for(const changed of [bytes+'globalThis.unreviewed=true;\n','globalThis.unreviewed=true;\n'+bytes,bytes.replace('export const','export let'),bytes.replace(';\n',';\n\n')]) assert.throws(()=>validateSelectorModule(changed));
  assert.throws(()=>assertPinnedSelection(readSourceSelection(canonical(pending))),/PIN_REQUIRED/);
  assert.equal(typeof JSON.parse(bytes.slice('export const RECEIVER_SOURCE_LOCK_JSON = '.length,-2)),'string');
});
test('complete ordered inventory covers every local import/require and preserves all licenses',()=>{
  const visited = new Set(), external = new Set();
  function walk(relative) {
    if(visited.has(relative))return;visited.add(relative);
    if(relative===SOURCE_SELECTOR_PATH)return;
    assert.ok(SOURCE_PATHS.includes(relative),relative);
    if(!/\.[cm]?js$/.test(relative))return;
    const source=fs.readFileSync(path.join(root,relative),'utf8');
    const tree = parsers.babel.parse(source,{},{}), imports = [];
    function visit(node) {
      if(!node||typeof node!=='object')return;
      if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)imports.push(node.source.value);
      if(node.type==='CallExpression'&&((node.callee.type==='Identifier'&&node.callee.name==='require')||node.callee.type==='Import')) { assert.equal(node.arguments[0]?.type,'StringLiteral','Uninventoried dynamic dependency'); imports.push(node.arguments[0].value); }
      if(node.type==='ImportExpression') { assert.equal(node.source.type,'StringLiteral');imports.push(node.source.value); }
      if(relative.endsWith('/verify-receipt.cjs')&&node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='fs'&&node.callee.property.name==='readFileSync') {
        const target=node.arguments[0];assert.equal(target.type,'BinaryExpression','Trusted profile read must have an inventoried static path');assert.equal(target.operator,'+');assert.equal(target.left.type,'Identifier');assert.equal(target.left.name,'__dirname');assert.equal(target.right.type,'StringLiteral');assert.equal(target.right.value,'/jobregistry-v2.json');imports.push('.'+target.right.value);
      }
      for(const [key,nested] of Object.entries(node))if(!['loc','tokens','comments'].includes(key)) { if(Array.isArray(nested))nested.forEach(visit);else if(nested&&typeof nested==='object')visit(nested); }
    }
    visit(tree);
    for(const reference of imports) {
      if(reference.startsWith('.'))walk(path.posix.normalize(path.posix.join(path.posix.dirname(relative),reference)));
      else external.add(reference);
    }
  }
  for(const entry of ['project-transfer.mjs','project-receipt.cjs','project-cli.mjs','generate-project-source.mjs'])walk('integrations/alpha-agent/'+entry);
  assert.ok(visited.has('integrations/alpha-agent/project-native-source.mjs'));assert.ok(visited.has('integrations/alpha-agent/verify-receipt.cjs'));assert.ok(visited.has('integrations/alpha-agent/jobregistry-v2.json'));
  assert.equal(SOURCE_PATHS.includes(SOURCE_SELECTOR_PATH),false);
  assert.deepEqual([...SOURCE_PATHS].sort(),[...SOURCE_PATHS]);assert.equal(new Set(SOURCE_PATHS).size,SOURCE_PATHS.length);
  for(const required of ['LICENSE','integrations/alpha-agent/vendor/alpha/LICENSE','integrations/alpha-agent/vendor/alpha/examples/build-successor/vendor/agijobs/LICENSE','integrations/alpha-agent/vendor/alpha/examples/build-successor/vendor/agijobs/provenance.json'])assert.ok(SOURCE_PATHS.includes(required));
  assert.ok([...external].every(name=>name==='ethers'||name.startsWith('node:')));
});
test('pinned selector matches actual fetched Git commit/tree and every installed dependency byte',()=>{
  if(RECEIVER_SOURCE.status==='pending-source-pin') {
    assert.throws(()=>verifySelectedSource(),/PIN_REQUIRED/);
    return;
  }
  const source=verifySelectedSource();assert.equal(source.commit,RECEIVER_SOURCE.commit);assert.equal(source.tree,RECEIVER_SOURCE.tree);
  for(const entry of source.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,entry.path))).digest('hex'),entry.sha256,entry.path);
  const raw=JSON.parse(canonical(source));raw.files.pop();assert.throws(()=>readSourceSelection(canonical(raw)),/INVENTORY/);
  const reordered=JSON.parse(canonical(source));reordered.files.reverse();assert.throws(()=>readSourceSelection(canonical(reordered)),/INVENTORY/);
  const noManifest=JSON.parse(canonical(source));noManifest.files=noManifest.files.filter(f=>!f.path.endsWith('project-native-source.mjs'));assert.throws(()=>readSourceSelection(canonical(noManifest)),/INVENTORY/);
});

test('pending source selection cannot be used by normal receiver APIs',async()=>{
  if(RECEIVER_SOURCE.status!=='pending-source-pin')return;
  const receiver=await import('../project-transfer.mjs');
  await assert.rejects(receiver.importAlphaProject('{}',{amountBaseUnits:'7000',compiledAt:'2026-10-16T00:00:00.000Z'}),/PIN_REQUIRED/);
  await assert.rejects(receiver.inspectProjectTransfer('{}'),/PIN_REQUIRED/);
  await assert.rejects(receiver.runProjectTransfer('{}'),/PIN_REQUIRED/);
});

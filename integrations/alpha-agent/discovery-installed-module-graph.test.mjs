// SPDX-License-Identifier: MIT
// Static decisions and one ordinary, trusted positive module invocation only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseModuleSources,checkDependencyRecords,ownedTarget,createModuleBoundary} from './discovery-installed-module-graph.mjs';

const sources = new Map([
  ['entry.mjs',Buffer.from("import {value} from './value.mjs'; export const total = value + 1;")],
  ['value.mjs',Buffer.from('export const value = 2;')]
]);

test('the shared parser reports ordinary static imports without evaluation',()=>{
  const records=parseModuleSources([...sources].map(([name,bytes])=>({name,source:bytes.toString('utf8')})));
  assert.deepEqual(records,[{name:'entry.mjs',requests:['./value.mjs']},{name:'value.mjs',requests:[]}]);
  checkDependencyRecords(records,new Set(sources.keys()));
});

test('inert dependency decisions require captured relative targets',()=>{
  const names=new Set(sources.keys());
  assert.equal(ownedTarget('./value.mjs','entry.mjs',names),'value.mjs');
  for(const request of ['./absent.mjs','../outside.mjs','node:fs']) {
    assert.throws(()=>ownedTarget(request,'entry.mjs',names));
  }
});

test('an ordinary trusted positive invocation uses captured module bytes',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-positive-'));
  const boundary=createModuleBoundary(directory,sources,['entry.mjs']);
  try {
    const imported=await boundary.importModule('entry.mjs');
    assert.equal(imported.total,3);
  } finally {boundary.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('installed receiver filesystem import is a fixed per-parent parser decision', async () => {
    const runtime = await import('./discovery-installed-module-graph-runtime.mjs');
    const records = runtime.parseModuleSources([{name: 'jobs/receiver.mjs', source:
        "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto';"}]);
    const names = new Set(['jobs/receiver.mjs']);
    assert.throws(() => runtime.checkDependencyRecords(records,names));
    assert.doesNotThrow(() => runtime.checkDependencyRecords(records,names,
        {'jobs/receiver.mjs':['node:fs','node:crypto']}));
    assert.throws(() => runtime.ownedTarget('node:fs','alpha/entry.mjs',new Set(['alpha/entry.mjs']),
        {'jobs/receiver.mjs':['node:fs','node:crypto']}));
});

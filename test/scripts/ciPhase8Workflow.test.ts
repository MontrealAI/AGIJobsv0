import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const WORKFLOW_PATH = join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');
const BRANCH_PROTECTION_SCRIPT = join(__dirname, '..', '..', 'scripts', 'ci', 'verify-branch-protection.ts');

describe('CI Phase 8 readiness workflow', function () {
  it('runs on pull requests and protects main with Phase 8 readiness', function () {
    const workflow = load(readFileSync(WORKFLOW_PATH, 'utf-8')) as any;
    expect(workflow?.on?.pull_request).to.not.equal(undefined);
    const pushBranches: unknown = workflow?.on?.push?.branches ?? [];
    expect(Array.isArray(pushBranches) ? pushBranches : [pushBranches]).to.include('main');

    const phase8Job = workflow?.jobs?.phase8;
    expect(phase8Job, 'phase8 job missing').to.not.equal(undefined);
    expect(phase8Job.name).to.equal('Phase 8 readiness');
    expect(phase8Job.needs || []).to.include.members(['lint', 'tests']);
  });

  it('enforces Phase 8 readiness in branch protection expectations', function () {
    const script = readFileSync(BRANCH_PROTECTION_SCRIPT, 'utf-8');
    expect(script).to.contain('"ci (v2) / Phase 8 readiness"');
  });
});

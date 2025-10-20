import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTranscript } from '../../scripts/v2/lib/nationalSupplyChainTranscript';

describe('National supply chain transcript sample', () => {
  it('passes the transcript validation checks', () => {
    const samplePath = resolve(__dirname, '../../demo/National-Supply-Chain-v0/ui/sample.json');
    const raw = readFileSync(samplePath, 'utf8');
    const transcript = JSON.parse(raw);
    const summary = validateTranscript(transcript);

    expect(summary.timelineLength).to.be.greaterThan(150);
    expect(summary.ownerActions).to.be.greaterThan(80);
    expect(summary.scenarioCount).to.equal(3);
    expect(summary.mintedCertificates).to.equal(2);
    expect(summary.unstoppableScore).to.equal(100);
  });
});

'use strict';

const label = Object.freeze({
  evidenceClass: 'placeholder',
  simulated: true,
  settled: false,
  productionApproved: false,
});

function requireFixtures(env = process.env) {
  if (env.AGI_DEMO_ALLOW_PLACEHOLDERS !== '1') {
    throw new Error(
      'Placeholder generation requires AGI_DEMO_ALLOW_PLACEHOLDERS=1. For actual local settlement use npm run demo:asi-global:local.'
    );
  }
}

module.exports = { label, requireFixtures };

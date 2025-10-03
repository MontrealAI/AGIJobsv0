describe('Owner console overview', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://orchestrator.example/governance/snapshot', {
      statusCode: 200,
      body: {
        chainId: 31337,
        timestamp: new Date('2024-01-01T00:00:00Z').toISOString(),
        configs: {
          identity: {
            agentRootNode: 'agent.agi.eth',
            clubRootNode: 'club.agi.eth',
            agentMerkleRoot: '0xagent',
            validatorMerkleRoot: '0xvalidator',
          },
        },
        onChain: {
          stakeManager: {
            minStakeLabel: '5000 AGIA',
            feePctLabel: '4%',
            burnPctLabel: '1%',
            validatorRewardPctLabel: '30%',
            treasury: '0x0000000000000000000000000000000000000001',
          },
          jobRegistry: {
            jobStakeLabel: '100 AGIA',
            maxJobRewardLabel: '250 AGIA',
            maxJobDurationLabel: '7 days',
            feePctLabel: '2%',
            validatorRewardPctLabel: '10%',
          },
          feePool: {
            burnPctLabel: '0.5%',
            treasury: '0x000000000000000000000000000000000000002a',
          },
          identityRegistry: {
            agentRootNode: 'agent.agi.eth',
            clubRootNode: 'club.agi.eth',
            agentMerkleRoot: '0xagent',
            validatorMerkleRoot: '0xvalidator',
          },
        },
      },
    }).as('snapshot');

    cy.intercept('GET', 'https://orchestrator.example/metrics', {
      statusCode: 200,
      body: `paymaster_balance 500000000000000000000\npaymaster_last_topup 1700000000`,
    }).as('metrics');
  });

  it('renders snapshot information and telemetry metrics', () => {
    cy.visit('/');
    cy.contains('AGI Jobs Owner Console');
    cy.contains('Protocol Policies');
    cy.wait('@snapshot');
    cy.contains('Minimum Stake').parent().should('contain.text', '5000 AGIA');
    cy.contains('Validator Reward %').parent().should('contain.text', '30%');
    cy.contains('Identity Roots');
    cy.wait('@metrics');
    cy.contains('500 AGIA');
  });
});

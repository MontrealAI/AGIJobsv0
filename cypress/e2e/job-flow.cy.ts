describe('Owner governance job flow', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://orchestrator.example/governance/snapshot', {
      statusCode: 200,
      body: {
        chainId: 31337,
        timestamp: new Date().toISOString(),
        configs: {},
        onChain: {},
      },
    }).as('snapshot');

    cy.intercept('POST', 'https://orchestrator.example/governance/preview', (req) => {
      const body = req.body as Record<string, any>;
      req.reply({
        statusCode: 200,
        body: {
          diff: {
            action: body?.key,
            value: body?.value ?? null,
          },
          bundle: {
            digest: '0xabc123',
            targets: ['jobRegistry'],
          },
        },
      });
    }).as('preview');

    cy.intercept('GET', /https:\/\/orchestrator\.example\/governance\/receipts.*/, {
      statusCode: 200,
      fixture: 'governance/receipts-agent-win.json',
    }).as('receipts');
  });

  it('previews configuration updates and inspects receipts', () => {
    cy.visit('/');
    cy.wait('@snapshot');

    cy.get('#governance-key').select('jobRegistry.setJobStake');
    cy.get('#governance-value').clear().type('150');
    cy.get('button').contains('Preview Change').click();
    cy.wait('@preview');
    cy.contains('Diff');
    cy.contains('jobRegistry');

    cy.get('#plan-hash').type('0xplan');
    cy.get('#job-id').type('42');
    cy.contains('Search Receipts').click();
    cy.wait('@receipts');
    cy.contains('job.finalized');
    cy.contains('Details').click();
    cy.findByTestId('receipt-details', { timeout: 10000 }).should('exist');
    cy.findByTestId('receipt-status-value', { timeout: 10000 }).should(
      'have.text',
      'agent_win'
    );
  });
});

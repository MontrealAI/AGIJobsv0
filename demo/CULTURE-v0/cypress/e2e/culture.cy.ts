describe('Culture Studio smoke test', () => {
  it('navigates through primary workflows', () => {
    cy.intercept('POST', /graphql$/, {
      body: {
        data: {
          artifacts: [
            { id: '1', kind: 'book', cid: 'bafybookdemo', parentId: null, citations: [], influence: 0.92, mintedAt: null }
          ]
        }
      }
    }).as('artifacts');
    cy.intercept('POST', '**/llm/generate', {
      segments: ['Deterministic outline segment one. ', 'Deterministic outline segment two. ']
    }).as('llm');
    cy.intercept('POST', '**/ipfs/upload', {
      cid: 'bafyfixedcid',
      bytes: 128
    }).as('ipfs');
    // This UI smoke uses explicit fixtures; it does not prove live settlement.
    cy.intercept('GET', '**/arena/scoreboard', {
      agents: [{ address: 'demo-agent', role: 'student', rating: 1200, wins: 0, losses: 0 }],
      rounds: [],
      currentDifficulty: 1,
      currentSuccessRate: 0,
      ownerControls: { paused: false, autoDifficulty: true, maxConcurrentJobs: 3, targetSuccessRate: 0.6 }
    }).as('scoreboard');

    cy.intercept('GET', '**/capabilities', { mode: 'local-adapters', generation: false, upload: false, mint: false, derivativeJobs: false, ownerControls: false });
    cy.visit('/');
    cy.contains('h1', 'Knowledge grows').should('be.visible');

    cy.wait('@artifacts');

    // Create artifact tab is active by default
    cy.contains('h2', 'Create knowledge artifact').should('be.visible');

    // Switch to Self-Play Arena tab and wait for telemetry
    cy.contains('button', 'Self-Play Arena').click();
    cy.contains('h2', 'Start arena round').should('be.visible');
    cy.contains('Telemetry snapshot', { timeout: 20000 }).should('be.visible');
    cy.get('#panel-1 table', { timeout: 20000 }).first().within(() => {
      cy.contains('Agent');
      cy.get('tbody tr').should('have.length.at.least', 1);
    });

    // Navigate to Culture Graph and ensure nodes load
    cy.contains('button', 'Culture Graph').click();
    cy.get('#panel-2').contains('h2', 'Culture graph').should('be.visible');
    cy.contains('button', 'Create derivative job').should('exist');
  });
});

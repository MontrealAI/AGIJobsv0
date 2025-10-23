describe('Culture Studio smoke test', () => {
  it('navigates through primary workflows', () => {
    cy.intercept('POST', /graphql$/, {
      body: {
        data: {
          artifacts: [
            { id: 1, kind: 'book', cid: 'bafybookdemo', parentId: null, cites: [], influence: 0.92, mintedAt: null }
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

    cy.visit('/');
    cy.contains('h1', 'CULTURE').should('be.visible');

    cy.wait('@artifacts');

    // Create artifact tab is active by default
    cy.contains('h2', 'Create knowledge artifact').should('be.visible');

    // Switch to Self-Play Arena tab and wait for telemetry
    cy.contains('button', 'Self-Play Arena').click();
    cy.contains('h2', 'Start arena round').should('be.visible');
    cy.contains('Telemetry snapshot', { timeout: 20000 }).should('be.visible');
    cy.get('table', { timeout: 20000 }).first().within(() => {
      cy.contains('Agent');
      cy.get('tbody tr').should('have.length.at.least', 1);
    });

    // Navigate to Culture Graph and ensure nodes load
    cy.contains('button', 'Culture Graph').click();
    cy.contains('h2', 'Culture graph').should('be.visible');
    cy.contains('button', 'Create derivative job').should('exist');
  });
});

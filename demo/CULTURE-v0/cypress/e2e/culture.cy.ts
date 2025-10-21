describe('Culture Studio smoke test', () => {
  it('navigates through primary workflows', () => {
    cy.visit('/');
    cy.contains('h1', 'CULTURE').should('be.visible');

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

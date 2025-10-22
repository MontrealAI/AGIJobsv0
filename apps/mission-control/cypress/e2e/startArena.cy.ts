describe('Start Arena Wizard', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/arena/launch', {
      statusCode: 200,
      body: { arenaId: 'arena-vanguard-5555' }
    }).as('launch');
  });

  it('launches arena and shows timeline', () => {
    cy.visit('/start-arena');
    cy.injectAndCheckA11y();

    cy.contains(/Launch arena/i).click();
    cy.contains(/Artifact name is required/i).should('be.visible');

    cy.get('input').first().type('Nebula Recovery Codex');
    cy.contains(/Launch arena/i).click();

    cy.wait('@launch');
    cy.contains(/Live status for arena-vanguard-5555/i, { timeout: 10000 }).should('be.visible');
  });
});

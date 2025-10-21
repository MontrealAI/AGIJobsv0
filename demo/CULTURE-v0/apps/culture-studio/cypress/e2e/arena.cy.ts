describe('CULTURE arena wizard', () => {
  it('walks through a round with real-time telemetry', () => {
    cy.visit('/');
    cy.contains('Self-Play Arena').click();

    cy.wait('@artifacts');
    cy.wait('@scoreboard');

    cy.get('select').first().select('#2 — Artifact bafybravo…');
    cy.get('input[type="number"]').eq(0).clear().type('4');
    cy.contains('Launch arena').click();

    cy.wait('@startArena');
    cy.wait('@closeArena');
    cy.wait('@finalizeArena');

    cy.wait('@scoreboard');
    cy.wait('@scoreboard');

    cy.contains('Difficulty trend');
    cy.get('.telemetry-card canvas').should('exist');

    cy.contains('Owner control panel');
    cy.contains('Pause arenas').click();
    cy.wait('@controls');
    cy.contains('Resume arenas');

    cy.contains('Target success rate').parent().find('input').clear().type('0.7').blur();
    cy.wait('@controls');

    cy.viewport('iphone-6');
    cy.contains('Latest summary').should('be.visible');
  });
});

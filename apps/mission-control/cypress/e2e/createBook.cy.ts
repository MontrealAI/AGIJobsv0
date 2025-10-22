describe('Create Book Wizard', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/orchestrator', {
      statusCode: 200,
      body: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Mocked orchestrator suggestion',
        timestamp: new Date().toISOString()
      }
    }).as('orchestrator');

    cy.intercept('POST', '/api/ipfs', {
      statusCode: 200,
      body: { cid: 'bafybeidcytest', url: 'https://ipfs.io/ipfs/bafybeidcytest' }
    }).as('ipfs');
  });

  it('walks through the wizard and uploads to IPFS', () => {
    cy.visit('/create-book');
    cy.injectAndCheckA11y();

    cy.get('input').first().type('Validator Primer');
    cy.get('textarea').first().type('Short synopsis');
    cy.contains(/Request orchestrator feedback/i).click();
    cy.wait('@orchestrator');
    cy.contains(/Mocked orchestrator suggestion/i).should('be.visible');

    cy.contains(/Next step/i).click();
    cy.get('textarea').eq(1).type('1. Start 2. End');
    cy.contains(/Next step/i).click();
    cy.get('textarea').last().type('# Heading');
    cy.contains(/Upload to IPFS/i).click();
    cy.wait('@ipfs');
    cy.contains(/Artifact CID/i).should('be.visible');
  });
});

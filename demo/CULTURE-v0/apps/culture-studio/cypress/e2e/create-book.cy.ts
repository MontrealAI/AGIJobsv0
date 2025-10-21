describe('Culture artifact creation', () => {
  it('streams a draft, uploads it, and mints successfully', () => {
    cy.visit('/');

    cy.contains('Create knowledge artifact');
    cy.get('textarea').first().clear().type('Explain how the registry helps a music collective share their rituals.');
    cy.contains('Send to assistant').click();

    cy.wait('@llmGenerate');
    cy.contains('Streaming…');
    cy.contains('origin story').should('exist');

    cy.contains('Save draft to IPFS').click();
    cy.wait('@ipfsUpload');
    cy.contains('Stored on IPFS');
    cy.contains('IPFS CID: bafytestcid');

    cy.contains('Mint artifact').click();
    cy.wait('@mintArtifact');
    cy.contains('CultureRegistry ID: #4242');

    cy.contains('Launch follow-on job').click();
    cy.wait('@deriveJob');
    cy.contains('Follow-on job scheduled');

    cy.viewport('iphone-6');
    cy.contains('Draft snapshot').should('be.visible');
  });
});

describe('CULTURE explicit service lifecycle', () => {
  it('requires supplied participants, evidence and a separate review decision', () => {
    const teacher = `0x${'11'.repeat(20)}`, student = `0x${'22'.repeat(20)}`, validator = `0x${'33'.repeat(20)}`;
    cy.visit('/');
    cy.contains('button', 'Self-Play Arena').click();
    cy.get('#panel-1').within(() => {
      cy.contains('label', 'Teacher address').find('input').type(teacher);
      cy.contains('label', 'Student addresses').find('textarea').type(student);
      cy.contains('label', 'Validator addresses').find('textarea').type(validator);
      cy.contains('Start service round').click();
    });
    cy.wait('@startArena'); cy.wait('@roundStatus');
    for (const address of [teacher, student, validator]) {
      cy.get('#panel-1').within(() => {
        cy.contains('label', 'Participant').find('select').select(address);
        cy.contains('label', 'Submission CID').find('input').type(`bafy-evidence-${address}`);
        cy.contains('Record submission').click();
      });
      cy.wait('@submission');
    }
    cy.get('#panel-1').contains('Close submissions').click(); cy.wait('@closeArena');
    cy.get('#panel-1').contains('label', 'Approved student winners').find('textarea').type(student);
    cy.get('#panel-1').contains('Finalize reviewed round').click(); cy.wait('@finalizeArena');
    cy.get('#panel-1').contains('Round 88: finalized').should('be.visible');
  });
});

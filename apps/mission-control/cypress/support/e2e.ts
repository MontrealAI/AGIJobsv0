import 'cypress-axe';

Cypress.Commands.add('injectAndCheckA11y', () => {
  cy.injectAxe();
  cy.checkA11y(undefined, undefined, (violations) => {
    if (violations.length) {
      cy.wrap(violations).each((violation) => {
        Cypress.log({ name: 'a11y violation', message: `${violation.id} ${violation.nodes.length} nodes` });
      });
    }
    expect(violations).to.have.length(0);
  });
});

declare global {
  namespace Cypress {
    interface Chainable {
      injectAndCheckA11y(): Chainable<void>;
    }
  }
}

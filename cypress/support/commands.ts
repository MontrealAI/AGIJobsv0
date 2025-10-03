export {};

Cypress.Commands.add(
  'findByTestId',
  (testId: string, options?: Partial<Cypress.Timeoutable & Cypress.Loggable & Cypress.Withinable & Cypress.Shadow>) =>
    cy.get(`[data-testid="${testId}"]`, options)
);

declare global {
  namespace Cypress {
    interface Chainable {
      findByTestId<E extends Node = HTMLElement>(
        testId: string,
        options?: Partial<Cypress.Timeoutable & Cypress.Loggable & Cypress.Withinable & Cypress.Shadow>
      ): Chainable<JQuery<E>>;
    }
  }
}

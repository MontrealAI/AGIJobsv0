describe("Sovereign Constellation UI", () => {
  it("loads configuration, hero metrics, and mission previews", () => {
    cy.visit("http://localhost:5179");
    cy.contains("Sovereign Constellation");
    cy.get('[data-testid="constellation-hero"]').should("exist");
    cy.get('[data-testid="hub-select"]').select(1);
    cy.get('[data-testid="playbook-select"]').select(1);
    cy.get('[data-testid="playbook-preview"]').should("exist");
  });
});

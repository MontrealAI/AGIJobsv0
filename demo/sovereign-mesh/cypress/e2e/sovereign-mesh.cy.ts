describe("Sovereign Mesh UI", () => {
  it("loads configuration, renders hero metrics, and previews playbooks", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get('[data-testid="hero-metrics"]').should("exist");
    cy.get('[data-testid="hub-select"]').select(1);
    cy.get('[data-testid="playbook-select"]').select(1);
    cy.get('[data-testid="playbook-preview"]').should("exist");
  });
});

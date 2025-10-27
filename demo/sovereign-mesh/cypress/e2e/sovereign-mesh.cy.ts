describe("Sovereign Mesh console", () => {
  it("loads configuration and renders mission selector", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.contains("Mission playbooks");
    cy.get("select").first().should("exist");
  });
});

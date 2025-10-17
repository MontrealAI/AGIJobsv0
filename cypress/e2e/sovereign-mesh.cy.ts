describe("Sovereign Mesh console", () => {
  it("renders hub selector and mission dropdown", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get("select").first().should("contain", "Choose Hub");
    cy.contains("Mission playbooks");
  });
});

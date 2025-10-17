describe("Sovereign Mesh UI", () => {
  it("renders mission controls", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.contains("Command Deck");
    cy.get("select").first().should("exist");
  });
});

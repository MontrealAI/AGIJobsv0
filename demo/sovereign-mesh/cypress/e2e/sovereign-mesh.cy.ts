describe("Sovereign Mesh UI", () => {
  it("loads configuration and renders hubs", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get("select")
      .first()
      .find("option")
      .its("length")
      .should("be.greaterThan", 0);
    cy.get("select").first().select("public-research", { force: true });
  });
});

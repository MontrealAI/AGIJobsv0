describe("Sovereign Mesh Console", () => {
  it("renders mission console and hub list", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get("select").first().select(1);
  });
});

describe("Sovereign Mesh UI", () => {
  it("loads configuration and allows hub selection", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get("select").first().select(1);
  });
});

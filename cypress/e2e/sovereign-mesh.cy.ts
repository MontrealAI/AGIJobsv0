describe("Sovereign Mesh console", () => {
  it("loads hubs and playbooks", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.contains("Beyond Civic Exocortex");
    cy.get("select").first().select(1, { force: true });
  });
});

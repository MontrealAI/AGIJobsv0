describe("Sovereign Mesh UI", () => {
  it("loads hubs and playbooks", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.get("select").first().select("Public Research Hub");
  });
});

describe("Sovereign Mesh UI", () => {
  it("renders hub selector and mission menu", () => {
    cy.visit("http://localhost:5178");
    cy.contains("Sovereign Mesh");
    cy.contains("Mesh Intelligence Dashboard");
    cy.get("select").first().select("Public Research Hub");
    cy.contains("Mission Playbooks");
  });
});

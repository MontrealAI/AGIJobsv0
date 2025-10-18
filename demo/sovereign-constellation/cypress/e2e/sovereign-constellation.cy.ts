describe("Sovereign Constellation UI", () => {
  it("loads configuration, hero metrics, and mission previews", () => {
    cy.visit("http://localhost:5179");
    cy.contains("Sovereign Constellation");
    cy.get('[data-testid="launch-sequence"]').within(() => {
      cy.contains("ASI Takes Off Launch Sequence");
      cy.contains("Prime the Sovereign Launchpad");
      cy.contains("Launch constellation");
    });
    cy.get('[data-testid="constellation-hero"]').should("exist");
    cy.get('[data-testid="asi-takes-off-deck"]').within(() => {
      cy.contains("ASI Takes Off Control Deck");
      cy.contains("Automation Spine");
      cy.contains("npm run demo:sovereign-constellation:asi-takes-off");
    });
    cy.get('[data-testid="asi-takes-off-systems"]').within(() => {
      cy.contains("Systems Matrix");
      cy.contains("Owner levers");
      cy.contains("Automation spine");
    });
    cy.get('[data-testid="asi-takes-off-flight-plan"]').within(() => {
      cy.contains("ASI Takes Off Flight Plan");
      cy.contains("Meta-Agentic");
      cy.contains("CI dashboard");
    });
    cy.get('[data-testid="mission-profiles"]').within(() => {
      cy.contains("ASI Takes Off Mission Profiles");
      cy.contains("Load mission plan").first().click();
    });
    cy.get('[data-testid="playbook-select"]').should("have.value", "asi-takes-off");
    cy.get('[data-testid="hub-select"]').select(1);
    cy.get('[data-testid="playbook-select"]').select(1);
    cy.get('[data-testid="playbook-preview"]').should("exist");
  });
});

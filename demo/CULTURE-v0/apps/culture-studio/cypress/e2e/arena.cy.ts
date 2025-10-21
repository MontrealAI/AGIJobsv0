describe("CULTURE arena flow", () => {
  it("renders scoreboard placeholder", () => {
    cy.visit("/");
    cy.contains("CULTURE Self-Play Scoreboard").should("exist");
  });
});

beforeEach(() => {
  // Default mocks for orchestrator endpoints so the UI stays friendly for demo tests.
  cy.intercept('POST', '**/llm/generate', {
    segments: [
      'Here is a simple structure that walks through the culture registry without jargon. ',
      'It includes an origin story, daily rituals, and ways to remix the artifact.'
    ]
  }).as('llmGenerate');

  cy.intercept('POST', '**/ipfs/upload', {
    cid: 'bafytestcid',
    bytes: 512
  }).as('ipfsUpload');

  cy.intercept('POST', '**/culture/mint', {
    artifactId: 4242,
    transactionHash: '0xtestmint'
  }).as('mintArtifact');

  cy.intercept('POST', '**/jobs/derive', {
    jobId: 'job-4242-1',
    title: 'Practice mission for artifact 4242'
  }).as('deriveJob');

  cy.intercept('POST', '**/arena/start', {
    round: { id: 88 }
  }).as('startArena');

  cy.intercept('POST', '**/arena/close/88', { ok: true }).as('closeArena');
  cy.intercept('POST', '**/arena/finalize/88', {
    roundId: 88,
    winners: ['0xstudent00', '0xstudent02'],
    difficulty: 0.64,
    observedSuccessRate: 0.61,
    difficultyDelta: 0.04
  }).as('finalizeArena');

  const baseScoreboard = {
    agents: [
      { address: '0xteacher', role: 'teacher', rating: 1620, wins: 24, losses: 6 },
      { address: '0xstudent00', role: 'student', rating: 1510, wins: 14, losses: 12 }
    ],
    rounds: [
      { id: 80, difficulty: 0.58, successRate: 0.55, difficultyDelta: 0.03, status: 'completed' },
      { id: 81, difficulty: 0.61, successRate: 0.57, difficultyDelta: 0.04, status: 'completed' }
    ],
    currentDifficulty: 0.61,
    currentSuccessRate: 0.57,
    ownerControls: { paused: false, autoDifficulty: true, maxConcurrentJobs: 2, targetSuccessRate: 0.6 }
  };

  let scoreboardCallCount = 0;
  cy.intercept('GET', '**/arena/scoreboard', (req) => {
    scoreboardCallCount += 1;
    if (scoreboardCallCount < 3) {
      req.reply(baseScoreboard);
      return;
    }
    req.reply({
      ...baseScoreboard,
      rounds: [
        ...baseScoreboard.rounds,
        { id: 88, difficulty: 0.64, successRate: 0.61, difficultyDelta: 0.04, status: scoreboardCallCount > 3 ? 'completed' : 'running' }
      ],
      currentDifficulty: 0.64,
      currentSuccessRate: 0.61
    });
  }).as('scoreboard');

  cy.intercept('POST', '**/arena/controls', (req) => {
    const body = req.body ?? {};
    req.reply({
      paused: body.paused ?? false,
      autoDifficulty: body.autoDifficulty ?? true,
      maxConcurrentJobs: 2,
      targetSuccessRate: body.targetSuccessRate ?? 0.6
    });
  }).as('controls');

  cy.intercept('POST', '**/graphql', {
    data: {
      artifacts: [
        { id: 1, kind: 'book', cid: 'bafyalpha', parentId: null, cites: [], influence: 0.4 },
        { id: 2, kind: 'dataset', cid: 'bafybravo', parentId: 1, cites: [1], influence: 0.7 }
      ]
    }
  }).as('artifacts');
});

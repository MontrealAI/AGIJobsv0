const orchestratorUrl = process.env.CULTURE_ORCHESTRATOR_URL ?? 'http://localhost:4005';

async function main() {
  const startResponse = await fetch(`${orchestratorUrl}/arena/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artifactId: 1,
      teacher: '0xteacher',
      students: ['0xstudent01', '0xstudent02', '0xstudent03'],
      validators: ['0xvalidator01', '0xvalidator02']
    })
  });
  const { round } = await startResponse.json();
  console.log(`Round ${round.id} started at difficulty ${round.difficulty}`);

  await fetch(`${orchestratorUrl}/arena/close/${round.id}`, { method: 'POST' });
  const finalizeResponse = await fetch(`${orchestratorUrl}/arena/finalize/${round.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winners: ['0xstudent01'] })
  });
  const summary = await finalizeResponse.json();
  console.log(`Round ${summary.roundId} complete. Success rate ${(summary.observedSuccessRate * 100).toFixed(1)}%.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

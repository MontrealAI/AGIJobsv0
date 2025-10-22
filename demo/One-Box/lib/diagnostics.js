const OWNER_LABELS = [
  { key: 'jobRegistry', label: 'Job registry' },
  { key: 'stakeManager', label: 'Stake manager' },
  { key: 'systemPause', label: 'System pause' },
];

function collectOwnerAssignments(surface) {
  if (!surface || typeof surface !== 'object') {
    return [];
  }

  const grouped = new Map();

  for (const descriptor of OWNER_LABELS) {
    const ownerResult = surface?.[descriptor.key]?.owner;
    if (!ownerResult || typeof ownerResult !== 'object') {
      continue;
    }
    if (ownerResult.status !== 'ok') {
      continue;
    }
    const ownerValue = typeof ownerResult.owner === 'string' ? ownerResult.owner.trim() : '';
    if (!ownerValue) {
      continue;
    }
    const key = ownerValue.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, { owner: ownerValue, contracts: [] });
    }
    grouped.get(key).contracts.push(descriptor.label);
  }

  return Array.from(grouped.values()).map((entry) => ({
    owner: entry.owner,
    contracts: entry.contracts,
  }));
}

function collectPausedContracts(surface) {
  if (!surface || typeof surface !== 'object') {
    return [];
  }

  const paused = [];

  for (const descriptor of OWNER_LABELS) {
    const pauseResult = surface?.[descriptor.key]?.paused;
    if (!pauseResult || typeof pauseResult !== 'object') {
      continue;
    }
    if (pauseResult.status === 'ok' && pauseResult.paused === true) {
      paused.push(descriptor.label);
    }
  }

  return paused;
}

module.exports = {
  collectOwnerAssignments,
  collectPausedContracts,
};

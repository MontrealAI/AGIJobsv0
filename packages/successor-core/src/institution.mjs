import { cloneJson, digestObject } from './integrity.mjs';
import { requireCondition, validateMission, validateGraph } from './domain.mjs';
import { compileJobs, verifyWorkOrderSeal } from './compiler.mjs';

const identifier = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
const union = (previous = [], additions = []) =>
  [...new Set([...previous, ...additions])].sort();

/** Operator-only registration of compiled dependencies; this does not issue a lease or admission. */
export async function registerCompilation(
  store,
  input,
  { actor, eventId, now = new Date().toISOString() } = {}
) {
  requireCondition(
    store?.read && store?.transact && identifier(actor) && identifier(eventId),
    'REGISTRATION_CONTEXT_REQUIRED',
    'Registration requires an operator-owned store, actor and unique event identifier'
  );
  const compilation = cloneJson(input);
  const mission = validateMission(compilation.constitution);
  const graph = validateGraph(compilation.graph);
  requireCondition(
    compilation.status === 'SEALED' && compilation.authorityCreated === 'NONE',
    'COMPILATION_INVALID',
    'Only a sealed compilation with no created authority can be registered'
  );
  requireCondition(
    compilation.digest ===
      (await digestObject('successor.constitution.v1', mission)),
    'CONSTITUTION_DIGEST_MISMATCH',
    'The constitution no longer matches the compiled commitment'
  );
  const { digest: graphDigest, ...graphPayload } = graph;
  requireCondition(
    graphDigest ===
      (await digestObject('successor.job-graph.v1', graphPayload)),
    'GRAPH_DIGEST_MISMATCH',
    'The graph no longer matches its commitment'
  );
  requireCondition(
    (await Promise.all(graph.nodes.map(verifyWorkOrderSeal))).every(Boolean),
    'JOB_SEAL_INVALID',
    'Every immutable work order must retain its exact seal'
  );
  const instant = typeof now === 'number' ? new Date(now).toISOString() : now;
  const drafts = graph.nodes.map(
    ({ digest, sealed, signatureStatus, ...job }) => ({
      ...job,
      state: 'DRAFT',
    })
  );
  const verified = await compileJobs(mission, {
    jobs: drafts,
    edges: graph.edges,
    now: instant,
  });
  requireCondition(
    verified.graph.digest === graphDigest,
    'GRAPH_RECOMPILATION_MISMATCH',
    'Graph structure and lifecycle must match the current compiler'
  );
  requireCondition(
    (await digestObject(
      'successor.invalidation-map.v1',
      compilation.invalidationMap
    )) ===
      (await digestObject(
        'successor.invalidation-map.v1',
        verified.invalidationMap
      )),
    'DEPENDENCY_MAP_MISMATCH',
    'The derived invalidation map was altered outside the sealed graph'
  );

  const sourceReferences = Object.fromEntries(
    mission.rights.map((right) => [
      right.sourceId,
      `mission:${mission.missionId}:source:${right.sourceId}`,
    ])
  );
  const workOrderDigests = Object.fromEntries(
    graph.nodes.map((job) => [job.jobId, job.digest])
  );
  const jobReferences = Object.fromEntries(
    graph.nodes.map((job) => [
      job.jobId,
      `mission:${mission.missionId}:job:${job.jobId}:${job.digest}`,
    ])
  );
  const references = { ...sourceReferences, ...jobReferences };
  requireCondition(
    Object.keys(references).length ===
      Object.keys(sourceReferences).length + Object.keys(jobReferences).length,
    'REFERENCE_NAMESPACE_CONFLICT',
    'A raw source identifier cannot also identify a job'
  );
  const dependencyMap = Object.fromEntries(
    Object.values(references).map((reference) => [reference, []])
  );
  for (const [upstream, downstreams] of Object.entries(
    verified.invalidationMap
  )) {
    requireCondition(
      references[upstream],
      'REFERENCE_UNRESOLVED',
      'Compiled invalidation source is unresolved',
      { upstream }
    );
    for (const downstream of downstreams) {
      requireCondition(
        jobReferences[downstream],
        'REFERENCE_UNRESOLVED',
        'Compiled invalidation target is unresolved',
        { downstream }
      );
      dependencyMap[jobReferences[downstream]] = union(
        dependencyMap[jobReferences[downstream]],
        [references[upstream]]
      );
    }
  }
  for (const job of graph.nodes)
    dependencyMap[job.digest] = [jobReferences[job.jobId], compilation.digest];
  dependencyMap[graphDigest] = union(
    [compilation.digest],
    graph.nodes.map((job) => job.digest)
  );
  const registration = {
    schemaVersion: '1.0.0',
    kind: 'CompilationRegistration',
    missionId: mission.missionId,
    constitutionDigest: compilation.digest,
    graphDigest,
    sourceReferences,
    jobReferences,
    workOrderDigests,
    status: 'COMPILED_NOT_AUTHORIZED',
    authorityCreated: 'NONE',
  };
  return store.transact(
    (state) => {
      state.dependencies ??= {};
      state.workOrders ??= {};
      state.compilations ??= {};
      state.sourceRights ??= {};
      state.invalidatedReferences ??= {};
      const previous = state.compilations[graphDigest];
      if (previous)
        requireCondition(
          previous.constitutionDigest === compilation.digest,
          'REGISTRATION_CONFLICT',
          'Existing graph registration belongs to another constitution'
        );
      for (const [reference, dependencies] of Object.entries(dependencyMap))
        state.dependencies[reference] = union(
          state.dependencies[reference],
          dependencies
        );
      for (const right of mission.rights) {
        const reference = sourceReferences[right.sourceId];
        const prior = state.sourceRights[reference];
        // Extending a source license requires a separately reviewed renewal; import or recompilation cannot extend it.
        const expiresAt = new Date(
          prior && Date.parse(prior.expiresAt) < Date.parse(right.expiresAt)
            ? prior.expiresAt
            : right.expiresAt
        ).toISOString();
        if (Date.parse(expiresAt) <= Date.parse(instant))
          state.invalidatedReferences[reference] ??= {
            sourceIds: [reference],
            reason:
              'Previously registered source rights expired; compilation cannot renew them.',
            eventId,
          };
        state.sourceRights[reference] = {
          missionId: mission.missionId,
          sourceId: right.sourceId,
          license: right.license,
          expiresAt,
          status: state.invalidatedReferences[reference]
            ? 'impaired'
            : prior?.status ?? 'current',
        };
      }
      // New immutable versions may depend on an already revoked source. They inherit
      // that impairment, never an automatic license or authority renewal.
      let changed = true;
      while (changed) {
        changed = false;
        for (const [reference, dependencies] of Object.entries(
          state.dependencies
        )) {
          const invalid = dependencies.filter(
            (dependency) => state.invalidatedReferences[dependency]
          );
          if (!state.invalidatedReferences[reference] && invalid.length) {
            state.invalidatedReferences[reference] = {
              sourceIds: invalid,
              reason: 'Registered dependency is already impaired.',
              eventId,
            };
            changed = true;
          }
        }
      }
      for (const job of graph.nodes) {
        const prior = state.workOrders[job.digest];
        const queue = [job.digest];
        const visited = new Set();
        let expiry = Date.parse(job.expiresAt);
        while (queue.length) {
          const reference = queue.pop();
          if (visited.has(reference)) continue;
          visited.add(reference);
          if (state.sourceRights[reference])
            expiry = Math.min(
              expiry,
              Date.parse(state.sourceRights[reference].expiresAt)
            );
          queue.push(...(state.dependencies[reference] ?? []));
        }
        state.workOrders[job.digest] = {
          ...prior,
          missionId: mission.missionId,
          jobId: job.jobId,
          workOrderDigest: job.digest,
          jobReference: jobReferences[job.jobId],
          constitutionDigest: compilation.digest,
          graphDigest,
          expiresAt: new Date(expiry).toISOString(),
          principal: job.principal,
          actor: job.actor,
          budget: cloneJson(job.budget),
          permittedTools: [...job.permittedTools],
          permittedActions: [...job.permittedActions],
          prohibitedActions: [...job.prohibitedActions],
          lifecycleState: prior?.lifecycleState ?? 'DRAFT',
          status: state.invalidatedReferences[job.digest]
            ? 'impaired'
            : prior?.status ?? 'current',
          authorization: 'NONE',
        };
      }
      const result = {
        ...registration,
        status: state.invalidatedReferences[graphDigest]
          ? 'IMPAIRED_NOT_AUTHORIZED'
          : registration.status,
      };
      state.compilations[graphDigest] = {
        ...result,
        registeredBy: actor,
        eventId,
        registeredAt: instant,
      };
      return result;
    },
    {
      actor,
      eventId,
      reason:
        'Register verified sealed work and mission-scoped invalidation dependencies; no authority granted',
    }
  );
}

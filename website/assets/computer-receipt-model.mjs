import {
  canonicalize,
  digestBytes,
} from '../../packages/successor-core/src/integrity.mjs';
import { restoreComputerMissionReport } from '../../packages/successor-core/src/computer-mission.mjs';
import { renderComputerDeskTaskHTML } from '../../scripts/pages/computer-mission.mjs';
import {
  createComputerReceiptDraft,
  inspectComputerReceiptDraft,
} from '../../integrations/alpha-agent/four-repo-computer-receipt.mjs';
import * as alpha from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs';
import { inspectLearningArchive } from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/learning.mjs';
import {
  inspectProject,
  serializeProject,
} from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/project.mjs';
import source from '../../integrations/alpha-agent/vendor/alpha-computer/source-identity.mjs';

export const ALPHA_COMPUTER_SOURCE = Object.freeze({
  repository: source.repository,
  commit: source.commit,
  tree: source.tree,
  sourceHash: source.files[source.entry].sha256,
});
export const COMPUTER_INSPECTOR_SOURCE = Object.freeze({
  ...ALPHA_COMPUTER_SOURCE,
  role: 'NATIVE_VALIDATION_IMPLEMENTATION_ONLY',
  authenticatedProducer: false,
});
export const COMPUTER_WORKSPACE_SCHEMA = 'agijobsv0/computer-workspace/v1';
export const PROPOSED_NETWORK = Object.freeze({
  chainId: 1,
  name: 'Ethereum Mainnet',
  token: '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA',
  asset: 'AGIALPHA',
  decimals: 18,
  deploymentSelected: false,
});
const need = (condition, code) => {
  if (!condition) throw Error(code);
};
const same = (left, right) => canonicalize(left) === canonicalize(right);
function confirmations({ approved, publicNonpersonal }) {
  need(
    approved === true && publicNonpersonal === true,
    'COMPUTER_PUBLIC_INPUTS_AND_EXPLICIT_APPROVAL_REQUIRED'
  );
}
async function inspectPinnedHandoff(raw) {
  const checked = await alpha.inspectComputerHandoff(raw);
  need(
    checked.handoff.sourceHash === ALPHA_COMPUTER_SOURCE.sourceHash,
    'COMPUTER_ALPHA_SOURCE_MISMATCH'
  );
  return checked;
}
async function historicalSourceDeclarations(history) {
  return Promise.all(
    history.records.map(async (record) => ({
      handoffSha256: await digestBytes(record.handoffRaw),
      declaredSourceHash: JSON.parse(record.handoffRaw).sourceHash,
      matchesInstalledInspector:
        JSON.parse(record.handoffRaw).sourceHash ===
        ALPHA_COMPUTER_SOURCE.sourceHash,
      authenticatedProducer: false,
    }))
  );
}
/** Accept Alpha's native complete export or a saved project without rewriting either source. */
export async function inspectAlphaProjectSource(raw) {
  need(
    typeof raw === 'string' &&
      new TextEncoder().encode(raw).length <= 2_000_000,
    'COMPUTER_PROJECT_SOURCE_SIZE'
  );
  const value = JSON.parse(raw);
  if (
    [
      'successor-alpha-learning-archive/v1',
      'successor-alpha-learning-archive/v2',
    ].includes(value?.schema)
  ) {
    const checked = await inspectLearningArchive(raw);
    return {
      project: checked.project,
      projectRaw: serializeProject(checked.project),
      sourceRaw: raw,
      historyRaw: checked.checkedComputer ? checked.computerHistoryRaw : null,
    };
  }
  const project = inspectProject(raw);
  return {
    project,
    projectRaw: serializeProject(project),
    sourceRaw: raw,
    historyRaw: null,
  };
}
async function inspectHistorySource(raw) {
  need(
    typeof raw === 'string' &&
      raw.length > 0 &&
      new TextEncoder().encode(raw).length <= 2_000_000,
    'COMPUTER_WORKSPACE_HISTORY_SOURCE'
  );
  const value = JSON.parse(raw);
  if (
    [
      'successor-alpha-learning-archive/v1',
      'successor-alpha-learning-archive/v2',
    ].includes(value?.schema)
  ) {
    const source = await inspectAlphaProjectSource(raw);
    need(source.historyRaw !== null, 'COMPUTER_WORKSPACE_HISTORY_SOURCE');
    return { historyRaw: source.historyRaw, projectSourceRaw: raw };
  }
  await alpha.inspectComputerHistory(raw);
  return { historyRaw: raw, projectSourceRaw: null };
}
export async function mergeComputerHistorySources(
  leftRaw = null,
  rightRaw = null
) {
  for (const raw of [leftRaw, rightRaw])
    need(
      raw === null || (typeof raw === 'string' && raw.length > 0),
      'COMPUTER_WORKSPACE_HISTORY_SOURCE'
    );
  if (!leftRaw && !rightRaw) return null;
  if (!leftRaw) {
    await alpha.inspectComputerHistory(rightRaw);
    return rightRaw;
  }
  if (!rightRaw) {
    await alpha.inspectComputerHistory(leftRaw);
    return leftRaw;
  }
  const left = await alpha.inspectComputerHistory(leftRaw),
    right = await alpha.inspectComputerHistory(rightRaw);
  const project = alpha.projectContains(right.project, left.project)
    ? right.project
    : alpha.projectContains(left.project, right.project)
    ? left.project
    : null;
  need(project, 'COMPUTER_WORKSPACE_PROJECT');
  const records = left.records.map((record) => ({ ...record }));
  for (const record of right.records) {
    const existing = records.find((item) =>
      same(JSON.parse(item.handoffRaw), JSON.parse(record.handoffRaw))
    );
    if (!existing) {
      records.push({ ...record });
      continue;
    }
    need(
      existing.handoffRaw === record.handoffRaw &&
        (existing.returnRaw === null ||
          record.returnRaw === null ||
          existing.returnRaw === record.returnRaw) &&
        (existing.review === null ||
          record.review === null ||
          same(existing.review, record.review)),
      'COMPUTER_WORKSPACE_HISTORY_CONFLICT'
    );
    existing.returnRaw ??= record.returnRaw;
    existing.review ??= record.review;
  }
  const raw = canonicalize({
    schema: left.schema,
    project,
    records,
    authority: 'none',
    settlement: 'not_connected',
  });
  await alpha.inspectComputerHistory(raw);
  return raw;
}
export function agialphaBaseUnits(value) {
  need(
    typeof value === 'string' &&
      /^(?:0|[1-9][0-9]{0,10})(?:\.[0-9]{1,18})?$/.test(value),
    'COMPUTER_AGIALPHA_DECIMAL_AMOUNT'
  );
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  need(
    units > 0n && units <= (1n << 96n) - 1n,
    'COMPUTER_AGIALPHA_AMOUNT_BOUND'
  );
  return units.toString();
}
export async function prepareSupplierComputerHandoff({
  projectRaw,
  reportRaw,
  approved,
  publicNonpersonal,
  language = 'en',
}) {
  confirmations({ approved, publicNonpersonal });
  need(['en', 'fr'].includes(language), 'COMPUTER_LANGUAGE');
  const source = await inspectAlphaProjectSource(projectRaw),
    project = source.project;
  const report = await restoreComputerMissionReport(reportRaw);
  const staged = report.formulation === 'actual_requirements';
  const goal = project.goal;
  const handoffRaw = await alpha.createComputerHandoff(project, {
    sourceHash: ALPHA_COMPUTER_SOURCE.sourceHash,
    goal,
    selected: staged ? 'reframe' : 'baseline',
    valueHypothesis:
      'A bounded allocation may meet the actual outcome at a lower quoted cost; market savings and model quality remain unestablished.',
    hypotheses: [
      'Order every unit from a single early supplier.',
      'Split early demand and remaining demand among suppliers.',
      'Enumerate bounded integer allocations with landed freight costs.',
    ],
    combination:
      'Compare landed costs and exact integer allocations, then separately verify delivery constraints.',
    reframing: staged
      ? 'Require only the actually needed early units by the early deadline; retain the original total units, final deadline and budget.'
      : 'Retain the selected one-supplier and all-units-early comparison; changing it requires separate explicit approval.',
    successCriteria: [
      'Meet every unchanged actual delivery requirement.',
      'Preserve exact mission and frozen program commitments.',
      'Separate quoted procurement costs from unknown execution and human costs.',
    ],
    html: renderComputerDeskTaskHTML(report, language),
    inputRights: report.mission.inputRights.classification,
    license: report.mission.inputRights.license,
    maxTurns: 8,
    maxActions: 30,
    maxSeconds: 90,
    reviewMinutes: 5,
  });
  const checked = await alpha.inspectComputerHandoff(handoffRaw);
  need(
    serializeProject(checked.project) === serializeProject(project),
    'COMPUTER_PROJECT_CHANGED'
  );
  return {
    handoffRaw,
    reportRaw,
    projectRaw: serializeProject(project),
    projectSourceRaw: source.sourceRaw,
    project: checked.project,
    report,
  };
}

export async function createComputerWorkspace({
  inputs,
  amount,
  network,
  approved,
  publicNonpersonal,
  createdAt,
  priorHistoryRaw = null,
  priorWorkspaceRaw = null,
  projectSourceRaw = null,
}) {
  confirmations({ approved, publicNonpersonal });
  need(same(network, PROPOSED_NETWORK), 'COMPUTER_EXPLICIT_NETWORK_REQUIRED');
  await inspectPinnedHandoff(inputs.handoffRaw);
  const draftRaw = await createComputerReceiptDraft(inputs, {
    amountBaseUnits: agialphaBaseUnits(amount),
    createdAt,
    inspectAlphaReturn: alpha.inspectComputerReturn,
  });
  const native = await alpha.inspectComputerReturn(
    inputs.handoffRaw,
    inputs.returnRaw
  );
  const prior = priorWorkspaceRaw
    ? await inspectComputerWorkspace(priorWorkspaceRaw)
    : null;
  if (prior) {
    need(prior.project.id === native.project.id, 'COMPUTER_WORKSPACE_PROJECT');
  }
  const importedHistory =
    priorHistoryRaw === null
      ? null
      : await inspectHistorySource(priorHistoryRaw);
  const projectSource =
    projectSourceRaw === null
      ? null
      : await inspectAlphaProjectSource(projectSourceRaw);
  let mergedHistory = await mergeComputerHistorySources(
    prior?.workspace.historyRaw ?? null,
    importedHistory?.historyRaw ?? null
  );
  mergedHistory = await mergeComputerHistorySources(
    mergedHistory,
    projectSource?.historyRaw ?? null
  );
  let project = native.project;
  if (projectSource) {
    if (alpha.projectContains(projectSource.project, project))
      project = projectSource.project;
    else
      need(
        alpha.projectContains(project, projectSource.project),
        'COMPUTER_WORKSPACE_PROJECT'
      );
  }
  if (importedHistory?.projectSourceRaw) {
    const source = await inspectAlphaProjectSource(
      importedHistory.projectSourceRaw
    );
    if (alpha.projectContains(source.project, project))
      project = source.project;
    else
      need(
        alpha.projectContains(project, source.project),
        'COMPUTER_WORKSPACE_PROJECT'
      );
  }
  if (mergedHistory) {
    const merged = await alpha.inspectComputerHistory(mergedHistory);
    if (alpha.projectContains(merged.project, project))
      project = merged.project;
    else
      need(
        alpha.projectContains(project, merged.project),
        'COMPUTER_WORKSPACE_PROJECT'
      );
  }
  const retained = await alpha.retainComputerHandoff(
    project,
    inputs.handoffRaw,
    { priorRecord: mergedHistory }
  );
  const historyRaw = await alpha.importComputerReturn(
    project,
    inputs.handoffRaw,
    inputs.returnRaw,
    { priorRecord: retained }
  );
  const drafts = prior ? [...prior.workspace.drafts] : [];
  if (!drafts.includes(draftRaw)) drafts.push(draftRaw);
  need(drafts.length <= 8, 'COMPUTER_WORKSPACE_HISTORY_BOUND');
  const historySources = [
    ...new Set([
      ...(prior?.workspace.historySources ?? []),
      ...(importedHistory ? [importedHistory.historyRaw] : []),
      ...(projectSource?.historyRaw ? [projectSource.historyRaw] : []),
      historyRaw,
    ]),
  ];
  need(historySources.length <= 16, 'COMPUTER_WORKSPACE_HISTORY_BOUND');
  const projectSources = [
    ...new Set([
      ...(prior?.workspace.projectSources ?? []),
      ...(projectSource ? [projectSource.sourceRaw] : []),
      ...(importedHistory?.projectSourceRaw
        ? [importedHistory.projectSourceRaw]
        : []),
    ]),
  ];
  need(projectSources.length <= 8, 'COMPUTER_WORKSPACE_PROJECT_SOURCE_BOUND');
  const sourceDeclarations = await historicalSourceDeclarations(
    await alpha.inspectComputerHistory(historyRaw)
  );
  const body = {
    schema: COMPUTER_WORKSPACE_SCHEMA,
    inspectorSource: COMPUTER_INSPECTOR_SOURCE,
    historicalSourceDeclarations: sourceDeclarations,
    unmatchedHistoricalSourceCount: sourceDeclarations.filter(
      (item) => !item.matchesInstalledInspector
    ).length,
    network: PROPOSED_NETWORK,
    draftRaw,
    drafts,
    historyRaw,
    historySources,
    projectSources,
    authority: 'none',
    settlement: 'not-connected',
    productionApproved: false,
  };
  const raw = canonicalize({
    ...body,
    sha256: await digestBytes(canonicalize(body)),
  });
  need(
    new TextEncoder().encode(raw).length <= 16_000_000,
    'COMPUTER_WORKSPACE_SIZE'
  );
  return inspectComputerWorkspace(raw);
}

export async function inspectComputerWorkspace(raw) {
  need(
    typeof raw === 'string' &&
      new TextEncoder().encode(raw).length <= 16_000_000,
    'COMPUTER_WORKSPACE_SIZE'
  );
  const value = JSON.parse(raw);
  need(
    Object.keys(value).sort().join('|') ===
      [
        'schema',
        'inspectorSource',
        'historicalSourceDeclarations',
        'unmatchedHistoricalSourceCount',
        'network',
        'draftRaw',
        'drafts',
        'historyRaw',
        'historySources',
        'projectSources',
        'authority',
        'settlement',
        'productionApproved',
        'sha256',
      ]
        .sort()
        .join('|'),
    'COMPUTER_WORKSPACE_FIELDS'
  );
  const { sha256, ...body } = value;
  need(
    raw === canonicalize(value) &&
      sha256 === (await digestBytes(canonicalize(body))),
    'COMPUTER_WORKSPACE_INTEGRITY'
  );
  need(
    value.schema === COMPUTER_WORKSPACE_SCHEMA &&
      same(value.inspectorSource, COMPUTER_INSPECTOR_SOURCE) &&
      same(value.network, PROPOSED_NETWORK) &&
      value.authority === 'none' &&
      value.settlement === 'not-connected' &&
      value.productionApproved === false,
    'COMPUTER_WORKSPACE_SCOPE'
  );
  const draft = await inspectComputerReceiptDraft(value.draftRaw, {
    inspectAlphaReturn: alpha.inspectComputerReturn,
  });
  await inspectPinnedHandoff(draft.original.handoffRaw);
  const native = await alpha.inspectComputerReturn(
    draft.original.handoffRaw,
    draft.original.returnRaw
  );
  const history = await alpha.inspectComputerHistory(value.historyRaw);
  const sourceDeclarations = await historicalSourceDeclarations(history);
  need(
    same(value.historicalSourceDeclarations, sourceDeclarations) &&
      value.unmatchedHistoricalSourceCount ===
        sourceDeclarations.filter((item) => !item.matchesInstalledInspector)
          .length,
    'COMPUTER_WORKSPACE_SOURCE_DECLARATIONS'
  );
  need(
    Array.isArray(value.projectSources) &&
      value.projectSources.length <= 8 &&
      new Set(value.projectSources).size === value.projectSources.length,
    'COMPUTER_WORKSPACE_PROJECT_SOURCES'
  );
  const originalAlphaArchives = [];
  for (const rawSource of value.projectSources) {
    const source = await inspectAlphaProjectSource(rawSource);
    if (
      JSON.parse(rawSource).schema?.startsWith(
        'successor-alpha-learning-archive/'
      )
    )
      originalAlphaArchives.push(rawSource);
    need(
      alpha.projectContains(history.project, source.project),
      'COMPUTER_WORKSPACE_PROJECT'
    );
    need(
      source.historyRaw === null ||
        value.historySources?.includes(source.historyRaw),
      'COMPUTER_WORKSPACE_PROJECT_SOURCE_HISTORY'
    );
  }
  need(
    Array.isArray(value.historySources) &&
      value.historySources.length >= 1 &&
      value.historySources.length <= 16 &&
      new Set(value.historySources).size === value.historySources.length &&
      value.historySources.includes(value.historyRaw),
    'COMPUTER_WORKSPACE_HISTORY_SOURCES'
  );
  for (const historySource of value.historySources) {
    const historical = await alpha.inspectComputerHistory(historySource);
    need(
      alpha.projectContains(history.project, historical.project),
      'COMPUTER_WORKSPACE_PROJECT'
    );
    for (const record of historical.records)
      need(
        history.records.some(
          (current) =>
            current.handoffRaw === record.handoffRaw &&
            (record.returnRaw === null ||
              current.returnRaw === record.returnRaw) &&
            (record.review === null || same(current.review, record.review))
        ),
        'COMPUTER_WORKSPACE_HISTORY'
      );
  }
  need(
    Array.isArray(value.drafts) &&
      value.drafts.length >= 1 &&
      value.drafts.length <= 8 &&
      new Set(value.drafts).size === value.drafts.length &&
      value.drafts.includes(value.draftRaw),
    'COMPUTER_WORKSPACE_DRAFT_HISTORY'
  );
  for (const previousRaw of value.drafts) {
    const previous = await inspectComputerReceiptDraft(previousRaw, {
      inspectAlphaReturn: alpha.inspectComputerReturn,
    });
    const historical = await alpha.inspectComputerReturn(
      previous.original.handoffRaw,
      previous.original.returnRaw
    );
    need(
      alpha.projectContains(history.project, historical.project),
      'COMPUTER_WORKSPACE_PROJECT'
    );
    need(
      history.records.some(
        (record) =>
          record.handoffRaw === previous.original.handoffRaw &&
          record.returnRaw === previous.original.returnRaw
      ),
      'COMPUTER_WORKSPACE_HISTORY'
    );
  }
  need(
    alpha.projectContains(history.project, native.project),
    'COMPUTER_WORKSPACE_PROJECT'
  );
  need(
    history.records.some(
      (record) =>
        record.handoffRaw === draft.original.handoffRaw &&
        record.returnRaw === draft.original.returnRaw
    ),
    'COMPUTER_WORKSPACE_HISTORY'
  );
  return {
    raw,
    workspace: value,
    draft,
    history,
    project: history.project,
    originalAlphaArchives,
  };
}

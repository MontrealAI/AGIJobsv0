import { orchestratorWallet, walletManager } from './utils';
import {
  telemetryQueueLength,
  getEnergyAnomalyReport,
  getEnergyAnomalyParameters,
} from './telemetry';
import { getAuditAnchoringState } from './auditAnchoring';
import { quarantineReport } from './security';
import { isOracleContractConfigured } from './operator';

export type HealthStatus = 'ok' | 'warning' | 'critical';

export interface HealthIndicator {
  component: string;
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealthReport {
  status: HealthStatus | 'degraded';
  generatedAt: string;
  indicators: HealthIndicator[];
  notes: string[];
}

function parseThreshold(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

const TELEMETRY_WARNING_THRESHOLD = parseThreshold(
  process.env.HEALTH_TELEMETRY_WARN_THRESHOLD,
  50
);
const TELEMETRY_CRITICAL_THRESHOLD = parseThreshold(
  process.env.HEALTH_TELEMETRY_CRITICAL_THRESHOLD,
  200
);
const ANOMALY_WARNING_THRESHOLD = parseThreshold(
  process.env.HEALTH_ANOMALY_WARN_THRESHOLD,
  1
);
const AUDIT_MAX_STALE_MS = parseThreshold(
  process.env.HEALTH_AUDIT_MAX_STALE_MS,
  12 * 60 * 60 * 1000
);

function applyStatusAggregation(
  current: HealthIndicator['status'] | 'degraded',
  incoming: HealthIndicator['status']
): HealthIndicator['status'] | 'degraded' {
  if (incoming === 'critical') {
    return 'critical';
  }
  if (incoming === 'warning') {
    if (current === 'critical') {
      return current;
    }
    return 'degraded';
  }
  return current;
}

function registerIndicator(
  indicators: HealthIndicator[],
  reportStatus: { value: HealthIndicator['status'] | 'degraded' },
  indicator: HealthIndicator,
  notes: string[]
): void {
  indicators.push(indicator);
  reportStatus.value = applyStatusAggregation(
    reportStatus.value,
    indicator.status
  );
  if (indicator.status !== 'ok') {
    const noteParts = [indicator.component, indicator.status];
    if (indicator.message) {
      noteParts.push(indicator.message);
    }
    notes.push(noteParts.join(':'));
  }
}

export function evaluateSystemHealth(): SystemHealthReport {
  const indicators: HealthIndicator[] = [];
  const notes: string[] = [];
  const statusRef: { value: HealthIndicator['status'] | 'degraded' } = {
    value: 'ok',
  };

  const walletList = walletManager ? walletManager.list() : [];
  if (!walletManager || walletList.length === 0) {
    registerIndicator(
      indicators,
      statusRef,
      {
        component: 'wallets',
        status: 'critical',
        message: 'no-wallets-loaded',
      },
      notes
    );
  } else if (!orchestratorWallet) {
    registerIndicator(
      indicators,
      statusRef,
      {
        component: 'wallets',
        status: 'critical',
        message: 'missing-orchestrator-wallet',
        details: { available: walletList },
      },
      notes
    );
  } else {
    registerIndicator(
      indicators,
      statusRef,
      {
        component: 'wallets',
        status: 'ok',
        details: {
          orchestrator: orchestratorWallet.address,
          loaded: walletList.length,
        },
      },
      notes
    );
  }

  const queueSize = telemetryQueueLength();
  let telemetryStatus: HealthStatus = 'ok';
  let telemetryMessage: string | undefined;
  if (queueSize >= TELEMETRY_CRITICAL_THRESHOLD) {
    telemetryStatus = 'critical';
    telemetryMessage = 'telemetry-queue-backlog-critical';
  } else if (queueSize >= TELEMETRY_WARNING_THRESHOLD) {
    telemetryStatus = 'warning';
    telemetryMessage = 'telemetry-queue-backlog';
  }
  registerIndicator(
    indicators,
    statusRef,
    {
      component: 'telemetry',
      status: telemetryStatus,
      message: telemetryMessage,
      details: {
        queueSize,
        warnThreshold: TELEMETRY_WARNING_THRESHOLD,
        criticalThreshold: TELEMETRY_CRITICAL_THRESHOLD,
      },
    },
    notes
  );

  const anomalies = getEnergyAnomalyReport();
  const activeAnomalies = anomalies.filter(
    (entry) => entry.count >= ANOMALY_WARNING_THRESHOLD
  );
  registerIndicator(
    indicators,
    statusRef,
    {
      component: 'energy-anomalies',
      status: activeAnomalies.length > 0 ? 'warning' : 'ok',
      message: activeAnomalies.length > 0 ? 'anomalies-detected' : undefined,
      details: {
        active: activeAnomalies.length,
        threshold: ANOMALY_WARNING_THRESHOLD,
        sample: activeAnomalies.slice(0, 5),
        parameters: getEnergyAnomalyParameters(),
      },
    },
    notes
  );

  const quarantined = quarantineReport().filter((entry) => entry.quarantined);
  registerIndicator(
    indicators,
    statusRef,
    {
      component: 'security',
      status: quarantined.length > 0 ? 'warning' : 'ok',
      message: quarantined.length > 0 ? 'agents-quarantined' : undefined,
      details: {
        quarantined: quarantined.map((entry) => ({
          address: entry.address,
          reasons: entry.reasons,
          lastFailure: entry.lastFailure,
        })),
      },
    },
    notes
  );

  const auditState = getAuditAnchoringState();
  let auditStatus: HealthStatus = 'ok';
  let auditMessage: string | undefined;
  if (auditState.lastError) {
    auditStatus = 'warning';
    auditMessage = auditState.lastError;
  }
  if (auditState.enabled && auditState.lastRunAt) {
    const lastRun = Date.parse(auditState.lastRunAt);
    if (Number.isFinite(lastRun)) {
      const ageMs = Date.now() - lastRun;
      if (ageMs > AUDIT_MAX_STALE_MS) {
        auditStatus = 'warning';
        auditMessage = 'audit-anchor-stale';
      }
    }
  }
  registerIndicator(
    indicators,
    statusRef,
    {
      component: 'audit',
      status: auditStatus,
      message: auditMessage,
      details: {
        state: auditState,
        maxStaleMs: AUDIT_MAX_STALE_MS,
      },
    },
    notes
  );

  const oracleConfigured = isOracleContractConfigured();
  registerIndicator(
    indicators,
    statusRef,
    {
      component: 'operator',
      status: oracleConfigured ? 'ok' : 'warning',
      message: oracleConfigured ? undefined : 'energy-oracle-not-configured',
    },
    notes
  );

  return {
    status: statusRef.value,
    generatedAt: new Date().toISOString(),
    indicators,
    notes,
  };
}

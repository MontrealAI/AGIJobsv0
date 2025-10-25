#!/usr/bin/env ts-node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
  Phase6Blueprint,
  DomainBlueprint,
} from './phase6-blueprint';

const DEFAULT_CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');

interface CliOptions {
  configPath: string;
  jsonOutput?: string;
}

export interface DidAuditReport {
  generatedAt: string;
  configPath?: string;
  coverage: number;
  credentialedDomains: number;
  totalDomains: number;
  totalRequirements: number;
  globalTrustAnchors: number;
  globalIssuers: number;
  globalPolicies: number;
  revocationRegistry?: string | null;
  missingDomains: string[];
  domainFindings: Array<{
    slug: string;
    name: string;
    credentials: string[];
    issuers: string[];
    verifiers: string[];
    gaps: string[];
  }>;
}

function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = { configPath: DEFAULT_CONFIG_PATH };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--config':
        if (!next) {
          throw new Error('--config expects a path');
        }
        options.configPath = next;
        i += 1;
        break;
      case '--config=':
        options.configPath = arg.split('=', 2)[1] ?? DEFAULT_CONFIG_PATH;
        break;
      case '--json':
        if (!next || next.startsWith('--')) {
          options.jsonOutput = '-';
        } else {
          options.jsonOutput = next;
          i += 1;
        }
        break;
      case '--json=':
        options.jsonOutput = arg.split('=', 2)[1] ?? '-';
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.warn(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(
    `Phase 6 DID & credential audit\n\n` +
      `Usage: npm run demo:phase6:did -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>   Use an alternate config file (default: ${DEFAULT_CONFIG_PATH})\n` +
      `  --json [path|-]   Emit JSON to <path>; use '-' for stdout\n` +
      `  -h, --help        Show this message\n`,
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value && value.length)));
}

function summarizeDomain(domain: DomainBlueprint): {
  credentials: string[];
  issuers: string[];
  verifiers: string[];
  gaps: string[];
} {
  const credentials = domain.credentials.map((credential) => credential.name);
  const issuers = uniqueStrings(domain.credentials.flatMap((credential) => credential.issuers));
  const verifiers = uniqueStrings(domain.credentials.flatMap((credential) => credential.verifiers));
  const gaps: string[] = [];
  if (credentials.length === 0) {
    gaps.push('missing credentials');
  }
  if (issuers.length === 0) {
    gaps.push('no issuers');
  }
  if (verifiers.length === 0) {
    gaps.push('no verifiers');
  }
  return { credentials, issuers, verifiers, gaps };
}

export function createDidAuditReport(blueprint: Phase6Blueprint): DidAuditReport {
  const missingDomains = blueprint.domains
    .filter((domain) => domain.credentials.length === 0)
    .map((domain) => domain.slug);
  const domainFindings = blueprint.domains.map((domain) => {
    const summary = summarizeDomain(domain);
    return {
      slug: domain.slug,
      name: domain.name,
      credentials: summary.credentials,
      issuers: summary.issuers,
      verifiers: summary.verifiers,
      gaps: summary.gaps,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    configPath: blueprint.configPath,
    coverage: blueprint.metrics.credentialCoverage,
    credentialedDomains: blueprint.metrics.credentialedDomainCount,
    totalDomains: blueprint.metrics.domainCount,
    totalRequirements: blueprint.metrics.credentialRequirementCount,
    globalTrustAnchors: blueprint.credentials.global.trustAnchors.length,
    globalIssuers: blueprint.credentials.global.issuers.length,
    globalPolicies: blueprint.credentials.global.policies.length,
    revocationRegistry: blueprint.credentials.global.revocationRegistry,
    missingDomains,
    domainFindings,
  };
}

function renderReport(report: DidAuditReport, domains: DomainBlueprint[]): void {
  console.log('\x1b[38;5;119mPhase 6 Credential & DID Audit\x1b[0m');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(
    `Coverage: ${(report.coverage * 100).toFixed(1)}% (${report.credentialedDomains}/${report.totalDomains} domains, ${report.totalRequirements} requirements)`,
  );
  console.log(`Trust anchors: ${report.globalTrustAnchors} | issuers: ${report.globalIssuers} | policies: ${report.globalPolicies}`);
  console.log(`Revocation registry: ${report.revocationRegistry ?? '—'}`);
  if (report.missingDomains.length) {
    console.log(`⚠ Missing credential coverage for: ${report.missingDomains.join(', ')}`);
  } else {
    console.log('All domains include credential requirements.');
  }
  domains.forEach((domain) => {
    const summary = summarizeDomain(domain);
    console.log(`\n${domain.name} (${domain.slug})`);
    console.log(`  Credentials: ${summary.credentials.length ? summary.credentials.join(', ') : '—'}`);
    console.log(`  Issuers: ${summary.issuers.length ? summary.issuers.join(', ') : '—'}`);
    console.log(`  Verifiers: ${summary.verifiers.length ? summary.verifiers.join(', ') : '—'}`);
    if (summary.gaps.length) {
      console.log(`  Gaps: ${summary.gaps.join(', ')}`);
    }
  });
}

export function runCli(argv: string[] = process.argv.slice(2)): void {
  const options = parseArgs(argv);
  const config = loadPhase6Config(options.configPath);
  const blueprint = buildPhase6Blueprint(config, { configPath: options.configPath });
  const report = createDidAuditReport(blueprint);

  if (options.jsonOutput === '-') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  renderReport(report, blueprint.domains);

  if (options.jsonOutput) {
    writeFileSync(options.jsonOutput, JSON.stringify(report, null, 2));
    console.log(`\nDID audit JSON saved to ${options.jsonOutput}`);
  }
}

if (require.main === module) {
  runCli();
}
